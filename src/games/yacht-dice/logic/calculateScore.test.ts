import { describe, expect, it } from 'vitest'
import {
  calculateScore,
  calculateScoreSummary,
  calculateUpperBonus,
} from './calculateScore'
import type { DiceValue, ScoreCard } from '../types/yacht'

const dice = (...values: DiceValue[]) => values

describe('calculateScore', () => {
  it('calculates upper number scores', () => {
    expect(calculateScore('sixes', dice(6, 6, 6, 2, 1))).toBe(18)
  })

  it('calculates Choice as the sum of all dice', () => {
    expect(calculateScore('choice', dice(1, 2, 3, 4, 6))).toBe(16)
  })

  it('calculates Four of a Kind', () => {
    expect(calculateScore('fourOfAKind', dice(4, 4, 4, 4, 2))).toBe(18)
    expect(calculateScore('fourOfAKind', dice(4, 4, 4, 3, 2))).toBe(0)
  })

  it('calculates Full House only for a pair and a triple', () => {
    expect(calculateScore('fullHouse', dice(2, 2, 5, 5, 5))).toBe(19)
    expect(calculateScore('fullHouse', dice(5, 5, 5, 5, 5))).toBe(0)
  })

  it('calculates Small and Large Straights', () => {
    expect(calculateScore('smallStraight', dice(1, 2, 3, 4, 4))).toBe(15)
    expect(calculateScore('smallStraight', dice(1, 2, 4, 5, 6))).toBe(0)
    expect(calculateScore('largeStraight', dice(2, 3, 4, 5, 6))).toBe(30)
  })

  it('calculates Yacht', () => {
    expect(calculateScore('yacht', dice(3, 3, 3, 3, 3))).toBe(50)
    expect(calculateScore('yacht', dice(3, 3, 3, 3, 2))).toBe(0)
  })
})

describe('upper bonus and total score', () => {
  const upperScores: ScoreCard = {
    ones: 3,
    twos: 6,
    threes: 9,
    fours: 12,
    fives: 15,
    sixes: 18,
  }

  it('awards 30 bonus points at 63 upper points', () => {
    expect(calculateUpperBonus(upperScores)).toBe(30)
  })

  it('includes the upper bonus in the total score', () => {
    expect(
      calculateScoreSummary({
        ...upperScores,
        choice: 20,
      }),
    ).toEqual({
      upperSubtotal: 63,
      upperBonus: 30,
      lowerSubtotal: 20,
      total: 113,
    })
  })

  it('does not award a bonus below 63 upper points', () => {
    expect(calculateUpperBonus({ ...upperScores, sixes: 17 })).toBe(0)
  })
})
