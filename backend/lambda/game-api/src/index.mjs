import { createHash, randomInt, randomUUID } from 'node:crypto'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
  BatchGetCommand,
  BatchWriteCommand,
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  TransactWriteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb'
import {
  SCORE_CATEGORIES,
  calculatePlayerTotal,
  calculateScore,
  createInitialDice,
  rollServerDice,
} from './game.mjs'

const USERS_TABLE = process.env.USERS_TABLE
const ROOMS_TABLE = process.env.ROOMS_TABLE
const MATCHES_TABLE = process.env.MATCHES_TABLE
const CHAT_MESSAGES_TABLE = process.env.CHAT_MESSAGES_TABLE
const PLAYER_MATCHES_TABLE = process.env.PLAYER_MATCHES_TABLE
const FRIENDS_TABLE = process.env.FRIENDS_TABLE
const COGNITO_IDENTITY_POOL_ID = process.env.COGNITO_IDENTITY_POOL_ID
const ROOM_CODE_CHARACTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const ROOM_TTL_SECONDS = 24 * 60 * 60
const CANCELLED_ROOM_TTL_SECONDS = 60 * 60
const CHAT_TTL_SECONDS = 7 * 24 * 60 * 60
const DISCONNECT_GRACE_SECONDS = 90
const DEFAULT_CHAT_LIMIT = 50
const DEFAULT_HISTORY_LIMIT = 20
const MAX_QUERY_LIMIT = 50
const ONLINE_WINDOW_SECONDS = 75
const MAX_ROOM_PARTICIPANTS = 4

for (const [name, value] of Object.entries({
  USERS_TABLE,
  ROOMS_TABLE,
  MATCHES_TABLE,
  CHAT_MESSAGES_TABLE,
  PLAYER_MATCHES_TABLE,
  FRIENDS_TABLE,
  COGNITO_IDENTITY_POOL_ID,
})) {
  if (!value) {
    throw new Error(`Lambda 환경 변수 ${name}이(가) 설정되지 않았습니다.`)
  }
}

const documentClient = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: {
    removeUndefinedValues: true,
  },
})

function nowIso() {
  return new Date().toISOString()
}

function nowEpochSeconds() {
  return Math.floor(Date.now() / 1000)
}

function normalizeRoomCode(value) {
  return String(value ?? '').trim().toUpperCase()
}

function normalizeNickname(value) {
  const nickname = String(value ?? '').trim()

  if (nickname.length < 1 || nickname.length > 16) {
    throw new Error('닉네임은 1자 이상 16자 이하로 입력해 주세요.')
  }

  return nickname
}

function normalizeChatText(value) {
  const text = String(value ?? '').trim()

  if (text.length < 1 || text.length > 200) {
    throw new Error('채팅 메시지는 1자 이상 200자 이하로 입력해 주세요.')
  }

  return text
}

function normalizeChatChannel(value) {
  const channel = String(value ?? '').trim().toLowerCase()
  if (!['lobby', 'game'].includes(channel)) {
    throw new Error('채팅 채널이 올바르지 않습니다.')
  }
  return channel
}

function normalizeQueryLimit(value, fallback) {
  if (value === undefined || value === null) {
    return fallback
  }

  const limit = Number(value)
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_QUERY_LIMIT) {
    throw new Error(`조회 개수는 1 이상 ${MAX_QUERY_LIMIT} 이하로 입력해 주세요.`)
  }

  return limit
}

function encodeNextToken(key) {
  return key
    ? Buffer.from(JSON.stringify(key), 'utf8').toString('base64url')
    : null
}

function decodeNextToken(value) {
  if (!value) {
    return undefined
  }

  try {
    return JSON.parse(Buffer.from(String(value), 'base64url').toString('utf8'))
  } catch {
    throw new Error('전적 조회 토큰이 올바르지 않습니다.')
  }
}

function getMatchResult(userId, winnerId) {
  if (!winnerId) {
    return 'draw'
  }

  return winnerId === userId ? 'win' : 'loss'
}

function requireIdentity(event) {
  const identity = event.identity
  const userId = identity?.sub
  const email = identity?.claims?.email

  if (userId && email) {
    return {
      userId: String(userId),
      email: String(email),
      isGuest: false,
    }
  }

  const guestIdentityId = identity?.cognitoIdentityId
  const guestIdentityPoolId = identity?.cognitoIdentityPoolId
  const guestAuthType = identity?.cognitoIdentityAuthType

  if (
    guestIdentityId &&
    guestIdentityPoolId === COGNITO_IDENTITY_POOL_ID &&
    guestAuthType === 'unauthenticated'
  ) {
    return {
      userId: `guest:${createHash('sha256')
        .update(String(guestIdentityId))
        .digest('hex')}`,
      email: null,
      isGuest: true,
    }
  }

  throw new Error('로그인 또는 게스트 인증 정보가 없거나 만료되었습니다.')
}

function requireExpectedVersion(room, expectedVersion) {
  if (!Number.isInteger(expectedVersion) || room.version !== expectedVersion) {
    throw new Error(
      '다른 플레이어가 먼저 상태를 변경했습니다. 최신 게임 상태를 불러와 다시 시도해 주세요.',
    )
  }
}

function requireParticipant(room, userId) {
  const player = room.players.find((candidate) => candidate.userId === userId)

  if (!player) {
    throw new Error('이 게임방의 참가자가 아닙니다.')
  }

  return player
}

function getGamePlayers(room) {
  const selected = room.players
    .filter((player) => player.isPlaying === true)
    .sort((left, right) => (left.slot ?? 99) - (right.slot ?? 99))

  if (selected.length > 0) {
    return selected
  }

  return room.players
    .filter((player) => player.slot === 1 || player.slot === 2)
    .sort((left, right) => left.slot - right.slot)
}

function requireGamePlayer(room, userId) {
  const player = getGamePlayers(room).find(
    (candidate) => candidate.userId === userId,
  )
  if (!player) {
    throw new Error('관전자는 게임 조작을 할 수 없습니다.')
  }
  return player
}

function createRoomCode() {
  return Array.from({ length: 6 }, () => {
    return ROOM_CODE_CHARACTERS[randomInt(0, ROOM_CODE_CHARACTERS.length)]
  }).join('')
}

