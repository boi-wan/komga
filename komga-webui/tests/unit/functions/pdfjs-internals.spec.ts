import fs from 'fs'
import path from 'path'
import {TEXT_ANNOTATION_ICONS} from '@/functions/pdfjs'

// The guard on the icons of text annotations (functions/pdfjs.ts) relies on how pdf.js shows them.
// A failing test here, after a pdf.js upgrade, means checking that the guard still applies, and updating these tests.
const pdfjsDist = path.dirname(require.resolve('pdfjs-dist/package.json'))
const read = (file: string) => fs.readFileSync(path.join(pdfjsDist, file), 'utf8')

describe('pdf.js internals', () => {
  test('given a text annotation when pdf.js shows it then the url of its icon is made of the name read from the file', () => {
    expect(read('legacy/build/pdf.mjs')).toContain('image.src = this.imageResourcesPath + "annotation-" + this.data.name.toLowerCase() + ".svg";')
  })

  test('given a page when pdf.js draws its annotations then it gets them from the page, the method the guard wraps', () => {
    expect(read('legacy/web/pdf_viewer.mjs')).toContain('this.pdfPage.getAnnotations({')
  })

  test('given the icons allowed by the guard then pdf.js has each of them', () => {
    const missing = TEXT_ANNOTATION_ICONS.filter(icon => !fs.existsSync(path.join(pdfjsDist, `legacy/web/images/annotation-${icon}.svg`)))

    expect(missing).toEqual([])
  })
})
