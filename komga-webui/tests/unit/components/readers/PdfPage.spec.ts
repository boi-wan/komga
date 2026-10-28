import {mount} from '@vue/test-utils'
import PdfPage from '@/components/readers/PdfPage.vue'
import {drawPdfPage, loadPdfPage} from '@/functions/pdf-page-source'
import {pinchZoom} from '@/functions/pinch-zoom'
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
const mockPdfJs: { error?: any } = {}
jest.mock('@/functions/pdfjs', () => {
  class MockPageView {
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
  }

  return {
    loadPdfJs: async () => mockPdfJs.error ? Promise.reject(mockPdfJs.error) : ({
      lib: {PixelsPerInch: {PDF_TO_CSS_UNITS: 96 / 72}},
      viewer: {RenderingStates: {INITIAL: 0}},
      createPageView: (options: any) => new MockPageView(options),
    }),
  }
})
jest.mock('@/functions/pdf-page-source', () => ({loadPdfPage: jest.fn(), drawPdfPage: jest.fn()}))
// the pinch-zoom of the browser, set by the tests
jest.mock('@/functions/pinch-zoom', () => ({pinchZoom: require('vue').observable({scale: 1})}))

// a US Letter page, with the release of its document
function loadedPage() {
  return {
    pdfPage: {getViewport: ({scale}: { scale: number }) => ({width: 612 * scale, height: 792 * scale}), getAnnotations: async () => []},
    release: jest.fn(),
  }
}

function mountPage(props: object = {}) {
  return mount(PdfPage, {
    propsData: {url: '/pages/1/raw', pageNumber: 1, fit: ScaleType.SCREEN, width: 800, height: 600, ...props},
    mocks: {$warn: jest.fn()},
  })
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0))

beforeEach(() => {
  mockViews.length = 0
  mockDraw.error = undefined
  mockPdfJs.error = undefined
  pinchZoom.scale = 1
  jest.mocked(loadPdfPage).mockReset()
  // drawn right away, unless a test makes the pages wait for their turn
  jest.mocked(drawPdfPage).mockReset().mockImplementation(draw => draw())
})

