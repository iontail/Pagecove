import { memo } from 'react'
import Markdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkCjkFriendly from 'remark-cjk-friendly/parseOnly'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import type { PluggableList } from 'unified'
import { answerMarkdown } from '../../../shared/answer-format'
import 'katex/dist/katex.min.css'

const remarkPlugins = [remarkGfm, remarkCjkFriendly, remarkMath]
const rehypePlugins: PluggableList = [[rehypeKatex, { trust: false, strict: 'ignore', maxExpand: 1000, maxSize: 20, errorColor: '#d9b886' }]]
const components: Components = {
  table: ({ children }) => <div className="answer-table"><table>{children}</table></div>,
  img: ({ alt }) => <span>{alt}</span>,
  a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>
}

export default memo(function AnswerText({ text }: { text: string }) {
  return <div className="answer-text"><Markdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={components} skipHtml>{answerMarkdown(text)}</Markdown></div>
})
