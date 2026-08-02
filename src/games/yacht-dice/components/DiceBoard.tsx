import { useEffect, useRef } from 'react'
import ThreeDiceBoard from './ThreeDiceBoard'
import { getDiceCombinationAnnouncement } from '../logic/getDiceCombination'
import type { DiceValue, Die } from '../types/yacht'
import { playGameSound } from '../../../audio/gameAudio'

export interface DiceBoardProps {
  dice: readonly Die[]
  disabled?: boolean
  isRolling?: boolean
  onToggleHold: (dieId: number) => void
}

function DiceBoard({
  dice,
  disabled = false,
  isRolling = false,
  onToggleHold,
}: DiceBoardProps) {
  const lastSoundKeyRef = useRef('')
  const diceValues = dice.map((die) => die.value)
  const hasCompleteDice = diceValues.every(
    (value): value is DiceValue => value !== null,
  )
  const combination =
    !isRolling && hasCompleteDice
      ? getDiceCombinationAnnouncement(diceValues)
      : null
  const diceValueKey = diceValues.join('-')

  useEffect(() => {
    if (isRolling) {
      lastSoundKeyRef.current = ''
      return
    }

    if (!combination) {
      return
    }

    const soundKey = `${combination}:${diceValueKey}`
    if (lastSoundKeyRef.current === soundKey) {
      return
    }

    lastSoundKeyRef.current = soundKey
    playGameSound('combination')
  }, [combination, diceValueKey, isRolling])

  return (
    <div className="dice-board-stack">
      <p className="dice-combination-announcement" aria-live="polite">
        {combination}
      </p>
      <ThreeDiceBoard
        dice={dice}
        disabled={disabled}
        isRolling={isRolling}
        onToggleHold={onToggleHold}
      />
    </div>
  )
}

export default DiceBoard
