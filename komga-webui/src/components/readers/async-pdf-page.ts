import Vue, {AsyncComponent} from 'vue'

// PdfPage, with pdf.js, is loaded with the first PDF page displayed.
// If it cannot be loaded (e.g. Komga was updated since the reader was opened), each page fails like a page pdf.js cannot draw,
// and is shown as an image.
export const asyncPdfPage: AsyncComponent = () => ({
  component: import(/* webpackChunkName: "pdf-page" */ './PdfPage.vue'),
  error: Vue.extend({
    mounted() {
      this.$emit('fail')
    },
    render: h => h('div'),
  }),
})
