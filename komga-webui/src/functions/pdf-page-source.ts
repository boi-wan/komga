import {loadPdfJs} from '@/functions/pdfjs'
import type {PDFDocumentLoadingTask, PDFPageProxy, PDFWorker} from 'pdfjs-lib'

export interface LoadedPdfPage {
  // must be destroyed once the page is not displayed anymore
  loadingTask: PDFDocumentLoadingTask,
  pdfPage: PDFPageProxy,
}

interface QueuedTask {
  priority: () => number,
  signal?: AbortSignal,
  start: () => void,
  abort: () => void,
}

// Runs a limited number of tasks at once, picking the waiting task with the lowest priority value first.
// Priorities are evaluated when a task is picked, so they can change while waiting.
export class LoadQueue {
  private readonly concurrency: number
  private readonly waiting: QueuedTask[] = []
  private running = 0

  constructor(concurrency: number) {
    this.concurrency = concurrency
  }

  run<T>(task: () => Promise<T>, priority: () => number, signal?: AbortSignal): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      this.waiting.push({
        priority,
        signal,
        start: () => {
          task()
            .then(resolve, reject)
            .finally(() => {
              this.running--
              this.next()
            })
        },
        abort: () => reject(new DOMException('Task aborted while waiting', 'AbortError')),
      })
      this.next()
    })
  }

  private next() {
    this.waiting
      .filter(t => t.signal?.aborted)
      .forEach(t => {
        this.waiting.splice(this.waiting.indexOf(t), 1)
        t.abort()
      })

    while (this.running < this.concurrency && this.waiting.length > 0) {
      const next = this.waiting.reduce((min, t) => t.priority() < min.priority() ? t : min)
      this.waiting.splice(this.waiting.indexOf(next), 1)
      this.running++
      next.start()
    }
  }
}

const queue = new LoadQueue(2)

// all the displayed pages share a single worker, destroyed when no page uses it anymore
const WORKER_IDLE_MS = 10000
let worker: PDFWorker | undefined
let workerUsers = 0
let workerIdleTimeout: ReturnType<typeof setTimeout> | undefined

export function acquirePdfWorker() {
  workerUsers++
  clearTimeout(workerIdleTimeout)
}

export function releasePdfWorker() {
  workerUsers--
  if (workerUsers === 0)
    workerIdleTimeout = setTimeout(() => {
      worker?.destroy()
      worker = undefined
    }, WORKER_IDLE_MS)
}

// Load the first page of a single page PDF.
// priority: lower values are loaded first, typically the distance to the current page
export function loadPdfPage(url: string, priority: () => number, signal: AbortSignal): Promise<LoadedPdfPage> {
  return queue.run(async () => {
    const {lib, assets} = await loadPdfJs()
    const response = await fetch(url, {credentials: 'include', signal})
    if (!response.ok) throw new Error(`Could not load PDF page ${url}: HTTP ${response.status}`)
    const data = await response.arrayBuffer()

    if (!worker) worker = new lib.PDFWorker()
    const loadingTask = lib.getDocument({data: data, worker: worker, ...assets})
    try {
      const pdfPage = await (await loadingTask.promise).getPage(1)
      if (signal.aborted) throw new DOMException('Page not needed anymore', 'AbortError')
      return {loadingTask, pdfPage}
    } catch (e) {
      loadingTask.destroy()
      throw e
    }
  }, priority, signal)
}
