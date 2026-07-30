import type { OnlineRoom, OnlineUser } from './types'

const ROOM_CODE_CHARACTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const PROTOTYPE_SESSION_KEY = 'minigamejoin:online-user-preview'

function createPrototypeId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}

export function createPrototypeUser(
  nickname: string,
  kind: OnlineUser['kind'],
  email?: string,
): OnlineUser {
  return {
    id: createPrototypeId(kind),
    nickname: nickname.trim(),
    kind,
    email,
    stats:
      kind === 'member'
        ? {
            wins: 0,
            losses: 0,
          }
        : undefined,
  }
}

export function loadPrototypeUser(): OnlineUser | null {
  try {
    const storedUser = window.localStorage.getItem(PROTOTYPE_SESSION_KEY)

    if (!storedUser) {
      return null
    }

    const user = JSON.parse(storedUser) as Partial<OnlineUser>

    if (
      typeof user.id !== 'string' ||
      typeof user.nickname !== 'string' ||
      (user.kind !== 'member' && user.kind !== 'guest')
    ) {
      return null
    }

    return {
      id: user.id,
      nickname: user.nickname,
      kind: user.kind,
      email: typeof user.email === 'string' ? user.email : undefined,
      stats:
        user.kind === 'member'
          ? {
              wins:
                typeof user.stats?.wins === 'number' ? user.stats.wins : 0,
              losses:
                typeof user.stats?.losses === 'number'
                  ? user.stats.losses
                  : 0,
            }
          : undefined,
    }
  } catch {
    return null
  }
}

export function calculateMemberWinRate(user: OnlineUser): number {
  if (user.kind !== 'member' || !user.stats) {
    return 0
  }

  const completedMatches = user.stats.wins + user.stats.losses

  if (completedMatches === 0) {
    return 0
  }

  return Math.round((user.stats.wins / completedMatches) * 1000) / 10
}

export function persistPrototypeUser(user: OnlineUser): void {
  try {
    window.localStorage.setItem(PROTOTYPE_SESSION_KEY, JSON.stringify(user))
  } catch {
    // 저장이 제한된 브라우저에서는 현재 탭의 로그인 상태만 유지합니다.
  }
}

export function clearPrototypeUser(): void {
  try {
    window.localStorage.removeItem(PROTOTYPE_SESSION_KEY)
  } catch {
    // 저장소 접근이 제한되어도 현재 화면의 로그아웃은 계속 진행합니다.
  }
}

export function createPrototypeRoom(user: OnlineUser): OnlineRoom {
  const code = Array.from({ length: 6 }, () => {
    const index = Math.floor(Math.random() * ROOM_CODE_CHARACTERS.length)
    return ROOM_CODE_CHARACTERS[index]
  }).join('')

  return {
    id: createPrototypeId('room'),
    code,
    gameId: 'yacht-dice',
    status: 'waiting',
    players: [
      {
        userId: user.id,
        nickname: user.nickname,
        isHost: true,
        isReady: true,
      },
    ],
    maxPlayers: 2,
  }
}
