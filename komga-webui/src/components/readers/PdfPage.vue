<template>
  <div class="pdf-page" :class="{'text-selection': textSelection}">
    <!--  pinch-zoomed, the page is drawn larger, and shrunk back to its size  -->
    <div :style="zoomBoxStyle">
      <div ref="container" class="pdfViewer singlePageView" :style="zoomStyle"/>
    </div>
  </div>
</template>

<script lang="ts">
import Vue, {markRaw, PropType} from 'vue'
import {ContinuousScaleType, ScaleType} from '@/types/enum-reader'
import {loadPdfJs, PdfJs} from '@/functions/pdfjs'
import {drawPdfPage, loadPdfPage} from '@/functions/pdf-page-source'
import {pdfPageScale, Size} from '@/functions/pdf-page-scale'
import {pinchZoom} from '@/functions/pinch-zoom'
import type {PDFPageView} from 'pdfjs-viewer'

// A PDF page drawn by pdf.js while mounted: the readers mount it around the current page, keyed by its url.
// Emits load with the size of the page at scale 1, and fail when pdf.js cannot draw it: the reader shows the page as an image.
// fail has true when pdf.js itself could not be loaded, so no page can be drawn.
export default Vue.extend({
  name: 'PdfPage',
  data: () => {
    return {
      // size of the page at scale 1, known once loaded
      pageSize: undefined as Size | undefined,
      loadAbort: undefined as AbortController | undefined,
      // drawing waiting for its turn
      drawAbort: undefined as AbortController | undefined,
      // releases the loaded page and its document
      releasePdfPage: undefined as (() => void) | undefined,
      // pdf.js objects are marked raw, so that Vue does not observe them
      pageView: undefined as PDFPageView | undefined,
    }
  },
  props: {
    // single page PDF
    url: {
      type: String,
      required: true,
    },
    pageNumber: {
      type: Number,
      required: true,
    },
    fit: {
      type: String as PropType<ScaleType | ContinuousScaleType>,
      required: true,
    },
    // available space in CSS pixels
    width: {
      type: Number,
      required: true,
    },
    height: {
      type: Number,
      required: true,
    },
    // pages with lower values are loaded and drawn first, typically the distance to the current page
    priority: {
      type: Number,
      default: 0,
    },
    // the text and the links of the page take the clicks, instead of the reader
    textSelection: {
      type: Boolean,
      default: false,
    },
  },
  mounted() {
    this.load()
  },
  beforeDestroy() {
    this.unload()
  },
  watch: {
    drawScale(val, old) {
      // the first scale is applied by load()
      if (val && old && this.pageView) {
        this.pageView.update({scale: val})
        this.draw()
      }
    },
  },
  computed: {
    scale(): number | undefined {
      if (!this.pageSize) return undefined
      return pdfPageScale(this.pageSize, {width: this.width, height: this.height}, this.fit)
    },
    zoom(): number {
      return pinchZoom.scale
    },
    // the scale the page is drawn at, for the pinch-zoom of the browser
    drawScale(): number | undefined {
      return this.scale && this.scale * this.zoom
    },
    // the size of the page, which the page drawn for the zoom is shrunk back to
    zoomBoxStyle(): string {
      if (this.zoom === 1 || !this.pageSize || !this.scale) return ''
      return `width: ${Math.floor(this.pageSize.width * this.scale)}px; height: ${Math.floor(this.pageSize.height * this.scale)}px; overflow: hidden;`
    },
    zoomStyle(): string {
      if (this.zoom === 1) return ''
      return `transform: scale(${1 / this.zoom}); transform-origin: 0 0;`
    },
  },
  methods: {
    async load() {
      const loadAbort = new AbortController()
      this.loadAbort = loadAbort
      let pdfJs: PdfJs
      try {
        pdfJs = await loadPdfJs()
      } catch (e) {
        this.fail(e, true)
        return
      }
      try {
        const {lib, createPageView} = pdfJs
        const {pdfPage, release} = await loadPdfPage(this.url, () => this.priority, loadAbort.signal)
        // the page can be unmounted between the end of the loading and this line
        if (loadAbort.signal.aborted) {
          release()
          return
        }
        this.releasePdfPage = release

        const viewport = pdfPage.getViewport({scale: lib.PixelsPerInch.PDF_TO_CSS_UNITS})
        this.pageSize = {width: viewport.width, height: viewport.height}
        this.$emit('load', this.pageSize)

        this.pageView = markRaw(createPageView({
          container: this.$refs.container as HTMLDivElement,
          id: this.pageNumber,
          pdfPage,
          viewport,
          scale: this.drawScale!!,
        }))
        await this.draw()
      } catch (e) {
        if (e?.name !== 'AbortError') this.fail(e)
      } finally {
        this.loadAbort = undefined
      }
    },
    async draw() {
      const {viewer} = await loadPdfJs()
      const pageView = this.pageView
      if (!pageView || pageView.renderingState !== viewer.RenderingStates.INITIAL) return
      // a drawing still waiting for its turn is replaced by this one, at the current scale
      this.drawAbort?.abort()
      const drawAbort = new AbortController()
      this.drawAbort = drawAbort
      try {
        // a drawing cancelled by a new scale or an unmount resolves
        await drawPdfPage(() => pageView.draw(), () => this.priority, drawAbort.signal)
      } catch (e) {
        if (e?.name !== 'AbortError' && this.pageView === pageView) this.fail(e)
      } finally {
        if (this.drawAbort === drawAbort) this.drawAbort = undefined
      }
    },
    fail(e: any, everyPage = false) {
      this.$warn('[PdfPage]', `page:${this.pageNumber}`, e)
      this.unload()
      this.$emit('fail', everyPage)
    },
    unload() {
      this.loadAbort?.abort()
      this.loadAbort = undefined
      this.drawAbort?.abort()
      this.drawAbort = undefined
      // a page view keeps its page and layers even when destroyed, so it is dropped
      this.pageView?.destroy()
      this.pageView?.div.remove()
      this.pageView = undefined
      this.releasePdfPage?.()
      this.releasePdfPage = undefined
    },
  },
})
</script>

<style src="pdfjs-dist/legacy/web/pdf_viewer.css"/>

<style>
/* pdf_viewer.css makes the whole app follow the color scheme of the system (native scrollbars and controls),
   while Komga applies its own theme */
:root {
  color-scheme: normal;
}

/* read mode: like an image, the page cannot be selected and lets the clicks through to the reader */
.pdf-page:not(.text-selection) .textLayer,
.pdf-page:not(.text-selection) .textLayer *,
.pdf-page:not(.text-selection) .annotationLayer * {
  pointer-events: none;
  user-select: none;
}
</style>
