import { useEffect, useRef, useState } from 'react'
import DiceBoard from './components/DiceBoard'
import RollButton from './components/RollButton'
import ScoreBoard from './components/ScoreBoard'
import YachtCelebration from './components/YachtCelebration'
import { MAX_ROLL_COUNT, SCORE_CATEGORIES } from './constants'
import { useYachtGame } from './hooks/useYachtGame'
import { calculateScore } from './logic/calculateScore'
import type { DiceValue } from './types/yacht'
import {
  performAndroidFeedback,
  setAndroidGameSessionActive,
} from '../../platform/nativeApp'

const CELEBRATION_DURATION_MS = 3000

function YachtDiceGame() {
  const {
    state,
    activePlayer,
    playerSummaries,
    previewScores,
    activeCompletedCategoryCount,
    canRoll,
    isRolling,
    roll,
    toggleHold,
    selectScore,
    changeNickname,
    resetGame,
  } = useYachtGame()
  const [showYachtCelebration, setShowYachtCelebration] = useState(false)
  const celebrationTimerRef = useRef<number | null>(null)
  const lastCheckedRollRef = useRef('')

  const isFinished = state.status === 'finished'
  const round = Math.min(
    activeCompletedCategoryCount + 1,
    SCORE_CATEGORIES.length,
  )
  const activeNickname =
    activePlayer.nickname.trim() || `플레이어 ${activePlayer.slot}`
  const finalPlayers = state.players.map((player) => ({
    ...player,
    total: playerSummaries[player.id].total,
  }))
  const highestTotal = Math.max(...finalPlayers.map((player) => player.total))
  const winners = finalPlayers.filter((player) => player.total === highestTotal)

  useEffect(() => {
    setAndroidGameSessionActive(state.status !== 'finished')
    return () => setAndroidGameSessionActive(false)
  }, [state.status])

  useEffect(() => {
    return () => {
      if (celebrationTimerRef.current !== null) {
        window.clearTimeout(celebrationTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (isRolling || state.rollCount === 0) {
      return
    }

    const rollKey = `${activePlayer.id}:${activeCompletedCategoryCount}:${state.rollCount}`

    if (lastCheckedRollRef.current === rollKey) {
      return
    }

    lastCheckedRollRef.current = rollKey

    const diceValues = state.dice.map((die) => die.value)

    if (diceValues.some((value) => value === null)) {
      return
    }

    if (calculateScore('yacht', diceValues as DiceValue[]) !== 50) {
      return
    }

    performAndroidFeedback('yacht')
    setShowYachtCelebration(true)

    if (celebrationTimerRef.current !== null) {
      window.clearTimeout(celebrationTimerRef.current)
    }

    celebrationTimerRef.current = window.setTimeout(() => {
      setShowYachtCelebration(false)
      celebrationTimerRef.current = null
    }, CELEBRATION_DURATION_MS)
  }, [
    activeCompletedCategoryCount,
    activePlayer.id,
    isRolling,
    state.dice,
    state.rollCount,
  ])

  const dismissYachtCelebration = () => {
    setShowYachtCelebration(false)

    if (celebrationTimerRef.current !== null) {
      window.clearTimeout(celebrationTimerRef.current)
      celebrationTimerRef.current = null
    }
  }

  const guideMessage =
    isRolling
      ? '주사위를 굴리고 있습니다...'
      : state.rollCount === 0
      ? '주사위를 굴려 라운드를 시작하세요.'
      : state.rollCount < MAX_ROLL_COUNT
        ? '남길 주사위를 선택하거나 점수 항목을 확정하세요.'
        : '세 번 모두 굴렸습니다. 점수 항목을 선택하세요.'

  return (
    <section className="yacht-layout" aria-label="Yacht Dice 게임">
      <div className="panel play-panel" aria-busy={isRolling}>
        {showYachtCelebration && (
          <YachtCelebration
            nickname={activeNickname}
            onDismiss={dismissYachtCelebration}
          />
        )}

        {!isFinished && (
          <div className="panel-title play-panel-title">
            <div>
              <span>{activePlayer.slot}P TURN</span>
              <h2>{activeNickname}</h2>
            </div>
            <div className="turn-meta">
              <span>
                라운드 {round} / {SCORE_CATEGORIES.length}
              </span>
              <strong>
                굴리기 {state.rollCount} / {MAX_ROLL_COUNT}
              </strong>
            </div>
          </div>
        )}

        {isFinished ? (
          <div className="game-result">
            <span>FINAL RESULT</span>
            <div className="final-score-list">
              {finalPlayers.map((player) => (
                <div
                  className={
                    player.total === highestTotal ? 'final-score-winner' : ''
                  }
                  key={player.id}
                >
                  <span>
                    {player.slot}P ·{' '}
                    {player.nickname.trim() || `플레이어 ${player.slot}`}
                  </span>
                  <strong>{player.total}</strong>
                </div>
              ))}
            </div>
            <p>
              {winners.length > 1
                ? '동점입니다!'
                : `${
                    winners[0].nickname.trim() ||
                    `플레이어 ${winners[0].slot}`
                  } 승리!`}
            </p>
            <button type="button" onClick={resetGame}>
              새 게임 시작
            </button>
          </div>
        ) : (
          <>
            <DiceBoard
              dice={state.dice}
              disabled={state.rollCount === 0 || isRolling}
              isRolling={isRolling}
              onToggleHold={toggleHold}
            />
            <p className="game-guide" aria-live="polite">
              {guideMessage}
            </p>
            <RollButton
              rollCount={state.rollCount}
              maxRollCount={MAX_ROLL_COUNT}
              disabled={!canRoll}
              isRolling={isRolling}
              onRoll={roll}
            />
            {state.players.some(
              (player) => Object.keys(player.scores).length > 0,
            ) && (
              <button
                className="reset-button"
                type="button"
                disabled={isRolling}
                onClick={resetGame}
              >
                처음부터 다시
              </button>
            )}
          </>
        )}
      </div>

      {state.players.map((player) => {
        const isActive =
          state.status !== 'finished' && player.id === activePlayer.id

        return (
          <ScoreBoard
            key={player.id}
            player={player}
            previewScores={isActive ? previewScores : {}}
            scoreSummary={playerSummaries[player.id]}
            isActive={isActive}
            canSelect={
              isActive && state.status === 'playing' && !isRolling
            }
            onSelectScore={selectScore}
            onNicknameChange={changeNickname}
          />
        )
      })}
    </section>
  )
}

export default YachtDiceGame
