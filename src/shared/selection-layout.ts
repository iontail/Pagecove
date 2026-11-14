type Box = { left: number; top: number; right: number; bottom: number; width: number; height: number }
type Mark = { x: number; y: number; width: number; height: number }

export function selectionPopup(source: Box, reader: Box, marks: Mark[], popupHeight: number, preferredWidth: number, viewport: { width: number; height: number }) {
  const leftEdge = Math.max(8, reader.left + 12), rightEdge = Math.min(viewport.width - 8, reader.right - 12)
  const topEdge = Math.max(8, reader.top + 8), bottomEdge = Math.min(viewport.height - 8, reader.bottom - 8)
  const visible = marks.map((mark) => ({
    left: Math.max(leftEdge, source.left + mark.x * source.width),
    right: Math.min(rightEdge, source.left + (mark.x + mark.width) * source.width),
    top: Math.max(topEdge, source.top + mark.y * source.height),
    bottom: Math.min(bottomEdge, source.top + (mark.y + mark.height) * source.height)
  })).filter((mark) => mark.bottom > mark.top && mark.right > mark.left)
  if (!visible.length || rightEdge <= leftEdge || bottomEdge <= topEdge) return null
  const width = Math.min(preferredWidth, rightEdge - leftEdge)
  const first = visible[0], top = Math.min(...visible.map((mark) => mark.top)), bottom = Math.max(...visible.map((mark) => mark.bottom))
  const availableSide = Math.max(top - topEdge - 8, bottomEdge - bottom - 8)
  const maxHeight = Math.min(560, availableSide >= 220 ? availableSide : bottomEdge - topEdge), height = Math.min(popupHeight, maxHeight)
  const above = top - height - 8, below = bottom + 8
  const preferredTop = above >= topEdge ? above : below + height <= bottomEdge ? below : top - topEdge >= bottomEdge - bottom ? above : below
  return { width, maxHeight, left: Math.max(leftEdge, Math.min(rightEdge - width, (first.left + first.right - width) / 2)), top: Math.max(topEdge, Math.min(bottomEdge - height, preferredTop)) }
}
