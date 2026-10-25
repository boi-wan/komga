<template>
  <div class="pdf-page">
    <img v-if="failed"
         :src="page.url"
         :alt="`Page ${page.number}`"
         :style="`max-width: ${width}px; max-height: ${height}px;`"
    />
    <div v-else
         ref="container"
         class="pdfViewer singlePageView"
    />
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

// iOS Safari cannot draw canvases larger than this
const MAX_CANVAS_PIXELS = 4096 * 4096

export default Vue.extend({
  name: 'PdfPage',
  data: () => {
    return {
      failed: false,
      // size of the page at scale 1, known once loaded
      pageSize: undefined as Size | undefined,
      loadAbort: undefined as AbortController | undefined,
      // releases the loaded page and its document
      release: undefined as (() => void) | undefined,
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
      if (this.loadAbort || this.release || this.failed) return
      const loadAbort = new AbortController()
      this.loadAbort = loadAbort
      try {
        const {lib, viewer, pageViewOptions} = await loadPdfJs()
        const {pdfPage, release} = await loadPdfPage(this.page.pdfUrl!!, () => this.priority, loadAbort.signal)
        // the page can be unloaded between the end of the loading and this line
        if (loadAbort.signal.aborted) {
          release()
          return
        }
        this.release = release

        const viewport = pdfPage.getViewport({scale: lib.PixelsPerInch.PDF_TO_CSS_UNITS})
        this.pageSize = {width: viewport.width, height: viewport.height}
        this.$emit('load', this.pageSize)

        this.pageView = markRaw(new viewer.PDFPageView({
          container: this.$refs.container as HTMLDivElement,
          id: this.page.number,
          scale: this.scale!!,
          defaultViewport: viewport,
          eventBus: new viewer.EventBus(),
          annotationMode: lib.AnnotationMode.ENABLE,
          maxCanvasPixels: MAX_CANVAS_PIXELS,
          // pages larger than the canvas limit are drawn at the highest resolution allowed:
          // the sharper detail view drawn over them only exists in the pdf.js viewer
          enableDetailCanvas: false,
          // only the links of the file, not the addresses found in its text
          enableAutoLinking: false,
          ...pageViewOptions,
        }))
        // the label of the page for screen readers, translated once as the translations are shared
        pageViewOptions.l10n.translateOnce(this.pageView.div)
        this.pageView.setPdfPage(pdfPage)
        await this.draw()
      } catch (e) {
        this.fail(e)
      } finally {
        if (this.loadAbort === loadAbort) this.loadAbort = undefined
      }
    },
    async draw() {
      const {viewer} = await loadPdfJs()
      const pageView = this.pageView
      if (pageView?.renderingState !== viewer.RenderingStates.INITIAL) return
      try {
        await pageView.draw()
      } catch (e) {
        // a new scale or an unload cancels the drawing in progress
        if (e?.name !== 'RenderingCancelledException' && this.pageView === pageView) this.fail(e)
      }
    },
    // the page is shown as a server image instead
    fail(e: any) {
      if (e?.name === 'AbortError') return
      this.$warn('[PdfPage]', `page:${this.page.number}`, e)
      this.unload()
      this.failed = true
    },
    unload() {
      this.loadAbort?.abort()
      this.loadAbort = undefined
      // a page view keeps its page and layers even when destroyed, so it is dropped (a page loaded again gets a new one)
      this.pageView?.destroy()
      this.pageView?.div.remove()
      this.pageView = undefined
      this.release?.()
      this.release = undefined
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
</style>
