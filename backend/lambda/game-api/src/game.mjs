import { randomInt } from 'node:crypto'

export const SCORE_CATEGORIES = [
  'ones',
  'twos',
  'threes',
  'fours',
  'fives',
  'sixes',
  'choice',
  'fourOfAKind',
  'fullHouse',
  'smallStraight',
  'largeStraight',
  'yacht',
]

const UPPER_VALUES = {
  ones: 1,
  twos: 2,
  threes: 3,
  fours: 4,
  fives: 5,
  sixes: 6,
}

export function createInitialDice() {
  return Array.from({ length: 5 }, (_, index) => ({
    id: index,
    value: null,
    isHeld: false,
  }))
}

export function rollServerDice(currentDice, heldIndexes, rollCount) {
  if (!Number.isInteger(rollCount) || rollCount < 0 || rollCount >= 3) {
    throw new Error('이번 턴에는 주사위를 더 굴릴 수 없습니다.')
  }

  const heldSet = new Set(heldIndexes)

  if (
    heldIndexes.some(
      (index) => !Number.isInteger(index) || index < 0 || index >= 5,
    )
  ) {
    throw new Error('보관할 주사위 정보가 올바르지 않습니다.')
  }

  return currentDice.map((die, index) => {
    const canHold = rollCount > 0 && die.value !== null && heldSet.has(index)

    return {
      ...die,
      value: canHold ? die.value : randomInt(1, 7),
      isHeld: canHold,
    }
  })
}

export function calculateScore(category, values) {
  if (!SCORE_CATEGORIES.includes(category)) {
    throw new Error('알 수 없는 점수 항목입니다.')
  }

  if (
    values.length !== 5 ||
    values.some((value) => !Number.isInteger(value) || value < 1 || value > 6)
  ) {
    throw new Error('주사위 값이 올바르지 않습니다.')
  }

  const counts = new Map()
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }

  const total = values.reduce((sum, value) => sum + value, 0)
  const unique = [...counts.keys()].sort((a, b) => a - b)
  const frequencies = [...counts.values()].sort((a, b) => b - a)

  if (category in UPPER_VALUES) {
    const target = UPPER_VALUES[category]
    return values
      .filter((value) => value === target)
      .reduce((sum, value) => sum + value, 0)
  }

  switch (category) {
    case 'choice':
      return total
    case 'fourOfAKind':
      return frequencies[0] >= 4 ? total : 0
    case 'fullHouse':
      return frequencies.length === 2 &&
        frequencies[0] === 3 &&
        frequencies[1] === 2
        ? total
        : 0
    case 'smallStraight': {
      const key = unique.join('')
      return key.includes('1234') || key.includes('2345') || key.includes('3456')
        ? 15
        : 0
    }
    case 'largeStraight':
      return unique.join('') === '12345' || unique.join('') === '23456'
        ? 30
        : 0
    case 'yacht':
      return frequencies[0] === 5 ? 50 : 0
    default:
      return 0
  }
}

export function calculatePlayerTotal(scores) {
  const scoreMap = Object.fromEntries(
    scores.map(({ category, score }) => [category, score]),
  )
  const upperSubtotal = Object.keys(UPPER_VALUES).reduce(
    (sum, category) => sum + (scoreMap[category] ?? 0),
    0,
  )
  const upperBonus = upperSubtotal >= 63 ? 30 : 0
  const lowerSubtotal = SCORE_CATEGORIES.filter(
    (category) => !(category in UPPER_VALUES),
  ).reduce((sum, category) => sum + (scoreMap[category] ?? 0), 0)

  return upperSubtotal + upperBonus + lowerSubtotal
}
