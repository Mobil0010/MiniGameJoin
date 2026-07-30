import { SCORE_CATEGORIES } from '../constants'
import type {
  DiceValue,
  ScoreCategory,
  YachtGameState,
  YachtPlayer,
} from '../types/yacht'
import { calculateScore } from './calculateScore'
import { createInitialDice } from './rollDice'

const MAX_NICKNAME_LENGTH = 16

const DEFAULT_PLAYERS: readonly Omit<YachtPlayer, 'scores'>[] = [
  {
    id: 'local-player-1',
    slot: 1,
    nickname: '플레이어 1',
  },
  {
    id: 'local-player-2',
    slot: 2,
    nickname: '플레이어 2',
  },
]

export function createInitialPlayers(
  profiles: readonly Omit<YachtPlayer, 'scores'>[] = DEFAULT_PLAYERS,
): YachtPlayer[] {
  return profiles.map((profile) => ({
    ...profile,
    scores: {},
  }))
}

export function createInitialGameState(
  profiles?: readonly Omit<YachtPlayer, 'scores'>[],
): YachtGameState {
  const players = createInitialPlayers(profiles)

  return {
    dice: createInitialDice(),
    rollCount: 0,
    players,
    activePlayerId: players[0].id,
    status: 'ready',
  }
}

export function getActivePlayer(state: YachtGameState): YachtPlayer {
  return (
    state.players.find((player) => player.id === state.activePlayerId) ??
    state.players[0]
  )
}

export function getCompletedCategoryCount(player: YachtPlayer): number {
  return Object.keys(player.scores).length
}

function getDiceValues(state: YachtGameState): DiceValue[] | null {
  const values = state.dice.map((die) => die.value)

  if (values.some((value) => value === null)) {
    return null
  }

  return values as DiceValue[]
}

export function submitActivePlayerScore(
  state: YachtGameState,
  category: ScoreCategory,
): YachtGameState {
  const diceValues = getDiceValues(state)
  const activePlayerIndex = state.players.findIndex(
    (player) => player.id === state.activePlayerId,
  )

  if (
    state.status !== 'playing' ||
    diceValues === null ||
    activePlayerIndex < 0 ||
    state.players[activePlayerIndex].scores[category] !== undefined
  ) {
    return state
  }

  const players = state.players.map((player, index) =>
    index === activePlayerIndex
      ? {
          ...player,
          scores: {
            ...player.scores,
            [category]: calculateScore(category, diceValues),
          },
        }
      : player,
  )
  const isFinished = players.every((player) =>
    SCORE_CATEGORIES.every(
      (scoreCategory) => player.scores[scoreCategory] !== undefined,
    ),
  )

  if (isFinished) {
    return {
      ...state,
      players,
      status: 'finished',
    }
  }

  const nextPlayerIndex = (activePlayerIndex + 1) % players.length

  return {
    dice: createInitialDice(),
    rollCount: 0,
    players,
    activePlayerId: players[nextPlayerIndex].id,
    status: 'ready',
  }
}

export function updatePlayerNickname(
  state: YachtGameState,
  playerId: string,
  nickname: string,
): YachtGameState {
  return {
    ...state,
    players: state.players.map((player) =>
      player.id === playerId
        ? {
            ...player,
            nickname: nickname.slice(0, MAX_NICKNAME_LENGTH),
          }
        : player,
    ),
  }
}

export function restartGame(state: YachtGameState): YachtGameState {
  return createInitialGameState(
    state.players.map(({ id, slot, nickname }) => ({
      id,
      slot,
      nickname,
    })),
  )
}
