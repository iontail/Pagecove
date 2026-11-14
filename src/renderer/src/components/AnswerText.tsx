export default function AnswerText({ text }: { text: string }) {
  const tokens = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\\\([\s\S]*?\\\))/g)
  return <div className="answer-text">{tokens.map((token, index) => token.startsWith('**') && token.endsWith('**') ? <strong key={index}>{token.slice(2, -2)}</strong> : token.startsWith('`') && token.endsWith('`') ? <code key={index}>{token.slice(1, -1)}</code> : token.startsWith('\\(') && token.endsWith('\\)') ? <code key={index}>{token.slice(2, -2)}</code> : token)}</div>
}
