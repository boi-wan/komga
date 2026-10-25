<template>
  <div>
    <div :class="`d-flex flex-column px-0 mx-0` "
         v-scroll="onScroll"
    >
      <template v-for="(page, i) in pages">
        <!--  the box of a PDF page is sized here, before PdfPage is loaded  -->
        <div v-if="page.pdfUrl"
             :key="`page${i}`"
             :id="`page${page.number}`"
             :style="`margin: ${i === 0 ? 0 : pageMargin}px auto; ${pdfBoxStyle(page)}`"
             v-intersect="onIntersect"
        >
          <!--  only the pages around the screen are drawn, the boxes of the others keep their size  -->
          <pdf-page v-if="pdfPageDistance(page.number) <= 2"
                    :page="page"
                    :fit="scale"
                    :width="availableWidth"
                    :height="$vuetify.breakpoint.height"
                    :priority="pdfPageDistance(page.number)"
                    @load="size => onPdfPageLoad(page, size)"
          />
        </div>
        <img v-else
             :key="`page${i}`"
             :alt="`Page ${page.number}`"
             :src="shouldLoad(i) ? page.url : undefined"
             :height="calcHeight(page)"
             :width="calcWidth(page)"
             :id="`page${page.number}`"
             :style="`margin: ${i === 0 ? 0 : pageMargin}px auto;`"
             v-intersect="onIntersect"
        />
      </template>
    </div>

    <!--  clickable zone: top  -->
    <div @click="prev()"
         class="top-quarter"
         style="z-index: 1;"
    />

    <!--  clickable zone: bottom  -->
    <div @click="next()"
         class="bottom-quarter"
         style="z-index: 1;"
    />

    <!--  clickable zone: menu  -->
    <div @click="centerClick()"
         class="center-vertical"
         style="z-index: 1;"
    />
  </div>
</template>

<script lang="ts">
import Vue from 'vue'
import {ContinuousScaleType} from '@/types/enum-reader'
import {PageDtoWithUrl} from '@/types/komga-books'
import {throttle} from 'lodash'
import {estimatePdfPageSize, pdfPageBox, Size} from '@/functions/pdf-page-scale'

const pageNumberOf = (pageElement: Element) => parseInt(pageElement.id.replace('page', ''))

