export const RPS_HANDS = ['rock', 'paper', 'scissors']
export const RPS_MODES = ['tournament', 'allPlay']
export const RPS_TIME_LIMITS = [5, 10, 15, 20]
export const RPS_WIN_TARGETS = [1, 2, 3]

const BEATS = {
  rock: 'scissors',
  paper: 'rock',
  scissors: 'paper',
}

export function normalizeRpsSettings(input = {}) {
  const mode = String(input.mode ?? 'tournament')
  const timeLimitSeconds = Number(input.timeLimitSeconds ?? 10)
  const winsRequired = Number(input.winsRequired ?? 2)
  const maxPlayers = Number(input.maxPlayers ?? 6)

  if (!RPS_MODES.includes(mode)) {
    throw new Error('지원하지 않는 가위바위보 게임 방식입니다.')
  }
  if (!RPS_TIME_LIMITS.includes(timeLimitSeconds)) {
    throw new Error('제한시간은 5초, 10초, 15초, 20초 중에서 선택해 주세요.')
  }
  if (!RPS_WIN_TARGETS.includes(winsRequired)) {
    throw new Error('승리 조건은 1승, 2승, 3승 중에서 선택해 주세요.')
  }
  if (!Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > 6) {
    throw new Error('가위바위보 방 정원은 2명부터 6명까지 설정할 수 있습니다.')
  }

  return { mode, timeLimitSeconds, winsRequired, maxPlayers }
}

export function getRpsWinningHand(left, right) {
  if (!RPS_HANDS.includes(left) || !RPS_HANDS.includes(right)) {
    throw new Error('가위바위보 선택이 올바르지 않습니다.')
  }
  if (left === right) {
    return null
  }
  return BEATS[left] === right ? left : right
}

export function resolveRpsSelections(selections) {
  if (!Array.isArray(selections) || selections.length < 2) {
    throw new Error('두 명 이상 선택해야 승패를 판정할 수 있습니다.')
  }
  if (selections.some(({ hand }) => !RPS_HANDS.includes(hand))) {
    throw new Error('가위바위보 선택이 올바르지 않습니다.')
  }

  const hands = [...new Set(selections.map(({ hand }) => hand))]
  if (hands.length !== 2) {
    return { isDraw: true, winnerIds: [], loserIds: [] }
  }

  const winningHand = getRpsWinningHand(hands[0], hands[1])
  return {
    isDraw: false,
    winnerIds: selections
      .filter(({ hand }) => hand === winningHand)
      .map(({ userId }) => userId),
    loserIds: selections
      .filter(({ hand }) => hand !== winningHand)
      .map(({ userId }) => userId),
  }
}

export function shuffleIds(ids, random = Math.random) {
  const shuffled = [...ids]
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random() * (index + 1))
    ;[shuffled[index], shuffled[target]] = [shuffled[target], shuffled[index]]
  }
  return shuffled
}

export function takeNextTournamentMatch(pendingIds, advancerIds) {
  let pending = [...pendingIds]
  let advancers = [...advancerIds]
  let advancedStage = false

  if (pending.length === 1) {
    advancers.push(pending[0])
    pending = []
  }

  if (pending.length === 0) {
    if (advancers.length === 1) {
      return {
        currentPlayerIds: [],
        pendingIds: [],
        advancerIds: advancers,
        winnerId: advancers[0],
        advancedStage,
      }
    }
    pending = advancers
    advancers = []
    advancedStage = true
  }

  return {
    currentPlayerIds: pending.slice(0, 2),
    pendingIds: pending.slice(2),
    advancerIds: advancers,
    winnerId: null,
    advancedStage,
  }
}
