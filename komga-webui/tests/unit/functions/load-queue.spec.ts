import {LoadQueue} from '@/functions/load-queue'

// a task that only completes when resolved by the test
function deferredTask(name: string, started: string[]) {
  let done: () => void = () => {}
  const task = () => {
    started.push(name)
    return new Promise<string>(resolve => done = () => resolve(name))
  }
  return {task, complete: () => done()}
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

describe('LoadQueue', () => {
  test('given more tasks than the concurrency when running then only that many tasks start', async () => {
    const queue = new LoadQueue(2)
    const started: string[] = []
    const tasks = ['a', 'b', 'c'].map(n => deferredTask(n, started))

    tasks.forEach(t => queue.run(t.task, () => 0))
    await flush()

    expect(started).toEqual(['a', 'b'])

    tasks[0].complete()
    await flush()

    expect(started).toEqual(['a', 'b', 'c'])
  })

  test('given waiting tasks when a slot frees then the lowest priority value starts first', async () => {
    const queue = new LoadQueue(1)
    const started: string[] = []
    const first = deferredTask('first', started)
    queue.run(first.task, () => 0)
    queue.run(deferredTask('far', started).task, () => 3)
    queue.run(deferredTask('near', started).task, () => 1)

    first.complete()
    await flush()

    expect(started).toEqual(['first', 'near'])
  })

  test('given waiting task whose priority changes when a slot frees then the current priority is used', async () => {
    const queue = new LoadQueue(1)
    const started: string[] = []
    const first = deferredTask('first', started)
    let distanceOfB = 5
    queue.run(first.task, () => 0)
    queue.run(deferredTask('a', started).task, () => 2)
    queue.run(deferredTask('b', started).task, () => distanceOfB)

    distanceOfB = 1
    first.complete()
    await flush()

    expect(started).toEqual(['first', 'b'])
  })

  test('given waiting task when aborted then it is rejected and never started', async () => {
    const queue = new LoadQueue(1)
    const started: string[] = []
    const first = deferredTask('first', started)
    const controller = new AbortController()
    queue.run(first.task, () => 0)
    const aborted = queue.run(deferredTask('aborted', started).task, () => 1, controller.signal)

    controller.abort()
    first.complete()

    await expect(aborted).rejects.toHaveProperty('name', 'AbortError')
    expect(started).toEqual(['first'])
  })

  test('given waiting task when aborted then it is rejected right away, without waiting for a free slot', async () => {
    const queue = new LoadQueue(1)
    const started: string[] = []
    const controller = new AbortController()
    queue.run(deferredTask('running', started).task, () => 0)
    const aborted = queue.run(deferredTask('aborted', started).task, () => 1, controller.signal)

    controller.abort()

    await expect(aborted).rejects.toHaveProperty('name', 'AbortError')
    expect(started).toEqual(['running'])
  })

  test('given task already aborted when queued then it is rejected and never started', async () => {
    const queue = new LoadQueue(1)
    const started: string[] = []
    const controller = new AbortController()
    controller.abort()

    await expect(queue.run(deferredTask('aborted', started).task, () => 0, controller.signal)).rejects.toHaveProperty('name', 'AbortError')
    expect(started).toEqual([])
  })

  test('given running task when it fails then its slot goes to the next task', async () => {
    const queue = new LoadQueue(1)
    const started: string[] = []
    const next = deferredTask('next', started)

    const failing = queue.run(() => Promise.reject(new Error('broken')), () => 0)
    queue.run(next.task, () => 0)

    await expect(failing).rejects.toThrow('broken')
    await flush()
    expect(started).toEqual(['next'])
  })

  test('given task when it completes then its result is returned', async () => {
    const queue = new LoadQueue(1)

    await expect(queue.run(() => Promise.resolve(42), () => 0)).resolves.toEqual(42)
  })
})
