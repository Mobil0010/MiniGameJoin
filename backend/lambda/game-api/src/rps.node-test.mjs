import test from 'node:test'
import assert from 'node:assert/strict'
import {
  getRpsWinningHand,
  normalizeRpsSettings,
  resolveRpsSelections,
  takeNextTournamentMatch,
} from './rps.mjs'

test('normalizes valid room settings', () => {
  assert.deepEqual(normalizeRpsSettings({}), {
    mode: 'tournament',
    timeLimitSeconds: 10,
    winsRequired: 2,
    maxPlayers: 6,
  })
  assert.throws(() => normalizeRpsSettings({ maxPlayers: 7 }))
})

test('resolves every two-player matchup', () => {
  assert.equal(getRpsWinningHand('rock', 'scissors'), 'rock')
  assert.equal(getRpsWinningHand('scissors', 'paper'), 'scissors')
  assert.equal(getRpsWinningHand('paper', 'rock'), 'paper')
  assert.equal(getRpsWinningHand('rock', 'rock'), null)
})

test('treats one or three hand types as a multiplayer draw', () => {
  assert.equal(resolveRpsSelections([
    { userId: 'a', hand: 'rock' },
    { userId: 'b', hand: 'paper' },
    { userId: 'c', hand: 'scissors' },
  ]).isDraw, true)
  assert.equal(resolveRpsSelections([
    { userId: 'a', hand: 'rock' },
    { userId: 'b', hand: 'rock' },
  ]).isDraw, true)
})

test('returns every winner and loser in multiplayer', () => {
  assert.deepEqual(resolveRpsSelections([
    { userId: 'a', hand: 'rock' },
    { userId: 'b', hand: 'scissors' },
    { userId: 'c', hand: 'rock' },
  ]), {
    isDraw: false,
    winnerIds: ['a', 'c'],
    loserIds: ['b'],
  })
})

test('advances tournament stages and preserves a bye', () => {
  const first = takeNextTournamentMatch(['a', 'b', 'c'], [])
  assert.deepEqual(first.currentPlayerIds, ['a', 'b'])
  const second = takeNextTournamentMatch(first.pendingIds, ['a'])
  assert.deepEqual(second.currentPlayerIds, ['a', 'c'])
  assert.equal(second.advancedStage, true)
})
