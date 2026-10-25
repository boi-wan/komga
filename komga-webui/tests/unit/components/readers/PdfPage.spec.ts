import {mount} from '@vue/test-utils'
import PdfPage from '@/components/readers/PdfPage.vue'
import {loadPdfPage} from '@/functions/pdf-page-source'
import {ScaleType} from '@/types/enum-reader'

// fake page views, recording what pdf.js would draw
interface MockView {
  options: any,
  div: HTMLDivElement,
  draws: number,
  destroyed: boolean,
}

const mockViews: MockView[] = []
const mockDraw: { error?: any } = {}
jest.mock('@/functions/pdfjs', () => ({
  loadPdfJs: async () => ({
    lib: {PixelsPerInch: {PDF_TO_CSS_UNITS: 96 / 72}, AnnotationMode: {ENABLE: 2}},
    viewer: {
      EventBus: class {
      },
      RenderingStates: {INITIAL: 0},
      PDFPageView: class {
        div = globalThis.document.createElement('div')
        renderingState = 0
        draws = 0
        destroyed = false
        options: any

        constructor(options: any) {
          this.options = options
          options.container.appendChild(this.div)
          mockViews.push(this)
        }

        setPdfPage() {
        }

        update({scale}: { scale: number }) {
          this.options.scale = scale
          this.renderingState = 0
        }

        async draw() {
          this.renderingState = 3
          this.draws++
          if (mockDraw.error) throw mockDraw.error
        }

        destroy() {
          this.destroyed = true
        }
      },
    },
    pageViewOptions: {l10n: {translateOnce: async () => undefined}, layerProperties: {}},
  }),
}))
jest.mock('@/functions/pdf-page-source', () => ({loadPdfPage: jest.fn()}))

// a US Letter page, with the release of its document
function loadedPage() {
  return {
    pdfPage: {getViewport: ({scale}: { scale: number }) => ({width: 612 * scale, height: 792 * scale})},
    release: jest.fn(),
  }
}

const page = (n: number) => ({number: n, url: `/pages/${n}`, pdfUrl: `/pages/${n}/raw`, mediaType: 'application/pdf', size: ''})

function mountPage(props: object = {}) {
  return mount(PdfPage, {
    propsData: {page: page(1), fit: ScaleType.SCREEN, width: 800, height: 600, ...props},
    mocks: {$warn: jest.fn()},
  })
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

beforeEach(() => {
  mockViews.length = 0
  mockDraw.error = undefined
  jest.mocked(loadPdfPage).mockReset()
})

describe('PdfPage', () => {
  test('given active page when mounted then its PDF page is loaded, drawn and its size emitted', async () => {
    jest.mocked(loadPdfPage).mockResolvedValue(loadedPage())

    const wrapper = mountPage()
    await flush()

    expect(jest.mocked(loadPdfPage).mock.calls[0][0]).toEqual('/pages/1/raw')
    expect(mockViews[0].draws).toEqual(1)
    expect(wrapper.emitted('load')).toEqual([[{width: 816, height: 1056}]])
  })

  test('given inactive page when mounted then nothing is loaded', async () => {
    mountPage({active: false})
    await flush()

    expect(loadPdfPage).not.toHaveBeenCalled()
  })

  test('given drawn page when deactivated then its view is dropped and its page released', async () => {
    const loaded = loadedPage()
    jest.mocked(loadPdfPage).mockResolvedValue(loaded)
    const wrapper = mountPage()
    await flush()

    await wrapper.setProps({active: false})

    expect(mockViews[0].destroyed).toBe(true)
    expect(mockViews[0].div.isConnected).toBe(false)
    expect(loaded.release).toHaveBeenCalledTimes(1)
  })

  test('given drawn page when its pdfUrl changes then the previous page is released and the new one loaded', async () => {
    const first = loadedPage()
    jest.mocked(loadPdfPage).mockResolvedValueOnce(first).mockResolvedValueOnce(loadedPage())
    const wrapper = mountPage()
    await flush()

    await wrapper.setProps({page: page(2)})
    await flush()

    expect(first.release).toHaveBeenCalledTimes(1)
    expect(jest.mocked(loadPdfPage).mock.calls[1][0]).toEqual('/pages/2/raw')
    expect(mockViews.map(v => v.destroyed)).toEqual([true, false])
  })

  test('given page deactivated while loading when the load completes then the page is released and not drawn', async () => {
    let complete: (value: ReturnType<typeof loadedPage>) => void = () => undefined
    jest.mocked(loadPdfPage).mockReturnValue(new Promise(resolve => complete = resolve))
    const wrapper = mountPage()
    await flush()

    await wrapper.setProps({active: false})
    const loaded = loadedPage()
    complete(loaded)
    await flush()

    expect(loaded.release).toHaveBeenCalledTimes(1)
    expect(mockViews).toHaveLength(0)
    expect(wrapper.find('img').exists()).toBe(false)
  })

  test('given page that cannot be loaded when loading then the server image is shown', async () => {
    jest.mocked(loadPdfPage).mockRejectedValue(new Error('HTTP 500'))

    const wrapper = mountPage()
    await flush()

    expect(wrapper.find('img').attributes('src')).toEqual('/pages/1')
  })

  test('given load aborted when loading then no server image is shown', async () => {
    jest.mocked(loadPdfPage).mockRejectedValue(new DOMException('Page not needed anymore', 'AbortError'))

    const wrapper = mountPage()
    await flush()

    expect(wrapper.find('img').exists()).toBe(false)
  })

  test('given drawn page when the available space changes then it is drawn again at the new scale', async () => {
    jest.mocked(loadPdfPage).mockResolvedValue(loadedPage())
    const wrapper = mountPage()
    await flush()

    await wrapper.setProps({height: 300})
    await flush()

    expect(mockViews[0].draws).toEqual(2)
    expect(mockViews[0].options.scale).toBeCloseTo(300 / 1056)
  })

  test('given drawn page when drawing it again fails then the server image is shown', async () => {
    const loaded = loadedPage()
    jest.mocked(loadPdfPage).mockResolvedValue(loaded)
    const wrapper = mountPage()
    await flush()

    mockDraw.error = new Error('broken page')
    await wrapper.setProps({height: 300})
    await flush()

    expect(wrapper.find('img').attributes('src')).toEqual('/pages/1')
    expect(loaded.release).toHaveBeenCalledTimes(1)
  })

  test('given drawn page when drawing it again is cancelled then the page stays', async () => {
    jest.mocked(loadPdfPage).mockResolvedValue(loadedPage())
    const wrapper = mountPage()
    await flush()

    mockDraw.error = {name: 'RenderingCancelledException'}
    await wrapper.setProps({height: 300})
    await flush()

    expect(wrapper.find('img').exists()).toBe(false)
    expect(mockViews[0].destroyed).toBe(false)
  })
})
