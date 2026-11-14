export type Box = [number, number, number, number]
export type GraphicRegion = { box: Box; kind: 'figure' | 'drawing' }
type Operators = { save: number; restore: number; transform: number; paintFormXObjectBegin: number; paintFormXObjectEnd: number; constructPath: number; endPath: number; paintImageXObject: number; paintInlineImageXObject: number; paintImageMaskXObject: number }

function numbers(value: unknown, length: number): value is number[] {
  return (Array.isArray(value) || ArrayBuffer.isView(value)) && (value as number[]).length === length && Array.from(value as number[]).every(Number.isFinite)
}

function multiply(a: number[], b: number[]) {
  return [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]]
}

function transformed(box: number[], matrix: number[]): Box {
  const points = [[box[0], box[1]], [box[2], box[1]], [box[0], box[3]], [box[2], box[3]]].map(([x, y]) => [matrix[0] * x + matrix[2] * y + matrix[4], matrix[1] * x + matrix[3] * y + matrix[5]])
  return [Math.min(...points.map(([x]) => x)), Math.min(...points.map(([, y]) => y)), Math.max(...points.map(([x]) => x)), Math.max(...points.map(([, y]) => y))]
}

export function overlaps(a: Box, b: Box, margin = 0) {
  return a[0] <= b[2] + margin && a[2] >= b[0] - margin && a[1] <= b[3] + margin && a[3] >= b[1] - margin
}

function union(a: Box, b: Box): Box { return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])] }

export function graphicRegions(list: { fnArray: number[]; argsArray: unknown[][] }, ops: Operators) {
  let matrix = [1, 0, 0, 1, 0, 0]
  const stack: number[][] = []
  const regions: GraphicRegion[] = []
  const paths: Box[] = []
  let partial = false
  list.fnArray.forEach((op, index) => {
    const args = list.argsArray[index] ?? []
    if (op === ops.save || op === ops.paintFormXObjectBegin) stack.push([...matrix])
    if (op === ops.transform && numbers(args, 6)) matrix = multiply(matrix, args)
    if (op === ops.paintFormXObjectBegin) {
      if (numbers(args[0], 6)) matrix = multiply(matrix, args[0])
      if (numbers(args[1], 4)) regions.push({ box: transformed(args[1], matrix), kind: 'figure' })
    }
    if ([ops.paintImageXObject, ops.paintInlineImageXObject, ops.paintImageMaskXObject].includes(op)) regions.push({ box: transformed([0, 0, 1, 1], matrix), kind: 'figure' })
    if (op === ops.constructPath && args[0] !== ops.endPath && numbers(args[2], 4)) {
      if (paths.length < 2000) paths.push(transformed(args[2], matrix))
      else partial = true
    }
    if (op === ops.restore || op === ops.paintFormXObjectEnd) matrix = stack.pop() ?? [1, 0, 0, 1, 0, 0]
  })
  // shortcut: dense vector pages need a layout model; keep image/form regions and report partial analysis.
  if (!partial) {
    const groups: { box: Box; count: number }[] = []
    for (const box of paths) {
      let group = { box, count: 1 }
      for (let index = groups.length - 1; index >= 0; index--) {
        if (overlaps(group.box, groups[index].box, 5)) {
          group = { box: union(group.box, groups[index].box), count: group.count + groups[index].count }
          groups.splice(index, 1)
          index = groups.length
        }
      }
      groups.push(group)
    }
    regions.push(...groups.filter(({ box, count }) => count >= 4 && box[2] - box[0] >= 24 && box[3] - box[1] >= 24).map(({ box }) => ({ box, kind: 'drawing' as const })))
  }
  return { regions, partial }
}
