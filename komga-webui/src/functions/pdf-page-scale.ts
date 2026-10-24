import {ContinuousScaleType, ScaleType} from '@/types/enum-reader'

export interface Size {
  width: number,
  height: number,
}

// pdf.js rounds the size of pages down: fitting scales are slightly larger, so that floating-point errors never lose a pixel
const ROUNDING_MARGIN = 1 + 1e-7

// Scale of a PDF page, so that it is displayed like the images of PagedReader and ContinuousReader.
// page: size of the page at scale 1, in CSS pixels
// area: space available for the page, in CSS pixels (half the width for double pages)
export function pdfPageScale(page: Size, area: Size, fit: ScaleType | ContinuousScaleType): number {
  const width = area.width / page.width * ROUNDING_MARGIN
  const height = area.height / page.height * ROUNDING_MARGIN
  switch (fit) {
    case ScaleType.SCREEN:
      return Math.min(width, height)
    case ScaleType.WIDTH:
    case ContinuousScaleType.WIDTH:
      return width
    case ScaleType.WIDTH_SHRINK_ONLY:
      return Math.min(1, width)
    case ScaleType.HEIGHT:
      return height
    default:
      return 1
  }
}