export default Vue.extend({
  name: 'ContinuousReader',
  components: {
    // loaded on demand, with pdf.js
    PdfPage: () => import(/* webpackChunkName: "pdf-page" */ './PdfPage.vue'),
  },
  data: () => {
    return {
      offsetTop: 0,
      totalHeight: 1000,
      currentPage: 1,
      seen: [] as boolean[],
      // pages intersecting the screen
      visiblePages: {} as Record<number, boolean>,
      // size at scale 1 of the PDF pages loaded so far, in CSS pixels
      pdfPageSizes: {} as Record<number, Size>,
      // size at scale 1 of the first PDF page loaded, used to estimate the size of the others
      pdfReferenceSize: undefined as Size | undefined,
    }
  },
  props: {
    pages: {
      type: Array as () => PageDtoWithUrl[],
      required: true,
    },
    animations: {
      type: Boolean,
      required: true,
    },
    page: {
      type: Number,
      required: true,
    },
    scale: {
      type: String as () => ContinuousScaleType,
      required: true,
    },
    sidePadding: {
      type: Number,
      required: true,
    },
    pageMargin: {
      type: Number,
      required: true,
    },
  },
  watch: {
    pages: {
      handler(val) {
        this.seen = new Array(val.length).fill(false)
        this.visiblePages = {}
        this.pdfPageSizes = {}
        this.pdfReferenceSize = undefined
        if (this.page === 1) window.scrollTo(0, 0)
      },
      immediate: true,
    },
    page: {
      handler(val) {
        if (val != this.currentPage) {
          this.$vuetify.goTo(`#page${val}`, {
            duration: 0,
          })
        }
      },
      immediate: false,
    },
  },
  created() {
    window.addEventListener('keydown', this.keyPressed)
  },
  destroyed() {
    window.removeEventListener('keydown', this.keyPressed)
  },
  mounted() {
    if (this.page != this.currentPage) {
      this.$vuetify.goTo(`#page${this.page}`, {
        duration: 0,
      })
    }
  },
  computed: {
    canPrev(): boolean {
      return this.offsetTop > 0
    },
    canNext(): boolean {
      return this.offsetTop + this.$vuetify.breakpoint.height < this.totalHeight
    },
    goToOptions(): object | undefined {
      if (this.animations) return undefined
      return {duration: 0}
    },
    totalSidePadding(): number {
      return this.sidePadding * 2
    },
    // width available for a page, without the side padding (calcWidth computes the same for images)
    availableWidth(): number {
      return this.$vuetify.breakpoint.width - (this.$vuetify.breakpoint.width * this.totalSidePadding) / 100
    },
    // first and last pages on the screen, or the current page until known
    visibleRange(): { first: number, last: number } {
      const visible = Object.keys(this.visiblePages).map(Number)
      if (visible.length === 0) return {first: this.currentPage, last: this.currentPage}
      return {first: Math.min(...visible), last: Math.max(...visible)}
    },
  },
  methods: {
    keyPressed: throttle(function (this: any, e: KeyboardEvent) {
      switch (e.key) {
        case ' ':
        case 'PageDown':
        case 'ArrowDown':
          if (!this.canNext) this.$emit('jump-next')
          break
        case 'PageUp':
        case 'ArrowUp':
          if (!this.canPrev) this.$emit('jump-previous')
          break
      }
    }, 500),
    onScroll(e: any) {
      this.offsetTop = e.target.scrollingElement.scrollTop
      this.totalHeight = e.target.scrollingElement.scrollHeight
    },
    onIntersect(entries: IntersectionObserverEntry[]) {
      // each page has its own observer: the last entry is the current state of the page
      const entry = entries[entries.length - 1]
      const page = pageNumberOf(entry.target)
      if (entry.isIntersecting) {
        this.$set(this.visiblePages, page, true)
        this.seen.splice(page - 1, 1, true)
        this.setCurrentPage(page)
      } else {
        this.$delete(this.visiblePages, page)
      }
    },
    setCurrentPage(page: number) {
      this.currentPage = page
      this.$emit('update:page', page)
    },
    shouldLoad(page: number): boolean {
      return page == 0 || this.seen[page] || Math.abs((this.currentPage - 1) - page) <= 2
    },
    calcHeight(page: PageDtoWithUrl): number | undefined {
      switch (this.scale) {
        case ContinuousScaleType.WIDTH:
          if (page.height && page.width)
            return page.height / (page.width / (this.$vuetify.breakpoint.width - (this.$vuetify.breakpoint.width * this.totalSidePadding) / 100))
          return undefined
        case ContinuousScaleType.ORIGINAL:
          return page.height || undefined
        default:
          return undefined
      }
    },
    calcWidth(page: PageDtoWithUrl): number | undefined {
      switch (this.scale) {
        case ContinuousScaleType.WIDTH:
          return this.$vuetify.breakpoint.width - (this.$vuetify.breakpoint.width * this.totalSidePadding) / 100
        case ContinuousScaleType.ORIGINAL:
          return page.width || undefined
        default:
          return undefined
      }
    },
    // distance of a page to the pages on the screen, 0 when on the screen
    pdfPageDistance(pageNumber: number): number {
      return Math.max(this.visibleRange.first - pageNumber, pageNumber - this.visibleRange.last, 0)
    },
    // the box of a PDF page gets the size of the page once loaded
    onPdfPageLoad(page: PageDtoWithUrl, size: Size) {
      const known = this.pdfPageSizes[page.number]
      if (known && known.width === size.width && known.height === size.height) return
      this.keepTopPageInPlace(() => {
        if (!this.pdfReferenceSize) this.pdfReferenceSize = size
        this.$set(this.pdfPageSizes, page.number, size)
      })
    },
    // Resizes pages: the page at the top of the screen stays in place,
    // and becomes the current page if the current one is pushed off the screen.
    keepTopPageInPlace(resize: () => void) {
      const top = [...this.$el.querySelectorAll('[id^=page]')].find(e => e.getBoundingClientRect().bottom > 0)
      const topBefore = top?.getBoundingClientRect().top
      resize()
      this.$nextTick(() => {
        if (!top || topBefore === undefined) return
        const shift = top.getBoundingClientRect().top - topBefore
        if (shift) window.scrollBy(0, shift)
        const current = document.getElementById(`page${this.currentPage}`)?.getBoundingClientRect()
        if (current && (current.bottom <= 0 || current.top >= window.innerHeight)) this.setCurrentPage(pageNumberOf(top))
      })
    },
    pdfBoxStyle(page: PageDtoWithUrl): string {
      const size = this.pdfPageSizes[page.number] || estimatePdfPageSize(page, this.pdfReferenceSize)
      const box = pdfPageBox(size, {width: this.availableWidth, height: this.$vuetify.breakpoint.height}, this.scale)
      return `width: ${box.width}px; height: ${box.height}px;`
    },
    centerClick() {
      this.$emit('menu')
    },
    prev() {
      if (this.canPrev) {
        const step = this.$vuetify.breakpoint.height * 0.95
        this.$vuetify.goTo(this.offsetTop - step, this.goToOptions)
      } else {
        this.$emit('jump-previous')
      }
    },
    next() {
      if (this.canNext) {
        const step = this.$vuetify.breakpoint.height * 0.95
        this.$vuetify.goTo(this.offsetTop + step, this.goToOptions)
      } else {
        this.$emit('jump-next')
      }
    },
  },
})
</script>
<style scoped>
.top-quarter {
  top: 0;
  height: 25vh;
  width: 100%;
  position: fixed;
}

.bottom-quarter {
  top: 75vh;
  height: 25vh;
  width: 100%;
  position: fixed;
}

.center-vertical {
  top: 25vh;
  height: 50vh;
  width: 100%;
  position: fixed;
}
</style>
