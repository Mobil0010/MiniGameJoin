export interface YachtCelebrationProps {
  nickname: string
  onDismiss: () => void
}

function YachtCelebration({
  nickname,
  onDismiss,
}: YachtCelebrationProps) {
  return (
    <button
      className="yacht-celebration"
      type="button"
      aria-label="Yacht 달성 축하 알림 닫기"
      onClick={onDismiss}
    >
      <span className="confetti-stage" aria-hidden="true">
        {Array.from({ length: 12 }, (_, index) => (
          <span className="confetti-piece" key={index} />
        ))}
      </span>

      <span className="celebration-card">
        <span className="celebration-emoji" aria-hidden="true">
          🎉
        </span>
        <span className="celebration-kicker">FIVE OF A KIND</span>
        <strong>YACHT!</strong>
        <span className="celebration-copy">
          {nickname || '현재 플레이어'}님의 완벽한 다섯 주사위!
        </span>
        <small>클릭하면 바로 닫힙니다</small>
      </span>
    </button>
  )
}

export default YachtCelebration
