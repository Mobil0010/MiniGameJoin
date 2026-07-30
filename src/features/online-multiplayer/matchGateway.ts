import type {
  ForfeitMatchRequest,
  OnlineMatchResult,
} from './types'

export interface OnlineMatchGateway {
  forfeitMatch: (
    request: ForfeitMatchRequest,
  ) => Promise<OnlineMatchResult>
}

export const ONLINE_MATCH_EXIT_COPY = {
  title: '게임에서 나가시겠습니까?',
  description:
    '게임 도중에 나가면 기권 처리되고 상대방이 자동으로 승리합니다. 그래도 나가겠습니까?',
} as const
