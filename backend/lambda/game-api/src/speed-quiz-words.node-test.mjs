import assert from 'node:assert/strict'
import test from 'node:test'
import {
  normalizeSpeedQuizAnswer,
  SPEED_QUIZ_WORDS,
} from './speed-quiz-words.mjs'

test('contains exactly 1,024 unique speed quiz prompts', () => {
  assert.equal(SPEED_QUIZ_WORDS.length, 1024)
  assert.equal(new Set(SPEED_QUIZ_WORDS).size, 1024)
  assert.ok(SPEED_QUIZ_WORDS.every((word) => word.trim().length > 0))
})

test('normalizes answer spacing and letter case', () => {
  assert.equal(normalizeSpeedQuizAnswer('  무궁화 꽃이 피었습니다  '), '무궁화꽃이피었습니다')
  assert.equal(normalizeSpeedQuizAnswer('USB'), normalizeSpeedQuizAnswer('usb'))
})
