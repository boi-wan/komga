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

// fake layout: the pages are stacked from the top of the document, by the height of their style (PDF pages) or attribute (images)
let scrollY = 0
window.scrollBy = jest.fn((x: number, y: number) => scrollY += y) as any
jest.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
  let top = -scrollY
  for (const box of document.querySelectorAll<HTMLElement>('[id^=page]')) {
    const height = parseFloat(box.style.height) || Number(box.getAttribute('height')) || 0
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

    await wrapper.setProps({pages: pages.map(p => ({...p, url: `/other-book${p.url}`}))})

    expect(boxHeight(5)).toEqual(PAGE_HEIGHT)
  })
})

describe('Failed PDF pages', () => {
  test('given a PDF page when pdf.js cannot draw it then the reader reports it', () => {
    mountReader()

    pdfPage(10).vm.$emit('fail', false)

    expect(wrapper.emitted('pdf-page-fail')).toEqual([[10, false]])
  })
})

describe('Pages switched between pdf.js and images', () => {
  const asImages = pages.map(p => ({...p, pdfUrl: undefined}))
  const pageTop = (n: number) => document.getElementById(`page${n}`)!!.getBoundingClientRect().top

  // at original scale, the PDF pages are 1055 pixels high, and their images 4141: the top of the screen is in the middle of page 5
  async function scrolledToPage5AtOriginalScale() {
    mountReader({page: 5, scale: ContinuousScaleType.ORIGINAL})
    intersect(5, true)
    jest.runAllTimers()
    await wrapper.vm.$nextTick()
    scrollY = pageTop(5) + 500
  }

  test('given PDF pages at original scale when shown as images then the page at the top stays in place, and stays the current page', async () => {
    await scrolledToPage5AtOriginalScale()
    const emitted = wrapper.emitted('update:page')!!.length

    await wrapper.setProps({pages: asImages})
    await wrapper.vm.$nextTick()

    expect(wrapper.find('img#page5').exists()).toBe(true)
    expect(pageTop(5)).toEqual(-500)
    expect(wrapper.emitted('update:page')).toHaveLength(emitted)
  })

  test('given images when shown as PDF pages again then the page at the top stays in place', async () => {
    await scrolledToPage5AtOriginalScale()
    await wrapper.setProps({pages: asImages})
    await wrapper.vm.$nextTick()

    await wrapper.setProps({pages: pages})
    await wrapper.vm.$nextTick()

    expect(wrapper.find('div#page5').exists()).toBe(true)
    expect(pageTop(5)).toEqual(-500)
  })

  test('given pages on the screen when a page above them becomes an image then the page at the top stays in place, and the pages around stay mounted', async () => {
    await scrolledToPage5AtOriginalScale()
    intersect(6, true)
    intersect(7, true)
    jest.runAllTimers()
    await wrapper.vm.$nextTick()

    await wrapper.setProps({pages: pages.map(p => p.number === 4 ? {...p, pdfUrl: undefined} : p)})
    await wrapper.vm.$nextTick()

    expect(wrapper.find('img#page4').exists()).toBe(true)
    expect(pageTop(5)).toEqual(-500)
    expect(mountedPages()).toEqual([3, 5, 6, 7, 8, 9])
  })
})
