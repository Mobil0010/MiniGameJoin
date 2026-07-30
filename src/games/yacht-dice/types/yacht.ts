export type DiceValue = 1 | 2 | 3 | 4 | 5 | 6

export type UpperScoreCategory =
  | 'ones'
  | 'twos'
  | 'threes'
  | 'fours'
  | 'fives'
  | 'sixes'

export type LowerScoreCategory =
  | 'choice'
  | 'fourOfAKind'
  | 'fullHouse'
  | 'smallStraight'
  | 'largeStraight'
  | 'yacht'

export type ScoreCategory = UpperScoreCategory | LowerScoreCategory

export type GameStatus = 'ready' | 'playing' | 'finished'

export interface Die {
  id: number
  value: DiceValue | null
  isHeld: boolean
}

export type ScoreCard = Partial<Record<ScoreCategory, number>>

export interface ScoreSummary {
  upperSubtotal: number
  upperBonus: number
  lowerSubtotal: number
  total: number
}

export type PlayerSlot = 1 | 2

export interface YachtPlayer {
  id: string
  slot: PlayerSlot
  nickname: string
  scores: ScoreCard
}

export interface YachtGameState {
  dice: Die[]
  rollCount: number
  players: YachtPlayer[]
  activePlayerId: string
  status: GameStatus
}
