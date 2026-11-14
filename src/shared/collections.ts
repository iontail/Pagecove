import type { ZoteroCollection } from './types'

export function collectionRows(collections: ZoteroCollection[]) {
  const byKey = new Map(collections.map((entry) => [entry.key, entry]))
  return collections.map((entry) => {
    const names = [entry.name]
    const seen = new Set([entry.key])
    let parent = byKey.get(entry.parentKey ?? '')
    while (parent && !seen.has(parent.key)) {
      seen.add(parent.key)
      names.unshift(parent.name)
      parent = byKey.get(parent.parentKey ?? '')
    }
    return { ...entry, depth: names.length - 1, path: names.join(' / ') }
  }).sort((a, b) => a.path.localeCompare(b.path))
}

export function inCollection(keys: string[], selected: string, collections: ZoteroCollection[]) {
  if (!selected) return true
  const parents = new Map(collections.map((entry) => [entry.key, entry.parentKey]))
  return keys.some((key) => {
    const seen = new Set<string>()
    let current: string | null | undefined = key
    while (current && !seen.has(current)) {
      if (current === selected) return true
      seen.add(current)
      current = parents.get(current)
    }
    return false
  })
}
