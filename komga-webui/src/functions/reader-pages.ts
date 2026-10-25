import {PageDtoWithUrl} from '@/types/komga-books'

// Pages given to the readers: those with a pdfUrl are drawn by pdf.js, unless the rendering of PDF pages is off,
// then every page is shown as its server image.
export function readerPages(pages: PageDtoWithUrl[], pdfRendering: boolean): PageDtoWithUrl[] {
  if (pdfRendering) return pages
  return pages.map(p => p.pdfUrl ? {...p, pdfUrl: undefined} : p)
}

// Whether two lists of pages show the same book, e.g. before and after the rendering of PDF pages is turned on or off.
export function sameBookPages(a: PageDtoWithUrl[] | undefined, b: PageDtoWithUrl[] | undefined): boolean {
  return !!a && !!b && a.length === b.length && a.every((page, i) => page.url === b[i].url)
}
