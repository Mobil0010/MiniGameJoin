import type { DiceValue, Die } from '../types/yacht'

const DICE_FACES: Record<DiceValue, string> = {
  1: '⚀',
  2: '⚁',
  3: '⚂',
  4: '⚃',
  5: '⚄',
  6: '⚅',
}

export interface DiceProps {
  die: Die
  disabled?: boolean
  isRolling?: boolean
  onToggleHold: (dieId: number) => void
}

function Dice({
  die,
  disabled = false,
  isRolling = false,
  onToggleHold,
}: DiceProps) {
  const label =
    die.value === null
      ? '아직 굴리지 않은 주사위'
      : `${die.value}번 주사위${die.isHeld ? ', 보관됨' : ''}`

  const shouldAnimate = isRolling && !die.isHeld
  const className = [
    'die-button',
    die.isHeld ? 'die-button-held' : '',
    shouldAnimate ? 'die-button-rolling' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <button
      className={className}
      type="button"
      aria-label={label}
      aria-pressed={die.isHeld}
      disabled={disabled || isRolling}
      onClick={() => onToggleHold(die.id)}
      style={{ animationDelay: `${die.id * 45}ms` }}
    >
      {die.value === null ? '?' : DICE_FACES[die.value]}
      <span>{die.isHeld ? 'KEEP' : '\u00A0'}</span>
    </button>
  )
}

export default Dice
