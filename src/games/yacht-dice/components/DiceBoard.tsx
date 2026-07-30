import Dice from './Dice'
import type { Die } from '../types/yacht'

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
  return (
    <div
      className="dice-row"
      aria-label="주사위 영역"
      aria-busy={isRolling}
    >
      {dice.map((die) => (
        <Dice
          key={die.id}
          die={die}
          disabled={disabled}
          isRolling={isRolling}
          onToggleHold={onToggleHold}
        />
      ))}
    </div>
  )
}

export default DiceBoard
