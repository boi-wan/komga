interface QueuedTask {
  priority: () => number,
  start: () => void,
}

// Runs a limited number of tasks at once, picking the waiting task with the lowest priority value first.
// Priorities are evaluated when a task is picked, so they can change while waiting.
// Tasks queued together (e.g. by the pages mounted together) are all waiting when the first one is picked.
export class LoadQueue {
  private readonly concurrency: number
  private readonly waiting: QueuedTask[] = []
  private running = 0
  private nextScheduled = false

  constructor(concurrency: number) {
    this.concurrency = concurrency
  }

  // a task aborted while waiting never starts, and its promise is rejected right away
  run<T>(task: () => Promise<T>, priority: () => number, signal?: AbortSignal): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (signal?.aborted) return reject(new DOMException('Task aborted while waiting', 'AbortError'))

      const onAbort = () => {
        const i = this.waiting.indexOf(queued)
        if (i >= 0) this.waiting.splice(i, 1)
        reject(new DOMException('Task aborted while waiting', 'AbortError'))
      }
      const queued: QueuedTask = {
        priority,
        start: () => {
          signal?.removeEventListener('abort', onAbort)
          task()
            .then(resolve, reject)
            .finally(() => {
              this.running--
              this.next()
            })
        },
      }
      signal?.addEventListener('abort', onAbort, {once: true})
      this.waiting.push(queued)
      this.scheduleNext()
    })
  }

  private scheduleNext() {
    if (this.nextScheduled) return
    this.nextScheduled = true
    Promise.resolve().then(() => {
      this.nextScheduled = false
      this.next()
    })
  }

  private next() {
    while (this.running < this.concurrency && this.waiting.length > 0) {
      const task = this.waiting.reduce((min, t) => t.priority() < min.priority() ? t : min)
      this.waiting.splice(this.waiting.indexOf(task), 1)
      this.running++
      task.start()
    }
  }
}
