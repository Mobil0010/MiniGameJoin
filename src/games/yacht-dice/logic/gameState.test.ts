import { describe, expect, it } from 'vitest'
import type { DiceValue, YachtGameState } from '../types/yacht'
import {
  createInitialGameState,
  restartGame,
  submitActivePlayerScore,
  updatePlayerNickname,
} from './gameState'

function withRolledDice(
  state: YachtGameState,
  values: readonly DiceValue[],
): YachtGameState {
  return {
    ...state,
    dice: state.dice.map((die, index) => ({
      ...die,
      value: values[index],
    })),
    rollCount: 1,
    status: 'playing',
  }
}

describe('2인 Yacht Dice 게임 상태', () => {
  it('1P부터 시작하고 두 명의 플레이어를 만든다', () => {
    const state = createInitialGameState()

    expect(state.players).toHaveLength(2)
    expect(state.activePlayerId).toBe('local-player-1')
    expect(state.players.map((player) => player.slot)).toEqual([1, 2])
  })

  it('1P 점수만 저장한 뒤 2P에게 차례를 넘긴다', () => {
    const initialState = withRolledDice(
      createInitialGameState(),
      [1, 1, 2, 3, 4],
    )
    const nextState = submitActivePlayerScore(initialState, 'ones')

    expect(nextState.players[0].scores.ones).toBe(2)
    expect(nextState.players[1].scores.ones).toBeUndefined()
    expect(nextState.activePlayerId).toBe('local-player-2')
    expect(nextState.rollCount).toBe(0)
    expect(nextState.status).toBe('ready')
  })

  it('2P 점수 확정 후 다시 1P에게 차례를 넘긴다', () => {
    const playerTwoTurn = submitActivePlayerScore(
      withRolledDice(createInitialGameState(), [1, 1, 2, 3, 4]),
      'ones',
    )
    const nextState = submitActivePlayerScore(
      withRolledDice(playerTwoTurn, [2, 2, 3, 4, 5]),
      'twos',
    )

    expect(nextState.players[1].scores.twos).toBe(4)
    expect(nextState.activePlayerId).toBe('local-player-1')
  })

  it('닉네임을 저장하고 새 게임에서도 유지한다', () => {
    const renamedState = updatePlayerNickname(
      createInitialGameState(),
      'local-player-1',
      '주사위왕',
    )
    const restartedState = restartGame(renamedState)

    expect(restartedState.players[0].nickname).toBe('주사위왕')
    expect(restartedState.players[0].scores).toEqual({})
    expect(restartedState.activePlayerId).toBe('local-player-1')
  })
})
