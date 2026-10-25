import type * as PdfPageSource from '@/functions/pdf-page-source'

// fake pdf.js, recording the workers and documents created and destroyed
const mockWorkers: { destroyed: boolean }[] = []
const mockDocuments: { destroyed: boolean }[] = []
jest.mock('@/functions/pdfjs', () => ({
  loadPdfJs: async () => ({
    lib: {
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
        const document = {
          destroyed: false,
          promise: Promise.resolve({getPage: async () => ({})}),
          destroy: async () => {
            document.destroyed = true
          },
        }
        mockDocuments.push(document)
        return document
      },
    },
    assets: {},
  }),
}))

function response(size: number, status = 200) {
  return {
    ok: status === 200,
    status: status,
    headers: {get: (name: string) => name === 'Content-Length' ? String(size) : null},
    body: {cancel: jest.fn()},
    arrayBuffer: async () => new ArrayBuffer(8),
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

  test('given server error when loading then it is rejected without opening a document', async () => {
    global.fetch = jest.fn(async () => response(0, 500)) as any

    await expect(loadPage(1)).rejects.toThrow('HTTP 500')
    expect(mockDocuments).toHaveLength(0)
  })
})
