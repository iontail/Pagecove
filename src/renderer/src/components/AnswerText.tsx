import { memo } from 'react'
import Markdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkCjkFriendly from 'remark-cjk-friendly/parseOnly'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import type { PluggableList } from 'unified'
import { answerMarkdown } from '../../../shared/answer-format'
import pageCitations from '../../../shared/page-citations'
import 'katex/dist/katex.min.css'

const remarkPlugins = [remarkGfm, remarkCjkFriendly, remarkMath]
const citedPlugins = [...remarkPlugins, pageCitations]
const rehypePlugins: PluggableList = [[rehypeKatex, { trust: false, strict: 'ignore', maxExpand: 1000, maxSize: 20, errorColor: '#d9b886' }]]
const components: Components = {
  table: ({ children }) => <div className="answer-table"><table>{children}</table></div>,
  img: ({ alt }) => <span>{alt}</span>,
  a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer">{children}</a>
}

export default memo(function AnswerText({ text, citations = true }: { text: string; citations?: boolean }) {
  return <div className="answer-text"><Markdown remarkPlugins={citations ? citedPlugins : remarkPlugins} rehypePlugins={rehypePlugins} components={components} skipHtml>{answerMarkdown(text)}</Markdown></div>
})