function toProfileResponse(profile) {
  const wins = profile.wins ?? 0
  const losses = profile.losses ?? 0
  const completedMatches = wins + losses

  return {
    ...profile,
    wins,
    losses,
    winRate:
      completedMatches === 0
        ? 0
        : Math.round((wins / completedMatches) * 1000) / 10,
  }
}

async function getProfile(userId) {
  const result = await documentClient.send(
    new GetCommand({
      TableName: USERS_TABLE,
      Key: { userId },
      ConsistentRead: true,
    }),
  )

  if (!result.Item) {
    throw new Error('회원 프로필이 없습니다. 다시 로그인해 주세요.')
  }

  return result.Item
}

async function getProfiles(userIds) {
  const uniqueIds = [...new Set(userIds)].filter(Boolean)
  if (uniqueIds.length === 0) {
    return new Map()
  }

  const result = await documentClient.send(
    new BatchGetCommand({
      RequestItems: {
        [USERS_TABLE]: {
          Keys: uniqueIds.map((userId) => ({ userId })),
          ProjectionExpression: 'userId, nickname, lastSeenAt',
        },
      },
    }),
  )

  return new Map(
    (result.Responses?.[USERS_TABLE] ?? []).map((profile) => [
      profile.userId,
      profile,
    ]),
  )
}

async function listFriendRelations(userId) {
  const result = await documentClient.send(
    new QueryCommand({
      TableName: FRIENDS_TABLE,
      KeyConditionExpression: 'ownerUserId = :ownerUserId',
      ExpressionAttributeValues: {
        ':ownerUserId': userId,
      },
    }),
  )
  return result.Items ?? []
}

async function touchPresence(event) {
  const { userId, isGuest } = requireIdentity(event)
  if (isGuest) {
    throw new Error('친구 기능은 로그인 회원만 사용할 수 있습니다.')
  }

  await documentClient.send(
    new UpdateCommand({
      TableName: USERS_TABLE,
      Key: { userId },
      UpdateExpression: 'SET lastSeenAt = :lastSeenAt, updatedAt = :updatedAt',
      ConditionExpression: 'attribute_exists(userId)',
      ExpressionAttributeValues: {
        ':lastSeenAt': nowIso(),
        ':updatedAt': nowIso(),
      },
    }),
  )
  return true
}

async function friendDashboard(event) {
  const { userId, isGuest } = requireIdentity(event)
  if (isGuest) {
    throw new Error('친구 기능은 로그인 회원만 사용할 수 있습니다.')
  }

  const relations = await listFriendRelations(userId)
  const profiles = await getProfiles(relations.map((item) => item.friendUserId))
  const onlineCutoff = Date.now() - ONLINE_WINDOW_SECONDS * 1000
  const inviteCutoff = Date.now() - ROOM_TTL_SECONDS * 1000

  const friends = relations
    .filter((item) => item.status === 'accepted')
    .map((item) => {
      const profile = profiles.get(item.friendUserId)
      if (!profile) {
        return null
      }
      const lastSeenAt = profile.lastSeenAt ?? null
      return {
        userId: profile.userId,
        nickname: profile.nickname,
        isOnline:
          Boolean(lastSeenAt) && new Date(lastSeenAt).getTime() >= onlineCutoff,
        lastSeenAt,
        invitedRoomCode:
          item.invitedRoomCode &&
          item.invitedAt &&
          new Date(item.invitedAt).getTime() >= inviteCutoff
            ? item.invitedRoomCode
            : null,
      }
    })
    .filter(Boolean)
    .sort((left, right) => {
      if (left.isOnline !== right.isOnline) {
        return left.isOnline ? -1 : 1
      }
      return left.nickname.localeCompare(right.nickname, 'ko')
    })

  const incomingRequests = relations
    .filter((item) => item.status === 'incoming')
    .map((item) => {
      const profile = profiles.get(item.friendUserId)
      return profile
        ? {
            userId: profile.userId,
            nickname: profile.nickname,
            requestedAt: item.requestedAt,
          }
        : null
    })
    .filter(Boolean)

  return { friends, incomingRequests }
}

async function searchMembers(event) {
  const { userId, isGuest } = requireIdentity(event)
  if (isGuest) {
    throw new Error('친구 기능은 로그인 회원만 사용할 수 있습니다.')
  }

  const query = String(event.arguments.query ?? '').trim()
  if (query.length < 2 || query.length > 64) {
    throw new Error('닉네임 또는 이메일을 2자 이상 입력해 주세요.')
  }

  const members = []
  let exclusiveStartKey
  let scannedPages = 0
  do {
    const result = await documentClient.send(
      new ScanCommand({
        TableName: USERS_TABLE,
        FilterExpression:
          'userId <> :userId AND (contains(#nickname, :query) OR #email = :query)',
        ExpressionAttributeNames: {
          '#nickname': 'nickname',
          '#email': 'email',
        },
        ExpressionAttributeValues: {
          ':userId': userId,
          ':query': query,
        },
        ProjectionExpression: 'userId, nickname',
        Limit: 50,
        ExclusiveStartKey: exclusiveStartKey,
      }),
    )
    members.push(...(result.Items ?? []))
    exclusiveStartKey = result.LastEvaluatedKey
    scannedPages += 1
  } while (exclusiveStartKey && members.length < 10 && scannedPages < 5)

  return members.slice(0, 10)
}

async function sendFriendRequest(event) {
  const { userId, isGuest } = requireIdentity(event)
  const targetUserId = String(event.arguments.userId ?? '')
  if (isGuest || !targetUserId || targetUserId === userId) {
    throw new Error('친구 요청 대상을 확인해 주세요.')
  }
  await getProfile(targetUserId)
  const timestamp = nowIso()

  try {
    await documentClient.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: FRIENDS_TABLE,
              Item: {
                ownerUserId: userId,
                friendUserId: targetUserId,
                status: 'outgoing',
                requestedAt: timestamp,
              },
              ConditionExpression: 'attribute_not_exists(ownerUserId)',
            },
          },
          {
            Put: {
              TableName: FRIENDS_TABLE,
              Item: {
                ownerUserId: targetUserId,
                friendUserId: userId,
                status: 'incoming',
                requestedAt: timestamp,
              },
              ConditionExpression: 'attribute_not_exists(ownerUserId)',
            },
          },
        ],
      }),
    )
  } catch (error) {
    if (error?.name === 'TransactionCanceledException') {
      throw new Error('이미 친구이거나 처리 중인 친구 요청이 있습니다.')
    }
    throw error
  }
  return true
}

