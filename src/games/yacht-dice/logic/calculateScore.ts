import {
  LOWER_SCORE_CATEGORIES,
  UPPER_BONUS_SCORE,
  UPPER_BONUS_THRESHOLD,
  UPPER_SCORE_CATEGORIES,
} from '../constants'
import type {
  DiceValue,
  ScoreCard,
  ScoreCategory,
  ScoreSummary,
  UpperScoreCategory,
} from '../types/yacht'

const UPPER_CATEGORY_VALUES: Record<UpperScoreCategory, DiceValue> = {
  ones: 1,
  twos: 2,
  threes: 3,
  fours: 4,
  fives: 5,
  sixes: 6,
}

function countDice(dice: readonly DiceValue[]): number[] {
  const counts = Array.from({ length: 7 }, () => 0)

  for (const value of dice) {
    counts[value] += 1
  }

  return counts
}

function hasStraight(
  uniqueValues: readonly DiceValue[],
  sequenceLength: number,
): boolean {
  for (let start = 0; start <= uniqueValues.length - sequenceLength; start += 1) {
    const firstValue = uniqueValues[start]
    const isSequence = uniqueValues
      .slice(start, start + sequenceLength)
      .every((value, index) => value === firstValue + index)

    if (isSequence) {
      return true
    }
  }

  return false
}

export function calculateScore(
  category: ScoreCategory,
  dice: readonly DiceValue[],
): number {
  const total = dice.reduce<number>((sum, value) => sum + value, 0)
  const counts = countDice(dice)
  const repeatedCounts = counts.filter((count) => count > 0).sort()
  const uniqueValues = [...new Set(dice)].sort(
    (first, second) => first - second,
  )

  if (category in UPPER_CATEGORY_VALUES) {
    const targetValue = UPPER_CATEGORY_VALUES[category as UpperScoreCategory]
    return dice
      .filter((value) => value === targetValue)
      .reduce<number>((sum, value) => sum + value, 0)
  }

  switch (category) {
    case 'choice':
      return total
    case 'fourOfAKind':
      return counts.some((count) => count >= 4) ? total : 0
    case 'fullHouse':
      return repeatedCounts.length === 2 &&
        repeatedCounts[0] === 2 &&
        repeatedCounts[1] === 3
        ? total
        : 0
    case 'smallStraight':
      return hasStraight(uniqueValues, 4) ? 15 : 0
    case 'largeStraight':
      return hasStraight(uniqueValues, 5) ? 30 : 0
    case 'yacht':
      return counts.some((count) => count === 5) ? 50 : 0
  }

  return 0
}

export function calculateUpperSubtotal(scores: ScoreCard): number {
  return UPPER_SCORE_CATEGORIES.reduce(
    (subtotal, category) => subtotal + (scores[category] ?? 0),
    0,
  )
}

export function calculateUpperBonus(scores: ScoreCard): number {
  return calculateUpperSubtotal(scores) >= UPPER_BONUS_THRESHOLD
    ? UPPER_BONUS_SCORE
    : 0
}

export function calculateScoreSummary(scores: ScoreCard): ScoreSummary {
  const upperSubtotal = calculateUpperSubtotal(scores)
  const upperBonus =
    upperSubtotal >= UPPER_BONUS_THRESHOLD ? UPPER_BONUS_SCORE : 0
  const lowerSubtotal = LOWER_SCORE_CATEGORIES.reduce(
    (subtotal, category) => subtotal + (scores[category] ?? 0),
    0,
  )

  return {
    upperSubtotal,
    upperBonus,
    lowerSubtotal,
    total: upperSubtotal + upperBonus + lowerSubtotal,
  }
}
