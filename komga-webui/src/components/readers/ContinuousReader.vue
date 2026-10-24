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
          <pdf-page :page="page"
                    :fit="scale"
                    :width="fitWidth"
                    :height="$vuetify.breakpoint.height"
                    :active="Math.abs((currentPage - 1) - i) <= 2"
                    :priority="Math.abs((currentPage - 1) - i)"
                    @load="size => setPdfPageSize(page, size)"
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
import {pdfPageScale, Size} from '@/functions/pdf-page-scale'

// US Letter at scale 1, in CSS pixels: the size of PDF pages until one is loaded
const PDF_PAGE_SIZE = {width: 816, height: 1056}

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
      // size at scale 1 of the PDF pages loaded so far, in CSS pixels
      pdfPageSizes: {} as Record<number, Size>,
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
        this.pdfPageSizes = {}
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
    fitWidth(): number {
      return this.$vuetify.breakpoint.width - (this.$vuetify.breakpoint.width * this.totalSidePadding) / 100
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
    onIntersect(entries: any) {
      if (entries[0].isIntersecting) {
        const page = parseInt(entries[0].target.id.replace('page', ''))
        this.seen.splice(page - 1, 1, true)
        this.currentPage = page
        this.$emit('update:page', page)
      }
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
    setPdfPageSize(page: PageDtoWithUrl, size: Size) {
      // the box of a page changes size once loaded: the page at the top of the screen stays in place,
      // and becomes the current page if the current one is pushed off the screen
      const anchor = [...this.$el.querySelectorAll('div[id^=page]')].find(e => e.getBoundingClientRect().bottom > 0)
      const top = anchor?.getBoundingClientRect().top
      this.$set(this.pdfPageSizes, page.number, size)
      this.$nextTick(() => {
        if (!anchor || top === undefined) return
        const shift = anchor.getBoundingClientRect().top - top
        if (shift) window.scrollBy(0, shift)
        const current = document.getElementById(`page${this.currentPage}`)?.getBoundingClientRect()
        if (current && (current.bottom <= 0 || current.top >= window.innerHeight)) {
          this.currentPage = parseInt(anchor.id.replace('page', ''))
          this.$emit('update:page', this.currentPage)
        }
      })
    },
    pdfBoxStyle(page: PageDtoWithUrl): string {
      let size = this.pdfPageSizes[page.number]
      if (!size) {
        // until loaded, a page has the ratio of its server image, and the short side of the pages already loaded
        size = Object.values(this.pdfPageSizes)[0] || PDF_PAGE_SIZE
        if (page.width && page.height) {
          const unit = Math.min(size.width, size.height) / Math.min(page.width, page.height)
          size = {width: page.width * unit, height: page.height * unit}
        }
      }
      const scale = pdfPageScale(size, {width: this.fitWidth, height: this.$vuetify.breakpoint.height}, this.scale)
      // rounded down like the pages drawn by pdf.js
      return `width: ${Math.floor(size.width * scale)}px; height: ${Math.floor(size.height * scale)}px;`
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
