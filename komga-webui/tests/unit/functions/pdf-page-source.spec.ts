import type * as PdfPageSource from '@/functions/pdf-page-source'

// fake pdf.js, recording the workers and documents created and destroyed
const mockWorkers: { destroyed: boolean }[] = []
const mockDocuments: { destroyed: boolean }[] = []
const mockAnnotations: { annotationType: number, name?: string }[] = []
const mockGetDocument: { error?: Error } = {}
jest.mock('@/functions/pdfjs', () => ({
  loadPdfJs: async () => ({
    lib: {
      AnnotationType: {TEXT: 1},
      PDFWorker: class {
        destroyed = false

        constructor() {
          mockWorkers.push(this)
        }

        destroy() {
          this.destroyed = true
        }
      },
      getDocument: () => {
        if (mockGetDocument.error) throw mockGetDocument.error
        const document = {
          destroyed: false,
          promise: Promise.resolve({getPage: async () => ({getAnnotations: async () => mockAnnotations})}),
          destroy: async () => {
            document.destroyed = true
          },
        }
        mockDocuments.push(document)
        return document
      },
    },
    documentOptions: {},
  }),
}))

// a response streaming size bytes, by chunks of 1 MiB
function response(size: number, {status = 200, contentLength = true} = {}) {
  let sent = 0
  const reader = {
    read: async () => {
      if (sent >= size) return {done: true, value: undefined}
      const chunk = new Uint8Array(Math.min(size - sent, 1024 * 1024))
      sent += chunk.length
      return {done: false, value: chunk}
    },
    cancel: jest.fn(),
  }
  return {
    ok: status === 200,
    status: status,
    headers: {get: (name: string) => name === 'Content-Length' && contentLength ? String(size) : null},
    body: {cancel: jest.fn(), getReader: () => reader},
    reader: reader,
  }
}

let source: typeof PdfPageSource
const loadPage = (n: number, signal = new AbortController().signal) => source.loadPdfPage(`/pages/${n}/raw`, () => 0, signal)

beforeEach(() => {
  // the worker is shared by the module: each test gets a new one
  jest.resetModules()
  jest.useFakeTimers()
  mockWorkers.length = 0
  mockDocuments.length = 0
  mockAnnotations.length = 0
  mockGetDocument.error = undefined
  global.fetch = jest.fn(async () => response(100)) as any
  source = require('@/functions/pdf-page-source')
})

afterEach(() => {
  jest.useRealTimers()
})

describe('Worker', () => {
  test('given two pages loaded when one is released then its document is destroyed and the worker is kept', async () => {
    const [first] = await Promise.all([loadPage(1), loadPage(2)])

    first.release()
    jest.advanceTimersByTime(60000)

    expect(mockWorkers).toHaveLength(1)
    expect(mockWorkers[0].destroyed).toBe(false)
    expect(mockDocuments.map(d => d.destroyed)).toEqual([true, false])
  })

  test('given every page released when idle for 10 seconds then the worker is destroyed', async () => {
    const page = await loadPage(1)

    page.release()
    jest.advanceTimersByTime(9999)
    expect(mockWorkers[0].destroyed).toBe(false)

    jest.advanceTimersByTime(1)
    expect(mockWorkers[0].destroyed).toBe(true)
  })

  test('given every page released when a page loads before 10 seconds then the worker is reused', async () => {
    (await loadPage(1)).release()
    jest.advanceTimersByTime(5000)

    await loadPage(2)
    jest.advanceTimersByTime(60000)

    expect(mockWorkers).toHaveLength(1)
    expect(mockWorkers[0].destroyed).toBe(false)
  })

  test('given worker destroyed when a page loads then a new worker is created', async () => {
    (await loadPage(1)).release()
    jest.advanceTimersByTime(10000)

    await loadPage(2)

    expect(mockWorkers.map(w => w.destroyed)).toEqual([true, false])
  })

  test('given page released twice when another page is still loaded then the worker is kept', async () => {
    const [first] = await Promise.all([loadPage(1), loadPage(2)])

    first.release()
    first.release()
    jest.advanceTimersByTime(60000)

    expect(mockWorkers[0].destroyed).toBe(false)
  })
})

