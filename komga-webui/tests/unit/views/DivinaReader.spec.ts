import Vue from 'vue'
import Vuetify from 'vuetify'
import {shallowMount, Wrapper} from '@vue/test-utils'
import lodash from 'lodash'
import DivinaReader from '@/views/DivinaReader.vue'
import PagedReader from '@/components/readers/PagedReader.vue'
import {MediaProfile} from '@/types/enum-books'

Vue.use(Vuetify)
// the translations are loaded by webpack
jest.mock('@/i18n', () => ({t: (key: string) => key}))

const book = (id: string, mediaProfile: MediaProfile) => ({
  id, seriesId: 'series', oneshot: false, name: id, metadata: {title: id, number: '1'}, media: {mediaProfile},
})
const books: Record<string, any> = {
  pdf: book('pdf', MediaProfile.PDF),
  'next-pdf': book('next-pdf', MediaProfile.PDF),
  comic: book('comic', MediaProfile.DIVINA),
}
const pageDtos = () => [1, 2, 3].map(n => ({number: n, fileName: `${n}.jpg`, mediaType: 'image/jpeg', width: 3200, height: 4141, size: ''}))

let wrapper: Wrapper<any>

async function openReader(bookId: string, webreader: object = {}) {
  wrapper = shallowMount(DivinaReader, {
    vuetify: new Vuetify(),
    propsData: {bookId},
    mocks: {
      $t: (key: string) => key,
      $i18n: {t: (key: string) => key},
      $debug: jest.fn(),
      $_: lodash,
      $store: {state: {persistedState: {webreader: {paged: {}, continuous: {}, animations: false, swipe: false, alwaysFullscreen: false, pdfClientRendering: true, ...webreader}}}, commit: jest.fn()},
      $route: {query: {}, params: {bookId}, name: 'read-book'},
      $router: {replace: jest.fn(), push: jest.fn()},
      $komgaBooks: {
        getBook: async (id: string) => books[id],
        getBookPages: async () => pageDtos(),
        updateReadProgress: jest.fn(),
        getBookSiblingNext: async () => Promise.reject(new Error('no next book')),
        getBookSiblingPrevious: async () => Promise.reject(new Error('no previous book')),
      },
      $komgaSeries: {getOneSeries: async () => ({metadata: {title: 'Series', readingDirection: ''}})},
    },
  })
  await flush()
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0))
const reader = () => wrapper.findComponent(PagedReader)
// PDF pages drawn by pdf.js, as given to the reader
const drawnPages = () => reader().props('pages').map((p: any) => !!p.pdfUrl)
const pressX = () => window.dispatchEvent(new KeyboardEvent('keydown', {key: 'x'}))

afterEach(() => wrapper.destroy())

describe('PDF pages', () => {
  test('given a PDF book when opened then its pages are drawn by pdf.js, and their text can be selected', async () => {
    await openReader('pdf')

    pressX()
    await wrapper.vm.$nextTick()

    expect(drawnPages()).toEqual([true, true, true])
    expect(reader().props('textSelection')).toBe(true)
  })

  test('given a PDF page that pdf.js cannot draw when reported then that page is shown as an image', async () => {
    await openReader('pdf')

    reader().vm.$emit('pdf-page-fail', 2, false)
    await wrapper.vm.$nextTick()

    expect(drawnPages()).toEqual([true, false, true])
  })

  test('given pdf.js that cannot be loaded when reported then every page is an image, and text selection ends', async () => {
    await openReader('pdf')
    pressX()
    await wrapper.vm.$nextTick()

    reader().vm.$emit('pdf-page-fail', 1, true)
    await wrapper.vm.$nextTick()
    pressX()
    await wrapper.vm.$nextTick()

    expect(drawnPages()).toEqual([false, false, false])
    expect(reader().props('textSelection')).toBe(false)
  })

  test('given text selection and failures when the next book opens then it opens in read mode, with all its pages drawn by pdf.js', async () => {
    await openReader('pdf')
    pressX()
    reader().vm.$emit('pdf-page-fail', 2, false)
    reader().vm.$emit('pdf-page-fail', 1, true)

    await wrapper.vm.setup('next-pdf')
    await wrapper.vm.$nextTick()

    expect(drawnPages()).toEqual([true, true, true])
    expect(reader().props('textSelection')).toBe(false)
  })
})

describe('Books without text', () => {
  test('given the rendering of PDF pages off when a PDF book is opened then its pages are images, and text cannot be selected', async () => {
    await openReader('pdf', {pdfClientRendering: false})

    pressX()
    await wrapper.vm.$nextTick()

    expect(drawnPages()).toEqual([false, false, false])
    expect(reader().props('textSelection')).toBe(false)
  })

  test('given a book that is not a PDF when opened then text cannot be selected', async () => {
    await openReader('comic')

    pressX()
    await wrapper.vm.$nextTick()

    expect(drawnPages()).toEqual([false, false, false])
    expect(reader().props('textSelection')).toBe(false)
  })
})
