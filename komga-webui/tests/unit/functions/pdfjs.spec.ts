import type * as PdfJs from '@/functions/pdfjs'

// fake pdf.js modules, recording the options of the page views
const mockPageViews: any[] = []
const mockLinkServices: any[] = []
const mockImport = {fail: false}
jest.mock('pdfjs-lib', () => {
  if (mockImport.fail) throw new Error('chunk not loaded')
  return {GlobalWorkerOptions: {}, AnnotationMode: {ENABLE: 2}, AnnotationType: {TEXT: 1}}
}, {virtual: true})
jest.mock('pdfjs-viewer', () => ({
  EventBus: class {
  },
  GenericL10n: class {
    translateOnce = jest.fn()
  },
  LinkTarget: {BLANK: 2},
  SimpleLinkService: class {
    constructor(options: any) {
      mockLinkServices.push(options)
    }
  },
  PDFPageView: class {
    div = globalThis.document.createElement('div')
    setPdfPage = jest.fn()

    constructor(options: any) {
      mockPageViews.push(options)
    }
  },
}), {virtual: true})

let pdfjs: typeof PdfJs
const userAgent = jest.spyOn(navigator, 'userAgent', 'get')

beforeEach(() => {
  // pdf.js is loaded once by the module: each test gets a new one
  jest.resetModules()
  mockPageViews.length = 0
  mockLinkServices.length = 0
  mockImport.fail = false
  userAgent.mockReturnValue('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/130.0.0.0')
  process.env.VUE_APP_PDFJS_ASSETS = 'js/pdfjs-6.4.299/'
  Object.assign(globalThis, {__webpack_public_path__: '/'})
  pdfjs = require('@/functions/pdfjs')
})

async function createPageView(pdfPage: any = {getAnnotations: async () => []}) {
  const {createPageView} = await pdfjs.loadPdfJs()
  createPageView({container: document.createElement('div'), id: 1, pdfPage, viewport: {width: 816, height: 1056}, scale: 1})
  return mockPageViews[0]
}

describe('Page views', () => {
  test('given a page view when created then it draws the links of the page, but no forms, scripts or editing', async () => {
    const options = await createPageView()

    expect(options.annotationMode).toEqual(2)
    expect(options.layerProperties).toMatchObject({
      enableScripting: false,
      annotationStorage: null,
      annotationEditorUIManager: null,
      downloadManager: null,
      fieldObjectsPromise: null,
      hasJSActionsPromise: null,
    })
  })

  test('given a page view when created then its links open in a new tab, and addresses in the text are not links', async () => {
    const options = await createPageView()

    expect(mockLinkServices).toEqual([{externalLinkTarget: 2}])
    expect(options.enableAutoLinking).toBe(false)
  })

  test('given a page view when created then its assets are under the versioned folder', async () => {
    const options = await createPageView()

    expect(options.imageResourcesPath).toEqual('http://localhost/js/pdfjs-6.4.299/images/')
  })

  test('given a desktop browser when creating a page view then its canvas is limited to 16 MP', async () => {
    expect((await createPageView()).maxCanvasPixels).toEqual(4096 * 4096)
  })

  test('given a phone when creating a page view then its canvas is limited to 5 MP, like the pdf.js viewer', async () => {
    userAgent.mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1')

    expect((await createPageView()).maxCanvasPixels).toEqual(5242880)
  })
})

describe('Text annotations', () => {
  // a page with these annotations, as pdf.js reads them from the file
  const pageWith = (...annotations: object[]) => ({getAnnotations: async () => annotations})

  test('given text annotation with an icon of pdf.js when its page is shown then its icon is kept', async () => {
    const page = pageWith({annotationType: 1, name: 'Comment'}, {annotationType: 1, name: 'NewParagraph'})

    await createPageView(page)

    expect((await page.getAnnotations()).map((a: any) => a.name)).toEqual(['Comment', 'NewParagraph'])
  })

  test('given text annotation whose icon name is a path when its page is shown then it gets the note icon', async () => {
    const link = {annotationType: 2, name: 'x/../../api/logout?'}
    const page = pageWith({annotationType: 1, name: 'x/../../api/logout?'}, {annotationType: 1}, link)

    await createPageView(page)

    expect(await page.getAnnotations()).toEqual([{annotationType: 1, name: 'Note'}, {annotationType: 1, name: 'Note'}, link])
  })
})

describe('Documents', () => {
  test('given pdf.js loaded then documents never show XFA forms', async () => {
    const {documentOptions} = await pdfjs.loadPdfJs()

    expect(documentOptions.enableXfa).toBe(false)
  })
})

describe('Loading', () => {
  test('given pdf.js that could not be loaded when a page needs it again then it is loaded again', async () => {
    mockImport.fail = true
    await expect(pdfjs.loadPdfJs()).rejects.toThrow('chunk not loaded')

    mockImport.fail = false

    await expect(pdfjs.loadPdfJs()).resolves.toHaveProperty('createPageView')
  })
})