describe('Loading', () => {
  test('given page not needed anymore when its document is opened then it is rejected, and its document and worker released', async () => {
    const abort = new AbortController()
    const loading = loadPage(1, abort.signal)
    // the load starts once the pages queued together are sorted
    await Promise.resolve()

    abort.abort()

    await expect(loading).rejects.toHaveProperty('name', 'AbortError')
    expect(mockDocuments[0].destroyed).toBe(true)
    jest.advanceTimersByTime(10000)
    expect(mockWorkers[0].destroyed).toBe(true)
  })

  test('given page larger than the limit when loading then it is rejected without opening a document', async () => {
    const tooLarge = response(source.MAX_PDF_PAGE_BYTES + 1)
    global.fetch = jest.fn(async () => tooLarge) as any

    await expect(loadPage(1)).rejects.toThrow('too large')
    expect(tooLarge.body.cancel).toHaveBeenCalled()
    expect(mockDocuments).toHaveLength(0)
  })

  test('given page larger than the limit without Content-Length when loading then its download is stopped at the limit', async () => {
    const tooLarge = response(source.MAX_PDF_PAGE_BYTES + 1, {contentLength: false})
    global.fetch = jest.fn(async () => tooLarge) as any

    await expect(loadPage(1)).rejects.toThrow('too large')
    expect(tooLarge.reader.cancel).toHaveBeenCalled()
    expect(mockDocuments).toHaveLength(0)
  })

  test('given document that cannot be opened when loading then the worker is released', async () => {
    mockGetDocument.error = new Error('broken pdf.js')

    await expect(loadPage(1)).rejects.toThrow('broken pdf.js')
    jest.advanceTimersByTime(10000)

    expect(mockWorkers[0].destroyed).toBe(true)
  })

  test('given server error when loading then it is rejected without opening a document', async () => {
    global.fetch = jest.fn(async () => response(0, {status: 500})) as any

    await expect(loadPage(1)).rejects.toThrow('HTTP 500')
    expect(mockDocuments).toHaveLength(0)
  })
})

describe('Text annotations', () => {
  test('given text annotation with an icon of pdf.js when loading then its icon is kept', async () => {
    mockAnnotations.push({annotationType: 1, name: 'Comment'}, {annotationType: 1, name: 'NewParagraph'})

    const {pdfPage} = await loadPage(1)

    expect((await pdfPage.getAnnotations()).map(a => a.name)).toEqual(['Comment', 'NewParagraph'])
  })

  test('given text annotation whose icon name is a path when loading then it gets the note icon', async () => {
    const link = {annotationType: 2, name: 'x/../../api/logout?'}
    mockAnnotations.push({annotationType: 1, name: 'x/../../api/logout?'}, {annotationType: 1}, link)

    const {pdfPage} = await loadPage(1)

    expect(await pdfPage.getAnnotations()).toEqual([{annotationType: 1, name: 'Note'}, {annotationType: 1, name: 'Note'}, link])
  })
})

describe('Drawing', () => {
  test('given pages drawn together when their turn comes then they are drawn one at a time, the closest first', async () => {
    const started: number[] = []
    const done: (() => void)[] = []
    const draw = (page: number) => source.drawPdfPage(() => new Promise<void>(resolve => {
      started.push(page)
      done.push(resolve)
    }), () => page, new AbortController().signal)

    const drawings = [draw(2), draw(0), draw(1)]
    await Promise.resolve()
    expect(started).toEqual([0])

    done[0]()
    await Promise.resolve()
    await Promise.resolve()
    expect(started).toEqual([0, 1])

    done[1]()
    await Promise.resolve()
    await Promise.resolve()
    done[2]()
    await Promise.all(drawings)
    expect(started).toEqual([0, 1, 2])
  })
})
