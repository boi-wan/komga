import type * as PinchZoom from '@/functions/pinch-zoom'

// the visual viewport of the browser, pinch-zoomed by the tests
const viewport = Object.assign(new EventTarget(), {scale: 1})
Object.defineProperty(window, 'visualViewport', {value: viewport, configurable: true})

let pinchZoom: typeof PinchZoom.pinchZoom
const pinch = (scale: number) => {
  viewport.scale = scale
  viewport.dispatchEvent(new Event('resize'))
}

beforeEach(() => {
  // the zoom is watched by the module: each test gets a new one
  jest.resetModules()
  jest.useFakeTimers()
  viewport.scale = 1
  pinchZoom = require('@/functions/pinch-zoom').pinchZoom
})

afterEach(() => {
  jest.useRealTimers()
})

describe('Pinch-zoom', () => {
  test('given a pinch when it ends then its zoom is known, not while pinching', () => {
    pinch(1.5)
    pinch(2)
    jest.advanceTimersByTime(299)
    expect(pinchZoom.scale).toEqual(1)

    jest.advanceTimersByTime(1)
    expect(pinchZoom.scale).toEqual(2)
  })

  test('given a zoom when it changes by less than a tenth then it is kept', () => {
    pinch(2)
    jest.advanceTimersByTime(300)

    pinch(2.05)
    jest.advanceTimersByTime(300)

    expect(pinchZoom.scale).toEqual(2)
  })

  test('given a zoom below 1 when the pinch ends then the zoom is 1', () => {
    pinch(2)
    jest.advanceTimersByTime(300)

    pinch(0.8)
    jest.advanceTimersByTime(300)

    expect(pinchZoom.scale).toEqual(1)
  })
})
