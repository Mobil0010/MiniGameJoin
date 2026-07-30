import {
  CognitoIdentityClient,
  GetIdCommand,
  GetOpenIdTokenCommand,
} from '@aws-sdk/client-cognito-identity'
import {
  AssumeRoleWithWebIdentityCommand,
  STSClient,
} from '@aws-sdk/client-sts'
import { Sha256 } from '@aws-crypto/sha256-browser'
import { HttpRequest } from '@smithy/protocol-http'
import { SignatureV4 } from '@smithy/signature-v4'
import type { OnlineUser } from './types'

const awsRegion = String(import.meta.env.VITE_AWS_REGION ?? '').trim()
const identityPoolId = String(
  import.meta.env.VITE_COGNITO_IDENTITY_POOL_ID ?? '',
).trim()
const guestRoleArn = String(
  import.meta.env.VITE_COGNITO_GUEST_ROLE_ARN ?? '',
).trim()
const guestIdentityStorageKey = 'minigamejoin:guest-identity-id'
const credentialRefreshMarginMs = 5 * 60 * 1000

interface GuestCredentials {
  accessKeyId: string
  secretAccessKey: string
  sessionToken: string
  expiration: Date
}

export interface SignedAppSyncRequest {
  body: string
  headers: Record<string, string>
}

let cachedCredentials: GuestCredentials | null = null

function assertGuestAuthConfigured(): void {
  if (
    !awsRegion ||
    !new RegExp(`^${awsRegion}:[0-9a-f-]{36}$`, 'i').test(identityPoolId) ||
    !/^arn:aws:iam::\d{12}:role\/[\w+=,.@/-]+$/.test(guestRoleArn)
  ) {
    throw new Error(
      '게스트 온라인 플레이용 Identity Pool 또는 IAM 역할이 아직 연결되지 않았습니다.',
    )
  }
}

function readStoredIdentityId(): string | null {
  try {
    const value = window.localStorage.getItem(guestIdentityStorageKey)
    return value?.startsWith(`${awsRegion}:`) ? value : null
  } catch {
    return null
  }
}

function storeIdentityId(value: string): void {
  try {
    window.localStorage.setItem(guestIdentityStorageKey, value)
  } catch {
    // 저장소 사용이 제한되어도 현재 페이지의 임시 자격 증명은 사용할 수 있습니다.
  }
}

function clearStoredIdentityId(): void {
  try {
    window.localStorage.removeItem(guestIdentityStorageKey)
  } catch {
    // 저장소 사용이 제한된 브라우저에서는 메모리 캐시만 초기화합니다.
  }
}

function normalizeCredentials(
  credentials?: {
    AccessKeyId?: string
    SecretAccessKey?: string
    SessionToken?: string
    Expiration?: Date
  },
): GuestCredentials {
  if (
    !credentials?.AccessKeyId ||
    !credentials.SecretAccessKey ||
    !credentials.SessionToken ||
    !credentials.Expiration
  ) {
    throw new Error('게스트용 임시 AWS 자격 증명을 발급받지 못했습니다.')
  }

  return {
    accessKeyId: credentials.AccessKeyId,
    secretAccessKey: credentials.SecretAccessKey,
    sessionToken: credentials.SessionToken,
    expiration: credentials.Expiration,
  }
}

async function requestIdentityId(
  client: CognitoIdentityClient,
): Promise<string> {
  const result = await client.send(
    new GetIdCommand({ IdentityPoolId: identityPoolId }),
  )

  if (!result.IdentityId) {
    throw new Error('게스트 식별자를 발급받지 못했습니다.')
  }

  storeIdentityId(result.IdentityId)
  return result.IdentityId
}

async function requestCredentials(
  client: CognitoIdentityClient,
  identityId: string,
): Promise<GuestCredentials> {
  const tokenResult = await client.send(
    new GetOpenIdTokenCommand({ IdentityId: identityId }),
  )

  if (!tokenResult.Token) {
    throw new Error('게스트용 Cognito 토큰을 발급받지 못했습니다.')
  }

  const identityUuid = identityId.split(':').at(-1) ?? crypto.randomUUID()
  const result = await new STSClient({ region: awsRegion }).send(
    new AssumeRoleWithWebIdentityCommand({
      RoleArn: guestRoleArn,
      RoleSessionName: `MiniGameJoinGuest-${identityUuid}`,
      WebIdentityToken: tokenResult.Token,
    }),
  )

  return normalizeCredentials(result.Credentials)
}

async function getGuestSession(): Promise<{
  identityId: string
  credentials: GuestCredentials
}> {
  assertGuestAuthConfigured()

  const storedIdentityId = readStoredIdentityId()
  if (
    storedIdentityId &&
    cachedCredentials &&
    cachedCredentials.expiration.getTime() - Date.now() >
      credentialRefreshMarginMs
  ) {
    return {
      identityId: storedIdentityId,
      credentials: cachedCredentials,
    }
  }

  const client = new CognitoIdentityClient({ region: awsRegion })
  let identityId = storedIdentityId ?? (await requestIdentityId(client))

  try {
    cachedCredentials = await requestCredentials(client, identityId)
  } catch (error) {
    if (!storedIdentityId) {
      throw error
    }

    clearStoredIdentityId()
    cachedCredentials = null
    identityId = await requestIdentityId(client)
    cachedCredentials = await requestCredentials(client, identityId)
  }

  return { identityId, credentials: cachedCredentials }
}

export function isGuestAwsAuthConfigured(): boolean {
  return Boolean(
    awsRegion &&
      new RegExp(`^${awsRegion}:[0-9a-f-]{36}$`, 'i').test(identityPoolId) &&
      /^arn:aws:iam::\d{12}:role\/[\w+=,.@/-]+$/.test(guestRoleArn),
  )
}

export async function createOnlineGuestUser(
  nickname: string,
): Promise<OnlineUser> {
  const normalizedNickname = nickname.trim()
  if (normalizedNickname.length < 1 || normalizedNickname.length > 16) {
    throw new Error('닉네임은 1자 이상 16자 이하로 입력해주세요.')
  }

  const { identityId } = await getGuestSession()
  const identityHash = Array.from(
    new Uint8Array(
      await window.crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(identityId),
      ),
    ),
    (value) => value.toString(16).padStart(2, '0'),
  ).join('')

  return {
    id: `guest:${identityHash}`,
    nickname: normalizedNickname,
    kind: 'guest',
  }
}

export async function signAppSyncGuestRequest(
  endpoint: string,
  body: string,
): Promise<SignedAppSyncRequest> {
  const { credentials } = await getGuestSession()
  const url = new URL(endpoint)
  const signer = new SignatureV4({
    service: 'appsync',
    region: awsRegion,
    credentials,
    sha256: Sha256,
  })
  const signedRequest = await signer.sign(
    new HttpRequest({
      protocol: url.protocol,
      hostname: url.hostname,
      port: url.port ? Number(url.port) : undefined,
      method: 'POST',
      path: `${url.pathname}${url.search}`,
      headers: {
        host: url.host,
        'content-type': 'application/json',
      },
      body,
    }),
  )

  return {
    body,
    headers: Object.fromEntries(
      Object.entries(signedRequest.headers).map(([name, value]) => [
        name,
        String(value),
      ]),
    ),
  }
}

export function clearGuestAwsSession(): void {
  cachedCredentials = null
  clearStoredIdentityId()
}
