import { useEffect, useMemo, useRef, useState } from 'react'
import {
  MAX_ROLL_COUNT,
  ROLL_ANIMATION_MS,
  SCORE_CATEGORIES,
} from '../constants'
import {
  calculateScore,
  calculateScoreSummary,
} from '../logic/calculateScore'
import {
  createInitialGameState,
  getActivePlayer,
  getCompletedCategoryCount,
  restartGame,
  submitActivePlayerScore,
  updatePlayerNickname,
} from '../logic/gameState'
import { rollDice } from '../logic/rollDice'
import type {
  DiceValue,
  ScoreCard,
  ScoreCategory,
  ScoreSummary,
  YachtPlayer,
  YachtGameState,
} from '../types/yacht'

function getDiceValues(state: YachtGameState): DiceValue[] | null {
  const values = state.dice.map((die) => die.value)

  if (values.some((value) => value === null)) {
    return null
  }

  return values as DiceValue[]
}

export interface UseYachtGameResult {
  state: YachtGameState
  activePlayer: YachtPlayer
  playerSummaries: Record<string, ScoreSummary>
  previewScores: ScoreCard
  activeCompletedCategoryCount: number
  canRoll: boolean
  isRolling: boolean
  roll: () => void
  toggleHold: (dieId: number) => void
  selectScore: (category: ScoreCategory) => void
  changeNickname: (playerId: string, nickname: string) => void
  resetGame: () => void
}

export function useYachtGame(): UseYachtGameResult {
  const [state, setState] = useState<YachtGameState>(createInitialGameState)
  const [isRolling, setIsRolling] = useState(false)
  const rollingRef = useRef(false)
  const rollTimerRef = useRef<number | null>(null)

  useEffect(() => {
    return () => {
      if (rollTimerRef.current !== null) {
        window.clearTimeout(rollTimerRef.current)
      }
    }
  }, [])

  const activePlayer = getActivePlayer(state)
  const playerSummaries = useMemo(
    () =>
      Object.fromEntries(
        state.players.map((player) => [
          player.id,
          calculateScoreSummary(player.scores),
        ]),
      ) as Record<string, ScoreSummary>,
    [state.players],
  )

  const previewScores = useMemo<ScoreCard>(() => {
    const diceValues = getDiceValues(state)

    if (diceValues === null || state.rollCount === 0) {
      return {}
    }

    return Object.fromEntries(
      SCORE_CATEGORIES.filter(
        (category) => activePlayer.scores[category] === undefined,
      ).map((category) => [
        category,
        calculateScore(category, diceValues),
      ]),
    ) as ScoreCard
  }, [activePlayer.scores, state])

  const activeCompletedCategoryCount = getCompletedCategoryCount(activePlayer)
  const canRoll =
    !isRolling &&
    state.status !== 'finished' &&
    state.rollCount < MAX_ROLL_COUNT

  const roll = () => {
    if (rollingRef.current || !canRoll) {
      return
    }

    rollingRef.current = true
    setIsRolling(true)

    rollTimerRef.current = window.setTimeout(() => {
      setState((current) => ({
        ...current,
        dice: rollDice(current.dice),
        rollCount: current.rollCount + 1,
        status: 'playing',
      }))
      rollingRef.current = false
      rollTimerRef.current = null
      setIsRolling(false)
    }, ROLL_ANIMATION_MS)
  }

  const toggleHold = (dieId: number) => {
    if (isRolling) {
      return
    }

    setState((current) => {
      if (current.status !== 'playing' || current.rollCount === 0) {
        return current
      }

      return {
        ...current,
        dice: current.dice.map((die) =>
          die.id === dieId ? { ...die, isHeld: !die.isHeld } : die,
        ),
      }
    })
  }

  const selectScore = (category: ScoreCategory) => {
    if (isRolling) {
      return
    }

    setState((current) => {
      return submitActivePlayerScore(current, category)
    })
  }

  const changeNickname = (playerId: string, nickname: string) => {
    setState((current) => updatePlayerNickname(current, playerId, nickname))
  }

  const resetGame = () => {
    if (isRolling) {
      return
    }

    setState((current) => restartGame(current))
  }

  return {
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
  }
}
