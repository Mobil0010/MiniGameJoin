import { DICE_COUNT } from '../constants'
import type { DiceValue, Die } from '../types/yacht'

export type RandomSource = () => number

function createDiceValue(random: RandomSource): DiceValue {
  return (Math.floor(random() * 6) + 1) as DiceValue
}

export function createInitialDice(): Die[] {
  return Array.from({ length: DICE_COUNT }, (_, index) => ({
    id: index,
    value: null,
    isHeld: false,
  }))
}

export function rollDice(
  dice: readonly Die[],
  random: RandomSource = Math.random,
): Die[] {
  return dice.map((die) => {
    if (die.isHeld && die.value !== null) {
      return die
    }

    return {
      ...die,
      value: createDiceValue(random),
      isHeld: false,
    }
  })
}
