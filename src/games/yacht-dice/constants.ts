import type {
  LowerScoreCategory,
  ScoreCategory,
  UpperScoreCategory,
} from './types/yacht'

export const DICE_COUNT = 5
export const MAX_ROLL_COUNT = 3
export const ROLL_ANIMATION_MS = 1200

export const UPPER_BONUS_THRESHOLD = 63
export const UPPER_BONUS_SCORE = 30

export const UPPER_SCORE_CATEGORIES: readonly UpperScoreCategory[] = [
  'ones',
  'twos',
  'threes',
  'fours',
  'fives',
  'sixes',
]

export const LOWER_SCORE_CATEGORIES: readonly LowerScoreCategory[] = [
  'choice',
  'fourOfAKind',
  'fullHouse',
  'smallStraight',
  'largeStraight',
  'yacht',
]

export const SCORE_CATEGORIES: readonly ScoreCategory[] = [
  ...UPPER_SCORE_CATEGORIES,
  ...LOWER_SCORE_CATEGORIES,
]

export const SCORE_CATEGORY_LABELS: Record<ScoreCategory, string> = {
  ones: 'Ones',
  twos: 'Twos',
  threes: 'Threes',
  fours: 'Fours',
  fives: 'Fives',
  sixes: 'Sixes',
  choice: 'Choice',
  fourOfAKind: 'Four of a Kind',
  fullHouse: 'Full House',
  smallStraight: 'Small Straight',
  largeStraight: 'Large Straight',
  yacht: 'Yacht',
}
