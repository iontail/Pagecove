# PaperGlim interface

The reading workspace serves two modes: operate for library and controls, read for the document and translation. Familiar desktop controls take priority over decorative effects.

## Direction

A black desktop workspace with neutral controls. Only the translation uses pale paper and restrained maple accents to distinguish it from the original PDF. The signature interaction is the paired amber sentence highlight across the original and translation. Use the supplied Ember reference for close black surfaces, thin borders, compact spacing and a restrained tonal gradient only on selected navigation controls. Avoid glows, decorative textures and dashboard cards.

## Foundations

The app identity is a split frame with two opposed, rounded forms, offset slightly across diagonal openings. Use soft white on a graphite tile. Keep the 180-degree relationship, optical stroke weight and open gaps; no initials, books, ribbons or sparkles. The header uses the same silhouette without the tile. `resources/icon.svg` is the master; `npm run icons` generates ICNS, PNG and matching app/site marks. Preserve recognition at 16–128px.

- Shell `#141415`, sidebar `#111112`, reading ground `#181819`.
- Main text `#e8e8eb`, secondary text `#a0a0a5`, separators `#2e2e32`.
- Neutral actions `#e7e7e7` with dark text `#181818`. Reserve maple for translation controls.
- Translation paper `#fffaf0`, text `#382f24`, header `#f0dfbd`.
- Use macOS system typography and Apple SD Gothic Neo. Body controls 12–13px, document and brand headings 14px. Translation body 14px, 13px in narrow columns.

## Composition and behavior

Library on the left, flexible reader in the center, optional AI panel on the right. Both separators support captured pointer drag, arrow keys, Home/End and double-click reset. Reserve at least 420px for the reader and save preferred widths. The AI panel has no fixed pixel cap; it can grow until the library reaches 208px and the reader reaches its minimum. Resize PDF canvases after releasing a separator.

Each translation starts with only a maple `한글번역` tab at the upper right of its page spread. Open translation touches the PDF edge, at half the source width by default and the same height. Drag the original/translation boundary to widen translation up to 65% of the spread, preserving a usable source width. Save the ratio and reset it with double-click. Scale the existing PDF during a drag and redraw it on release. Longer translations scroll inside that page. Hover and keyboard focus highlight both aligned sentence ranges immediately without moving the document.

The back control beside the document title returns to the PDF drop screen. It retains files and reading positions. Use explicit loading, empty, error, disabled and focus states. Respect reduced motion.

PDF text stays transparent during native selection, preserving the single canvas-rendered glyph layer. The selection toolbar is 340px wide and the expanded explanation prefers 440px, bounded by the reader. Hide the popup when its anchor scrolls out. When enough space exists above or below, cap the answer height there so the selected sentence remains visible. Outside pointer input clears the tool. Long answers scroll inside the popup.

PDF text selection never attaches a quotation or changes the request scope in sidebar chat. Keep sidebar questions grounded in the whole paper; selection-specific questions stay in the inline discussion. Preserve a sidebar draft when selecting or dismissing text. Disable the composer until a document is open. Cmd+Enter submits except while IME composition is active. Distinguish chat and summary progress, and open explicit HTTP(S) answer links in the default browser.

Chat suggestions send immediately. Show the current question and the beginning of its answer when a response arrives. Markdown uses short headings, clear paragraph spacing and shallow lists. Local KaTeX handles inline and display math; long expressions and tables scroll within their own bounds. Keep equations distinct without colored cards or decorative separators.

Remove page citations from the answer body and gather them into one native disclosure at the bottom, labeled `근거 보기`, closed by default. Each entry pairs a short claim excerpt with its source pages. Deduplicate references per claim and compact consecutive ranges without dropping pages. Summaries use one disclosure for the whole summary. Keep user-authored messages, code and equations unchanged.

## Reading assistance

Keep translation controls attached to the source column; opening translation on one page never moves another page's controls into empty side space. The first page also offers translate-all progress and stop.

Selection tools appear immediately above the selected text when space permits. An explanation expands into a compact dark popover with its own follow-up conversation. Saved selection history uses a subtle blue mark distinct from amber translation hover, and returns on hover. The sidebar has separate conversation and summary tabs. Model selection and a compact Fast switch sit inside the composer footer. Use an app-styled Radix menu instead of native OS select popups. Show the provider mark and name on the trigger, allow Codex/Claude switching inside the menu, and use neutral hover/selection rows with a checkmark. Keep the list scrollable and the popup inside window bounds. Preserve the conversation and draft when changing models. Show increased usage when Fast is on, and disable unsupported combinations. Keep bulk translation at Standard speed. The summary starts at its three-sentence overview, followed by problem, method, results and limitations.
