import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserAttribute,
  CognitoUserPool,
  type CognitoUserSession,
} from 'amazon-cognito-identity-js'
import type { OnlineUser } from '../online-multiplayer/types'

const COGNITO_REGION = 'ap-northeast-2'
const COGNITO_USER_POOL_ID = 'ap-northeast-2_wKEL9hhbQ'
const COGNITO_APP_CLIENT_ID = '5icj3sfkbd83t6fdpuas69damg'
const NICKNAME_STORAGE_PREFIX = 'minigamejoin:member-nickname:'

const userPool = new CognitoUserPool({
  UserPoolId: COGNITO_USER_POOL_ID,
  ClientId: COGNITO_APP_CLIENT_ID,
})

interface SignUpInput {
  email: string
  password: string
  nickname: string
}

interface SignUpResult {
  email: string
  destination?: string
  userConfirmed: boolean
}

interface CognitoErrorShape {
  code?: string
  name?: string
  message?: string
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function nicknameStorageKey(email: string): string {
  return `${NICKNAME_STORAGE_PREFIX}${normalizeEmail(email)}`
}

function saveNickname(email: string, nickname: string): void {
  try {
    window.localStorage.setItem(nicknameStorageKey(email), nickname.trim())
  } catch {
    // 닉네임 저장이 제한되어도 Cognito 인증은 계속 진행합니다.
  }
}

function loadNickname(email: string): string {
  try {
    return (
      window.localStorage.getItem(nicknameStorageKey(email))?.trim() ||
      email.split('@')[0] ||
      '플레이어'
    )
  } catch {
    return email.split('@')[0] || '플레이어'
  }
}

function removeNickname(email: string): void {
  try {
    window.localStorage.removeItem(nicknameStorageKey(email))
  } catch {
    // 계정 삭제는 브라우저 저장소 정리 실패와 관계없이 완료합니다.
  }
}

function createCognitoUser(email: string): CognitoUser {
  return new CognitoUser({
    Username: normalizeEmail(email),
    Pool: userPool,
  })
}

function memberFromSession(
  session: CognitoUserSession,
  fallbackEmail: string,
): OnlineUser {
  const payload = session.getIdToken().payload
  const email = String(payload.email ?? fallbackEmail)
  const nickname = String(payload.nickname ?? loadNickname(email))

  return {
    id: String(payload.sub ?? email),
    nickname,
    kind: 'member',
    email,
    stats: {
      wins: 0,
      losses: 0,
    },
  }
}

function getErrorShape(error: unknown): CognitoErrorShape {
  if (typeof error !== 'object' || error === null) {
    return {}
  }

  return error as CognitoErrorShape
}

export function isCognitoError(error: unknown, code: string): boolean {
  const errorShape = getErrorShape(error)
  return errorShape.code === code || errorShape.name === code
}

export function getCognitoErrorMessage(error: unknown): string {
  const errorShape = getErrorShape(error)
  const code = errorShape.code ?? errorShape.name

  switch (code) {
    case 'UsernameExistsException':
      return '이미 가입된 이메일입니다. 로그인하거나 인증 코드를 다시 받아주세요.'
    case 'AliasExistsException':
      return '이미 다른 계정에서 사용 중인 이메일입니다.'
    case 'UserNotConfirmedException':
      return '이메일 인증이 아직 완료되지 않았습니다.'
    case 'NotAuthorizedException':
      return '이메일 또는 비밀번호가 올바르지 않습니다.'
    case 'UserNotFoundException':
      return '가입된 계정을 찾을 수 없습니다.'
    case 'CodeMismatchException':
      return '인증 코드가 올바르지 않습니다.'
    case 'ExpiredCodeException':
      return '인증 코드가 만료되었습니다. 새 코드를 받아주세요.'
    case 'InvalidPasswordException':
      return '비밀번호 규칙을 충족하지 않습니다.'
    case 'LimitExceededException':
      return '요청 횟수가 너무 많습니다. 잠시 후 다시 시도해주세요.'
    case 'TooManyFailedAttemptsException':
      return '실패 횟수가 너무 많습니다. 잠시 후 다시 시도해주세요.'
    case 'NetworkError':
      return '네트워크 연결을 확인한 뒤 다시 시도해주세요.'
    case 'CodeDeliveryFailureException':
      return '인증 이메일을 보내지 못했습니다. 잠시 뒤 다시 시도해주세요.'
    default:
      if (
        errorShape.message?.includes('SECRET_HASH') ||
        errorShape.message?.includes('configured with secret')
      ) {
        return '현재 로그인 기능을 이용할 수 없습니다. 잠시 후 다시 시도해주세요.'
      }

      return errorShape.message || '인증 처리 중 오류가 발생했습니다.'
  }
}

export function signUpMember({
  email,
  password,
  nickname,
}: SignUpInput): Promise<SignUpResult> {
  const normalizedEmail = normalizeEmail(email)
  const attributes = [
    new CognitoUserAttribute({
      Name: 'email',
      Value: normalizedEmail,
    }),
  ]

  return new Promise((resolve, reject) => {
    userPool.signUp(
      normalizedEmail,
      password,
      attributes,
      [],
      (error, result) => {
        if (error) {
          reject(error)
          return
        }

        if (!result) {
          reject(new Error('회원가입 결과를 확인하지 못했습니다.'))
          return
        }

        saveNickname(normalizedEmail, nickname)
        resolve({
          email: normalizedEmail,
          destination: result.codeDeliveryDetails?.Destination,
          userConfirmed: result.userConfirmed,
        })
      },
    )
  })
}

export function confirmMemberRegistration(
  email: string,
  code: string,
): Promise<void> {
  const cognitoUser = createCognitoUser(email)

  return new Promise((resolve, reject) => {
    cognitoUser.confirmRegistration(code.trim(), true, (error) => {
      if (error) {
        reject(error)
        return
      }

      resolve()
    })
  })
}

export function resendMemberConfirmationCode(email: string): Promise<string> {
  const cognitoUser = createCognitoUser(email)

  return new Promise((resolve, reject) => {
    cognitoUser.resendConfirmationCode((error, result) => {
      if (error) {
        reject(error)
        return
      }

      const destination =
        typeof result === 'object' &&
        result !== null &&
        'CodeDeliveryDetails' in result
          ? String(
              (
                result as {
                  CodeDeliveryDetails?: { Destination?: string }
                }
              ).CodeDeliveryDetails?.Destination ?? '',
            )
          : ''

      resolve(destination)
    })
  })
}

export function signInMember(
  email: string,
  password: string,
): Promise<OnlineUser> {
  const normalizedEmail = normalizeEmail(email)
  const cognitoUser = createCognitoUser(normalizedEmail)
  const authenticationDetails = new AuthenticationDetails({
    Username: normalizedEmail,
    Password: password,
  })

  return new Promise((resolve, reject) => {
    cognitoUser.authenticateUser(authenticationDetails, {
      onSuccess: (session) => {
        resolve(memberFromSession(session, normalizedEmail))
      },
      onFailure: reject,
    })
  })
}

export function requestMemberPasswordReset(email: string): Promise<string> {
  const cognitoUser = createCognitoUser(email)

  return new Promise((resolve, reject) => {
    cognitoUser.forgotPassword({
      onSuccess: () => resolve(''),
      onFailure: reject,
      inputVerificationCode: (data) => {
        resolve(String(data.CodeDeliveryDetails?.Destination ?? ''))
      },
    })
  })
}

export function confirmMemberPasswordReset(
  email: string,
  code: string,
  newPassword: string,
): Promise<void> {
  const cognitoUser = createCognitoUser(email)

  return new Promise((resolve, reject) => {
    cognitoUser.confirmPassword(code.trim(), newPassword, {
      onSuccess: () => resolve(),
      onFailure: reject,
    })
  })
}

export function requestMemberEmailChange(newEmail: string): Promise<void> {
  const currentUser = userPool.getCurrentUser()

  if (!currentUser) {
    return Promise.reject(new Error('로그인한 회원 계정을 찾을 수 없습니다.'))
  }

  const normalizedEmail = normalizeEmail(newEmail)
  return new Promise((resolve, reject) => {
    currentUser.getSession(
      (sessionError: Error | null, session: CognitoUserSession | null) => {
        if (sessionError || !session?.isValid()) {
          reject(sessionError ?? new Error('로그인 세션이 만료되었습니다.'))
          return
        }

        currentUser.updateAttributes(
          [
            new CognitoUserAttribute({
              Name: 'email',
              Value: normalizedEmail,
            }),
          ],
          (updateError) => {
            if (updateError) {
              reject(updateError)
              return
            }

            resolve()
          },
        )
      },
    )
  })
}

export function confirmMemberEmailChange(code: string): Promise<void> {
  const currentUser = userPool.getCurrentUser()

  if (!currentUser) {
    return Promise.reject(new Error('로그인한 회원 계정을 찾을 수 없습니다.'))
  }

  return new Promise((resolve, reject) => {
    currentUser.verifyAttribute('email', code.trim(), {
      onSuccess: () => resolve(),
      onFailure: reject,
    })
  })
}

export function restoreMemberSession(): Promise<OnlineUser | null> {
  const currentUser = userPool.getCurrentUser()

  if (!currentUser) {
    return Promise.resolve(null)
  }

  return new Promise((resolve) => {
    currentUser.getSession(
      (error: Error | null, session: CognitoUserSession | null) => {
        if (error || !session?.isValid()) {
          currentUser.signOut()
          resolve(null)
          return
        }

        resolve(memberFromSession(session, currentUser.getUsername()))
      },
    )
  })
}

export function getCurrentMemberIdToken(): Promise<string> {
  const currentUser = userPool.getCurrentUser()

  if (!currentUser) {
    return Promise.reject(new Error('로그인된 회원 세션을 찾을 수 없습니다.'))
  }

  return new Promise((resolve, reject) => {
    currentUser.getSession(
      (error: Error | null, session: CognitoUserSession | null) => {
        if (error || !session?.isValid()) {
          reject(error ?? new Error('로그인 세션이 만료되었습니다.'))
          return
        }

        resolve(session.getIdToken().getJwtToken())
      },
    )
  })
}

export function signOutMember(): void {
  userPool.getCurrentUser()?.signOut()
}

export function deleteCurrentMember(): Promise<void> {
  const currentUser = userPool.getCurrentUser()

  if (!currentUser) {
    return Promise.reject(new Error('로그인된 회원 계정을 찾을 수 없습니다.'))
  }

  return new Promise((resolve, reject) => {
    currentUser.getSession(
      (
        sessionError: Error | null,
        session: CognitoUserSession | null,
      ) => {
        if (sessionError || !session?.isValid()) {
          reject(sessionError ?? new Error('로그인 세션이 만료되었습니다.'))
          return
        }

        const email = String(
          session.getIdToken().payload.email ?? currentUser.getUsername(),
        )

        currentUser.deleteUser((deleteError) => {
          if (deleteError) {
            reject(deleteError)
            return
          }

          removeNickname(email)
          resolve()
        })
      },
    )
  })
}

export const cognitoConfiguration = {
  region: COGNITO_REGION,
  userPoolId: COGNITO_USER_POOL_ID,
  appClientId: COGNITO_APP_CLIENT_ID,
} as const
