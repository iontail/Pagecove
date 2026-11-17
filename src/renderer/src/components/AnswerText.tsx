import { memo, useContext, useMemo } from 'react'
import Markdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkCjkFriendly from 'remark-cjk-friendly/parseOnly'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import type { PluggableList } from 'unified'
import { answerMarkdown } from '../../../shared/answer-format'
import pageCitations from '../../../shared/page-citations'
import { ReadingActions } from '@/lib/reading-actions'
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
  const navigation = useContext(ReadingActions)
  const renderedComponents = useMemo<Components>(() => ({ ...components,
    a: ({ href, children }) => {
      const match = /^#paperglim-page-(\d+)-(\d+)$/.exec(href ?? '')
      if (!match) return <a href={href} target="_blank" rel="noreferrer">{children}</a>
      const start = Number(match[1]), end = Number(match[2])
      const valid = !!navigation && Number.isSafeInteger(start) && Number.isSafeInteger(end) && start > 0 && end >= start && end <= navigation.pageCount
      return <button className="citation-page" disabled={!valid} title={valid ? `PDF ${start}페이지로 이동` : '이 PDF의 페이지 범위를 벗어난 근거야'} onClick={() => { if (valid) navigation.goToPage(start) }}>{children}</button>
    }
  }), [navigation])
  return <div className="answer-text"><Markdown remarkPlugins={citations ? citedPlugins : remarkPlugins} rehypePlugins={rehypePlugins} components={renderedComponents} skipHtml>{answerMarkdown(text)}</Markdown></div>
})
