import { jsonMath, paperRequest } from './paper-harness.ts'
import type { ChatMessage, SelectionAnchor } from './paper-harness'

export type StudyMode = 'concept' | 'figure'
export const studySections = {
  concept: { details: '개념과 기호', reasoning: '단계별 풀이', connection: '작은 예시', limits: '논문 속 역할과 조건' },
  figure: { details: '축·범례·비교 조건', reasoning: '그림·표에서 확인되는 결과', connection: '본문과의 연결', limits: '해석의 한계' }
} as const

const tasks = {
  concept: `details에는 필요한 개념만 설명하고, 기호의 뜻과 차원은 확인되는 범위에서 적어. reasoning에서는 식을 한 단계씩 잇고, 각 단계에서 무슨 연산을 하고 왜 가능한지 설명해. 원문에 생략된 유도·가정을 보충할 때는 배경 설명 또는 해석임을 밝혀.
connection은 독자가 막힐 만한 지점에 도움이 될 때만 "이해를 위한 예시" 하나를 써. 예시의 수치를 실험 결과와 섞지 마. limits에는 성립 조건과 논문 속 역할 중 질문에 필요한 내용을 적어.`,
  figure: `선택 이미지와 같은 페이지의 본문·캡션을 함께 확인해. details에서는 그림의 축·단위·범례 또는 표의 행·열·지표 중 비교를 읽는 데 필요한 정보를 알려줘.
reasoning에는 실제로 읽히는 경향과 비교를 최대 세 가지로 정리해. 읽을 수 없는 숫자는 추측하지 마. connection에서 원문이 이 그림을 어떻게 사용했는지 설명하고 저자의 주장과 눈으로 관찰한 사실을 구분해. limits에는 잘린 축, 누락된 조건, 선택 영역만으로 판단할 수 없는 내용 등 질문에 중요한 제약만 적어.`
} as const

export function studyPrompt(reference: string, question: string, history: ChatMessage[], anchor: SelectionAnchor, mode: StudyMode, pageText: string) {
  const instructions = `학습 과제: ${mode}\n${tasks[mode]}`
  const outputFormat = `다음 형식의 JSON 객체만 반환해. overview에서 새 질문에 먼저 답하고, 이어지는 문단은 짧게 나눠. 이해에 꼭 필요한 중간 과정은 충분히 보여줘. 이미 설명한 내용과 항목 간 반복을 줄이고, 각 문자열에 별도 제목을 넣지 마. overview는 필수야. 나머지 항목이 질문에 필요 없다면 빈 문자열로 두되, 결론에 영향을 주는 한계나 불확실성은 limits에 써. ${jsonMath}
학습 출력 형식: {"overview":"...","details":"...","reasoning":"...","connection":"...","limits":"..."}`
  return paperRequest({ reference, question, history, selection: anchor, instructions, outputFormat, selectedPage: pageText, figure: mode === 'figure' })
}

export function studyMarkdown(answer: string, mode: StudyMode) {
  let value: Record<string, unknown>
  try { value = JSON.parse(answer.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')) }
  catch { throw new Error('답변을 읽을 수 없어요. 다시 시도해 주세요.') }
  const keys = ['overview', ...Object.keys(studySections[mode])]
  if (!value || Array.isArray(value) || keys.some((key) => typeof value[key] !== 'string' || (value[key] as string).length > 10000) || !(value.overview as string).trim()) throw new Error('답변의 필수 항목이 누락됐어요. 다시 시도해 주세요.')
  return [(value.overview as string).trim(), ...Object.entries(studySections[mode]).flatMap(([key, title]) => (value[key] as string).trim() ? [`### ${title}\n\n${(value[key] as string).trim()}`] : [])].join('\n\n')
}
