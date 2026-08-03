import { describe, expect, it } from 'vitest'
import { getDiceCombinationAnnouncement } from './getDiceCombination'

describe('getDiceCombinationAnnouncement', () => {
  it('announces four of a kind', () => {
    expect(getDiceCombinationAnnouncement([4, 4, 4, 4, 2])).toBe(
      'Four of a Kind!',
    )
  })

  it('announces a full house', () => {
    expect(getDiceCombinationAnnouncement([2, 2, 5, 5, 5])).toBe(
      'Full House!',
    )
  })

  it('announces a small straight', () => {
    expect(getDiceCombinationAnnouncement([1, 2, 3, 4, 6])).toBe(
      'Small Straight!',
    )
  })

  it('prefers large straight over small straight', () => {
    expect(getDiceCombinationAnnouncement([2, 3, 4, 5, 6])).toBe(
      'Large Straight!',
    )
  })

  it('leaves Yacht to the existing Yacht celebration', () => {
    expect(getDiceCombinationAnnouncement([6, 6, 6, 6, 6])).toBeNull()
  })

  it('returns nothing for a roll without an announced combination', () => {
    expect(getDiceCombinationAnnouncement([1, 1, 2, 4, 6])).toBeNull()
  })

  it.each([
    ['fourOfAKind', [4, 4, 4, 4, 2]],
    ['fullHouse', [2, 2, 5, 5, 5]],
    ['smallStraight', [1, 2, 3, 4, 6]],
    ['largeStraight', [2, 3, 4, 5, 6]],
  ] as const)('does not announce a registered %s category', (category, dice) => {
    expect(
      getDiceCombinationAnnouncement(dice, { [category]: 0 }),
    ).toBeNull()
  })

  it('does not fall back to small straight when large straight is registered', () => {
    expect(
      getDiceCombinationAnnouncement([2, 3, 4, 5, 6], {
        largeStraight: 30,
      }),
    ).toBeNull()
  })
})