describe('PdfPage', () => {
  test('given page when mounted then its PDF page is loaded, drawn and its size emitted', async () => {
    jest.mocked(loadPdfPage).mockResolvedValue(loadedPage())

    const wrapper = mountPage()
    await flush()

    expect(jest.mocked(loadPdfPage).mock.calls[0][0]).toEqual('/pages/1/raw')
    expect(mockViews[0].draws).toEqual(1)
    expect(wrapper.emitted('load')).toEqual([[{width: 816, height: 1056}]])
  })

  test('given drawn page when unmounted then its view is dropped and its page released', async () => {
    const loaded = loadedPage()
    jest.mocked(loadPdfPage).mockResolvedValue(loaded)
    const wrapper = mountPage()
    await flush()
    const view = mockViews[0]

    wrapper.destroy()

    expect(view.destroyed).toBe(true)
    expect(view.div.isConnected).toBe(false)
    expect(loaded.release).toHaveBeenCalledTimes(1)
  })

  test('given page unmounted while loading when the load completes then the page is released and not drawn', async () => {
    let complete: (value: ReturnType<typeof loadedPage>) => void = () => undefined
    jest.mocked(loadPdfPage).mockReturnValue(new Promise(resolve => complete = resolve))
    const wrapper = mountPage()
    await flush()

    wrapper.destroy()
    const loaded = loadedPage()
    complete(loaded)
    await flush()

    expect(loaded.release).toHaveBeenCalledTimes(1)
    expect(mockViews).toHaveLength(0)
    expect(wrapper.emitted('fail')).toBeUndefined()
  })

  test('given page that cannot be loaded when loading then the failure is reported for this page', async () => {
    jest.mocked(loadPdfPage).mockRejectedValue(new Error('HTTP 500'))

    const wrapper = mountPage()
    await flush()

    expect(wrapper.emitted('fail')).toEqual([[false]])
  })

  test('given pdf.js that cannot be loaded when loading then the failure is reported for every page', async () => {
    mockPdfJs.error = new Error('chunk not loaded')

    const wrapper = mountPage()
    await flush()

    expect(wrapper.emitted('fail')).toEqual([[true]])
    expect(loadPdfPage).not.toHaveBeenCalled()
  })

  test('given load aborted when loading then no failure is reported', async () => {
    jest.mocked(loadPdfPage).mockRejectedValue(new DOMException('Page not needed anymore', 'AbortError'))

    const wrapper = mountPage()
    await flush()

    expect(wrapper.emitted('fail')).toBeUndefined()
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

  test('given drawn page when drawing it again fails then the failure is reported and the page released', async () => {
    const loaded = loadedPage()
    jest.mocked(loadPdfPage).mockResolvedValue(loaded)
    const wrapper = mountPage()
    await flush()

    mockDraw.error = new Error('broken page')
    await wrapper.setProps({height: 300})
    await flush()

    expect(wrapper.emitted('fail')).toEqual([[false]])
    expect(loaded.release).toHaveBeenCalledTimes(1)
  })

  test('given page waiting for its turn to be drawn when unmounted then its drawing is dropped', async () => {
    jest.mocked(loadPdfPage).mockResolvedValue(loadedPage())
    jest.mocked(drawPdfPage).mockImplementation(() => new Promise(() => undefined))
    const wrapper = mountPage()
    await flush()
    const signal = jest.mocked(drawPdfPage).mock.calls[0][2]

    wrapper.destroy()

    expect(signal.aborted).toBe(true)
  })

  test('given page waiting for its turn to be drawn when the scale changes then it waits to be drawn at the new scale only', async () => {
    jest.mocked(loadPdfPage).mockResolvedValue(loadedPage())
    jest.mocked(drawPdfPage).mockImplementation(() => new Promise(() => undefined))
    const wrapper = mountPage()
    await flush()

    await wrapper.setProps({height: 300})
    await flush()

    const signals = jest.mocked(drawPdfPage).mock.calls.map(call => call[2].aborted)
    expect(signals).toEqual([true, false])
    expect(mockViews[0].options.scale).toBeCloseTo(300 / 1056)
  })

  test('given drawn page when pinch-zoomed then it is drawn again for the zoom, shrunk back to its size', async () => {
    jest.mocked(loadPdfPage).mockResolvedValue(loadedPage())
    const wrapper = mountPage()
    await flush()
    const scale = mockViews[0].options.scale

    pinchZoom.scale = 2
    await flush()

    expect(mockViews[0].options.scale).toBeCloseTo(scale * 2)
    expect(mockViews[0].draws).toEqual(2)
    const box = wrapper.find('.pdfViewer').element.parentElement!!
    expect(box.style.width).toEqual(`${Math.floor(816 * scale)}px`)
    expect(box.style.height).toEqual(`${Math.floor(1056 * scale)}px`)
    expect(wrapper.find('.pdfViewer').attributes('style')).toContain('scale(0.5)')
  })

  test('given pinch-zoomed page when the zoom is back to 1 then it is drawn as before', async () => {
    jest.mocked(loadPdfPage).mockResolvedValue(loadedPage())
    const wrapper = mountPage()
    await flush()
    const scale = mockViews[0].options.scale
    pinchZoom.scale = 2
    await flush()

    pinchZoom.scale = 1
    await flush()

    expect(mockViews[0].options.scale).toEqual(scale)
    expect(wrapper.find('.pdfViewer').attributes('style') || '').not.toContain('scale')
    expect(wrapper.find('.pdfViewer').element.parentElement!!.style.width).toEqual('')
  })

  test('given drawn page when text selection turns on then it is marked for text selection, without drawing the page again', async () => {
    jest.mocked(loadPdfPage).mockResolvedValue(loadedPage())
    const wrapper = mountPage()
    await flush()
    expect(wrapper.classes()).not.toContain('text-selection')

    await wrapper.setProps({textSelection: true})
    await flush()

    expect(wrapper.classes()).toContain('text-selection')
    expect(mockViews).toHaveLength(1)
    expect(mockViews[0].draws).toEqual(1)
  })
})
