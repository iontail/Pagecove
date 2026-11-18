import { pdfjs } from './pdf-runtime'

const cache = new Map<string, string>()
const queue: (() => Promise<void>)[] = []
let running = 0

function drain() {
  while (running < 2 && queue.length) {
    const task = queue.shift()!
    running++
    void task().finally(() => { running--; drain() })
  }
}

export function paperPreview(id: string, needed: () => boolean): Promise<string | null> {
  if (cache.has(id)) return Promise.resolve(cache.get(id)!)
  return new Promise((resolve) => {
    queue.push(async () => {
      if (!needed()) { resolve(null); return }
      let loading: ReturnType<typeof pdfjs.getDocument> | undefined
      try {
        const data = await window.paperglim.previewPdf(id)
        if (!needed()) { resolve(null); return }
        loading = pdfjs.getDocument({ data })
        const pdf = await loading.promise
        const page = await pdf.getPage(1)
        const viewport = page.getViewport({ scale: 340 / page.getViewport({ scale: 1 }).width })
        const canvas = document.createElement('canvas')
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height)
        await page.render({ canvas, viewport }).promise
        const image = canvas.toDataURL('image/webp', .82)
        cache.set(id, image)
        if (cache.size > 100) cache.delete(cache.keys().next().value!)
        resolve(image)
      } catch { resolve(null) }
      finally { await loading?.destroy().catch(() => {}) }
    })
    drain()
  })
}
