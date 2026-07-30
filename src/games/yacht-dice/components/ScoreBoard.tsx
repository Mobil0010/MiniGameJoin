import {
  LOWER_SCORE_CATEGORIES,
  SCORE_CATEGORY_LABELS,
  UPPER_BONUS_THRESHOLD,
  UPPER_SCORE_CATEGORIES,
} from '../constants'
import type {
  ScoreCard,
  ScoreCategory,
  ScoreSummary,
  YachtPlayer,
} from '../types/yacht'

export interface ScoreBoardProps {
  player: YachtPlayer
  previewScores: ScoreCard
  scoreSummary: ScoreSummary
  isActive: boolean
  canSelect: boolean
  onSelectScore: (category: ScoreCategory) => void
  onNicknameChange: (playerId: string, nickname: string) => void
}

interface ScoreSectionProps {
  title: string
  variant: 'upper' | 'lower'
  categories: readonly ScoreCategory[]
  scores: ScoreCard
  previewScores: ScoreCard
  canSelect: boolean
  onSelectScore: (category: ScoreCategory) => void
}

function ScoreSection({
  title,
  variant,
  categories,
  scores,
  previewScores,
  canSelect,
  onSelectScore,
}: ScoreSectionProps) {
  return (
    <div className={`score-section score-section-${variant}`}>
      <h3>{title}</h3>
      <ul>
        {categories.map((category) => {
          const selectedScore = scores[category]
          const previewScore = previewScores[category]
          const isSelected = selectedScore !== undefined
          const isAvailable = canSelect && !isSelected
          const rowClassName = [
            'score-row',
            isSelected ? 'score-row-selected' : '',
            isAvailable ? 'score-row-available' : '',
          ]
            .filter(Boolean)
            .join(' ')

          return (
            <li key={category}>
              <button
                className={rowClassName}
                type="button"
                disabled={!canSelect || isSelected}
                onClick={() => onSelectScore(category)}
              >
                <span>{SCORE_CATEGORY_LABELS[category]}</span>
                <strong className={!isSelected ? 'score-preview' : undefined}>
                  {selectedScore ?? previewScore ?? '-'}
                </strong>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function ScoreBoard({
  player,
  previewScores,
  scoreSummary,
  isActive,
  canSelect,
  onSelectScore,
  onNicknameChange,
}: ScoreBoardProps) {
  return (
    <aside
      className={`panel score-panel score-panel-player-${player.slot} ${
        isActive ? 'score-panel-active' : 'score-panel-inactive'
      }`}
      aria-label={`${player.slot}P 점수표`}
    >
      <div className="score-player-header">
        <span className="player-slot-badge">{player.slot}P</span>
        <label className="nickname-field">
          <span className="sr-only">{player.slot}P 닉네임</span>
          <input
            type="text"
            value={player.nickname}
            maxLength={16}
            aria-label={`${player.slot}P 닉네임`}
            onChange={(event) =>
              onNicknameChange(player.id, event.target.value)
            }
          />
        </label>
        <span
          className={`turn-indicator ${isActive ? 'turn-indicator-active' : ''}`}
        >
          {isActive ? '현재 차례' : '대기 중'}
        </span>
      </div>

      <div className="score-board-heading">
        <div>
          <span>SCORE</span>
          <h2>점수표</h2>
        </div>
      </div>

      <ScoreSection
        title="숫자 점수"
        variant="upper"
        categories={UPPER_SCORE_CATEGORIES}
        scores={player.scores}
        previewScores={previewScores}
        canSelect={canSelect}
        onSelectScore={onSelectScore}
      />

      <div className="bonus-summary">
        <div>
          <span>상단 합계</span>
          <strong>
            {scoreSummary.upperSubtotal} / {UPPER_BONUS_THRESHOLD}
          </strong>
        </div>
        <div>
          <span>보너스</span>
          <strong>+{scoreSummary.upperBonus}</strong>
        </div>
      </div>

      <ScoreSection
        title="조합 점수"
        variant="lower"
        categories={LOWER_SCORE_CATEGORIES}
        scores={player.scores}
        previewScores={previewScores}
        canSelect={canSelect}
        onSelectScore={onSelectScore}
      />

      <div className="total-score">
        <span>총점</span>
        <strong>{scoreSummary.total}</strong>
      </div>
    </aside>
  )
}

export default ScoreBoard
