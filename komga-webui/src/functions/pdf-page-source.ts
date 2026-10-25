import {loadPdfJs} from '@/functions/pdfjs'
import {LoadQueue} from '@/functions/load-queue'
import type * as PdfJsLib from 'pdfjs-lib'
import type {PDFDocumentLoadingTask, PDFPageProxy, PDFWorker} from 'pdfjs-lib'

export interface LoadedPdfPage {
  pdfPage: PDFPageProxy,
  // to call once the page is not displayed anymore: destroys its document, and the worker when no page uses it anymore
  release: () => void,
}

// the server copies the resources of a page into its single page PDF: when all the pages of a file share them,
// every page weighs as much as the whole file, and is better shown as an image
export const MAX_PDF_PAGE_BYTES = 16 * 1024 * 1024

const queue = new LoadQueue(2)

// pdf.js draws a page in slices, one per frame: one page at a time, the closest first, instead of all the pages slowed down together
const drawQueue = new LoadQueue(1)

// icons of the text annotations, copied from pdf.js by vue.config.js
const TEXT_ANNOTATION_ICONS = ['check', 'comment', 'help', 'insert', 'key', 'newparagraph', 'noicon', 'note', 'paragraph']

// pdf.js shows the icon of a text annotation from `annotation-${name}.svg`, with the name read from the file:
// any other name, like a path, would make the browser request another url of Komga (e.g. /api/logout)
function keepTextAnnotationIcons(pdfPage: PDFPageProxy, lib: typeof PdfJsLib) {
  const getAnnotations = pdfPage.getAnnotations.bind(pdfPage)
  pdfPage.getAnnotations = async params => (await getAnnotations(params)).map(annotation =>
    annotation.annotationType === lib.AnnotationType.TEXT && !TEXT_ANNOTATION_ICONS.includes(String(annotation.name).toLowerCase())
      ? {...annotation, name: 'Note'}
      : annotation)
}

// all the loaded pages share a single worker, destroyed once no page has used it for a while
const WORKER_IDLE_MS = 10000
let worker: PDFWorker | undefined
let workerUsers = 0
let workerIdleTimeout: ReturnType<typeof setTimeout> | undefined

function acquireWorker(lib: typeof PdfJsLib): PDFWorker {
  workerUsers++
  clearTimeout(workerIdleTimeout)
  if (!worker) worker = new lib.PDFWorker()
  return worker
}

function releaseWorker() {
  workerUsers--
  if (workerUsers === 0) {
    workerIdleTimeout = setTimeout(() => {
      worker?.destroy()
      worker = undefined
    }, WORKER_IDLE_MS)
  }
}

// Download a single page PDF, rejected once larger than MAX_PDF_PAGE_BYTES.
// The bytes are counted, as proxies compressing the responses drop their Content-Length.
async function fetchPdfPage(url: string, signal: AbortSignal): Promise<Uint8Array> {
  const response = await fetch(url, {credentials: 'include', signal})
  if (!response.ok) throw new Error(`Could not load PDF page ${url}: HTTP ${response.status}`)
  const tooLarge = () => new Error(`PDF page ${url} is too large: over ${MAX_PDF_PAGE_BYTES} bytes`)
  if (Number(response.headers.get('Content-Length')) > MAX_PDF_PAGE_BYTES) {
    response.body?.cancel()
    throw tooLarge()
  }
  const reader = response.body!!.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  for (let read = await reader.read(); !read.done; read = await reader.read()) {
    size += read.value.length
    if (size > MAX_PDF_PAGE_BYTES) {
      reader.cancel()
      throw tooLarge()
    }
    chunks.push(read.value)
  }
  const data = new Uint8Array(size)
  chunks.reduce((offset, chunk) => {
    data.set(chunk, offset)
    return offset + chunk.length
  }, 0)
  return data
}

// Load the first page of a single page PDF.
// priority: lower values are loaded first, typically the distance to the current page
export function loadPdfPage(url: string, priority: () => number, signal: AbortSignal): Promise<LoadedPdfPage> {
  return queue.run(async () => {
    // pdf.js is loaded while the page is downloaded
    const [{lib, documentOptions}, data] = await Promise.all([loadPdfJs(), fetchPdfPage(url, signal)])

    const worker = acquireWorker(lib)
    let loadingTask: PDFDocumentLoadingTask | undefined
    let released = false
    const release = () => {
      if (released) return
      released = true
      loadingTask?.destroy()
      releaseWorker()
    }
    try {
      loadingTask = lib.getDocument({data: data, worker: worker, ...documentOptions})
      const pdfPage = await (await loadingTask.promise).getPage(1)
      if (signal.aborted) throw new DOMException('Page not needed anymore', 'AbortError')
      keepTextAnnotationIcons(pdfPage, lib)
      return {pdfPage, release}
    } catch (e) {
      release()
      throw e
    }
  }, priority, signal)
}

// Draw a page when its turn comes. Resolves once drawn, or once its drawing is cancelled (new scale, unmount).
// priority: lower values are drawn first, like the pages loaded
export function drawPdfPage(draw: () => Promise<void>, priority: () => number, signal: AbortSignal): Promise<void> {
  return drawQueue.run(draw, priority, signal)
}
