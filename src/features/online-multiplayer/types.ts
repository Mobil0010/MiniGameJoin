export type OnlineUserKind = 'member' | 'guest'

export interface MemberGameStats {
  wins: number
  losses: number
}

export interface OnlineUser {
  id: string
  nickname: string
  kind: OnlineUserKind
  email?: string
  stats?: MemberGameStats
}

import type { Die, ScoreCard } from '../../games/yacht-dice/types/yacht'

export type OnlineRoomStatus =
  | 'waiting'
  | 'ready'
  | 'playing'
  | 'finished'
  | 'cancelled'

export interface OnlineRoomPlayer {
  userId: string
  nickname: string
  isHost: boolean
  isReady: boolean
  isPlaying: boolean
  slot?: 1 | 2
  scores?: ScoreCard
}

export interface OnlineRoom {
  id: string
  code: string
  gameId: 'yacht-dice'
  status: OnlineRoomStatus
  players: OnlineRoomPlayer[]
  maxPlayers: 4
  activePlayerId?: string | null
  dice?: Die[]
  rollCount?: number
  version?: number
  winnerId?: string | null
  finishReason?: OnlineMatchEndReason | null
}

export type OnlineChatChannel = 'lobby' | 'game'

export interface FriendSummary {
  userId: string
  nickname: string
  isOnline: boolean
  lastSeenAt: string | null
  invitedRoomCode: string | null
}

export interface FriendRequestSummary {
  userId: string
  nickname: string
  requestedAt: string
}

export interface FriendDashboard {
  friends: FriendSummary[]
  incomingRequests: FriendRequestSummary[]
}

export interface MemberSearchResult {
  userId: string
  nickname: string
}

export type OnlineMatchStatus = 'playing' | 'finished'
export type OnlineMatchEndReason =
  | 'completed'
  | 'forfeit'
  | 'disconnect-timeout'

export interface OnlineMatchResult {
  matchId: string
  status: 'finished'
  winnerId: string
  loserId: string
  reason: OnlineMatchEndReason
  finishedAt: string
}

export interface ForfeitMatchRequest {
  matchId: string
  playerId: string
  stateVersion: number
}

export type MatchHistoryResult = 'win' | 'loss' | 'draw'

export interface MatchHistoryItem {
  matchId: string
  roomCode: string
  result: MatchHistoryResult
  reason: OnlineMatchEndReason
  myScore: number
  opponentScore: number
  opponentNickname: string
  finishedAt: string
}

export interface MatchHistoryPage {
  items: MatchHistoryItem[]
  nextToken: string | null
}

export interface MatchDetailPlayer {
  userId: string
  nickname: string
  slot: 1 | 2
  totalScore: number
  scores: ScoreCard
}

export interface MatchDetail {
  matchId: string
  roomCode: string
  result: MatchHistoryResult
  reason: OnlineMatchEndReason
  winnerId: string | null
  players: MatchDetailPlayer[]
  finishedAt: string
}
