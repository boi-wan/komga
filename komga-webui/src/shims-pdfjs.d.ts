// pdf.js ships its own types, but they need TypeScript >= 5.7 (generic typed arrays, MapIterator).
// The modules are imported through webpack aliases (see vue.config.js), so that TypeScript uses these declarations.
// Only the subset of the API used by the webui is declared here, against pdfjs-dist 6.4.299 (pinned in package.json).
// On an upgrade, check these declarations, the files copied by vue.config.js, the pdfjsLib global in functions/pdfjs.ts,
// and the pdf_viewer.css rules overridden in PdfPage.vue.

declare module 'pdfjs-lib' {
  export const GlobalWorkerOptions: {
    workerSrc: string,
  }

  export const PixelsPerInch: {
    PDF_TO_CSS_UNITS: number,
  }

  export const AnnotationMode: {
    ENABLE: number,
  }

  export interface PageViewport {
    width: number,
    height: number,
  }

  export interface PDFPageProxy {
    getViewport(params: { scale: number }): PageViewport
  }

  export interface PDFDocumentProxy {
    getPage(pageNumber: number): Promise<PDFPageProxy>
  }

  export interface PDFDocumentLoadingTask {
    promise: Promise<PDFDocumentProxy>

    destroy(): Promise<void>
  }

  export class PDFWorker {
    destroy(): void
  }

  export function getDocument(params: {
    data: ArrayBuffer,
    worker: PDFWorker,
    cMapUrl: string,
    standardFontDataUrl: string,
    wasmUrl: string,
    iccUrl: string,
  }): PDFDocumentLoadingTask
}

declare module 'pdfjs-viewer' {
  import {PageViewport, PDFPageProxy} from 'pdfjs-lib'

  export class EventBus {
  }

  export class GenericL10n {
    translateOnce(element: HTMLElement): Promise<void>
  }

  export const LinkTarget: {
    BLANK: number,
  }

  export class SimpleLinkService {
    constructor(options: { externalLinkTarget: number })
  }

  // services of the annotation layer, all disabled but the links
  export interface LayerProperties {
    annotationEditorUIManager: null,
    annotationStorage: null,
    downloadManager: null,
    enableScripting: false,
    fieldObjectsPromise: null,
    findController: null,
    hasJSActionsPromise: null,
    linkService: SimpleLinkService,
  }

  export const RenderingStates: {
    INITIAL: number,
  }

  export class PDFPageView {
    div: HTMLDivElement
    renderingState: number

    constructor(options: {
      container: HTMLElement,
      id: number,
      scale: number,
      defaultViewport: PageViewport,
      eventBus: EventBus,
      annotationMode: number,
      maxCanvasPixels: number,
      enableDetailCanvas: boolean,
      enableAutoLinking: boolean,
      l10n: GenericL10n,
      layerProperties: LayerProperties,
    })

    setPdfPage(pdfPage: PDFPageProxy): void

    update(params: { scale: number }): void

    draw(): Promise<void>

    destroy(): void
  }
}
