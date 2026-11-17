import type { PDFDocumentProxy } from 'pdfjs-dist'

export type OutlineEntry = { title: string; page: number; depth: number }
export async function pdfOutline(pdf: Pick<PDFDocumentProxy, 'getOutline' | 'getDestination' | 'getPageIndex' | 'numPages'>) {
  const entries: OutlineEntry[] = []
  async function walk(items: NonNullable<Awaited<ReturnType<PDFDocumentProxy['getOutline']>>>, depth: number) {
    if (depth > 32) return
    for (const item of items) {
      if (entries.length >= 1000) return
      try {
        const destination = typeof item.dest === 'string' ? await pdf.getDestination(item.dest) : item.dest
        if (Array.isArray(destination) && destination.length) {
          const index = typeof destination[0] === 'number' ? destination[0] : await pdf.getPageIndex(destination[0])
          if (Number.isInteger(index) && index >= 0 && index < pdf.numPages) entries.push({ title: item.title || '제목 없는 항목', page: index + 1, depth })
        }
      } catch { /* Keep usable entries when one PDF destination is invalid. */ }
      await walk(item.items ?? [], depth + 1)
    }
  }
  await walk(await pdf.getOutline() ?? [], 0)
  return entries
}
