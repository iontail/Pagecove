export function answerMarkdown(text: string) {
  return text.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~|`+[^`\n]+`+)/g).map((part, index) => index % 2 ? part : part
    .replace(/(?<!\\)\\\[([\s\S]*?)\\\]/g, (_match, math) => `\n\n$$\n${math.trim()}\n$$\n\n`)
    .replace(/(?<!\\)\\\(([^\n]*?)\\\)/g, (_match, math) => `$${math.trim()}$`)
  ).join('')
}
