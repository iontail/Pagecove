# PaperGlim

## Platform and stack

Apple Silicon macOS desktop app using Electron, React, TypeScript and react-pdf. Ship arm64 builds only; Intel Mac is not supported.

## Purpose

Read academic PDFs with page-local Korean translation and optional AI questions using the user's installed, authenticated Codex or Claude Code CLI. The user wants GitHub downloads without a separate app subscription.

## Workflows and constraints

- Open or drop local PDFs, or register local PDFs from Zotero while retaining collection membership.
- Scroll through pages continuously. Keep translation paragraphs beside their source page and map translated sentences to exact source text ranges.
- Provide a first-page translate-all action and sentence-level recovery instead of hiding an entire page on one validation failure.
- Offer composer-level model selection and optional Codex Fast for chat, summary and selection explanation; preserve current conversation when changing models. Keep translation at Standard speed. Disable Claude Fast because it requires credits outside subscription limits.
- Offer whole-paper chat and structured three-sentence / overview summaries.
- Make the three reading suggestions execute immediately with distinct internal tasks. Ground normal chat and inline explanations in the same paper context, define relevant concepts and keep answers concise. Render Markdown and local KaTeX inline/display math, retaining malformed math as visible source.
- Preserve important English terminology. Exclude chart interiors from translation where the heuristic can identify them.
- Each CLI invocation is ephemeral. Include only the current thread history, never other threads. Keep sidebar chat and drafts temporary; persist requested selection explanations locally for later hover recall. Share the full-paper extraction and long-paper evidence context across questions, summaries and explanations.
- Search full PDF text locally with Cmd+F and jump to exact source ranges. Open saved selection discussions from a document-level list.
- Cancel individual AI operations by terminating their owned CLI process groups, preserve question drafts, and keep concurrent operations isolated.
- Persist completed translations locally by paper and content SHA-256, restoring them across model changes and app restarts while keeping sidebar chat temporary. Allow per-page cache deletion.
- Keep original PDFs unchanged. Retain the library and reading position when returning to the start screen.
- Keep the overall interface black with neutral controls. Reserve pale yellow and wood brown for the translation area. Keep controls readable and both translation and side panels resizable.

## Current limits

Scanned PDF OCR, Zotero annotation synchronization, group libraries, signed distribution builds and automatic downloading of remote Zotero attachments are not implemented.
