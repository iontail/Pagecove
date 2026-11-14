export const defaultPanels = { library: 260, assistant: 320 }

export function panelLayout(preferred: typeof defaultPanels, viewport: number, assistantOpen: boolean) {
  const space = viewport - 420 - (assistantOpen ? 12 : 6)
  const assistantMax = Math.max(260, space - 208)
  const assistant = assistantOpen ? Math.max(260, Math.min(preferred.assistant, assistantMax)) : 0
  const library = Math.max(208, Math.min(400, preferred.library, space - assistant))
  return { library, assistant, libraryMax: Math.max(208, Math.min(400, space - assistant)), assistantMax }
}

export function translationLayout(width: number, share: number) {
  const min = Math.min(140, width / 3)
  const max = Math.max(min, Math.min(width * .65, width - Math.min(180, width / 2)))
  const translation = Math.max(min, Math.min(max, width * share))
  return { source: width - translation, translation, min, max }
}
