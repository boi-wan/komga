<template>
  <div class="pdf-page" :class="{'text-selection': textSelection}">
    <div ref="container" class="pdfViewer singlePageView"/>
  </div>
</template>

<script lang="ts">
import Vue, {markRaw, PropType} from 'vue'
import {PageDtoWithUrl} from '@/types/komga-books'
import {ContinuousScaleType, ScaleType} from '@/types/enum-reader'
import {loadPdfJs} from '@/functions/pdfjs'
import {loadPdfPage} from '@/functions/pdf-page-source'
import {pdfPageScale, Size} from '@/functions/pdf-page-scale'
import type {PDFPageView} from 'pdfjs-viewer'

// Emits load with the size of the page at scale 1, and fail when pdf.js cannot draw it: the reader shows the page as an image.
export default Vue.extend({
  name: 'PdfPage',
  data: () => {
    return {
      failed: false,
      // size of the page at scale 1, known once loaded
      pageSize: undefined as Size | undefined,
      loadAbort: undefined as AbortController | undefined,
      // releases the loaded page and its document
      releasePdfPage: undefined as (() => void) | undefined,
      // pdf.js objects are marked raw, so that Vue does not observe them
      pageView: undefined as PDFPageView | undefined,
    }
  },
  props: {
    page: {
      type: Object as PropType<PageDtoWithUrl>,
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
    // inactive pages release their canvas and their PDF
    active: {
      type: Boolean,
      default: true,
    },
    // pages with lower values are loaded first, typically the distance to the current page
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
    if (this.active) this.load()
  },
  beforeDestroy() {
    this.unload()
  },
  watch: {
    'page.pdfUrl'() {
      // the component is reused for another page, for instance when the page layout changes
      this.unload()
      this.pageSize = undefined
      this.failed = false
      if (this.active) this.load()
    },
    active(val) {
      if (val) this.load()
      else this.unload()
    },
    scale(val, old) {
      // the first scale is applied by load(), and an unloaded page gets the current scale when loaded again
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
  },
  methods: {
    async load() {
      if (this.loadAbort || this.releasePdfPage || this.failed) return
      const loadAbort = new AbortController()
      this.loadAbort = loadAbort
      try {
        const {lib, createPageView} = await loadPdfJs()
        const {pdfPage, release} = await loadPdfPage(this.page.pdfUrl!!, () => this.priority, loadAbort.signal)
        // the page can be unloaded between the end of the loading and this line
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
          id: this.page.number,
          pdfPage,
          viewport,
          scale: this.scale!!,
        }))
        await this.draw()
      } catch (e) {
        if (e?.name !== 'AbortError') this.fail(e)
      } finally {
        if (this.loadAbort === loadAbort) this.loadAbort = undefined
      }
    },
    async draw() {
      const {viewer} = await loadPdfJs()
      const pageView = this.pageView
      if (!pageView || pageView.renderingState !== viewer.RenderingStates.INITIAL) return
      try {
        // a drawing cancelled by a new scale or an unload resolves
        await pageView.draw()
      } catch (e) {
        if (this.pageView === pageView) this.fail(e)
      }
    },
    fail(e: any) {
      this.$warn('[PdfPage]', `page:${this.page.number}`, e)
      this.unload()
      this.failed = true
      this.$emit('fail')
    },
    unload() {
      this.loadAbort?.abort()
      this.loadAbort = undefined
      // a page view keeps its page and layers even when destroyed, so it is dropped (a page loaded again gets a new one)
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
