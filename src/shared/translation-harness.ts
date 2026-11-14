import { textBlocks, translationPrompt, parseTranslation } from './reading.ts'
import type { TextBlock, TextItem, TranslationPlan } from './reading'
import type { Box, GraphicRegion } from './pdf-regions'

export async function runTranslation(blocks: TextBlock[], ask: (prompt: string) => Promise<string>) {
  const prompt = translationPrompt(blocks)
  return parseTranslation(await ask(prompt), blocks, true)
}

export function selectedBlocks(plan: TranslationPlan, included: string[] = []) {
  return [...plan.blocks, ...plan.excluded.filter(({ block }) => included.includes(block.id)).map(({ block }) => block)].sort((a, b) => a.itemIndexes[0] - b.itemIndexes[0])
}

const caption = /^(?:fig(?:ure)?\.?|table)\s*\d+[.:\s]/i

function itemBox(item: TextItem): Box {
  const [a, b, , , x, y] = item.transform
  const scale = Math.hypot(a, b) || 1
  const ux = a / scale, uy = b / scale
  const points = [[x, y], [x + ux * item.width, y + uy * item.width], [x - uy * item.height, y + ux * item.height], [x + ux * item.width - uy * item.height, y + uy * item.width + ux * item.height]]
  return [Math.min(...points.map(([px]) => px)), Math.min(...points.map(([, py]) => py)), Math.max(...points.map(([px]) => px)), Math.max(...points.map(([, py]) => py))]
}

function inside(item: TextItem, box: Box, margin = 0) {
  const bounds = itemBox(item)
  const x = (bounds[0] + bounds[2]) / 2, y = (bounds[1] + bounds[3]) / 2
  return x >= box[0] - margin && x <= box[2] + margin && y >= box[1] - margin && y <= box[3] + margin
}

export function planTranslation(items: (TextItem | { type: string })[], pageBox: Box, graphics: { regions: GraphicRegion[]; partial: boolean } | null): TranslationPlan {
  const raw = textBlocks(items)
  const protectedCaptions = new Set(raw.filter((block) => caption.test(block.text)).flatMap((block) => block.itemIndexes))
  const textItems = items.flatMap((item, index) => 'str' in item && item.str.trim() ? [{ item, index }] : [])
  const sizes = new Map<number, number>()
  for (const { item, index } of textItems) {
    if (protectedCaptions.has(index) || item.str.length < 30) continue
    const size = Math.round(item.height * 2) / 2
    sizes.set(size, (sizes.get(size) ?? 0) + item.str.length)
  }
  const bodySize = [...sizes].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 10
  const metadata = new Set(raw.filter((block) => /^(?:\d+\s*)?https?:\/\//i.test(block.text) || (block.text.includes('@') && block.text.replace(/\S+@\S+/g, '').length < 40)).flatMap((block) => block.itemIndexes))
  const pageArea = (pageBox[2] - pageBox[0]) * (pageBox[3] - pageBox[1])
  const regions = (graphics?.regions ?? []).filter(({ box }) => {
    const area = (box[2] - box[0]) * (box[3] - box[1])
    if (area <= 0 || area > pageArea * .75) return false
    // Page-wide Form XObjects can contain the article itself.
    return textItems.filter(({ item, index }) => !protectedCaptions.has(index) && item.str.length >= 60 && item.height >= bodySize * .9 && inside(item, box)).length < 3
  })
  const excluded = new Map<number, string>()
  for (const { item, index } of textItems) {
    if (protectedCaptions.has(index)) continue
    const str = item.str.trim()
    const rotated = Math.abs(item.transform[1]) > Math.abs(item.transform[0])
    const inline = item.height < bodySize * .85 && textItems.some(({ item: other }) => other !== item && other.height >= bodySize * .9 && Math.abs(item.transform[5] - other.transform[5]) < bodySize * .6 && Math.min(Math.abs(item.transform[4] - other.transform[4] - other.width), Math.abs(item.transform[4] + item.width - other.transform[4])) < bodySize)
    if (metadata.has(index)) excluded.set(index, '주소·문서 식별자')
    else if (regions.some(({ box, kind }) => inside(item, box, kind === 'drawing' ? bodySize : 0))) excluded.set(index, '도표 내부 텍스트')
    else if (rotated) excluded.set(index, '회전된 여백·축 텍스트')
    else if (inline) continue
    else if (/^(?:https?:\/\/|arXiv:|\S+@\S+)/i.test(str)) excluded.set(index, '주소·문서 식별자')
    else if (/^[\d\s.,+−\-()%×=<>\[\]]+$/.test(str) && (item.height < bodySize * .85 || item.transform[5] < pageBox[1] + 55)) excluded.set(index, '눈금·페이지 번호')
    else if (item.height < bodySize * .75 && str.length < 45) excluded.set(index, '작은 도표 라벨')
  }
  const allowedItems = items.map((item, index) => excluded.has(index) ? { type: 'excluded' } : item)
  const blocks = textBlocks(allowedItems).map((block) => ({ ...block, id: `b${block.itemIndexes[0] + 1}`, kind: caption.test(block.text) ? 'caption' as const : 'body' as const }))
  const excludedBlocks = textBlocks(items.map((item, index) => excluded.has(index) ? item : { type: 'included' })).map((block) => ({ block: { ...block, id: `b${block.itemIndexes[0] + 1}` }, reason: excluded.get(block.itemIndexes[0])! }))
  return { blocks, excluded: excludedBlocks, partial: !graphics || graphics.partial }
}
