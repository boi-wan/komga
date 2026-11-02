import {ContinuousScaleType, ScaleType} from '@/types/enum-reader'

export interface Size {
  width: number,
  height: number,
}

// US Letter at scale 1, in CSS pixels: the size of PDF pages until one is loaded
export const DEFAULT_PDF_PAGE_SIZE: Size = {width: 816, height: 1056}

// pdf.js rounds the size of pages down: fitting scales are slightly larger, so that floating-point errors never lose a pixel
const ROUNDING_MARGIN = 1 + 1e-7

// scale for each fit, from the scales filling the width and the height of the area
const FITS: Record<ScaleType | ContinuousScaleType, (widthScale: number, heightScale: number) => number> = {
  [ScaleType.SCREEN]: (widthScale, heightScale) => Math.min(widthScale, heightScale),
  [ScaleType.WIDTH]: widthScale => widthScale,
  [ScaleType.WIDTH_SHRINK_ONLY]: widthScale => Math.min(1, widthScale),
  [ScaleType.HEIGHT]: (widthScale, heightScale) => heightScale,
  [ScaleType.ORIGINAL]: () => 1,
  [ContinuousScaleType.WIDTH]: widthScale => widthScale,
  [ContinuousScaleType.ORIGINAL]: () => 1,
}

// Scale of a PDF page, so that it is displayed like the images of PagedReader and ContinuousReader.
// page: size of the page at scale 1, in CSS pixels
// area: space available for the page, in CSS pixels (half the width for double pages)
export function pdfPageScale(page: Size, area: Size, fit: ScaleType | ContinuousScaleType): number {
  const widthScale = area.width / page.width * ROUNDING_MARGIN
  const heightScale = area.height / page.height * ROUNDING_MARGIN
  // unknown values are displayed at original size, like the images
  return FITS[fit]?.(widthScale, heightScale) ?? 1
}

// Size at scale 1 of a PDF page not loaded yet, in CSS pixels: the ratio of its server image,
// and the short side of a page of the same book already loaded (pages of a book usually share their short side).
// image: size of the server image, unknown for some books
// reference: size at scale 1 of a page already loaded
export function estimatePdfPageSize(image: Partial<Size>, reference: Size = DEFAULT_PDF_PAGE_SIZE): Size {
  if (!image.width || !image.height) return reference
  const imageToPdfScale = Math.min(reference.width, reference.height) / Math.min(image.width, image.height)
  return {width: image.width * imageToPdfScale, height: image.height * imageToPdfScale}
}

// Size of a PDF page drawn by pdf.js, in CSS pixels, rounded down like pdf.js does.
export function pdfPageBox(page: Size, area: Size, fit: ScaleType | ContinuousScaleType): Size {
  const scale = pdfPageScale(page, area, fit)
  return {width: Math.floor(page.width * scale), height: Math.floor(page.height * scale)}
}