async function respondFriendRequest(event) {
  const { userId, isGuest } = requireIdentity(event)
  const requesterId = String(event.arguments.userId ?? '')
  const decision = String(event.arguments.decision ?? '')
  if (isGuest || !requesterId || !['accept', 'reject'].includes(decision)) {
    throw new Error('친구 요청 처리 정보가 올바르지 않습니다.')
  }

  const incoming = await documentClient.send(
    new GetCommand({
      TableName: FRIENDS_TABLE,
      Key: { ownerUserId: userId, friendUserId: requesterId },
      ConsistentRead: true,
    }),
  )
  if (incoming.Item?.status !== 'incoming') {
    throw new Error('처리할 친구 요청이 없습니다.')
  }

  if (decision === 'reject') {
    await removeFriendPair(userId, requesterId)
    return true
  }

  const timestamp = nowIso()
  await documentClient.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: FRIENDS_TABLE,
            Item: {
              ownerUserId: userId,
              friendUserId: requesterId,
              status: 'accepted',
              acceptedAt: timestamp,
            },
          },
        },
        {
          Put: {
            TableName: FRIENDS_TABLE,
            Item: {
              ownerUserId: requesterId,
              friendUserId: userId,
              status: 'accepted',
              acceptedAt: timestamp,
            },
          },
        },
      ],
    }),
  )
  return true
}

async function removeFriendPair(leftUserId, rightUserId) {
  await documentClient.send(
    new TransactWriteCommand({
      TransactItems: [
        {
          Delete: {
            TableName: FRIENDS_TABLE,
            Key: { ownerUserId: leftUserId, friendUserId: rightUserId },
          },
        },
        {
          Delete: {
            TableName: FRIENDS_TABLE,
            Key: { ownerUserId: rightUserId, friendUserId: leftUserId },
          },
        },
      ],
    }),
  )
}

async function removeFriend(event) {
  const { userId, isGuest } = requireIdentity(event)
  const friendUserId = String(event.arguments.userId ?? '')
  if (isGuest || !friendUserId) {
    throw new Error('삭제할 친구를 확인해 주세요.')
  }
  await removeFriendPair(userId, friendUserId)
  return true
}

async function getRoom(roomCode) {
  const result = await documentClient.send(
    new GetCommand({
      TableName: ROOMS_TABLE,
      Key: { roomCode: normalizeRoomCode(roomCode) },
      ConsistentRead: true,
    }),
  )

  if (!result.Item) {
    throw new Error('게임방을 찾을 수 없습니다.')
  }

  return result.Item
}

async function putVersionedRoom(room, expectedVersion) {
  try {
    await documentClient.send(
      new PutCommand({
        TableName: ROOMS_TABLE,
        Item: room,
        ConditionExpression: '#version = :expectedVersion',
        ExpressionAttributeNames: {
          '#version': 'version',
        },
        ExpressionAttributeValues: {
          ':expectedVersion': expectedVersion,
        },
      }),
    )
  } catch (error) {
    if (error?.name === 'ConditionalCheckFailedException') {
      throw new Error(
        '다른 플레이어가 먼저 상태를 변경했습니다. 최신 상태를 확인해 주세요.',
      )
    }

    throw error
  }

  return room
}

async function ensureProfile(event) {
  const identity = requireIdentity(event)
  const nickname = normalizeNickname(event.arguments.nickname)
  const existing = await documentClient.send(
    new GetCommand({
      TableName: USERS_TABLE,
      Key: { userId: identity.userId },
      ConsistentRead: true,
    }),
  )

  if (existing.Item) {
    if (existing.Item.email === identity.email) {
      return toProfileResponse(existing.Item)
    }

    const result = await documentClient.send(
      new UpdateCommand({
        TableName: USERS_TABLE,
        Key: { userId: identity.userId },
        UpdateExpression: 'SET email = :email, updatedAt = :updatedAt',
        ExpressionAttributeValues: {
          ':email': identity.email,
          ':updatedAt': nowIso(),
        },
        ReturnValues: 'ALL_NEW',
      }),
    )

    return toProfileResponse(result.Attributes)
  }

  const timestamp = nowIso()
  const profile = {
    userId: identity.userId,
    email: identity.email,
    nickname,
    wins: 0,
    losses: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
  }

  try {
    await documentClient.send(
      new PutCommand({
        TableName: USERS_TABLE,
        Item: profile,
        ConditionExpression: 'attribute_not_exists(userId)',
      }),
    )

    return toProfileResponse(profile)
  } catch (error) {
    if (error?.name !== 'ConditionalCheckFailedException') {
      throw error
    }

    return toProfileResponse(await getProfile(identity.userId))
  }
}

async function updateNickname(event) {
  const { userId } = requireIdentity(event)
  const nickname = normalizeNickname(event.arguments.nickname)
  const timestamp = nowIso()
  const result = await documentClient.send(
    new UpdateCommand({
      TableName: USERS_TABLE,
      Key: { userId },
      UpdateExpression: 'SET nickname = :nickname, updatedAt = :updatedAt',
      ConditionExpression: 'attribute_exists(userId)',
      ExpressionAttributeValues: {
        ':nickname': nickname,
        ':updatedAt': timestamp,
      },
      ReturnValues: 'ALL_NEW',
    }),
  )

  return toProfileResponse(result.Attributes)
}

async function deleteMyProfile(event) {
  const { userId } = requireIdentity(event)
  let exclusiveStartKey

  do {
    const history = await documentClient.send(
      new QueryCommand({
        TableName: PLAYER_MATCHES_TABLE,
        KeyConditionExpression: 'userId = :userId',
        ExpressionAttributeValues: {
          ':userId': userId,
        },
        ProjectionExpression: 'userId, matchKey',
        Limit: 25,
        ExclusiveStartKey: exclusiveStartKey,
      }),
    )

    const items = history.Items ?? []
    if (items.length > 0) {
      await documentClient.send(
        new BatchWriteCommand({
          RequestItems: {
            [PLAYER_MATCHES_TABLE]: items.map((item) => ({
              DeleteRequest: {
                Key: {
                  userId: item.userId,
                  matchKey: item.matchKey,
                },
              },
            })),
          },
        }),
      )
    }

    exclusiveStartKey = history.LastEvaluatedKey
  } while (exclusiveStartKey)

  const friendRelations = await listFriendRelations(userId)
  await Promise.all(
    friendRelations.map((relation) =>
      removeFriendPair(userId, relation.friendUserId),
    ),
  )

  await documentClient.send(
    new DeleteCommand({
      TableName: USERS_TABLE,
      Key: { userId },
    }),
  )

  return true
}

