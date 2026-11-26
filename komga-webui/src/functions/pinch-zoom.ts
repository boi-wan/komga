import Vue from 'vue'
import {debounce} from 'lodash'

// Zoom of the page by the browser (pinch-zoom), known once a pinch ends.
// Canvases are drawn for the screen, and a pinch only stretches them: the PDF pages are drawn again for the zoom.
export const pinchZoom = Vue.observable({scale: 1})

const viewport = window.visualViewport
if (viewport) {
  viewport.addEventListener('resize', debounce(() => {
    const scale = Math.max(1, viewport.scale)
    // a smaller change is not worth drawing the pages again
    if (Math.abs(scale - pinchZoom.scale) >= 0.1) pinchZoom.scale = scale
  }, 300))
}
