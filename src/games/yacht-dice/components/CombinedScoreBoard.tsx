import {
  LOWER_SCORE_CATEGORIES,
  SCORE_CATEGORY_LABELS,
  SCORE_CATEGORIES,
  UPPER_BONUS_THRESHOLD,
  UPPER_SCORE_CATEGORIES,
} from '../constants'
import type {
  ScoreCard,
  ScoreCategory,
  ScoreSummary,
  YachtPlayer,
} from '../types/yacht'

interface CombinedScoreBoardProps {
  players: readonly YachtPlayer[]
  activePlayerId: string
  previewScores: ScoreCard
  playerSummaries: Record<string, ScoreSummary>
  round: number
  canSelectActive: boolean
  canEditNicknames?: boolean
  onSelectScore: (category: ScoreCategory) => void
  onNicknameChange: (playerId: string, nickname: string) => void
}

interface ScoreCategoryRowProps {
  category: ScoreCategory
  players: readonly YachtPlayer[]
  activePlayerId: string
  previewScores: ScoreCard
  canSelectActive: boolean
  onSelectScore: (category: ScoreCategory) => void
}

function ScoreCategoryRow({
  category,
  players,
  activePlayerId,
  previewScores,
  canSelectActive,
  onSelectScore,
}: ScoreCategoryRowProps) {
  return (
    <div className="combined-score-row">
      <span className="combined-score-label">
        {SCORE_CATEGORY_LABELS[category]}
      </span>
      {players.map((player) => {
        const selectedScore = player.scores[category]
        const isActive = player.id === activePlayerId
        const isSelected = selectedScore !== undefined
        const isAvailable = isActive && canSelectActive && !isSelected
        const previewScore = isActive ? previewScores[category] : undefined

        return (
          <button
            className={[
              'combined-score-cell',
              isSelected ? 'combined-score-cell-selected' : '',
              isAvailable ? 'combined-score-cell-available' : '',
              isActive ? 'combined-score-cell-active-player' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            type="button"
            disabled={!isAvailable}
            key={player.id}
            aria-label={`${player.slot}P ${SCORE_CATEGORY_LABELS[category]} ${
              isSelected ? `${selectedScore}점` : '점수 선택'
            }`}
            onClick={() => onSelectScore(category)}
          >
            <strong className={!isSelected ? 'score-preview' : undefined}>
              {selectedScore ?? previewScore ?? '-'}
            </strong>
          </button>
        )
      })}
    </div>
  )
}

function CombinedScoreBoard({
  players,
  activePlayerId,
  previewScores,
  playerSummaries,
  round,
  canSelectActive,
  canEditNicknames = true,
  onSelectScore,
  onNicknameChange,
}: CombinedScoreBoardProps) {
  return (
    <aside className="panel combined-score-panel" aria-label="두 플레이어 점수표">
      <div className="combined-score-topline">
        <div>
          <span>SCORE BOARD</span>
          <h2>점수표</h2>
        </div>
        <strong>
          라운드 {round} / {SCORE_CATEGORIES.length}
        </strong>
      </div>

      <div className="combined-player-grid">
        <span className="combined-player-grid-label">플레이어</span>
        {players.map((player) => {
          const isActive = player.id === activePlayerId

          return (
            <div
              className={`combined-player-heading ${
                isActive ? 'combined-player-heading-active' : ''
              }`}
              key={player.id}
            >
              <span className="player-slot-badge">{player.slot}P</span>
              <label className="nickname-field">
                <span className="sr-only">{player.slot}P 닉네임</span>
                <input
                  type="text"
                  value={player.nickname}
                  maxLength={16}
                  readOnly={!canEditNicknames}
                  aria-label={`${player.slot}P 닉네임`}
                  onChange={(event) =>
                    onNicknameChange(player.id, event.target.value)
                  }
                />
              </label>
              <span
                className={`turn-indicator ${
                  isActive ? 'turn-indicator-active' : ''
                }`}
              >
                {isActive ? '현재 턴' : '대기'}
              </span>
            </div>
          )
        })}
      </div>

      <section className="combined-score-section">
        <h3>숫자 점수</h3>
        <div className="combined-score-table">
          {UPPER_SCORE_CATEGORIES.map((category) => (
            <ScoreCategoryRow
              category={category}
              players={players}
              activePlayerId={activePlayerId}
              previewScores={previewScores}
              canSelectActive={canSelectActive}
              onSelectScore={onSelectScore}
              key={category}
            />
          ))}

          <div className="combined-score-row combined-summary-row">
            <span className="combined-score-label">상단 합계</span>
            {players.map((player) => (
              <strong className="combined-summary-cell" key={player.id}>
                {playerSummaries[player.id].upperSubtotal} /{' '}
                {UPPER_BONUS_THRESHOLD}
              </strong>
            ))}
          </div>
          <div className="combined-score-row combined-summary-row">
            <span className="combined-score-label">보너스</span>
            {players.map((player) => (
              <strong className="combined-summary-cell" key={player.id}>
                +{playerSummaries[player.id].upperBonus}
              </strong>
            ))}
          </div>
        </div>
      </section>

      <section className="combined-score-section combined-score-section-lower">
        <h3>조합 점수</h3>
        <div className="combined-score-table">
          {LOWER_SCORE_CATEGORIES.map((category) => (
            <ScoreCategoryRow
              category={category}
              players={players}
              activePlayerId={activePlayerId}
              previewScores={previewScores}
              canSelectActive={canSelectActive}
              onSelectScore={onSelectScore}
              key={category}
            />
          ))}
        </div>
      </section>

      <div className="combined-total-row">
        <span>총점</span>
        {players.map((player) => (
          <strong key={player.id}>{playerSummaries[player.id].total}</strong>
        ))}
      </div>
    </aside>
  )
}

export default CombinedScoreBoard
