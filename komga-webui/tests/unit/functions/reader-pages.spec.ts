import {sameBookPages, toReaderPages} from '@/functions/reader-pages'
import {PageDtoWithUrl} from '@/types/komga-books'

const page = (n: number, book: string) => ({number: n, fileName: `${n}`, mediaType: 'image/jpeg', size: '', url: `/books/${book}/pages/${n}`})
const pdfPage = (n: number): PageDtoWithUrl => ({...page(n, 'a'), pdfUrl: `/books/a/pages/${n}/raw`})
const imagePage = (n: number): PageDtoWithUrl => page(n, 'b')

describe('Reader pages', () => {
  test('given PDF rendering on when giving the pages to the readers then they are the pages of the book', () => {
    const pages = [pdfPage(1), pdfPage(2)]

    expect(toReaderPages(pages, true)).toBe(pages)
  })

  test('given PDF rendering off when giving PDF pages to the readers then they are shown as images', () => {
    expect(toReaderPages([pdfPage(1), pdfPage(2)], false).map(p => p.pdfUrl)).toEqual([undefined, undefined])
  })

  test('given PDF rendering off when giving image pages to the readers then they are left as they are', () => {
    const pages = [imagePage(1), imagePage(2)]

    expect(toReaderPages(pages, false)).toEqual(pages)
    expect(toReaderPages(pages, false)[0]).toBe(pages[0])
  })
})

describe('Failed PDF pages', () => {
  test('given PDF pages pdf.js could not draw when giving the pages to the readers then those are shown as images', () => {
    expect(toReaderPages([pdfPage(1), pdfPage(2), pdfPage(3)], true, {2: true}).map(p => !!p.pdfUrl)).toEqual([true, false, true])
  })

  test('given a PDF page pdf.js could not draw when the rendering is turned off and on then it stays an image', () => {
    const pages = [pdfPage(1), pdfPage(2)]

    expect(toReaderPages(pages, false, {1: true}).map(p => !!p.pdfUrl)).toEqual([false, false])
    expect(toReaderPages(pages, true, {1: true}).map(p => !!p.pdfUrl)).toEqual([false, true])
  })
})

describe('Same book', () => {
  test('given the pages of a book when its PDF rendering changes then they are the same book', () => {
    const pages = [pdfPage(1), pdfPage(2)]

    expect(sameBookPages(pages, toReaderPages(pages, false))).toBe(true)
  })

  test('given the pages of two books then they are not the same book', () => {
    expect(sameBookPages([pdfPage(1), pdfPage(2)], [imagePage(1), imagePage(2)])).toBe(false)
    expect(sameBookPages([pdfPage(1), pdfPage(2)], [pdfPage(1)])).toBe(false)
  })

  test('given no previous pages then they are not the same book', () => {
    expect(sameBookPages([pdfPage(1)], undefined)).toBe(false)
  })
})
