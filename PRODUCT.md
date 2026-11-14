# PaperGlim

## Platform and stack

macOS desktop app using Electron, React, TypeScript and react-pdf.

## Purpose

Read academic PDFs with page-local Korean translation and optional AI questions using the user's installed, authenticated Codex or Claude Code CLI. The user wants GitHub downloads without a separate app subscription.

## Workflows and constraints

- Open or drop local PDFs, or register local PDFs from Zotero while retaining collection membership.
- Scroll through pages continuously. Keep translation paragraphs beside their source page and map translated sentences to exact source text ranges.
- Provide a first-page translate-all action and sentence-level recovery instead of hiding an entire page on one validation failure.
- Offer composer-level model selection and optional Codex Fast for chat, summary and selection explanation; preserve current conversation when changing models. Keep translation at Standard speed. Disable Claude Fast because it requires credits outside subscription limits.
- Offer whole-paper chat and structured three-sentence / overview summaries.
- Preserve important English terminology. Exclude chart interiors from translation where the heuristic can identify them.
- Each CLI invocation is ephemeral. Include only the current thread history, never other threads. Keep sidebar chat and drafts temporary; persist requested selection explanations locally for later hover recall. Share the full-paper extraction and long-paper evidence context across questions, summaries and explanations.
- Keep original PDFs unchanged. Retain the library and reading position when returning to the start screen.
- Keep the overall interface black with neutral controls. Reserve pale yellow and wood brown for the translation area. Keep controls readable and both translation and side panels resizable.

## Current limits

Scanned PDF OCR, Zotero annotation synchronization, group libraries, signed distribution builds and automatic downloading of remote Zotero attachments are not implemented.
