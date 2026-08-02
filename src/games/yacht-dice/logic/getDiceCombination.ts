import type { DiceValue } from '../types/yacht'
import { calculateScore } from './calculateScore'

export type AnnouncedDiceCombination =
  | 'Four of a Kind!'
  | 'Full House!'
  | 'Small Straight!'
  | 'Large Straight!'

export function getDiceCombinationAnnouncement(
  dice: readonly DiceValue[],
): AnnouncedDiceCombination | null {
  if (dice.length !== 5 || calculateScore('yacht', dice) === 50) {
    return null
  }

  // A large straight also satisfies the small-straight condition, so check it first.
  if (calculateScore('largeStraight', dice) > 0) {
    return 'Large Straight!'
  }

  if (calculateScore('smallStraight', dice) > 0) {
    return 'Small Straight!'
  }

  if (calculateScore('fourOfAKind', dice) > 0) {
    return 'Four of a Kind!'
  }

  if (calculateScore('fullHouse', dice) > 0) {
    return 'Full House!'
  }

  return null
}
