// pdf.js ships its own types, but they need TypeScript >= 5.7 (generic typed arrays, MapIterator).
// The modules are imported through webpack aliases (see vue.config.js), so that TypeScript uses these declarations.
// Only the subset of the API used by the webui is declared here.

declare module 'pdfjs-lib' {
  export const version: string

  export const GlobalWorkerOptions: {
    workerSrc: string,
  }

  export const PixelsPerInch: {
    PDF_TO_CSS_UNITS: number,
  }

  export const AnnotationMode: {
    DISABLE: number,
    ENABLE: number,
    ENABLE_FORMS: number,
    ENABLE_STORAGE: number,
  }

  export interface PageViewport {
    width: number,
    height: number,
    scale: number,
  }

  export interface PDFPageProxy {
    getViewport(params: { scale: number }): PageViewport

    cleanup(): boolean
  }

  export interface PDFDocumentProxy {
    numPages: number

    getPage(pageNumber: number): Promise<PDFPageProxy>
  }

  export interface PDFDocumentLoadingTask {
    promise: Promise<PDFDocumentProxy>

    destroy(): Promise<void>
  }

  export class PDFWorker {
    constructor(params?: { name?: string })

    destroy(): void
  }

  export function getDocument(params: {
    data?: ArrayBuffer | Uint8Array,
    url?: string,
    withCredentials?: boolean,
    worker?: PDFWorker,
    cMapUrl?: string,
    standardFontDataUrl?: string,
    wasmUrl?: string,
    iccUrl?: string,
  }): PDFDocumentLoadingTask
}

declare module 'pdfjs-viewer' {
  import {PageViewport, PDFPageProxy} from 'pdfjs-lib'

  export class EventBus {
  }

  export class PDFPageView {
    constructor(options: {
      container: HTMLElement,
      id: number,
      scale: number,
      defaultViewport: PageViewport,
      eventBus: EventBus,
      textLayerMode?: number,
      annotationMode?: number,
      maxCanvasPixels?: number,
    })

    setPdfPage(pdfPage: PDFPageProxy): void

    update(params: { scale: number }): void

    draw(): Promise<void>

    reset(): void

    destroy(): void
  }
}