async function createRoom(event) {
  const { userId, isGuest } = requireIdentity(event)
  const nickname = isGuest
    ? normalizeNickname(event.arguments.guestNickname)
    : (await getProfile(userId)).nickname

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const roomCode = createRoomCode()
    const timestamp = nowIso()
    const epoch = nowEpochSeconds()
    const room = {
      roomCode,
      gameId: 'yacht-dice',
      status: 'waiting',
      players: [
        {
          userId,
          nickname,
          isGuest,
          isHost: true,
          isReady: true,
          slot: 1,
          isPlaying: true,
          scores: [],
        },
      ],
      activePlayerId: null,
      dice: createInitialDice(),
      rollCount: 0,
      version: 1,
      lastSeenAt: {
        [userId]: epoch,
      },
      resultRecorded: false,
      createdAt: timestamp,
      updatedAt: timestamp,
      expiresAt: epoch + ROOM_TTL_SECONDS,
    }

    try {
      await documentClient.send(
        new PutCommand({
          TableName: ROOMS_TABLE,
          Item: room,
          ConditionExpression: 'attribute_not_exists(roomCode)',
        }),
      )

      return room
    } catch (error) {
      if (error?.name !== 'ConditionalCheckFailedException') {
        throw error
      }
    }
  }

  throw new Error('게임방 코드를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.')
}

async function readParticipantRoom(event) {
  const { userId } = requireIdentity(event)
  const room = await getRoom(event.arguments.roomCode)
  requireParticipant(room, userId)

  return { room, userId }
}

async function listChatMessages(event) {
  const { room } = await readParticipantRoom(event)
  const channel = normalizeChatChannel(event.arguments.channel)
  const limit = normalizeQueryLimit(
    event.arguments.limit,
    DEFAULT_CHAT_LIMIT,
  )
  const result = await documentClient.send(
    new QueryCommand({
      TableName: CHAT_MESSAGES_TABLE,
      KeyConditionExpression:
        'roomCode = :roomCode AND begins_with(messageKey, :channelPrefix)',
      ExpressionAttributeValues: {
        ':roomCode': room.roomCode,
        ':channelPrefix': `${channel}#`,
      },
      ScanIndexForward: false,
      Limit: limit,
    }),
  )

  return [...(result.Items ?? [])].reverse()
}

async function sendChatMessage(event) {
  const { room, userId } = await readParticipantRoom(event)
  const sender = requireParticipant(room, userId)

  if (room.status === 'cancelled') {
    throw new Error('종료된 게임방에는 메시지를 보낼 수 없습니다.')
  }

  const text = normalizeChatText(event.arguments.text)
  const channel = normalizeChatChannel(event.arguments.channel)
  if (channel === 'lobby' && room.status === 'playing') {
    throw new Error('게임이 시작된 뒤에는 대기실 채팅을 보낼 수 없습니다.')
  }
  if (channel === 'game' && room.status !== 'playing') {
    throw new Error('게임 채팅은 게임이 시작된 뒤 사용할 수 있습니다.')
  }
  const timestamp = nowIso()
  const message = {
    id: randomUUID(),
    roomCode: room.roomCode,
    messageKey: `${channel}#${timestamp}#${randomUUID()}`,
    senderId: userId,
    senderNickname: sender.nickname,
    channel,
    text,
    sentAt: timestamp,
    expiresAt: nowEpochSeconds() + CHAT_TTL_SECONDS,
  }

  await documentClient.send(
    new PutCommand({
      TableName: CHAT_MESSAGES_TABLE,
      Item: message,
      ConditionExpression:
        'attribute_not_exists(roomCode) AND attribute_not_exists(messageKey)',
    }),
  )

  return message
}

async function deleteRoomChatMessages(roomCode) {
  let exclusiveStartKey

  do {
    const result = await documentClient.send(
      new QueryCommand({
        TableName: CHAT_MESSAGES_TABLE,
        KeyConditionExpression: 'roomCode = :roomCode',
        ExpressionAttributeValues: {
          ':roomCode': roomCode,
        },
        ProjectionExpression: 'roomCode, messageKey',
        ExclusiveStartKey: exclusiveStartKey,
      }),
    )
    const deleteRequests = (result.Items ?? []).map((item) => ({
      DeleteRequest: {
        Key: {
          roomCode: item.roomCode,
          messageKey: item.messageKey,
        },
      },
    }))

    for (let index = 0; index < deleteRequests.length; index += 25) {
      let pendingRequests = deleteRequests.slice(index, index + 25)
      for (let attempt = 0; pendingRequests.length > 0 && attempt < 5; attempt += 1) {
        const response = await documentClient.send(
          new BatchWriteCommand({
            RequestItems: {
              [CHAT_MESSAGES_TABLE]: pendingRequests,
            },
          }),
        )
        pendingRequests = response.UnprocessedItems?.[CHAT_MESSAGES_TABLE] ?? []
      }

      if (pendingRequests.length > 0) {
        throw new Error('이전 채팅을 모두 초기화하지 못했습니다. 다시 시도해 주세요.')
      }
    }

    exclusiveStartKey = result.LastEvaluatedKey
  } while (exclusiveStartKey)
}

async function authorizeRoomSubscription(event) {
  await readParticipantRoom(event)
  return null
}

