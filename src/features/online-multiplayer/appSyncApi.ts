import { getCurrentMemberIdToken } from '../auth/cognitoAuth'
import {
  isGuestAwsAuthConfigured,
  signAppSyncGuestRequest,
  type SignedAppSyncRequest,
} from './guestAwsAuth'
import type {
  MatchDetail,
  MatchHistoryPage,
  MemberGameStats,
  OnlineMatchEndReason,
  OnlineRoom,
  OnlineRoomPlayer,
  OnlineUser,
} from './types'
import type { RealtimeChatMessage } from './realtimeGateway'
import type {
  Die,
  DiceValue,
  ScoreCard,
  ScoreCategory,
} from '../../games/yacht-dice/types/yacht'

const appSyncGraphqlUrl = String(
  import.meta.env.VITE_APPSYNC_GRAPHQL_URL ?? '',
).trim()

interface GraphqlResponse<T> {
  data?: T
  errors?: Array<{
    message?: string
    errorType?: string
  }>
}

interface UserProfileDto {
  userId: string
  email: string
  nickname: string
  wins: number
  losses: number
  winRate: number
  createdAt: string
  updatedAt: string
}

interface RoomDto {
  roomCode: string
  gameId: 'yacht-dice'
  status: OnlineRoom['status']
  players: Array<{
    userId: string
    nickname: string
    isHost: boolean
    isReady: boolean
    slot: 1 | 2
    scores: Array<{
      category: ScoreCategory
      score: number
    }>
  }>
  activePlayerId?: string | null
  dice: Array<{
    id: number
    value?: DiceValue | null
    isHeld: boolean
  }>
  rollCount: number
  version: number
  winnerId?: string | null
  finishReason?: 'completed' | 'forfeit' | 'disconnectTimeout' | null
  createdAt: string
  updatedAt: string
  expiresAt: number
}

interface ChatMessageDto {
  id: string
  roomCode: string
  senderId: string
  senderNickname: string
  text: string
  sentAt: string
}

interface MatchHistoryPageDto {
  items: Array<{
    matchId: string
    roomCode: string
    result: 'win' | 'loss' | 'draw'
    reason: 'completed' | 'forfeit' | 'disconnectTimeout'
    myScore: number
    opponentScore: number
    opponentNickname: string
    finishedAt: string
  }>
  nextToken?: string | null
}

interface MatchDetailDto {
  matchId: string
  roomCode: string
  result: 'win' | 'loss' | 'draw'
  reason: 'completed' | 'forfeit' | 'disconnectTimeout'
  winnerId?: string | null
  players: Array<{
    userId: string
    nickname: string
    slot: 1 | 2
    totalScore: number
    scores: Array<{
      category: ScoreCategory
      score: number
    }>
  }>
  finishedAt: string
}

const PROFILE_FIELDS = `
  userId
  email
  nickname
  wins
  losses
  winRate
  createdAt
  updatedAt
`

const CHAT_MESSAGE_FIELDS = `
  id
  roomCode
  senderId
  senderNickname
  text
  sentAt
`

const ROOM_FIELDS = `
  roomCode
  gameId
  status
  players {
    userId
    nickname
    isHost
    isReady
    slot
    scores {
      category
      score
    }
  }
  activePlayerId
  dice {
    id
    value
    isHeld
  }
  rollCount
  version
  winnerId
  finishReason
  createdAt
  updatedAt
  expiresAt
`

const FORFEIT_ON_PAGE_EXIT_MUTATION = `
  mutation Forfeit($roomCode: ID!, $expectedVersion: Int!) {
    forfeit(roomCode: $roomCode, expectedVersion: $expectedVersion) {
      roomCode
      status
    }
  }
`

export class OnlineApiError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OnlineApiError'
  }
}

export function isAppSyncConfigured(): boolean {
  return /^https:\/\/.+\.appsync-api\..+\.amazonaws\.com\/graphql$/.test(
    appSyncGraphqlUrl,
  )
}

export function isGuestOnlineConfigured(): boolean {
  return isAppSyncConfigured() && isGuestAwsAuthConfigured()
}

async function createGraphqlRequest(
  query: string,
  variables: Record<string, unknown>,
): Promise<SignedAppSyncRequest> {
  const body = JSON.stringify({ query, variables })

  try {
    const idToken = await getCurrentMemberIdToken()
    return {
      body,
      headers: {
        'Content-Type': 'application/json',
        Authorization: idToken,
      },
    }
  } catch {
    return signAppSyncGuestRequest(appSyncGraphqlUrl, body)
  }
}

