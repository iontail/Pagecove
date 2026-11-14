# PaperGlim interface

The reading workspace serves two modes: operate for library and controls, read for the document and translation. Familiar desktop controls take priority over decorative effects.

## Direction

A black desktop workspace with neutral controls. Only the translation uses pale paper and restrained maple accents to distinguish it from the original PDF. The signature interaction is the paired amber sentence highlight across the original and translation. Use the supplied Ember reference for close black surfaces, thin borders, compact spacing and a restrained tonal gradient only on selected navigation controls. Avoid glows, decorative textures and dashboard cards.

## Foundations

- Shell `#141415`, sidebar `#111112`, reading ground `#181819`.
- Main text `#e8e8eb`, secondary text `#a0a0a5`, separators `#2e2e32`.
- Neutral actions `#e7e7e7` with dark text `#181818`. Reserve maple for translation controls.
- Translation paper `#fffaf0`, text `#382f24`, header `#f0dfbd`.
- Use macOS system typography and Apple SD Gothic Neo. Body controls 12–13px, document and brand headings 14px. Translation body 14px, 13px in narrow columns.

## Composition and behavior

Library on the left, flexible reader in the center, optional AI panel on the right. Both separators support captured pointer drag, arrow keys, Home/End and double-click reset. Reserve at least 420px for the reader and save preferred widths. The AI panel has no fixed pixel cap; it can grow until the library reaches 208px and the reader reaches its minimum. Resize PDF canvases after releasing a separator.

Each translation starts with only a maple `한글번역` tab at the upper right of its page spread. Open translation touches the PDF edge, at half the source width by default and the same height. Drag the original/translation boundary to widen translation up to 65% of the spread, preserving a usable source width. Save the ratio and reset it with double-click. Scale the existing PDF during a drag and redraw it on release. Longer translations scroll inside that page. Hover and keyboard focus highlight both aligned sentence ranges immediately without moving the document.

The back control beside the document title returns to the PDF drop screen. It retains files and reading positions. Use explicit loading, empty, error, disabled and focus states. Respect reduced motion.

## Reading assistance

Keep translation controls attached to the source column; opening translation on one page never moves another page's controls into empty side space. The first page also offers translate-all progress and stop.

Selection tools appear immediately above the selected text when space permits. An explanation expands into a compact dark popover with its own follow-up conversation. Saved selection history uses a subtle blue mark distinct from amber translation hover, and returns on hover. The sidebar has separate conversation and summary tabs. Model selection and a compact Fast switch sit inside the composer footer. Use an app-styled Radix menu instead of native OS select popups. Show the provider mark and name on the trigger, allow Codex/Claude switching inside the menu, and use neutral hover/selection rows with a checkmark. Keep the list scrollable and the popup inside window bounds. Preserve the conversation and draft when changing models. Show increased usage when Fast is on, and disable unsupported combinations. Keep bulk translation at Standard speed. The summary starts at its three-sentence overview, followed by problem, method, results and limitations.