async function joinRoom(event) {
  const { userId, isGuest } = requireIdentity(event)
  const nickname = isGuest
    ? normalizeNickname(event.arguments.guestNickname)
    : (await getProfile(userId)).nickname
  const room = await getRoom(event.arguments.roomCode)

  if (room.players.some((player) => player.userId === userId)) {
    return room
  }

  if (
    !['waiting', 'ready', 'playing'].includes(room.status) ||
    room.players.length >= MAX_ROOM_PARTICIPANTS
  ) {
    throw new Error('입장할 수 없거나 정원이 찬 게임방입니다.')
  }

  const epoch = nowEpochSeconds()
  const selectedPlayers = getGamePlayers(room)
  const joinsAsPlayer =
    room.status !== 'playing' && selectedPlayers.length < 2
  const occupiedSlots = new Set(
    selectedPlayers.map((player) => player.slot).filter(Boolean),
  )
  const assignedSlot = joinsAsPlayer
    ? [1, 2].find((slot) => !occupiedSlots.has(slot)) ?? 2
    : null
  const nextRoom = {
    ...room,
    status: joinsAsPlayer ? 'waiting' : room.status,
    players: [
      ...room.players,
      {
        userId,
        nickname,
        isGuest,
        isHost: false,
        isReady: false,
        slot: assignedSlot,
        isPlaying: joinsAsPlayer,
        scores: [],
      },
    ],
    lastSeenAt: {
      ...room.lastSeenAt,
      [userId]: epoch,
    },
    version: room.version + 1,
    updatedAt: nowIso(),
    expiresAt: epoch + ROOM_TTL_SECONDS,
  }

  return putVersionedRoom(nextRoom, room.version)
}

async function leaveRoom(event) {
  const { room, userId } = await readParticipantRoom(event)
  requireExpectedVersion(room, event.arguments.expectedVersion)

  const leavingPlayer = requireParticipant(room, userId)

  if (room.status === 'playing' && leavingPlayer.isPlaying !== false) {
    throw new Error('진행 중인 게임에서는 기권 기능을 사용해 주세요.')
  }

  const epoch = nowEpochSeconds()
  const nextRoom = leavingPlayer.isHost && room.status !== 'playing'
    ? {
        ...room,
        status: 'cancelled',
        version: room.version + 1,
        updatedAt: nowIso(),
        expiresAt: epoch + CANCELLED_ROOM_TTL_SECONDS,
      }
    : {
        ...room,
        status: room.status === 'playing' ? 'playing' : 'waiting',
        players: room.players.filter((player) => player.userId !== userId),
        version: room.version + 1,
        updatedAt: nowIso(),
        expiresAt: epoch + ROOM_TTL_SECONDS,
      }

  return putVersionedRoom(nextRoom, room.version)
}

async function setReady(event) {
  const { room, userId } = await readParticipantRoom(event)
  requireExpectedVersion(room, event.arguments.expectedVersion)

  if (!['waiting', 'ready'].includes(room.status)) {
    throw new Error('게임 시작 전 대기방에서만 준비 상태를 바꿀 수 있습니다.')
  }

  const players = room.players.map((player) =>
    player.userId === userId
      ? {
          ...player,
          isReady:
            player.isPlaying === false ? false : Boolean(event.arguments.ready),
        }
      : player,
  )
  const gamePlayers = getGamePlayers({ ...room, players })
  const isReady =
    gamePlayers.length === 2 && gamePlayers.every((player) => player.isReady)
  const nextRoom = {
    ...room,
    players,
    status: isReady ? 'ready' : 'waiting',
    version: room.version + 1,
    updatedAt: nowIso(),
  }

  return putVersionedRoom(nextRoom, room.version)
}

async function selectPlayers(event) {
  const { room, userId } = await readParticipantRoom(event)
  requireExpectedVersion(room, event.arguments.expectedVersion)
  const host = requireParticipant(room, userId)

  if (!host.isHost) {
    throw new Error('방장만 게임 플레이어를 선택할 수 있습니다.')
  }
  if (!['waiting', 'ready'].includes(room.status)) {
    throw new Error('대기실에서만 게임 플레이어를 선택할 수 있습니다.')
  }

  const playerIds = [...new Set(event.arguments.playerIds ?? [])]
  if (playerIds.length > 2) {
    throw new Error('게임 플레이어는 최대 2명까지 선택할 수 있습니다.')
  }
  const minimumPlayerCount = Math.min(2, room.players.length)
  if (playerIds.length < minimumPlayerCount) {
    throw new Error(
      '플레이어는 최소 2명이어야 하므로 현재 플레이어를 관전자로 변경할 수 없습니다.',
    )
  }
  if (
    playerIds.some(
      (playerId) =>
        !room.players.some((participant) => participant.userId === playerId),
    )
  ) {
    throw new Error('방에 없는 참가자는 선택할 수 없습니다.')
  }

  const players = room.players.map((participant) => {
    const slotIndex = playerIds.indexOf(participant.userId)
    const isPlaying = slotIndex >= 0
    return {
      ...participant,
      isPlaying,
      slot: isPlaying ? slotIndex + 1 : null,
      isReady: isPlaying
        ? participant.isHost || Boolean(participant.isReady)
        : false,
      scores: [],
    }
  })
  const gamePlayers = getGamePlayers({ ...room, players })
  const allReady =
    gamePlayers.length === 2 && gamePlayers.every((player) => player.isReady)

  return putVersionedRoom(
    {
      ...room,
      players,
      status: allReady ? 'ready' : 'waiting',
      version: room.version + 1,
      updatedAt: nowIso(),
    },
    room.version,
  )
}

async function inviteFriendToRoom(event) {
  const { userId, isGuest } = requireIdentity(event)
  if (isGuest) {
    throw new Error('친구 초대는 로그인 회원만 사용할 수 있습니다.')
  }

  const room = await getRoom(event.arguments.roomCode)
  const host = requireParticipant(room, userId)
  if (!host.isHost) {
    throw new Error('방장만 친구를 초대할 수 있습니다.')
  }
  if (!['waiting', 'ready'].includes(room.status)) {
    throw new Error('대기 중인 방에만 친구를 초대할 수 있습니다.')
  }
  if (room.players.length >= MAX_ROOM_PARTICIPANTS) {
    throw new Error('방 정원이 가득 찼습니다.')
  }

  const friendUserId = String(event.arguments.friendUserId ?? '')
  const relation = await documentClient.send(
    new GetCommand({
      TableName: FRIENDS_TABLE,
      Key: { ownerUserId: friendUserId, friendUserId: userId },
      ConsistentRead: true,
    }),
  )
  if (relation.Item?.status !== 'accepted') {
    throw new Error('친구로 등록된 회원만 초대할 수 있습니다.')
  }

  await documentClient.send(
    new UpdateCommand({
      TableName: FRIENDS_TABLE,
      Key: { ownerUserId: friendUserId, friendUserId: userId },
      UpdateExpression:
        'SET invitedRoomCode = :roomCode, invitedAt = :invitedAt',
      ConditionExpression: '#status = :accepted',
      ExpressionAttributeNames: {
        '#status': 'status',
      },
      ExpressionAttributeValues: {
        ':roomCode': room.roomCode,
        ':invitedAt': nowIso(),
        ':accepted': 'accepted',
      },
    }),
  )
  return true
}