async function graphqlRequest<TData>(
  query: string,
  variables: Record<string, unknown> = {},
): Promise<TData> {
  if (!isAppSyncConfigured()) {
    throw new OnlineApiError(
      'AppSync API 주소가 아직 설정되지 않았습니다. .env.local에 VITE_APPSYNC_GRAPHQL_URL을 추가해 주세요.',
    )
  }

  const request = await createGraphqlRequest(query, variables)
  const response = await fetch(appSyncGraphqlUrl, {
    method: 'POST',
    headers: request.headers,
    body: request.body,
  })

  let result: GraphqlResponse<TData>
  try {
    result = (await response.json()) as GraphqlResponse<TData>
  } catch {
    throw new OnlineApiError(
      `AppSync 응답을 읽지 못했습니다. HTTP ${response.status}`,
    )
  }

  if (!response.ok || result.errors?.length || !result.data) {
    throw new OnlineApiError(
      result.errors?.[0]?.message ??
        `온라인 서버 요청에 실패했습니다. HTTP ${response.status}`,
    )
  }

  return result.data
}

function toBase64(value: string): string {
  return window.btoa(value)
}

function createAppSyncRealtimeUrl(idToken: string): string {
  const httpUrl = new URL(appSyncGraphqlUrl)
  const realtimeHost = httpUrl.host.replace(
    '.appsync-api.',
    '.appsync-realtime-api.',
  )
  const header = toBase64(
    JSON.stringify({
      host: httpUrl.host,
      Authorization: idToken,
    }),
  )
  const payload = toBase64('{}')
  const parameters = new URLSearchParams({ header, payload })

  return `wss://${realtimeHost}/graphql?${parameters.toString()}`
}

export function subscribeToOnlineChat(
  roomCode: string,
  userKind: OnlineUser['kind'],
  onMessage: (message: RealtimeChatMessage) => void,
  onError: (message: string) => void,
): () => void {
  if (userKind === 'guest') {
    return () => undefined
  }

  let socket: WebSocket | null = null
  let reconnectTimer: number | null = null
  let stopped = false
  const operationId = crypto.randomUUID()

  const connect = async () => {
    try {
      const idToken = await getCurrentMemberIdToken()
      if (stopped) {
        return
      }

      const graphqlHost = new URL(appSyncGraphqlUrl).host
      socket = new WebSocket(createAppSyncRealtimeUrl(idToken), 'graphql-ws')

      socket.addEventListener('open', () => {
        socket?.send(JSON.stringify({ type: 'connection_init' }))
      })

      socket.addEventListener('message', (event) => {
        let frame: {
          id?: string
          type?: string
          payload?: {
            data?: {
              onChatMessage?: ChatMessageDto
            }
            errors?: Array<{ message?: string }>
          }
        }

        try {
          frame = JSON.parse(String(event.data)) as typeof frame
        } catch {
          return
        }

        if (frame.type === 'connection_ack') {
          socket?.send(
            JSON.stringify({
              id: operationId,
              type: 'start',
              payload: {
                data: JSON.stringify({
                  query: `subscription OnChatMessage($roomCode: ID!) {
                    onChatMessage(roomCode: $roomCode) {
                      ${CHAT_MESSAGE_FIELDS}
                    }
                  }`,
                  variables: { roomCode },
                }),
                extensions: {
                  authorization: {
                    host: graphqlHost,
                    Authorization: idToken,
                  },
                },
              },
            }),
          )
          return
        }

        if (frame.type === 'data') {
          const message = frame.payload?.data?.onChatMessage
          if (message) {
            onMessage(message)
          }
          return
        }

        if (frame.type === 'error') {
          onError(
            frame.payload?.errors?.[0]?.message ??
              '실시간 채팅 연결에서 오류가 발생했습니다.',
          )
        }
      })

      socket.addEventListener('close', (event) => {
        socket = null
        if (!stopped) {
          const detail =
            event.code === 1000
              ? ''
              : ` (종료 코드 ${event.code}${
                  event.reason ? `: ${event.reason}` : ''
                })`
          onError(
            `채팅 연결이 끊겨 다시 연결하고 있습니다.${detail}`,
          )
          reconnectTimer = window.setTimeout(connect, 2000)
        }
      })

      socket.addEventListener('error', () => {
        onError('실시간 채팅 서버에 연결하지 못했습니다.')
      })
    } catch (error) {
      if (!stopped) {
        onError(
          error instanceof Error
            ? error.message
            : '실시간 채팅 연결에 실패했습니다.',
        )
        reconnectTimer = window.setTimeout(connect, 2000)
      }
    }
  }

  void connect()

  return () => {
    stopped = true
    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer)
    }
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ id: operationId, type: 'stop' }))
    }
    socket?.close()
    socket = null
  }
}

