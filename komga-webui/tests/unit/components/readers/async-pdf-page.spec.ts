import {mount} from '@vue/test-utils'
import {asyncPdfPage} from '@/components/readers/async-pdf-page'

describe('Async PdfPage', () => {
  test('given PdfPage that cannot be loaded when a PDF page is displayed then its failure is reported', () => {
    const error = (asyncPdfPage as () => { error: any })().error

    const wrapper = mount(error)

    expect(wrapper.emitted('fail')).toHaveLength(1)
  })
})
