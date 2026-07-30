export interface OnlineMatchExitDialogProps {
  isSubmitting: boolean
  onCancel: () => void
  onConfirmForfeit: () => void
}

function OnlineMatchExitDialog({
  isSubmitting,
  onCancel,
  onConfirmForfeit,
}: OnlineMatchExitDialogProps) {
  return (
    <div
      className="match-exit-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="match-exit-title"
      aria-describedby="match-exit-description"
    >
      <section className="match-exit-dialog">
        <span>LEAVE MATCH?</span>
        <h2 id="match-exit-title">게임에서 나가시겠습니까?</h2>
        <p id="match-exit-description">
          게임 도중에 나가면 기권 처리되고 상대방이 자동으로 승리합니다.
          그래도 나가겠습니까?
        </p>
        <div>
          <button
            className="secondary-action"
            type="button"
            disabled={isSubmitting}
            onClick={onCancel}
          >
            계속 플레이
          </button>
          <button
            className="danger-action"
            type="button"
            disabled={isSubmitting}
            onClick={onConfirmForfeit}
          >
            {isSubmitting ? '기권 처리 중...' : '기권하고 나가기'}
          </button>
        </div>
      </section>
    </div>
  )
}

export default OnlineMatchExitDialog