function mapProfileToUser(profile: UserProfileDto): OnlineUser {
  const stats: MemberGameStats = {
    wins: profile.wins,
    losses: profile.losses,
  }

  return {
    id: profile.userId,
    email: profile.email,
    nickname: profile.nickname,
    kind: 'member',
    stats,
  }
}

function mapScoreEntries(
  scores: RoomDto['players'][number]['scores'],
): ScoreCard {
  return Object.fromEntries(
    scores.map(({ category, score }) => [category, score]),
  ) as ScoreCard
}

function mapFinishReason(
  reason:
    | RoomDto['finishReason']
    | 'completed'
    | 'forfeit'
    | 'disconnectTimeout',
): OnlineMatchEndReason | null {
  if (!reason) {
    return null
  }

  return reason === 'disconnectTimeout' ? 'disconnect-timeout' : reason
}

function mapRoom(room: RoomDto): OnlineRoom {
  const players: OnlineRoomPlayer[] = room.players.map((player) => ({
    userId: player.userId,
    nickname: player.nickname,
    isHost: player.isHost,
    isReady: player.isReady,
    slot: player.slot,
    scores: mapScoreEntries(player.scores),
  }))
  const dice: Die[] = room.dice.map((die) => ({
    id: die.id,
    value: die.value ?? null,
    isHeld: die.isHeld,
  }))

  return {
    id: room.roomCode,
    code: room.roomCode,
    gameId: room.gameId,
    status: room.status,
    players,
    maxPlayers: 2,
    activePlayerId: room.activePlayerId,
    dice,
    rollCount: room.rollCount,
    version: room.version,
    winnerId: room.winnerId,
    finishReason: mapFinishReason(room.finishReason),
  }
}

export async function ensureOnlineProfile(
  nickname: string,
): Promise<OnlineUser> {
  const data = await graphqlRequest<{ ensureProfile: UserProfileDto }>(
    `mutation EnsureProfile($nickname: String!) {
      ensureProfile(nickname: $nickname) {
        ${PROFILE_FIELDS}
      }
    }`,
    { nickname },
  )

  return mapProfileToUser(data.ensureProfile)
}

export async function getOnlineProfile(): Promise<OnlineUser> {
  const data = await graphqlRequest<{ me: UserProfileDto }>(
    `query Me {
      me {
        ${PROFILE_FIELDS}
      }
    }`,
  )

  return mapProfileToUser(data.me)
}

export async function updateOnlineNickname(
  nickname: string,
): Promise<OnlineUser> {
  const data = await graphqlRequest<{ updateNickname: UserProfileDto }>(
    `mutation UpdateNickname($nickname: String!) {
      updateNickname(nickname: $nickname) {
        ${PROFILE_FIELDS}
      }
    }`,
    { nickname },
  )

  return mapProfileToUser(data.updateNickname)
}

export async function deleteOnlineProfile(): Promise<void> {
  await graphqlRequest<{ deleteMyProfile: boolean }>(
    `mutation DeleteMyProfile {
      deleteMyProfile
    }`,
  )
}

export async function createOnlineRoom(
  guestNickname?: string,
): Promise<OnlineRoom> {
  const data = await graphqlRequest<{ createRoom: RoomDto }>(
    `mutation CreateRoom($guestNickname: String) {
      createRoom(guestNickname: $guestNickname) {
        ${ROOM_FIELDS}
      }
    }`,
    { guestNickname: guestNickname ?? null },
  )

  return mapRoom(data.createRoom)
}

