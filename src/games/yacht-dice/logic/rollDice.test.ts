import { describe, expect, it } from 'vitest'
import { createInitialDice, rollDice } from './rollDice'

describe('rollDice', () => {
  it('creates five empty dice', () => {
    const dice = createInitialDice()

    expect(dice).toHaveLength(5)
    expect(dice.every((die) => die.value === null)).toBe(true)
    expect(dice.every((die) => die.isHeld === false)).toBe(true)
  })

  it('rolls only dice that are not held', () => {
    const dice = [
      { id: 0, value: 6 as const, isHeld: true },
      { id: 1, value: 2 as const, isHeld: false },
    ]

    const result = rollDice(dice, () => 0)

    expect(result[0]).toEqual(dice[0])
    expect(result[1]?.value).toBe(1)
  })
})