async function startGame(event) {
  const { room, userId } = await readParticipantRoom(event)
  requireExpectedVersion(room, event.arguments.expectedVersion)
  const player = requireParticipant(room, userId)

  if (!player.isHost) {
    throw new Error('방장만 게임을 시작할 수 있습니다.')
  }

  const gamePlayers = getGamePlayers(room)
  if (
    gamePlayers.length !== 2 ||
    !gamePlayers.every((candidate) => candidate.isReady)
  ) {
    throw new Error('두 플레이어가 모두 준비해야 게임을 시작할 수 있습니다.')
  }

  const epoch = nowEpochSeconds()
  const nextRoom = {
    ...room,
    status: 'playing',
    activePlayerId: gamePlayers[0].userId,
    dice: createInitialDice(),
    rollCount: 0,
    lastSeenAt: Object.fromEntries(
      gamePlayers.map((candidate) => [candidate.userId, epoch]),
    ),
    version: room.version + 1,
    updatedAt: nowIso(),
    expiresAt: epoch + ROOM_TTL_SECONDS,
  }

  return putVersionedRoom(nextRoom, room.version)
}

async function returnToWaitingRoom(event) {
  const { room, userId } = await readParticipantRoom(event)
  requireParticipant(room, userId)

  if (['waiting', 'ready'].includes(room.status)) {
    return room
  }

  requireExpectedVersion(room, event.arguments.expectedVersion)
  if (room.status !== 'finished') {
    throw new Error('종료된 게임에서만 대기실로 돌아갈 수 있습니다.')
  }

  await deleteRoomChatMessages(room.roomCode)

  const timestamp = nowIso()
  const epoch = nowEpochSeconds()
  const players = room.players.map((player) => ({
    ...player,
    isReady: player.isPlaying === true && player.isHost === true,
    scores: [],
  }))
  const nextRoom = {
    ...room,
    status: 'waiting',
    players,
    activePlayerId: null,
    dice: createInitialDice(),
    rollCount: 0,
    winnerId: undefined,
    finishReason: undefined,
    resultRecorded: false,
    lastSeenAt: Object.fromEntries(
      players.map((player) => [player.userId, epoch]),
    ),
    version: room.version + 1,
    updatedAt: timestamp,
    expiresAt: epoch + ROOM_TTL_SECONDS,
  }

  return putVersionedRoom(nextRoom, room.version)
}

async function rollDice(event) {
  const { room, userId } = await readParticipantRoom(event)
  requireExpectedVersion(room, event.arguments.expectedVersion)

  if (room.status !== 'playing') {
    throw new Error('진행 중인 게임이 아닙니다.')
  }

  if (room.activePlayerId !== userId) {
    throw new Error('현재 주사위를 굴릴 차례가 아닙니다.')
  }

  const nextRoom = {
    ...room,
    dice: rollServerDice(
      room.dice,
      event.arguments.heldIndexes ?? [],
      room.rollCount,
    ),
    rollCount: room.rollCount + 1,
    version: room.version + 1,
    updatedAt: nowIso(),
  }

  return putVersionedRoom(nextRoom, room.version)
}

async function finishMatch(room, expectedVersion, reason, winnerId, loserId) {
  const timestamp = nowIso()
  const epoch = nowEpochSeconds()
  const matchId = randomUUID()
  const gamePlayers = getGamePlayers(room)
  if (gamePlayers.length !== 2) {
    throw new Error('경기 플레이어 정보를 찾을 수 없습니다.')
  }
  const player1Score = calculatePlayerTotal(gamePlayers[0].scores)
  const player2Score = calculatePlayerTotal(gamePlayers[1].scores)
  const playerScores = [player1Score, player2Score]
  const matchPlayers = gamePlayers.map((player, index) => ({
    userId: player.userId,
    nickname: player.nickname,
    slot: player.slot,
    totalScore: playerScores[index],
    scores: player.scores,
  }))
  const finishedRoom = {
    ...room,
    status: 'finished',
    winnerId,
    finishReason: reason,
    resultRecorded: true,
    version: room.version + 1,
    updatedAt: timestamp,
    expiresAt: epoch + ROOM_TTL_SECONDS,
  }
  const match = {
    matchId,
    roomCode: room.roomCode,
    winnerId,
    loserId,
    reason,
    player1Id: gamePlayers[0].userId,
    player2Id: gamePlayers[1].userId,
    player1Score,
    player2Score,
    players: matchPlayers,
    finishedAt: timestamp,
  }
  const playerMatchItems = gamePlayers.map((player, index) => {
    const opponentIndex = index === 0 ? 1 : 0

    return {
      userId: player.userId,
      matchKey: `${timestamp}#${matchId}`,
      matchId,
      roomCode: room.roomCode,
      result: getMatchResult(player.userId, winnerId),
      reason,
      myScore: playerScores[index],
      opponentScore: playerScores[opponentIndex],
      opponentNickname: gamePlayers[opponentIndex].nickname,
      finishedAt: timestamp,
    }
  })
  const isRankedMatch = gamePlayers.every(
    (player) =>
      player.isGuest !== true &&
      !String(player.userId).startsWith('guest:'),
  )
  const transactionItems = [
    {
      Put: {
        TableName: ROOMS_TABLE,
        Item: finishedRoom,
        ConditionExpression:
          '#version = :expectedVersion AND resultRecorded = :notRecorded',
        ExpressionAttributeNames: {
          '#version': 'version',
        },
        ExpressionAttributeValues: {
          ':expectedVersion': expectedVersion,
          ':notRecorded': false,
        },
      },
    },
    {
      Put: {
        TableName: MATCHES_TABLE,
        Item: match,
        ConditionExpression: 'attribute_not_exists(matchId)',
      },
    },
    ...(isRankedMatch
      ? playerMatchItems.map((item) => ({
          Put: {
            TableName: PLAYER_MATCHES_TABLE,
            Item: item,
            ConditionExpression:
              'attribute_not_exists(userId) AND attribute_not_exists(matchKey)',
          },
        }))
      : []),
  ]

  if (isRankedMatch && winnerId && loserId) {
    transactionItems.push(
      {
        Update: {
          TableName: USERS_TABLE,
          Key: { userId: winnerId },
          UpdateExpression:
            'SET wins = if_not_exists(wins, :zero) + :one, updatedAt = :updatedAt',
          ConditionExpression: 'attribute_exists(userId)',
          ExpressionAttributeValues: {
            ':zero': 0,
            ':one': 1,
            ':updatedAt': timestamp,
          },
        },
      },
      {
        Update: {
          TableName: USERS_TABLE,
          Key: { userId: loserId },
          UpdateExpression:
            'SET losses = if_not_exists(losses, :zero) + :one, updatedAt = :updatedAt',
          ConditionExpression: 'attribute_exists(userId)',
          ExpressionAttributeValues: {
            ':zero': 0,
            ':one': 1,
            ':updatedAt': timestamp,
          },
        },
      },
    )
  }

  try {
    await documentClient.send(
      new TransactWriteCommand({
        TransactItems: transactionItems,
      }),
    )
  } catch (error) {
    if (error?.name === 'TransactionCanceledException') {
      throw new Error('경기 결과가 이미 처리되었거나 게임 상태가 변경되었습니다.')
    }

    throw error
  }

  return finishedRoom
}