export async function joinOnlineRoom(
  roomCode: string,
  guestNickname?: string,
): Promise<OnlineRoom> {
  const data = await graphqlRequest<{ joinRoom: RoomDto }>(
    `mutation JoinRoom($roomCode: ID!, $guestNickname: String) {
      joinRoom(roomCode: $roomCode, guestNickname: $guestNickname) {
        ${ROOM_FIELDS}
      }
    }`,
    { roomCode, guestNickname: guestNickname ?? null },
  )

  return mapRoom(data.joinRoom)
}

export async function getOnlineRoom(roomCode: string): Promise<OnlineRoom> {
  const data = await graphqlRequest<{ room: RoomDto }>(
    `query Room($roomCode: ID!) {
      room(roomCode: $roomCode) {
        ${ROOM_FIELDS}
      }
    }`,
    { roomCode },
  )

  return mapRoom(data.room)
}

export async function leaveOnlineRoom(room: OnlineRoom): Promise<OnlineRoom> {
  const data = await graphqlRequest<{ leaveRoom: RoomDto }>(
    `mutation LeaveRoom($roomCode: ID!, $expectedVersion: Int!) {
      leaveRoom(roomCode: $roomCode, expectedVersion: $expectedVersion) {
        ${ROOM_FIELDS}
      }
    }`,
    {
      roomCode: room.code,
      expectedVersion: room.version,
    },
  )

  return mapRoom(data.leaveRoom)
}

export async function setOnlineReady(
  room: OnlineRoom,
  ready: boolean,
): Promise<OnlineRoom> {
  const data = await graphqlRequest<{ setReady: RoomDto }>(
    `mutation SetReady(
      $roomCode: ID!
      $ready: Boolean!
      $expectedVersion: Int!
    ) {
      setReady(
        roomCode: $roomCode
        ready: $ready
        expectedVersion: $expectedVersion
      ) {
        ${ROOM_FIELDS}
      }
    }`,
    {
      roomCode: room.code,
      ready,
      expectedVersion: room.version,
    },
  )

  return mapRoom(data.setReady)
}

export async function startOnlineGame(
  room: OnlineRoom,
): Promise<OnlineRoom> {
  const data = await graphqlRequest<{ startGame: RoomDto }>(
    `mutation StartGame($roomCode: ID!, $expectedVersion: Int!) {
      startGame(roomCode: $roomCode, expectedVersion: $expectedVersion) {
        ${ROOM_FIELDS}
      }
    }`,
    {
      roomCode: room.code,
      expectedVersion: room.version,
    },
  )

  return mapRoom(data.startGame)
}

export async function rollOnlineDice(
  room: OnlineRoom,
  heldIndexes: number[],
): Promise<OnlineRoom> {
  const data = await graphqlRequest<{ rollDice: RoomDto }>(
    `mutation RollDice(
      $roomCode: ID!
      $heldIndexes: [Int!]!
      $expectedVersion: Int!
    ) {
      rollDice(
        roomCode: $roomCode
        heldIndexes: $heldIndexes
        expectedVersion: $expectedVersion
      ) {
        ${ROOM_FIELDS}
      }
    }`,
    {
      roomCode: room.code,
      heldIndexes,
      expectedVersion: room.version,
    },
  )

  return mapRoom(data.rollDice)
}

export async function confirmOnlineScore(
  room: OnlineRoom,
  category: ScoreCategory,
): Promise<OnlineRoom> {
  const data = await graphqlRequest<{ confirmScore: RoomDto }>(
    `mutation ConfirmScore(
      $roomCode: ID!
      $category: ScoreCategory!
      $expectedVersion: Int!
    ) {
      confirmScore(
        roomCode: $roomCode
        category: $category
        expectedVersion: $expectedVersion
      ) {
        ${ROOM_FIELDS}
      }
    }`,
    {
      roomCode: room.code,
      category,
      expectedVersion: room.version,
    },
  )

  return mapRoom(data.confirmScore)
}

export async function forfeitOnlineGame(
  room: OnlineRoom,
): Promise<OnlineRoom> {
  const data = await graphqlRequest<{ forfeit: RoomDto }>(
    `mutation Forfeit($roomCode: ID!, $expectedVersion: Int!) {
      forfeit(roomCode: $roomCode, expectedVersion: $expectedVersion) {
        ${ROOM_FIELDS}
      }
    }`,
    {
      roomCode: room.code,
      expectedVersion: room.version,
    },
  )

  return mapRoom(data.forfeit)
}

