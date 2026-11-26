import Vue, {AsyncComponent} from 'vue'

// PdfPage, with pdf.js, is loaded with the first PDF page displayed.
// If it cannot be loaded (e.g. Komga was updated since the reader was opened), it fails for every page,
// like pdf.js that cannot be loaded, and the pages are shown as images.
export const asyncPdfPage: AsyncComponent = () => ({
  component: import(/* webpackChunkName: "pdf-page" */ './PdfPage.vue'),
  error: Vue.extend({
    mounted() {
      this.$emit('fail', true)
    },
    render: h => h('div'),
  }),
})
