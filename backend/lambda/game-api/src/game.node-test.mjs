import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculatePlayerTotal,
  calculateScore,
  createInitialDice,
} from './game.mjs'

test('creates five empty dice', () => {
  const dice = createInitialDice()
  assert.equal(dice.length, 5)
  assert.ok(dice.every((die) => die.value === null && !die.isHeld))
})

test('calculates yacht and full house scores', () => {
  assert.equal(calculateScore('yacht', [6, 6, 6, 6, 6]), 50)
  assert.equal(calculateScore('fullHouse', [2, 2, 3, 3, 3]), 13)
  assert.equal(calculateScore('fullHouse', [2, 2, 2, 2, 3]), 0)
})

test('adds the 30 point upper bonus at 63 points', () => {
  const scores = [
    { category: 'ones', score: 3 },
    { category: 'twos', score: 6 },
    { category: 'threes', score: 9 },
    { category: 'fours', score: 12 },
    { category: 'fives', score: 15 },
    { category: 'sixes', score: 18 },
    { category: 'choice', score: 20 },
  ]

  assert.equal(calculatePlayerTotal(scores), 113)
})
