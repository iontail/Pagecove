import { createContext } from 'react'

export const ReadingActions = createContext<{ pageCount: number; goToPage: (page: number) => void; openAISettings: () => void } | null>(null)
