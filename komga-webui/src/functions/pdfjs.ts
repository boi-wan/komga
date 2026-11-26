import type * as PdfJsLib from 'pdfjs-lib'
import type {PageViewport, PDFPageProxy} from 'pdfjs-lib'
import type * as PdfJsViewer from 'pdfjs-viewer'
import type {PDFPageView} from 'pdfjs-viewer'

export interface PageViewOptions {
  container: HTMLDivElement,
  // number of the page, for its label
  id: number,
  pdfPage: PDFPageProxy,
  // the page at scale 1
  viewport: PageViewport,
  scale: number,
}

export interface PdfJs {
  lib: typeof PdfJsLib,
  viewer: typeof PdfJsViewer,
  // options of getDocument
  documentOptions: {
    cMapUrl: string,
    standardFontDataUrl: string,
    wasmUrl: string,
    iccUrl: string,
    enableXfa: false,
  },
  // A view drawing the canvas, the text and the links of a page: no forms, no scripts, no editing.
  createPageView(options: PageViewOptions): PDFPageView,
}

// icons of the text annotations, among the annotation icons of pdf.js copied by vue.config.js
export const TEXT_ANNOTATION_ICONS = ['check', 'comment', 'help', 'insert', 'key', 'newparagraph', 'noicon', 'note', 'paragraph']

// pdf.js shows the icon of a text annotation from `${imageResourcesPath}annotation-${name}.svg`, with the name read from
// the file (TextAnnotationElement), and its annotation layer gets the annotations from pdfPage.getAnnotations
// (AnnotationLayerBuilder): any other name, like a path, would make the browser request another url of Komga
// (e.g. /api/logout). tests/unit/functions/pdfjs-internals.spec.ts checks that pdf.js still works this way.
function keepTextAnnotationIcons(pdfPage: PDFPageProxy, textType: number) {
  const getAnnotations = pdfPage.getAnnotations.bind(pdfPage)
  pdfPage.getAnnotations = async params => (await getAnnotations(params)).map(annotation =>
    annotation.annotationType === textType && !TEXT_ANNOTATION_ICONS.includes(String(annotation.name).toLowerCase())
      ? {...annotation, name: 'Note'}
      : annotation)
}

// Canvases larger than this are drawn at a lower resolution: the limit of the pdf.js viewer on phones and tablets,
// 16 MP (64 MB per page drawn) elsewhere, where the pdf.js viewer allows 32 MP.
function maxCanvasPixels(): number {
  const {maxTouchPoints, platform, userAgent} = navigator
  const ios = /\b(?:iPad|iPhone|iPod)(?=;)/.test(userAgent) || (platform === 'MacIntel' && maxTouchPoints > 1)
  return ios || /Android/.test(userAgent) ? 5242880 : 4096 * 4096
}

let pdfJs: Promise<PdfJs> | undefined

// pdf.js is only loaded when a PDF page is displayed
export function loadPdfJs(): Promise<PdfJs> {
  if (!pdfJs) {
    pdfJs = importPdfJs().catch(e => {
      // tried again by the next page
      pdfJs = undefined
      throw e
    })
  }
  return pdfJs
}

async function importPdfJs(): Promise<PdfJs> {
  const lib = await import(/* webpackChunkName: "pdfjs" */ 'pdfjs-lib')
  // the viewer components read the library from this global when their module is evaluated
  Object.assign(globalThis, {pdfjsLib: lib})
  const viewer = await import(/* webpackChunkName: "pdfjs" */ 'pdfjs-viewer')

  // absolute url, as the worker fetches the assets itself
  const base = new URL(process.env.VUE_APP_PDFJS_ASSETS!!, new URL(__webpack_public_path__, window.location.href)).toString()
  lib.GlobalWorkerOptions.workerSrc = `${base}pdf.worker.min.mjs`

  // shared by all the page views, otherwise each one parses its own copy of the translations
  const l10n = new viewer.GenericL10n()
  const layerProperties = {
    annotationEditorUIManager: null,
    annotationStorage: null,
    downloadManager: null,
    enableScripting: false as const,
    fieldObjectsPromise: null,
    findController: null,
    hasJSActionsPromise: null,
    // links of a PDF file open in a new tab, never in place of the reader
    linkService: new viewer.SimpleLinkService({externalLinkTarget: viewer.LinkTarget.BLANK}),
  }

  return {
    lib,
    viewer,
    documentOptions: {
      cMapUrl: `${base}cmaps/`,
      standardFontDataUrl: `${base}standard_fonts/`,
      wasmUrl: `${base}wasm/`,
      iccUrl: `${base}iccs/`,
      enableXfa: false,
    },
    createPageView({container, id, pdfPage, viewport, scale}) {
      const pageView = new viewer.PDFPageView({
        container,
        id,
        scale,
        defaultViewport: viewport,
        eventBus: new viewer.EventBus(),
        // annotations are drawn, and links work, but forms are not filled in
        annotationMode: lib.AnnotationMode.ENABLE,
        maxCanvasPixels: maxCanvasPixels(),
        // pages larger than the canvas limit are drawn at the highest resolution allowed:
        // the sharper detail view drawn over them only exists in the pdf.js viewer
        enableDetailCanvas: false,
        // only the links of the file, not the addresses found in its text
        enableAutoLinking: false,
        // icons of the text annotations
        imageResourcesPath: `${base}images/`,
        l10n,
        layerProperties,
      })
      // the label of the page for screen readers, translated once as the translations are shared
      l10n.translateOnce(pageView.div)
      keepTextAnnotationIcons(pdfPage, lib.AnnotationType.TEXT)
      pageView.setPdfPage(pdfPage)
      return pageView
    },
  }
}
