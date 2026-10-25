import {createLocalVue, mount} from '@vue/test-utils'
import lodash from 'lodash'
import PagedReader from '@/components/readers/PagedReader.vue'
import {ReadingDirection} from '@/types/enum-books'
import {PagedReaderLayout, ScaleType} from '@/types/enum-reader'

// v-touch keeps its handlers on the element, so that the tests can swipe
const localVue = createLocalVue()
localVue.directive('touch', {
  bind(el, binding) {
    (el as any).swipe = binding.value
  },
})

const page = (n: number) => ({number: n, url: `/pages/${n}`, pdfUrl: `/pages/${n}/raw`, mediaType: 'application/pdf', size: ''})
const pages = [1, 2, 3, 4, 5].map(page)

function mountReader(props: object = {}) {
  return mount(PagedReader, {
    localVue,
    propsData: {
      pages: pages,
      page: 3,
      pageLayout: PagedReaderLayout.SINGLE_PAGE,
      animations: false,
      swipe: true,
      readingDirection: ReadingDirection.LEFT_TO_RIGHT,
      scale: ScaleType.SCREEN,
      textSelection: false,
      ...props,
    },
    stubs: {VCarousel: true, VCarouselItem: true, PdfPage: true},
    mocks: {$debug: jest.fn(), $_: lodash, $vuetify: {breakpoint: {width: 800, height: 600}}},
  })
}

// turning a page scrolls to the top
window.scrollTo = jest.fn()

const zones = '.left-quarter, .right-quarter, .top-quarter, .bottom-quarter, .center-horizontal, .center-vertical'

describe('Read mode', () => {
  test('given horizontal reading when reading then the left, right and menu zones take the clicks', () => {
    const wrapper = mountReader()

    expect(wrapper.findAll(zones).wrappers.map(z => z.classes()[0])).toEqual(['left-quarter', 'right-quarter', 'center-horizontal'])
  })

  test('given gestures on when swiping then the page turns', async () => {
    const wrapper = mountReader()

    ;(wrapper.element as any).swipe.left()
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('update:page')?.pop()).toEqual([4])
  })
})

describe('Text selection mode', () => {
  test('given text selection when reading then no zone takes the clicks', () => {
    const wrapper = mountReader({textSelection: true})

    expect(wrapper.findAll(zones)).toHaveLength(0)
  })

  test('given text selection when swiping then the page stays', async () => {
    const wrapper = mountReader({textSelection: true})
    await wrapper.vm.$nextTick()
    const emitted = wrapper.emitted('update:page')?.length

    ;(wrapper.element as any).swipe.left()
    await wrapper.vm.$nextTick()

    expect(wrapper.emitted('update:page')?.length).toEqual(emitted)
  })

  test('given text selection when turned off then the zones take the clicks again', async () => {
    const wrapper = mountReader({textSelection: true})

    await wrapper.setProps({textSelection: false})

    expect(wrapper.findAll(zones)).toHaveLength(3)
  })
})

describe('PDF pages', () => {
  test('given PDF page when pdf.js cannot draw it then it is shown as its server image', async () => {
    const wrapper = mountReader()

    wrapper.findAll('pdfpage-stub').at(0).vm.$emit('fail')
    await wrapper.vm.$nextTick()

    expect(wrapper.findAll('img').wrappers.map(i => i.attributes('src'))).toEqual(['/pages/1'])
    expect(wrapper.findAll('pdfpage-stub')).toHaveLength(4)
  })
})