export async function prepareOnlineForfeitOnPageExit(
  room: OnlineRoom,
): Promise<SignedAppSyncRequest | null> {
  if (
    !isAppSyncConfigured() ||
    typeof room.version !== 'number'
  ) {
    return null
  }

  return createGraphqlRequest(FORFEIT_ON_PAGE_EXIT_MUTATION, {
    roomCode: room.code,
    expectedVersion: room.version,
  })
}

export function sendOnlineForfeitOnPageExit(
  request: SignedAppSyncRequest | null,
): void {
  if (!request) {
    return
  }

  void fetch(appSyncGraphqlUrl, {
    method: 'POST',
    headers: request.headers,
    body: request.body,
    keepalive: true,
  }).catch(() => undefined)
}

export async function sendOnlineHeartbeat(roomCode: string): Promise<void> {
  await graphqlRequest<{ heartbeat: boolean }>(
    `mutation Heartbeat($roomCode: ID!) {
      heartbeat(roomCode: $roomCode)
    }`,
    { roomCode },
  )
}

export async function claimOnlineDisconnectWin(
  room: OnlineRoom,
): Promise<OnlineRoom> {
  const data = await graphqlRequest<{ claimDisconnectWin: RoomDto }>(
    `mutation ClaimDisconnectWin(
      $roomCode: ID!
      $expectedVersion: Int!
    ) {
      claimDisconnectWin(
        roomCode: $roomCode
        expectedVersion: $expectedVersion
      ) {
        ${ROOM_FIELDS}
      }
    }`,
    {
      roomCode: room.code,
      expectedVersion: room.version,
    },
  )

  return mapRoom(data.claimDisconnectWin)
}

export async function listOnlineChatMessages(
  roomCode: string,
): Promise<RealtimeChatMessage[]> {
  const data = await graphqlRequest<{
    listChatMessages: ChatMessageDto[]
  }>(
    `query ListChatMessages($roomCode: ID!, $limit: Int) {
      listChatMessages(roomCode: $roomCode, limit: $limit) {
        ${CHAT_MESSAGE_FIELDS}
      }
    }`,
    { roomCode, limit: 50 },
  )

  return data.listChatMessages
}

export async function sendOnlineChatMessage(
  roomCode: string,
  text: string,
): Promise<RealtimeChatMessage> {
  const data = await graphqlRequest<{
    sendChatMessage: ChatMessageDto
  }>(
    `mutation SendChatMessage($roomCode: ID!, $text: String!) {
      sendChatMessage(roomCode: $roomCode, text: $text) {
        ${CHAT_MESSAGE_FIELDS}
      }
    }`,
    { roomCode, text },
  )

  return data.sendChatMessage
}

export async function getMyMatchHistory(
  nextToken?: string | null,
): Promise<MatchHistoryPage> {
  const data = await graphqlRequest<{
    myMatchHistory: MatchHistoryPageDto
  }>(
    `query MyMatchHistory($limit: Int, $nextToken: String) {
      myMatchHistory(limit: $limit, nextToken: $nextToken) {
        items {
          matchId
          roomCode
          result
          reason
          myScore
          opponentScore
          opponentNickname
          finishedAt
        }
        nextToken
      }
    }`,
    { limit: 20, nextToken: nextToken ?? null },
  )

  return {
    items: data.myMatchHistory.items.map((item) => ({
      ...item,
      reason: mapFinishReason(item.reason) ?? 'completed',
    })),
    nextToken: data.myMatchHistory.nextToken ?? null,
  }
}

export async function getOnlineMatchDetail(
  matchId: string,
): Promise<MatchDetail> {
  const data = await graphqlRequest<{
    matchDetail: MatchDetailDto
  }>(
    `query MatchDetail($matchId: ID!) {
      matchDetail(matchId: $matchId) {
        matchId
        roomCode
        result
        reason
        winnerId
        players {
          userId
          nickname
          slot
          totalScore
          scores {
            category
            score
          }
        }
        finishedAt
      }
    }`,
    { matchId },
  )

  return {
    ...data.matchDetail,
    winnerId: data.matchDetail.winnerId ?? null,
    reason: mapFinishReason(data.matchDetail.reason) ?? 'completed',
    players: data.matchDetail.players.map((player) => ({
      ...player,
      scores: mapScoreEntries(player.scores),
    })),
  }
}
