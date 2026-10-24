import {pdfPageScale} from '@/functions/pdf-page-scale'
import {ContinuousScaleType, ScaleType} from '@/types/enum-reader'

// A4 portrait at scale 1 (595x842 pt as CSS pixels)
const page = {width: 794, height: 1123}
const landscapeArea = {width: 1600, height: 900}
const portraitArea = {width: 390, height: 844}

describe('Paged reader', () => {
  test('given portrait page in landscape area when fitting screen then height is the limit', () => {
    expect(pdfPageScale(page, landscapeArea, ScaleType.SCREEN)).toBeCloseTo(900 / 1123)
  })

  test('given portrait page in portrait area when fitting screen then width is the limit', () => {
    expect(pdfPageScale(page, portraitArea, ScaleType.SCREEN)).toBeCloseTo(390 / 794)
  })

  test('given double page area when fitting screen then half the width becomes the limit', () => {
    const screen = {width: 1200, height: 900}
    const halfScreen = {width: screen.width / 2, height: screen.height}

    expect(pdfPageScale(page, screen, ScaleType.SCREEN)).toBeCloseTo(900 / 1123)
    expect(pdfPageScale(page, halfScreen, ScaleType.SCREEN)).toBeCloseTo(600 / 794)
  })

  test('given page when fitting width then page fills the width, whatever the height', () => {
    expect(pdfPageScale(page, landscapeArea, ScaleType.WIDTH)).toBeCloseTo(1600 / 794)
  })

  test('given page larger than area when fitting width shrink only then page is shrunk', () => {
    expect(pdfPageScale(page, portraitArea, ScaleType.WIDTH_SHRINK_ONLY)).toBeCloseTo(390 / 794)
  })

  test('given page smaller than area when fitting width shrink only then page keeps its size', () => {
    expect(pdfPageScale(page, landscapeArea, ScaleType.WIDTH_SHRINK_ONLY)).toEqual(1)
  })

  test('given page when fitting height then page fills the height, whatever the width', () => {
    expect(pdfPageScale(page, portraitArea, ScaleType.HEIGHT)).toBeCloseTo(844 / 1123)
  })

  test('given page when using original size then scale is 1', () => {
    expect(pdfPageScale(page, portraitArea, ScaleType.ORIGINAL)).toEqual(1)
  })

  test('given unknown fit when scaling then original size is used, like the image reader', () => {
    expect(pdfPageScale(page, portraitArea, '' as ScaleType)).toEqual(1)
  })
})

describe('Continuous reader', () => {
  test('given page when fitting width then page fills the width', () => {
    expect(pdfPageScale(page, portraitArea, ContinuousScaleType.WIDTH)).toBeCloseTo(390 / 794)
  })

  test('given page when using original size then scale is 1', () => {
    expect(pdfPageScale(page, portraitArea, ContinuousScaleType.ORIGINAL)).toEqual(1)
  })
})
