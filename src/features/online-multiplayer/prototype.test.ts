import { describe, expect, it } from 'vitest'
import type { OnlineUser } from './types'
import { calculateMemberWinRate } from './prototype'

describe('회원 전적', () => {
  it('승리와 패배가 없으면 승률은 0%다', () => {
    const user: OnlineUser = {
      id: 'member-1',
      nickname: '플레이어',
      kind: 'member',
      stats: { wins: 0, losses: 0 },
    }

    expect(calculateMemberWinRate(user)).toBe(0)
  })

  it('승리 횟수를 완료 경기 수로 나누어 승률을 계산한다', () => {
    const user: OnlineUser = {
      id: 'member-1',
      nickname: '플레이어',
      kind: 'member',
      stats: { wins: 2, losses: 1 },
    }

    expect(calculateMemberWinRate(user)).toBe(66.7)
  })

  it('게스트는 전적을 계산하지 않는다', () => {
    const user: OnlineUser = {
      id: 'guest-1',
      nickname: '게스트',
      kind: 'guest',
    }

    expect(calculateMemberWinRate(user)).toBe(0)
  })
})
