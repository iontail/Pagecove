import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defaultPanels, panelLayout, translationLayout } from '../src/shared/panels.ts'

test('side panels leave reading room at minimum window size and restore preferred sizes when expanded', () => {
  const preferred = { library: 390, assistant: 440 }
  for (const viewport of [1040, 1180, 1420, 2560]) {
    const panels = panelLayout(preferred, viewport, true)
    assert.ok(panels.library >= 208 && panels.library <= 400)
    assert.ok(panels.assistant >= 260 && panels.assistant <= panels.assistantMax)
    assert.ok(viewport - panels.library - panels.assistant - 12 >= 420)
  }
  assert.equal(panelLayout(preferred, 1420, true).library, preferred.library)
  assert.equal(panelLayout(preferred, 1420, true).assistant, preferred.assistant)
  const hidden = panelLayout(defaultPanels, 1040, false)
  assert.equal(hidden.library, 260)
  assert.equal(hidden.assistant, 0)
})

test('AI panel can grow past the previous cap and yields library space at the window edge', () => {
  const wide = panelLayout({ library: 260, assistant: 900 }, 1420, true)
  assert.equal(wide.assistant, 780)
  assert.equal(wide.library, 208)
  assert.equal(1420 - wide.library - wide.assistant - 12, 420)
  assert.equal(panelLayout({ library: 260, assistant: 900 }, 2560, true).assistant, 900)
})

test('enlarged UI keeps PDF and chat usable by temporarily hiding the library', () => {
  for (const viewport of [1040 / 1.5, 1040 / 1.25, 1420 / 1.5]) {
    const panels = panelLayout(defaultPanels, viewport, true)
    assert.ok(viewport - panels.library - panels.assistant - (panels.library ? 12 : 6) >= 420)
    assert.equal(panels.library === 0, viewport < 900)
    assert.ok(panelLayout(defaultPanels, viewport, false).library >= 208)
  }
})

test('translation starts at half the original width and can expand without overflowing at small zoom', () => {
  const initial = translationLayout(1200, 1 / 3)
  assert.equal(initial.source, initial.translation * 2)
  assert.equal(translationLayout(1200, .6).translation, 720)
  for (const width of [130, 260, 372, 720, 1200]) {
    const layout = translationLayout(width, .65)
    assert.ok(layout.min <= layout.max)
    assert.ok(layout.source > 0 && layout.translation > 0)
    assert.equal(layout.source + layout.translation, width)
  }
})
