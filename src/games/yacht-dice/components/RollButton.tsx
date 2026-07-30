export interface RollButtonProps {
  rollCount: number
  maxRollCount: number
  disabled?: boolean
  isRolling?: boolean
  onRoll: () => void
}

function RollButton({
  rollCount,
  maxRollCount,
  disabled = false,
  isRolling = false,
  onRoll,
}: RollButtonProps) {
  const buttonLabel =
    isRolling
      ? '주사위 굴리는 중...'
      : rollCount === 0
      ? '주사위 굴리기'
      : `다시 굴리기 (${maxRollCount - rollCount}회 남음)`

  return (
    <button
      className="roll-button"
      type="button"
      disabled={disabled}
      onClick={onRoll}
    >
      {buttonLabel}
    </button>
  )
}

export default RollButton
