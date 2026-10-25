import type * as PdfJsLib from 'pdfjs-lib'
import type * as PdfJsViewer from 'pdfjs-viewer'

export interface PdfJs {
  lib: typeof PdfJsLib,
  viewer: typeof PdfJsViewer,
  // urls of the assets copied by vue.config.js, to pass to getDocument
  assets: {
    cMapUrl: string,
    standardFontDataUrl: string,
    wasmUrl: string,
    iccUrl: string,
  },
  // options shared by all the page views
  pageViewOptions: {
    l10n: PdfJsViewer.GenericL10n,
    layerProperties: PdfJsViewer.LayerProperties,
  },
}

let pdfJs: Promise<PdfJs> | undefined

// pdf.js is only loaded when a PDF page is displayed
export function loadPdfJs(): Promise<PdfJs> {
  if (!pdfJs) pdfJs = importPdfJs()
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

  return {
    lib,
    viewer,
    assets: {
      cMapUrl: `${base}cmaps/`,
      standardFontDataUrl: `${base}standard_fonts/`,
      wasmUrl: `${base}wasm/`,
      iccUrl: `${base}iccs/`,
    },
    pageViewOptions: {
      // otherwise each page view parses its own copy of the translations
      l10n: new viewer.GenericL10n(),
      layerProperties: {
        annotationEditorUIManager: null,
        annotationStorage: null,
        downloadManager: null,
        enableScripting: false,
        fieldObjectsPromise: null,
        findController: null,
        hasJSActionsPromise: null,
        // links of a PDF file open in a new tab, never in place of the reader
        linkService: new viewer.SimpleLinkService({externalLinkTarget: viewer.LinkTarget.BLANK}),
      },
    },
  }
}
