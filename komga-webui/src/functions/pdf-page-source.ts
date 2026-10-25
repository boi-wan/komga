import {loadPdfJs} from '@/functions/pdfjs'
import {LoadQueue} from '@/functions/load-queue'
import type * as PdfJsLib from 'pdfjs-lib'
import type {PDFPageProxy, PDFWorker} from 'pdfjs-lib'

export interface LoadedPdfPage {
  pdfPage: PDFPageProxy,
  // to call once the page is not displayed anymore: destroys its document, and the worker when no page uses it anymore
  release: () => void,
}

// the server copies the resources of a page into its single page PDF: when all the pages of a file share them,
// every page weighs as much as the whole file, and is better shown as an image
export const MAX_PDF_PAGE_BYTES = 16 * 1024 * 1024

const queue = new LoadQueue(2)

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
    // pdf.js is loaded while the page is downloaded
    const [{lib, assets}, response] = await Promise.all([loadPdfJs(), fetch(url, {credentials: 'include', signal})])
    if (!response.ok) throw new Error(`Could not load PDF page ${url}: HTTP ${response.status}`)
    const size = Number(response.headers.get('Content-Length'))
    if (size > MAX_PDF_PAGE_BYTES) {
      response.body?.cancel()
      throw new Error(`PDF page ${url} is too large: ${size} bytes`)
    }
    const data = await response.arrayBuffer()

    const loadingTask = lib.getDocument({data: data, worker: acquireWorker(lib), ...assets})
    let released = false
    const release = () => {
      if (released) return
      released = true
      loadingTask.destroy()
      releaseWorker()
    }
    try {
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
