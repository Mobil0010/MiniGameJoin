import type { DiceValue, ScoreCard } from '../types/yacht'
import { calculateScore } from './calculateScore'

export type AnnouncedDiceCombination =
  | 'Four of a Kind!'
  | 'Full House!'
  | 'Small Straight!'
  | 'Large Straight!'

export function getDiceCombinationAnnouncement(
  dice: readonly DiceValue[],
  registeredScores: ScoreCard = {},
): AnnouncedDiceCombination | null {
  if (dice.length !== 5 || calculateScore('yacht', dice) === 50) {
    return null
  }

  // A large straight also satisfies the small-straight condition, so check it first.
  if (calculateScore('largeStraight', dice) > 0) {
    return registeredScores.largeStraight === undefined
      ? 'Large Straight!'
      : null
  }

  if (calculateScore('smallStraight', dice) > 0) {
    return registeredScores.smallStraight === undefined
      ? 'Small Straight!'
      : null
  }

  if (calculateScore('fourOfAKind', dice) > 0) {
    return registeredScores.fourOfAKind === undefined
      ? 'Four of a Kind!'
      : null
  }

  if (calculateScore('fullHouse', dice) > 0) {
    return registeredScores.fullHouse === undefined ? 'Full House!' : null
  }

  return null
}
