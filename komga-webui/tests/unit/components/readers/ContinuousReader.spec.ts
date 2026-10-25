import {createLocalVue, mount, Wrapper} from '@vue/test-utils'
import ContinuousReader from '@/components/readers/ContinuousReader.vue'
import {ContinuousScaleType} from '@/types/enum-reader'

const localVue = createLocalVue()
localVue.directive('intersect', {})
localVue.directive('scroll', {})

// US Letter pages, with their server image 3200 pixels wide: 800 x 1035 pixels on an 800 pixels wide screen
const page = (n: number) => ({number: n, url: `/pages/${n}`, pdfUrl: `/pages/${n}/raw`, mediaType: 'application/pdf', size: '', width: 3200, height: 4141})
const pages = Array.from({length: 20}, (_, i) => page(i + 1))
const PAGE_HEIGHT = 1035

// fake layout: the page boxes are stacked from the top of the document, by the height of their style
let scrollY = 0
window.scrollBy = jest.fn((x: number, y: number) => scrollY += y) as any
jest.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
  let top = -scrollY
  for (const box of document.querySelectorAll<HTMLElement>('[id^=page]')) {
    const height = parseFloat(box.style.height) || 0
    if (box === this) return {top: top, bottom: top + height, height: height} as DOMRect
    top += height
  }
  return {top: 0, bottom: 0, height: 0} as DOMRect
})

let wrapper: Wrapper<any>

function mountReader(props: object = {}) {
  wrapper = mount(ContinuousReader, {
    localVue,
    attachTo: document.body,
    propsData: {
      pages: pages,
      page: 10,
      animations: false,
      scale: ContinuousScaleType.WIDTH,
      sidePadding: 0,
      pageMargin: 0,
      textSelection: false,
      ...props,
    },
    stubs: {PdfPage: true},
    mocks: {$vuetify: {breakpoint: {width: 800, height: 600}, goTo: jest.fn()}},
  })
  return wrapper
}

const mountedPages = () => wrapper.findAll('pdfpage-stub').wrappers.map(p => p.element.parentElement!!.id.replace('page', '')).map(Number)
const pdfPage = (n: number) => wrapper.findAll('pdfpage-stub').wrappers.find(p => p.element.parentElement!!.id === `page${n}`)!!
const boxHeight = (n: number) => parseFloat((document.getElementById(`page${n}`) as HTMLElement).style.height)
// what the observer of each page reports
const intersect = (n: number, isIntersecting: boolean) =>
  wrapper.vm.onIntersect([{target: document.getElementById(`page${n}`), isIntersecting}])

beforeEach(() => {
  jest.useFakeTimers()
  scrollY = 0
  jest.mocked(window.scrollBy).mockClear()
})

afterEach(() => {
  wrapper.destroy()
  jest.useRealTimers()
})

describe('Mounted PDF pages', () => {
  test('given no page on the screen yet when mounted then the pages around the current page are mounted', () => {
    mountReader()

    expect(mountedPages()).toEqual([8, 9, 10, 11, 12])
  })

  test('given pages on the screen when they are reported then the pages within 2 pages of them are mounted', async () => {
    mountReader()

    intersect(10, true)
    intersect(11, true)
    intersect(12, true)
    jest.runAllTimers()
    await wrapper.vm.$nextTick()

    expect(mountedPages()).toEqual([8, 9, 10, 11, 12, 13, 14])
  })

  test('given a jump back when the observers report the pages one by one then the pages in between are never mounted', async () => {
    mountReader({page: 19})
    intersect(19, true)
    intersect(20, true)
    jest.runAllTimers()
    await wrapper.vm.$nextTick()

    intersect(2, true)
    await wrapper.vm.$nextTick()
    const mountedWhileReporting = mountedPages().length
    intersect(19, false)
    intersect(20, false)
    jest.runAllTimers()
    await wrapper.vm.$nextTick()

    expect(mountedWhileReporting).toBeLessThanOrEqual(5)
    expect(mountedPages()).toEqual([1, 2, 3, 4])
  })
})

describe('Page sizes', () => {
  // the top of the screen is in the middle of page 5
  async function scrolledToPage5() {
    mountReader({page: 5})
    intersect(5, true)
    jest.runAllTimers()
    await wrapper.vm.$nextTick()
    scrollY = 4 * PAGE_HEIGHT + 500
  }

  test('given a page above the screen when its size is known then the page at the top stays in place', async () => {
    await scrolledToPage5()

    pdfPage(3).vm.$emit('load', {width: 816, height: 1300})
    await wrapper.vm.$nextTick()

    expect(boxHeight(3)).toEqual(Math.floor(1300 * 800 / 816))
    expect(window.scrollBy).toHaveBeenCalledWith(0, boxHeight(3) - PAGE_HEIGHT)
  })

  test('given a page loaded again when its size is the same then the scroll is not corrected again', async () => {
    await scrolledToPage5()

    pdfPage(3).vm.$emit('load', {width: 816, height: 1300})
    await wrapper.vm.$nextTick()
    pdfPage(3).vm.$emit('load', {width: 816, height: 1300})
    await wrapper.vm.$nextTick()

    expect(window.scrollBy).toHaveBeenCalledTimes(1)
  })

  test('given the current page pushed off the screen by the page at the top then the page at the top becomes the current page', async () => {
    await scrolledToPage5()
    intersect(6, true)
    const emitted = wrapper.emitted('update:page')!!
    expect(emitted[emitted.length - 1]).toEqual([6])
    const before = emitted.length

    pdfPage(5).vm.$emit('load', {width: 816, height: 3000})
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('update:page')!!.slice(before)).toEqual([[5]])
  })

  test('given new pages when the book changes then the sizes of the previous book are forgotten', async () => {
    await scrolledToPage5()
    pdfPage(5).vm.$emit('load', {width: 816, height: 1300})
    await wrapper.vm.$nextTick()

    await wrapper.setProps({pages: pages.map(p => ({...p}))})

    expect(boxHeight(5)).toEqual(PAGE_HEIGHT)
  })
})

describe('Failed PDF pages', () => {
  test('given a PDF page on the screen when pdf.js cannot draw it then it is shown as its server image', async () => {
    mountReader()
    intersect(10, true)

    pdfPage(10).vm.$emit('fail')
    await wrapper.vm.$nextTick()

    expect(wrapper.find('img#page10').attributes('src')).toEqual('/pages/10')
    expect(mountedPages()).toEqual([8, 9, 11, 12])
  })
})
