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
import {loadPdfJs} from '@/functions/pdfjs'
import type {PDFDocumentLoadingTask} from 'pdfjs-lib'
import type {PDFPageView} from 'pdfjs-viewer'

export default Vue.extend({
  name: 'PdfPage',
  data: () => {
    return {
      failed: false,
      destroyed: false,
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
    // available space in CSS pixels, the page is scaled to fit in it
    width: {
      type: Number,
      required: true,
    },
    height: {
      type: Number,
      required: true,
    },
  },
  mounted() {
    this.render()
  },
  beforeDestroy() {
    this.destroyed = true
    this.pageView?.destroy()
    this.loadingTask?.destroy()
  },
  methods: {
    async render() {
      try {
        const {lib, viewer, assets} = await loadPdfJs()
        const response = await fetch(this.page.pdfUrl!!, {credentials: 'include'})
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        const data = await response.arrayBuffer()
        if (this.destroyed) return

        this.loadingTask = markRaw(lib.getDocument({data: data, ...assets}))
        const pdfPage = await (await this.loadingTask.promise).getPage(1)
        if (this.destroyed) return

        const viewport = pdfPage.getViewport({scale: lib.PixelsPerInch.PDF_TO_CSS_UNITS})
        this.pageView = markRaw(new viewer.PDFPageView({
          container: this.$refs.container as HTMLDivElement,
          id: this.page.number,
          scale: Math.min(this.width / viewport.width, this.height / viewport.height),
          defaultViewport: viewport,
          eventBus: new viewer.EventBus(),
          annotationMode: lib.AnnotationMode.ENABLE,
        }))
        this.pageView.setPdfPage(pdfPage)
        await this.pageView.draw()
      } catch (e) {
        if (this.destroyed) return
        this.$warn('[PdfPage]', `page:${this.page.number}`, e)
        this.failed = true
      }
    },
  },
})
</script>

<style src="pdfjs-dist/legacy/web/pdf_viewer.css"/>