async function myMatchHistory(event) {
  const { userId } = requireIdentity(event)
  const limit = normalizeQueryLimit(
    event.arguments.limit,
    DEFAULT_HISTORY_LIMIT,
  )
  const result = await documentClient.send(
    new QueryCommand({
      TableName: PLAYER_MATCHES_TABLE,
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: {
        ':userId': userId,
      },
      ScanIndexForward: false,
      Limit: limit,
      ExclusiveStartKey: decodeNextToken(event.arguments.nextToken),
    }),
  )

  return {
    items: result.Items ?? [],
    nextToken: encodeNextToken(result.LastEvaluatedKey),
  }
}

async function matchDetail(event) {
  const { userId } = requireIdentity(event)
  const result = await documentClient.send(
    new GetCommand({
      TableName: MATCHES_TABLE,
      Key: {
        matchId: String(event.arguments.matchId),
      },
      ConsistentRead: true,
    }),
  )
  const match = result.Item

  if (!match) {
    throw new Error('경기 기록을 찾을 수 없습니다.')
  }

  const participantIds = match.players?.map((player) => player.userId) ?? [
    match.player1Id,
    match.player2Id,
  ]
  if (!participantIds.includes(userId)) {
    throw new Error('이 경기 기록을 조회할 권한이 없습니다.')
  }

  const players =
    match.players ??
    [
      {
        userId: match.player1Id,
        nickname: '1P',
        slot: 1,
        totalScore: match.player1Score ?? 0,
        scores: [],
      },
      {
        userId: match.player2Id,
        nickname: '2P',
        slot: 2,
        totalScore: match.player2Score ?? 0,
        scores: [],
      },
    ]

  return {
    matchId: match.matchId,
    roomCode: match.roomCode,
    result: getMatchResult(userId, match.winnerId),
    reason: match.reason,
    winnerId: match.winnerId ?? null,
    players,
    finishedAt: match.finishedAt,
  }
}

async function confirmScore(event) {
  const { room, userId } = await readParticipantRoom(event)
  requireExpectedVersion(room, event.arguments.expectedVersion)

  if (room.status !== 'playing' || room.activePlayerId !== userId) {
    throw new Error('현재 점수를 확정할 차례가 아닙니다.')
  }

  if (room.rollCount < 1 || room.dice.some((die) => die.value === null)) {
    throw new Error('주사위를 한 번 이상 굴린 뒤 점수를 확정해 주세요.')
  }

  const category = String(event.arguments.category)
  if (!SCORE_CATEGORIES.includes(category)) {
    throw new Error('알 수 없는 점수 항목입니다.')
  }

  const gamePlayers = getGamePlayers(room)
  const activeIndex = gamePlayers.findIndex(
    (player) => player.userId === userId,
  )
  const activePlayer = gamePlayers[activeIndex]
  if (!activePlayer) {
    throw new Error('관전자는 점수를 확정할 수 없습니다.')
  }
  if (activePlayer.scores.some((entry) => entry.category === category)) {
    throw new Error('이미 확정한 점수 항목입니다.')
  }

  const score = calculateScore(
    category,
    room.dice.map((die) => die.value),
  )
  const updatedGamePlayers = gamePlayers.map((player, index) =>
    index === activeIndex
      ? {
          ...player,
          scores: [...player.scores, { category, score }],
        }
      : player,
  )
  const updatedById = new Map(
    updatedGamePlayers.map((player) => [player.userId, player]),
  )
  const players = room.players.map(
    (player) => updatedById.get(player.userId) ?? player,
  )
  const scoredRoom = {
    ...room,
    players,
  }
  const isFinished = updatedGamePlayers.every(
    (player) => player.scores.length === SCORE_CATEGORIES.length,
  )

  if (isFinished) {
    const player1Total = calculatePlayerTotal(updatedGamePlayers[0].scores)
    const player2Total = calculatePlayerTotal(updatedGamePlayers[1].scores)
    const winnerId =
      player1Total === player2Total
        ? undefined
        : player1Total > player2Total
          ? updatedGamePlayers[0].userId
          : updatedGamePlayers[1].userId
    const loserId = winnerId
      ? updatedGamePlayers.find((player) => player.userId !== winnerId)?.userId
      : undefined

    return finishMatch(
      scoredRoom,
      room.version,
      'completed',
      winnerId,
      loserId,
    )
  }

  const nextPlayer =
    updatedGamePlayers[(activeIndex + 1) % updatedGamePlayers.length]
  const nextRoom = {
    ...scoredRoom,
    activePlayerId: nextPlayer.userId,
    dice: createInitialDice(),
    rollCount: 0,
    version: room.version + 1,
    updatedAt: nowIso(),
  }

  return putVersionedRoom(nextRoom, room.version)
}

