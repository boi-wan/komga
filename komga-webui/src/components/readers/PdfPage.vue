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
import {acquirePdfWorker, loadPdfPage, releasePdfWorker} from '@/functions/pdf-page-source'
import {pdfPageScale, Size} from '@/functions/pdf-page-scale'
import type {PDFDocumentLoadingTask} from 'pdfjs-lib'
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
      loading: undefined as AbortController | undefined,
      // pdf.js objects are marked raw, so that Vue does not observe them
      loadingTask: undefined as PDFDocumentLoadingTask | undefined,
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
  created() {
    acquirePdfWorker()
  },
  mounted() {
    if (this.active) this.load()
  },
  beforeDestroy() {
    this.unload()
    releasePdfWorker()
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
      if (this.loading || this.loadingTask || this.failed) return
      const loading = new AbortController()
      this.loading = loading
      try {
        const {lib, viewer} = await loadPdfJs()
        const {loadingTask, pdfPage} = await loadPdfPage(this.page.pdfUrl!!, () => this.priority, loading.signal)
        if (loading.signal.aborted) {
          loadingTask.destroy()
          return
        }
        this.loadingTask = markRaw(loadingTask)

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
        }))
        this.pageView.setPdfPage(pdfPage)
        await this.draw()
      } catch (e) {
        if (e?.name === 'AbortError') return
        this.$warn('[PdfPage]', `page:${this.page.number}`, e)
        this.unload()
        this.failed = true
      } finally {
        if (this.loading === loading) this.loading = undefined
      }
    },
    async draw() {
      const {viewer} = await loadPdfJs()
      if (this.pageView?.renderingState !== viewer.RenderingStates.INITIAL) return
      try {
        await this.pageView.draw()
      } catch (e) {
        // a new scale or an unload cancels the drawing in progress
        if (e?.name !== 'RenderingCancelledException') throw e
      }
    },
    unload() {
      this.loading?.abort()
      this.loading = undefined
      // a page view keeps its page and layers even when destroyed, so it is dropped (the reader keeps the size of the page)
      this.pageView?.destroy()
      this.pageView?.div.remove()
      this.pageView = undefined
      this.loadingTask?.destroy()
      this.loadingTask = undefined
    },
  },
})
</script>

<style src="pdfjs-dist/legacy/web/pdf_viewer.css"/>