async function forfeit(event) {
  const { room, userId } = await readParticipantRoom(event)
  requireExpectedVersion(room, event.arguments.expectedVersion)

  if (room.status !== 'playing') {
    throw new Error('진행 중인 게임에서만 기권할 수 있습니다.')
  }

  requireGamePlayer(room, userId)
  const winner = getGamePlayers(room).find(
    (player) => player.userId !== userId,
  )
  if (!winner) {
    throw new Error('상대 플레이어를 찾을 수 없습니다.')
  }

  return finishMatch(room, room.version, 'forfeit', winner.userId, userId)
}

async function heartbeat(event) {
  const { room, userId } = await readParticipantRoom(event)

  if (room.status !== 'playing') {
    return true
  }

  await documentClient.send(
    new UpdateCommand({
      TableName: ROOMS_TABLE,
      Key: { roomCode: room.roomCode },
      UpdateExpression: 'SET lastSeenAt.#userId = :lastSeen',
      ConditionExpression: 'attribute_exists(roomCode)',
      ExpressionAttributeNames: {
        '#userId': userId,
      },
      ExpressionAttributeValues: {
        ':lastSeen': nowEpochSeconds(),
      },
    }),
  )

  return true
}

async function claimDisconnectWin(event) {
  const { room, userId } = await readParticipantRoom(event)
  requireExpectedVersion(room, event.arguments.expectedVersion)

  if (room.status !== 'playing') {
    throw new Error('진행 중인 게임이 아닙니다.')
  }

  requireGamePlayer(room, userId)
  const opponent = getGamePlayers(room).find(
    (player) => player.userId !== userId,
  )
  if (!opponent) {
    throw new Error('상대 플레이어를 찾을 수 없습니다.')
  }

  const lastSeen = room.lastSeenAt?.[opponent.userId] ?? 0
  if (nowEpochSeconds() - lastSeen < DISCONNECT_GRACE_SECONDS) {
    throw new Error('상대 플레이어의 재접속 대기 시간이 아직 남아 있습니다.')
  }

  return finishMatch(
    room,
    room.version,
    'disconnectTimeout',
    userId,
    opponent.userId,
  )
}

async function cancelAbandonedRoom(room) {
  const epoch = nowEpochSeconds()
  const cancelledRoom = {
    ...room,
    status: 'cancelled',
    activePlayerId: null,
    resultRecorded: true,
    version: room.version + 1,
    updatedAt: nowIso(),
    expiresAt: epoch + CANCELLED_ROOM_TTL_SECONDS,
  }

  await documentClient.send(
    new PutCommand({
      TableName: ROOMS_TABLE,
      Item: cancelledRoom,
      ConditionExpression:
        '#version = :expectedVersion AND resultRecorded = :notRecorded',
      ExpressionAttributeNames: {
        '#version': 'version',
      },
      ExpressionAttributeValues: {
        ':expectedVersion': room.version,
        ':notRecorded': false,
      },
    }),
  )

  return cancelledRoom
}

async function processPresenceCheck() {
  const epoch = nowEpochSeconds()
  let exclusiveStartKey
  let checked = 0
  let finished = 0
  let cancelled = 0

  do {
    const result = await documentClient.send(
      new ScanCommand({
        TableName: ROOMS_TABLE,
        FilterExpression:
          '#status = :playing AND resultRecorded = :notRecorded',
        ExpressionAttributeNames: {
          '#status': 'status',
        },
        ExpressionAttributeValues: {
          ':playing': 'playing',
          ':notRecorded': false,
        },
        ExclusiveStartKey: exclusiveStartKey,
      }),
    )

    for (const room of result.Items ?? []) {
      checked += 1
      const gamePlayers = getGamePlayers(room)
      if (gamePlayers.length !== 2) {
        continue
      }

      const disconnectedPlayers = gamePlayers.filter((player) => {
        const lastSeen = room.lastSeenAt?.[player.userId] ?? 0
        return epoch - lastSeen >= DISCONNECT_GRACE_SECONDS
      })

      try {
        if (disconnectedPlayers.length === 2) {
          await cancelAbandonedRoom(room)
          cancelled += 1
          continue
        }

        if (disconnectedPlayers.length !== 1) {
          continue
        }

        const loser = disconnectedPlayers[0]
        const winner = gamePlayers.find(
          (player) => player.userId !== loser.userId,
        )
        if (!winner) {
          continue
        }

        await finishMatch(
          room,
          room.version,
          'disconnectTimeout',
          winner.userId,
          loser.userId,
        )
        finished += 1
      } catch (error) {
        if (
          ![
            'ConditionalCheckFailedException',
            'TransactionCanceledException',
          ].includes(error?.name) &&
          !String(error?.message).includes('이미 처리')
        ) {
          console.error('접속 종료 경기 처리 실패', {
            roomCode: room.roomCode,
            error,
          })
        }
      }
    }

    exclusiveStartKey = result.LastEvaluatedKey
  } while (exclusiveStartKey)

  return {
    checked,
    finished,
    cancelled,
    checkedAt: nowIso(),
  }
}

const handlers = {
  me: async (event) => {
    const { userId } = requireIdentity(event)
    return toProfileResponse(await getProfile(userId))
  },
  room: async (event) => {
    const { room } = await readParticipantRoom(event)
    return room
  },
  listChatMessages,
  friendDashboard,
  searchMembers,
  myMatchHistory,
  matchDetail,
  onRoomChanged: authorizeRoomSubscription,
  onChatMessage: authorizeRoomSubscription,
  ensureProfile,
  updateNickname,
  deleteMyProfile,
  createRoom,
  joinRoom,
  leaveRoom,
  setReady,
  selectPlayers,
  startGame,
  rollDice,
  confirmScore,
  forfeit,
  returnToWaitingRoom,
  heartbeat,
  claimDisconnectWin,
  sendChatMessage,
  touchPresence,
  sendFriendRequest,
  respondFriendRequest,
  removeFriend,
  inviteFriendToRoom,
}

export async function handler(event) {
  if (event?.source === 'minigamejoin.presence-check') {
    return processPresenceCheck()
  }

  const fieldName = event.info?.fieldName ?? event.fieldName
  const fieldHandler = handlers[fieldName]

  if (!fieldHandler) {
    throw new Error(`지원하지 않는 GraphQL 작업입니다: ${fieldName}`)
  }

  return fieldHandler(event)
}
