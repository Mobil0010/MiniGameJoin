import {
  type FormEvent,
  useEffect,
  useState,
} from 'react'
import { Link } from 'react-router'
import { isAndroidNativeApp, shareAndroidInvite } from '../platform/nativeApp'
import {
  confirmMemberEmailChange,
  confirmMemberPasswordReset,
  confirmMemberRegistration,
  deleteCurrentMember,
  getCognitoErrorMessage,
  isCognitoError,
  resendMemberConfirmationCode,
  requestMemberPasswordReset,
  requestMemberEmailChange,
  restoreMemberSession,
  signInMember,
  signOutMember,
  signUpMember,
} from '../features/auth/cognitoAuth'
import AccountDeletionDialog from '../features/online-multiplayer/AccountDeletionDialog'
import MatchHistoryDialog from '../features/online-multiplayer/MatchHistoryDialog'
import MemberProfileDialog from '../features/online-multiplayer/MemberProfileDialog'
import {
  createOnlineRoom,
  deleteOnlineProfile,
  ensureOnlineProfile,
  getOnlineRoom,
  getOnlineProfile,
  getMyGameStats,
  isAppSyncConfigured,
  isGuestOnlineConfigured,
  joinOnlineRoom,
  leaveOnlineRoom,
  selectOnlinePlayers,
  setOnlineReady,
  startOnlineGame,
  updateOnlineRpsSettings,
  updateOnlineNickname,
} from '../features/online-multiplayer/appSyncApi'
import OnlineYachtGame from '../features/online-multiplayer/OnlineYachtGame'
import OnlineRpsGame from '../features/online-multiplayer/OnlineRpsGame'
import OnlineChatPanel from '../features/online-multiplayer/OnlineChatPanel'
import FriendsPanel from '../features/online-multiplayer/FriendsPanel'
import {
  clearGuestAwsSession,
  createOnlineGuestUser,
} from '../features/online-multiplayer/guestAwsAuth'
import { normalizeRoomCodeInput } from '../features/online-multiplayer/roomCodeInput'
import {
  clearPrototypeUser,
  loadPrototypeUser,
  persistPrototypeUser,
} from '../features/online-multiplayer/prototype'
import type {
  OnlineRoom,
  OnlineGameId,
  OnlineGameStats,
  OnlineUser,
  RpsSettings,
} from '../features/online-multiplayer/types'

type AuthView =
  | 'login'
  | 'signup'
  | 'confirm'
  | 'guest'
  | 'forgot'
  | 'reset'

function YachtOnlinePage() {
  const [authView, setAuthView] = useState<AuthView>('login')
  const [user, setUser] = useState<OnlineUser | null>(null)
  const [room, setRoom] = useState<OnlineRoom | null>(null)
  const [joinCode, setJoinCode] = useState('')
  const [notice, setNotice] = useState('')
  const [authNotice, setAuthNotice] = useState('')
  const [authError, setAuthError] = useState('')
  const [pendingEmail, setPendingEmail] = useState('')
  const [isRestoringSession, setIsRestoringSession] = useState(true)
  const [isAuthSubmitting, setIsAuthSubmitting] = useState(false)
  const [showAccountDeletion, setShowAccountDeletion] = useState(false)
  const [isDeletingAccount, setIsDeletingAccount] = useState(false)
  const [isLobbySubmitting, setIsLobbySubmitting] = useState(false)
  const [showMemberProfile, setShowMemberProfile] = useState(false)
  const [showMatchHistory, setShowMatchHistory] = useState(false)
  const [currentGameStats, setCurrentGameStats] = useState<OnlineGameStats | null>(null)
  const [profileError, setProfileError] = useState('')
  const [profileNotice, setProfileNotice] = useState('')
  const [pendingEmailChange, setPendingEmailChange] = useState('')
  const [playerToReplaceId, setPlayerToReplaceId] = useState<string | null>(
    null,
  )
  const [selectedOnlineGameId, setSelectedOnlineGameId] = useState<
    OnlineGameId | null
  >(null)
  const appSyncConfigured = isAppSyncConfigured()
  const guestOnlineConfigured = isGuestOnlineConfigured()
  const isOnlineMatchVisible =
    room?.status === 'playing' || room?.status === 'finished'
  const isOnlineGameSelected = selectedOnlineGameId !== null
  const currentRoomParticipant = room?.players.find(
    (player) => player.userId === user?.id,
  )
  const isCurrentUserRoomHost = currentRoomParticipant?.isHost === true
  const selectedRoomPlayers =
    room?.players
      .filter((player) => player.isPlaying)
      .sort((left, right) => (left.slot ?? 99) - (right.slot ?? 99)) ?? []

  useEffect(() => {
    let active = true
    if (
      user?.kind !== 'member' ||
      !selectedOnlineGameId ||
      room?.status === 'playing'
    ) {
      setCurrentGameStats(null)
      return () => { active = false }
    }
    void getMyGameStats(selectedOnlineGameId)
      .then((stats) => {
        if (active) setCurrentGameStats(stats)
      })
      .catch(() => {
        if (active) setCurrentGameStats(null)
      })
    return () => { active = false }
  }, [room?.status, selectedOnlineGameId, user?.id, user?.kind])

  useEffect(() => {
    if (
      playerToReplaceId &&
      (!room ||
        !['waiting', 'ready'].includes(room.status) ||
        !room.players.some(
          (player) =>
            player.userId === playerToReplaceId && player.isPlaying,
        ))
    ) {
      setPlayerToReplaceId(null)
    }
  }, [playerToReplaceId, room])

  useEffect(() => {
    let isActive = true
    const storedUser = loadPrototypeUser()

    if (storedUser?.kind === 'guest') {
      if (!guestOnlineConfigured) {
        setUser(storedUser)
        setNotice(
          '현재 게스트 온라인 플레이를 이용할 수 없습니다.',
        )
        setIsRestoringSession(false)
        return () => {
          isActive = false
        }
      }

      void createOnlineGuestUser(storedUser.nickname)
        .then((restoredGuest) => {
          if (isActive) {
            persistPrototypeUser(restoredGuest)
            setUser(restoredGuest)
          }
        })
        .catch((error) => {
          if (isActive) {
            clearPrototypeUser()
            setUser(null)
            setAuthView('guest')
            setAuthError(
              error instanceof Error
                ? error.message
                : '게스트 접속 정보를 복원하지 못했습니다.',
            )
          }
        })
        .finally(() => {
          if (isActive) {
            setIsRestoringSession(false)
          }
        })

      return () => {
        isActive = false
      }
    }

    if (storedUser?.kind === 'member') {
      clearPrototypeUser()
    }

    void (async () => {
      const restoredUser = await restoreMemberSession()

      if (!isActive) {
        return
      }

      if (restoredUser?.kind === 'member' && appSyncConfigured) {
        try {
          setUser(await ensureOnlineProfile(restoredUser.nickname))
        } catch (error) {
          setUser(restoredUser)
          setNotice(
            error instanceof Error
              ? error.message
              : '회원 프로필을 불러오지 못했습니다.',
          )
        }
      } else {
        setUser(restoredUser)
      }

      setIsRestoringSession(false)
    })()

    return () => {
      isActive = false
    }
  }, [appSyncConfigured, guestOnlineConfigured])

  useEffect(() => {
    if (
      !appSyncConfigured ||
      !user ||
      !room ||
      room.status === 'cancelled'
    ) {
      return
    }

    const intervalId = window.setInterval(() => {
      void getOnlineRoom(room.code)
        .then((latestRoom) => {
          setRoom((currentRoom) =>
            currentRoom?.code === latestRoom.code ? latestRoom : currentRoom,
          )
        })
        .catch(() => {
          // 일시적인 네트워크 오류는 다음 폴링에서 다시 시도합니다.
        })
    }, 2500)

    return () => window.clearInterval(intervalId)
  }, [appSyncConfigured, room, user])

  const selectAuthView = (view: Exclude<AuthView, 'confirm'>) => {
    setAuthView(view)
    setAuthNotice('')
    setAuthError('')
  }

  const submitMemberAuth = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const email = String(formData.get('email') ?? '').trim().toLowerCase()
    const password = String(formData.get('password') ?? '')

    setIsAuthSubmitting(true)
    setAuthError('')
    setAuthNotice('')

    try {
      if (authView === 'signup') {
        const nickname = String(formData.get('nickname') ?? '').trim()
        const result = await signUpMember({ email, password, nickname })

        if (result.userConfirmed) {
          setPendingEmail(result.email)
          setAuthView('login')
          setAuthNotice('회원가입이 완료되었습니다. 로그인해주세요.')
          return
        }

        setPendingEmail(result.email)
        setAuthView('confirm')
        setAuthNotice(
          result.destination
            ? `${result.destination}로 보낸 인증 코드를 입력해주세요.`
            : '이메일로 보낸 인증 코드를 입력해주세요.',
        )
        return
      }

      const signedInMember = await signInMember(email, password)
      const member = appSyncConfigured
        ? await ensureOnlineProfile(signedInMember.nickname)
        : signedInMember
      clearPrototypeUser()
      setUser(member)
      setPendingEmail('')
      setNotice('')
    } catch (error) {
      if (isCognitoError(error, 'UserNotConfirmedException')) {
        setPendingEmail(email)
        setAuthView('confirm')
      }

      setAuthError(getCognitoErrorMessage(error))
    } finally {
      setIsAuthSubmitting(false)
    }
  }

  const submitConfirmationCode = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const code = String(formData.get('code') ?? '').trim()

    setIsAuthSubmitting(true)
    setAuthError('')

    try {
      await confirmMemberRegistration(pendingEmail, code)
      setAuthView('login')
      setAuthNotice('이메일 인증이 완료되었습니다. 이제 로그인해주세요.')
    } catch (error) {
      setAuthError(getCognitoErrorMessage(error))
    } finally {
      setIsAuthSubmitting(false)
    }
  }

  const resendConfirmationCode = async () => {
    setIsAuthSubmitting(true)
    setAuthError('')

    try {
      const destination = await resendMemberConfirmationCode(pendingEmail)
      setAuthNotice(
        destination
          ? `${destination}로 새 인증 코드를 보냈습니다.`
          : '새 인증 코드를 이메일로 보냈습니다.',
      )
    } catch (error) {
      setAuthError(getCognitoErrorMessage(error))
    } finally {
      setIsAuthSubmitting(false)
    }
  }

  const submitPasswordResetRequest = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const email = String(formData.get('email') ?? '').trim().toLowerCase()

    setIsAuthSubmitting(true)
    setAuthError('')
    setAuthNotice('')

    try {
      const destination = await requestMemberPasswordReset(email)
      setPendingEmail(email)
      setAuthView('reset')
      setAuthNotice(
        destination
          ? `${destination}로 비밀번호 재설정 코드를 보냈습니다.`
          : '이메일로 비밀번호 재설정 코드를 보냈습니다.',
      )
    } catch (error) {
      setAuthError(getCognitoErrorMessage(error))
    } finally {
      setIsAuthSubmitting(false)
    }
  }

  const submitPasswordReset = async (
    event: FormEvent<HTMLFormElement>,
  ) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const code = String(formData.get('code') ?? '').trim()
    const newPassword = String(formData.get('newPassword') ?? '')

    setIsAuthSubmitting(true)
    setAuthError('')

    try {
      await confirmMemberPasswordReset(pendingEmail, code, newPassword)
      setAuthView('login')
      setAuthNotice(
        '비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요.',
      )
    } catch (error) {
      setAuthError(getCognitoErrorMessage(error))
    } finally {
      setIsAuthSubmitting(false)
    }
  }

  const enterAsGuest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const nickname = String(formData.get('nickname') ?? '').trim()

    if (!nickname) {
      return
    }

    setIsAuthSubmitting(true)
    setAuthError('')

    try {
      if (!guestOnlineConfigured) {
        throw new Error(
          '현재 게스트 온라인 플레이를 이용할 수 없습니다.',
        )
      }

      const nextUser = await createOnlineGuestUser(nickname)
      persistPrototypeUser(nextUser)
      setUser(nextUser)
      setNotice('')
    } catch (error) {
      setAuthError(
        error instanceof Error
          ? error.message
          : '게스트로 접속하지 못했습니다.',
      )
    } finally {
      setIsAuthSubmitting(false)
    }
  }

  const createRoom = async () => {
    if (!user) {
      return
    }

    setIsLobbySubmitting(true)
    setNotice('')

    try {
      if (!selectedOnlineGameId) return
      const nextRoom = await createOnlineRoom(
        selectedOnlineGameId,
        user.kind === 'guest' ? user.nickname : undefined,
      )
      setSelectedOnlineGameId(nextRoom.gameId)
      setRoom(nextRoom)
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : '게임방을 만들지 못했습니다.',
      )
    } finally {
      setIsLobbySubmitting(false)
    }
  }

  const joinRoom = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (joinCode.length !== 6) {
      setNotice('방 코드는 6자리로 입력해주세요.')
      return
    }

    if (!user) {
      return
    }

    setIsLobbySubmitting(true)
    setNotice('')

    try {
      const nextRoom = await joinOnlineRoom(
          joinCode,
          user.kind === 'guest' ? user.nickname : undefined,
        )
      setSelectedOnlineGameId(nextRoom.gameId)
      setRoom(nextRoom)
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : '게임방에 참가하지 못했습니다.',
      )
    } finally {
      setIsLobbySubmitting(false)
    }
  }

  const joinRoomByInvitation = async (roomCode: string) => {
    if (!user || room) {
      return
    }
    setIsLobbySubmitting(true)
    setNotice('')
    try {
      const nextRoom = await joinOnlineRoom(roomCode)
      setSelectedOnlineGameId(nextRoom.gameId)
      setRoom(nextRoom)
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : '초대받은 방에 참가하지 못했습니다.',
      )
    } finally {
      setIsLobbySubmitting(false)
    }
  }

  const leaveOnline = () => {
    if (user?.kind === 'member') {
      signOutMember()
    } else {
      clearGuestAwsSession()
    }

    clearPrototypeUser()
    setUser(null)
    setRoom(null)
    setSelectedOnlineGameId(null)
    setJoinCode('')
    setNotice('')
  }

  const deleteMemberAccount = async () => {
    setIsDeletingAccount(true)

    try {
      if (appSyncConfigured) {
        await deleteOnlineProfile()
      }
      await deleteCurrentMember()
      clearPrototypeUser()
      setRoom(null)
      setUser(null)
      setSelectedOnlineGameId(null)
      setShowAccountDeletion(false)
      setJoinCode('')
      setNotice('')
    } catch (error) {
      setShowAccountDeletion(false)
      setNotice(getCognitoErrorMessage(error))
    } finally {
      setIsDeletingAccount(false)
    }
  }

  const saveMemberNickname = async (nickname: string) => {
    if (!nickname) {
      return
    }

    setIsLobbySubmitting(true)
    setProfileError('')
    setProfileNotice('')

    try {
      setUser(await updateOnlineNickname(nickname))
      setProfileNotice('닉네임이 변경되었습니다.')
    } catch (error) {
      setProfileError(
        error instanceof Error ? error.message : '닉네임을 변경하지 못했습니다.',
      )
    } finally {
      setIsLobbySubmitting(false)
    }
  }

  const requestEmailChange = async (email: string) => {
    setIsLobbySubmitting(true)
    setProfileError('')
    setProfileNotice('')

    try {
      await requestMemberEmailChange(email)
      setPendingEmailChange(email)
      setProfileNotice(`${email}로 인증 코드를 보냈습니다.`)
    } catch (error) {
      setProfileError(getCognitoErrorMessage(error))
      throw error
    } finally {
      setIsLobbySubmitting(false)
    }
  }

  const confirmEmailChange = async (code: string) => {
    setIsLobbySubmitting(true)
    setProfileError('')
    setProfileNotice('')

    try {
      await confirmMemberEmailChange(code)
      signOutMember()
      clearPrototypeUser()
      setUser(null)
      setRoom(null)
      setSelectedOnlineGameId(null)
      setShowMemberProfile(false)
      setAuthView('login')
      setPendingEmail(pendingEmailChange)
      setAuthNotice(
        '이메일 변경이 완료되었습니다. 새 이메일로 다시 로그인해주세요.',
      )
    } catch (error) {
      setProfileError(getCognitoErrorMessage(error))
      throw error
    } finally {
      setIsLobbySubmitting(false)
    }
  }

  const returnToLobby = () => {
    setRoom(null)
    setNotice('')

    if (user?.kind === 'member') {
      void getOnlineProfile()
        .then(setUser)
        .catch(() => {
          // 다음 로그인 또는 화면 새로고침에서 최신 전적을 다시 불러옵니다.
        })
    }
  }

  const openMatchHistory = () => {
    if (user?.kind !== 'member') {
      return
    }

    void getOnlineProfile()
      .then((profile) => {
        setUser(profile)
        setShowMatchHistory(true)
      })
      .catch((error) => {
        setNotice(
          error instanceof Error
            ? error.message
            : '회원 전적을 불러오지 못했습니다.',
        )
      })
  }

  const exitWaitingRoom = async () => {
    if (!room || !user) {
      setRoom(null)
      return
    }

    setIsLobbySubmitting(true)

    try {
      await leaveOnlineRoom(room)
      setRoom(null)
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : '게임방에서 나가지 못했습니다.',
      )
    } finally {
      setIsLobbySubmitting(false)
    }
  }

  const toggleReady = async () => {
    if (!room || !user) {
      return
    }

    const currentPlayer = room.players.find(
      (player) => player.userId === user.id,
    )

    if (!currentPlayer) {
      return
    }

    setIsLobbySubmitting(true)

    try {
      setRoom(await setOnlineReady(room, !currentPlayer.isReady))
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : '준비 상태를 변경하지 못했습니다.',
      )
    } finally {
      setIsLobbySubmitting(false)
    }
  }

  const toggleSelectedPlayer = async (userId: string) => {
    if (!room || !isCurrentUserRoomHost) {
      return
    }

    const currentIds = selectedRoomPlayers.map((player) => player.userId)
    const isCurrentlyPlaying = currentIds.includes(userId)
    const minimumPlayerCount = Math.min(2, room.players.length)
    let nextIds: string[]

    if (isCurrentlyPlaying && currentIds.length <= minimumPlayerCount) {
      if (playerToReplaceId === userId) {
        setPlayerToReplaceId(null)
        setNotice('플레이어 교체 선택을 취소했습니다.')
        return
      }

      if (room.players.length < 2) {
        setNotice(
          '플레이어는 최소 2명이어야 하므로 현재 플레이어를 관전자로 변경할 수 없습니다.',
        )
        return
      }

      setPlayerToReplaceId(userId)
      setNotice(
        '플레이어는 최소 2명이어야 하므로 바로 관전자로 변경할 수 없습니다. 교체할 관전자를 선택해주세요.',
      )
      return
    }

    if (!isCurrentlyPlaying && currentIds.length >= 2) {
      if (!playerToReplaceId || !currentIds.includes(playerToReplaceId)) {
        setNotice(
          '현재 플레이어가 2명입니다. 먼저 교체할 플레이어의 관전자로 변경 버튼을 눌러주세요.',
        )
        return
      }

      nextIds = currentIds.map((id) =>
        id === playerToReplaceId ? userId : id,
      )
    } else {
      nextIds = isCurrentlyPlaying
        ? currentIds.filter((id) => id !== userId)
        : [...currentIds, userId]
    }

    if (nextIds.length < minimumPlayerCount || nextIds.length > 2) {
      setNotice('게임 플레이어는 최소 2명, 최대 2명이어야 합니다.')
      return
    }

    setIsLobbySubmitting(true)
    setNotice('')
    try {
      setRoom(await selectOnlinePlayers(room, nextIds))
      setPlayerToReplaceId(null)
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : '플레이어를 선택하지 못했습니다.',
      )
    } finally {
      setIsLobbySubmitting(false)
    }
  }

  const updateRpsRule = async (patch: Partial<RpsSettings>) => {
    if (!room?.rpsSettings || !isCurrentUserRoomHost) return
    setIsLobbySubmitting(true)
    setNotice('')
    try {
      setRoom(await updateOnlineRpsSettings(room, {
        ...room.rpsSettings,
        ...patch,
      }))
      setNotice('규칙을 변경했습니다. 참가자들은 다시 준비해 주세요.')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '규칙을 변경하지 못했습니다.')
    } finally {
      setIsLobbySubmitting(false)
    }
  }

  const startGame = async () => {
    if (!room || !user) {
      return
    }

    setIsLobbySubmitting(true)

    try {
      setRoom(await startOnlineGame(room))
      setNotice('온라인 게임 상태가 시작되었습니다.')
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : '게임을 시작하지 못했습니다.',
      )
    } finally {
      setIsLobbySubmitting(false)
    }
  }

  return (
    <main
      className={`page online-page ${
        isOnlineMatchVisible ? 'online-game-page' : ''
      }`}
    >
      {showAccountDeletion && (
        <AccountDeletionDialog
          isSubmitting={isDeletingAccount}
          onCancel={() => setShowAccountDeletion(false)}
          onConfirm={deleteMemberAccount}
        />
      )}
      {showMemberProfile && user?.kind === 'member' && (
        <MemberProfileDialog
          user={user}
          isSubmitting={isLobbySubmitting}
          errorMessage={profileError}
          noticeMessage={profileNotice}
          onClose={() => {
            setShowMemberProfile(false)
            setProfileError('')
            setProfileNotice('')
          }}
          onSaveNickname={saveMemberNickname}
          onRequestEmailChange={requestEmailChange}
          onConfirmEmailChange={confirmEmailChange}
        />
      )}
      {showMatchHistory && user?.kind === 'member' && (
        <MatchHistoryDialog
          initialGameId={selectedOnlineGameId ?? 'yacht-dice'}
          onClose={() => setShowMatchHistory(false)}
        />
      )}

      <header className="site-header">
        {room?.status === 'playing' ? (
          <>
            <span className="brand">MiniGameJoin</span>
            <span className="back-link">온라인 게임 진행 중</span>
          </>
        ) : (
          <>
            <Link className="brand" to="/">
              MiniGameJoin
            </Link>
            {isOnlineGameSelected && !room ? (
              <button
                className="back-link header-back-button"
                type="button"
                onClick={() => {
                  setSelectedOnlineGameId(null)
                  setNotice('')
                }}
              >
                ← 온라인 게임 목록
              </button>
            ) : (
              <Link className="back-link" to="/">
                ← 플레이 방식
              </Link>
            )}
          </>
        )}
      </header>

      {!isOnlineMatchVisible && (
        <>
          <section className="online-heading">
            <div>
              <p className="eyebrow">ONLINE MULTIPLAYER</p>
              <h1>
                {selectedOnlineGameId === 'yacht-dice'
                  ? 'Yacht Dice 온라인 로비'
                  : selectedOnlineGameId === 'rock-paper-scissors'
                    ? '가위바위보 온라인 로비'
                    : '웹 멀티플레이'}
              </h1>
              <p>
                {isOnlineGameSelected
                  ? '방을 만들거나 초대 코드로 참가해 친구와 게임을 시작하세요.'
                  : '로그인 또는 게스트 입장 후 플레이할 온라인 게임을 선택하세요.'}
              </p>
            </div>
            <span className="online-status-badge">온라인 플레이 가능</span>
          </section>

        </>
      )}

      {!user ? (
        <section className="auth-shell" aria-labelledby="online-entry-title">
          <div className="auth-copy">
            <span>PLAYER ACCESS</span>
            <h2 id="online-entry-title">온라인 플레이 입장</h2>
            <p>
              회원은 이메일 인증 후 안전하게 로그인하고, 게스트는 가입 없이
              바로 온라인 플레이를 시작할 수 있습니다.
            </p>
          </div>

          <div className="auth-panel">
            {isRestoringSession ? (
              <p className="auth-loading" role="status">
                로그인 상태를 확인하고 있습니다…
              </p>
            ) : (
              <>
                <div
                  className="auth-tabs"
                  role="tablist"
                  aria-label="입장 방식"
                >
                  {(
                    [
                      ['login', '로그인'],
                      ['signup', '회원가입'],
                      ['guest', '게스트'],
                    ] as const
                  ).map(([view, label]) => (
                    <button
                      className={authView === view ? 'auth-tab-active' : ''}
                      type="button"
                      role="tab"
                      aria-selected={authView === view}
                      key={view}
                      onClick={() => selectAuthView(view)}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {authNotice && (
                  <p className="auth-message" role="status">
                    {authNotice}
                  </p>
                )}
                {authError && (
                  <p className="auth-message auth-error" role="alert">
                    {authError}
                  </p>
                )}

                {authView === 'forgot' ? (
                  <form
                    key="forgot-password-form"
                    className="auth-form"
                    onSubmit={submitPasswordResetRequest}
                  >
                    <div className="confirmation-heading">
                      <strong>비밀번호 찾기</strong>
                      <p>가입한 이메일로 재설정 코드를 보내드립니다.</p>
                    </div>
                    <label>
                      이메일
                      <input
                        name="email"
                        type="email"
                        autoComplete="email"
                        defaultValue={pendingEmail}
                        placeholder="player@example.com"
                        required
                        autoFocus
                      />
                    </label>
                    <button type="submit" disabled={isAuthSubmitting}>
                      {isAuthSubmitting
                        ? '코드 전송 중…'
                        : '재설정 코드 받기'}
                    </button>
                    <button
                      className="auth-text-button"
                      type="button"
                      onClick={() => selectAuthView('login')}
                    >
                      로그인으로 돌아가기
                    </button>
                  </form>
                ) : authView === 'reset' ? (
                  <form
                    key="reset-password-form"
                    className="auth-form"
                    onSubmit={submitPasswordReset}
                  >
                    <div className="confirmation-heading">
                      <strong>새 비밀번호 설정</strong>
                      <p>{pendingEmail}</p>
                    </div>
                    <label>
                      재설정 코드
                      <input
                        name="code"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        placeholder="이메일로 받은 6자리 코드"
                        required
                        autoFocus
                      />
                    </label>
                    <label>
                      새 비밀번호
                      <input
                        name="newPassword"
                        type="password"
                        minLength={8}
                        autoComplete="new-password"
                        placeholder="8자 이상"
                        required
                      />
                    </label>
                    <button type="submit" disabled={isAuthSubmitting}>
                      {isAuthSubmitting
                        ? '변경 중…'
                        : '비밀번호 변경'}
                    </button>
                    <button
                      className="auth-text-button"
                      type="button"
                      onClick={() => setAuthView('forgot')}
                    >
                      코드 다시 받기
                    </button>
                  </form>
                ) : authView === 'confirm' ? (
                  <form
                    key="confirmation-form"
                    className="auth-form"
                    onSubmit={submitConfirmationCode}
                  >
                    <div className="confirmation-heading">
                      <strong>이메일 인증</strong>
                      <p>{pendingEmail}</p>
                    </div>
                    <label>
                      인증 코드
                      <input
                        name="code"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        placeholder="이메일로 받은 6자리 코드"
                        required
                        autoFocus
                      />
                    </label>
                    <button type="submit" disabled={isAuthSubmitting}>
                      {isAuthSubmitting ? '확인 중…' : '인증 완료'}
                    </button>
                    <div className="confirmation-actions">
                      <button
                        type="button"
                        disabled={isAuthSubmitting}
                        onClick={resendConfirmationCode}
                      >
                        인증 코드 다시 받기
                      </button>
                      <button
                        type="button"
                        onClick={() => selectAuthView('login')}
                      >
                        로그인으로 돌아가기
                      </button>
                    </div>
                  </form>
                ) : authView === 'guest' ? (
              <form
                key="guest-form"
                className="auth-form"
                onSubmit={enterAsGuest}
              >
                <label>
                  닉네임
                  <input
                    name="nickname"
                    type="text"
                    maxLength={16}
                    placeholder="게임에서 사용할 이름"
                    required
                  />
                </label>
                <button type="submit" disabled={isAuthSubmitting}>
                  {isAuthSubmitting ? '연결 중…' : '게스트로 계속'}
                </button>
              </form>
            ) : (
              <form
                key={`member-${authView}`}
                className="auth-form"
                onSubmit={submitMemberAuth}
              >
                {authView === 'signup' && (
                  <label>
                    닉네임
                    <input
                      name="nickname"
                      type="text"
                      maxLength={16}
                      placeholder="게임에서 사용할 이름"
                      required
                    />
                  </label>
                )}
                <label>
                  이메일
                  <input
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="player@example.com"
                    defaultValue={pendingEmail}
                    required
                  />
                </label>
                <label>
                  비밀번호
                  <input
                    name="password"
                    type="password"
                    minLength={8}
                    autoComplete={
                      authView === 'signup'
                        ? 'new-password'
                        : 'current-password'
                    }
                    placeholder="8자 이상"
                    required
                  />
                </label>
                <button type="submit" disabled={isAuthSubmitting}>
                  {isAuthSubmitting
                    ? '처리 중…'
                    : authView === 'signup'
                      ? '인증 코드 받기'
                      : '로그인'}
                </button>
                {authView === 'login' && (
                  <button
                    className="auth-text-button"
                    type="button"
                    onClick={() => {
                      setAuthView('forgot')
                      setAuthError('')
                      setAuthNotice('')
                    }}
                  >
                    비밀번호를 잊으셨나요?
                  </button>
                )}
              </form>
                )}
              </>
            )}
          </div>
        </section>
      ) : !isOnlineGameSelected ? (
        <section className="online-game-catalog">
          <div className="lobby-profile">
            <div>
              <span>
                {user.kind === 'member' ? 'MEMBER' : 'GUEST'} PLAYER
              </span>
              <h2>{user.nickname}</h2>
              <p>
                {user.kind === 'member'
                  ? user.email
                  : '이번 접속에서만 사용하는 게스트 프로필'}
              </p>
            </div>
            <div className="profile-actions">
              <button type="button" onClick={leaveOnline}>
                {user.kind === 'member' ? '로그아웃' : '게스트 나가기'}
              </button>
            </div>
          </div>

          <div className="section-title">
            <h2>온라인 게임 목록</h2>
            <span>2개 플레이 가능 · 1개 준비 중</span>
          </div>

          <div className="game-grid">
            <button
              className="game-card game-card-ready online-game-card"
              type="button"
              onClick={() => {
                setSelectedOnlineGameId('yacht-dice')
                setNotice('')
              }}
            >
              <span className="game-icon" aria-hidden="true">
                ⚄
              </span>
              <div>
                <span className="badge">실시간 온라인</span>
                <h3>Yacht Dice</h3>
                <p>
                  방을 만들고 친구를 초대하거나 코드로 참가해 온라인으로
                  플레이합니다.
                </p>
              </div>
              <strong>온라인 로비 입장 →</strong>
            </button>

            <button
              className="game-card game-card-ready online-game-card"
              type="button"
              onClick={() => {
                setSelectedOnlineGameId('rock-paper-scissors')
                setNotice('')
              }}
            >
              <span className="game-icon" aria-hidden="true">
                ✌
              </span>
              <div>
                <span className="badge">2~6명 실시간</span>
                <h3>가위바위보</h3>
                <p>
                  토너먼트 또는 전체 난투전으로 동시에 손을 골라 승부합니다.
                </p>
              </div>
              <strong>온라인 로비 입장 →</strong>
            </button>

            <article className="game-card game-card-soon">
              <span className="game-icon" aria-hidden="true">
                ?
              </span>
              <div>
                <span className="badge">준비 중</span>
                <h3>스피드 퀴즈</h3>
                <p>
                  친구와 제한 시간 안에 문제를 맞히는 온라인 퀴즈 게임입니다.
                </p>
              </div>
              <strong>추후 제공 예정</strong>
            </article>
          </div>
        </section>
      ) : room && isOnlineMatchVisible ? (
        room.gameId === 'rock-paper-scissors' ? (
          <OnlineRpsGame
            room={room}
            user={user}
            onRoomChange={setRoom}
            onReturnToLobby={returnToLobby}
          />
        ) : (
          <OnlineYachtGame
            room={room}
            user={user}
            onRoomChange={setRoom}
            onReturnToLobby={returnToLobby}
          />
        )
      ) : room ? (
        <section
          className={`room-waiting ${
            room.gameId === 'rock-paper-scissors' ? 'room-waiting-rps' : ''
          }`}
        >
          <div className="room-code-block">
            <span>ROOM CODE</span>
            <strong>{room.code}</strong>
            <p>이 코드를 친구에게 공유해 같은 게임방에 입장하세요.</p>
            {isAndroidNativeApp() && (
              <button
                className="native-share-invite-button"
                type="button"
                onClick={() => shareAndroidInvite(room.code)}
              >
                Android로 초대 공유
              </button>
            )}
          </div>

          {room.gameId === 'rock-paper-scissors' && room.rpsSettings && (
            <div className="rps-settings-card">
              <div className="room-members-heading">
                <div>
                  <p className="eyebrow">GAME RULES</p>
                  <h2>가위바위보 규칙</h2>
                </div>
                <span>{isCurrentUserRoomHost ? '방장 설정' : '규칙 확인'}</span>
              </div>
              <div className="rps-settings-grid">
                <label>
                  게임 방식
                  <select
                    value={room.rpsSettings.mode}
                    disabled={!isCurrentUserRoomHost || isLobbySubmitting}
                    onChange={(event) => void updateRpsRule({
                      mode: event.target.value as RpsSettings['mode'],
                    })}
                  >
                    <option value="tournament">1:1 토너먼트</option>
                    <option value="all-play">전체 난투전</option>
                  </select>
                </label>
                <label>
                  선택 제한시간
                  <select
                    value={room.rpsSettings.timeLimitSeconds}
                    disabled={!isCurrentUserRoomHost || isLobbySubmitting}
                    onChange={(event) => void updateRpsRule({
                      timeLimitSeconds: Number(event.target.value) as RpsSettings['timeLimitSeconds'],
                    })}
                  >
                    {[5, 10, 15, 20].map((seconds) => (
                      <option value={seconds} key={seconds}>{seconds}초</option>
                    ))}
                  </select>
                </label>
                <label>
                  {room.rpsSettings.mode === 'tournament' ? '경기 승리 조건' : '플레이어 생명'}
                  <select
                    value={room.rpsSettings.winsRequired}
                    disabled={!isCurrentUserRoomHost || isLobbySubmitting}
                    onChange={(event) => void updateRpsRule({
                      winsRequired: Number(event.target.value) as RpsSettings['winsRequired'],
                    })}
                  >
                    {[1, 2, 3].map((count) => (
                      <option value={count} key={count}>
                        {room.rpsSettings?.mode === 'tournament'
                          ? `${count}승 선취`
                          : `${count}개`}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  방 정원
                  <select
                    value={room.rpsSettings.maxPlayers}
                    disabled={!isCurrentUserRoomHost || isLobbySubmitting}
                    onChange={(event) => void updateRpsRule({
                      maxPlayers: Number(event.target.value) as RpsSettings['maxPlayers'],
                    })}
                  >
                    {[2, 3, 4, 5, 6].map((count) => (
                      <option value={count} key={count}>{count}명</option>
                    ))}
                  </select>
                </label>
              </div>
              <p>
                시간 안에 고르지 않으면 자동으로 무작위 손이 선택됩니다.
                규칙을 바꾸면 모든 참가자의 준비가 해제됩니다.
              </p>
            </div>
          )}

          <div className="room-members">
            <div className="room-members-heading">
              <h2>참가자</h2>
              <span>{room.players.length} / {room.maxPlayers}</span>
            </div>
            <p className="room-role-guide">
              {room.gameId === 'rock-paper-scissors'
                ? '게임 시작 전 참가자는 모두 플레이합니다. 진행 중 들어온 참가자는 현재 게임을 관전합니다.'
                : '방장과 첫 입장자는 자동으로 플레이어가 되고, 이후 참가자는 관전합니다. 진행 중 입장한 참가자는 현재 경기에서 관전자로 고정됩니다.'}
            </p>
            <div className="room-member-grid">
              {Array.from({ length: room.maxPlayers }, (_, index) => {
                const participant = room.players[index]
                if (!participant) {
                  return (
                    <div className="room-member room-member-empty" key={index}>
                      <span>{index + 1}번 자리</span>
                      <strong>참가자를 기다리는 중</strong>
                      <small>초대 코드로 참가</small>
                    </div>
                  )
                }

                return (
                  <div
                    className={`room-member ${
                      participant.isPlaying
                        ? 'room-member-playing'
                        : 'room-member-spectating'
                    } ${
                      participant.userId === playerToReplaceId
                        ? 'room-member-replacement'
                        : ''
                    }`}
                    key={participant.userId}
                  >
                    <span>
                      {participant.isHost ? '방장 · ' : ''}
                      {participant.isPlaying
                        ? `${participant.slot ?? '-'}P`
                        : '관전자'}
                    </span>
                    <strong>{participant.nickname}</strong>
                    <small>
                      {participant.isPlaying
                        ? participant.isReady
                          ? '준비 완료'
                          : '준비 중'
                        : '관전 대기'}
                    </small>
                    {isCurrentUserRoomHost && room.gameId === 'yacht-dice' && (
                      <button
                        type="button"
                        disabled={isLobbySubmitting}
                        onClick={() =>
                          void toggleSelectedPlayer(participant.userId)
                        }
                      >
                        {participant.isPlaying
                          ? participant.userId === playerToReplaceId
                            ? '교체 선택 취소'
                            : '관전자로 변경'
                          : playerToReplaceId
                            ? '이 플레이어로 교체'
                            : '플레이어로 선택'}
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {user.kind === 'member' && (
            <FriendsPanel
              user={user}
              roomCode={room.code}
              canInvite={isCurrentUserRoomHost}
            />
          )}

          <div className="lobby-chat-section">
            <h2>대기실 채팅</h2>
            <p>게임이 시작되면 이 대화는 게임 채팅으로 넘어가지 않습니다.</p>
            <OnlineChatPanel
              roomCode={room.code}
              channel="lobby"
              user={user}
              isOpen
              onClose={() => undefined}
              onUnreadChange={() => undefined}
            />
          </div>

          <div className="room-actions">
            <button
              className="secondary-action"
              type="button"
              disabled={isLobbySubmitting || room.status === 'playing'}
              onClick={exitWaitingRoom}
            >
              방 나가기
            </button>
            {room.players.find((player) => player.userId === user.id)
              ?.isHost ? (
              <button
                type="button"
                disabled={
                  isLobbySubmitting ||
                  room.status === 'playing' ||
                  (room.gameId === 'yacht-dice'
                    ? selectedRoomPlayers.length !== 2
                    : selectedRoomPlayers.length < 2) ||
                  !selectedRoomPlayers.every((player) => player.isReady)
                }
                onClick={startGame}
              >
                {room.status === 'playing' ? '게임 진행 중' : '게임 시작'}
              </button>
            ) : currentRoomParticipant?.isPlaying ? (
              <button
                type="button"
                disabled={isLobbySubmitting || room.status === 'playing'}
                onClick={toggleReady}
              >
                {room.players.find((player) => player.userId === user.id)
                  ?.isReady
                  ? '준비 취소'
                  : '준비 완료'}
              </button>
            ) : (
              <span className="spectator-ready-note">
                관전자는 준비할 필요가 없습니다.
              </span>
            )}
          </div>

          {notice && (
            <p className="lobby-notice" role="status">
              {notice}
            </p>
          )}
        </section>
      ) : (
        <section className="lobby-shell">
          <div className="lobby-profile">
            <div>
              <span>
                {user.kind === 'member' ? 'MEMBER' : 'GUEST'} PLAYER
              </span>
              <h2>{user.nickname}</h2>
              <p>
                {user.kind === 'member'
                  ? user.email
                  : '이번 접속에서만 사용하는 게스트 프로필'}
              </p>
            </div>
            <div className="profile-actions">
              {user.kind === 'member' && (
                <>
                  <button
                    type="button"
                    onClick={() => setShowMemberProfile(true)}
                  >
                    회원정보 수정
                  </button>
                  <button
                    type="button"
                    onClick={openMatchHistory}
                  >
                    전적 상세
                  </button>
                  <button
                    className="delete-account-button"
                    type="button"
                    onClick={() => setShowAccountDeletion(true)}
                  >
                    회원탈퇴
                  </button>
                </>
              )}
              <button type="button" onClick={leaveOnline}>
                {user.kind === 'member' ? '로그아웃' : '게스트 나가기'}
              </button>
            </div>
          </div>

          {user.kind === 'member' ? currentGameStats ? (
            <section className="member-stats" aria-label={`${selectedOnlineGameId} 회원 전적`}>
              <div>
                <span>승리</span>
                <strong>{currentGameStats.wins}</strong>
              </div>
              <div>
                <span>패배</span>
                <strong>{currentGameStats.losses}</strong>
              </div>
              <div>
                <span>무승부</span>
                <strong>{currentGameStats.draws}</strong>
              </div>
              <div>
                <span>승률</span>
                <strong>{currentGameStats.winRate}%</strong>
              </div>
            </section>
          ) : (
            <p className="guest-stats-notice">게임별 전적을 불러오는 중…</p>
          ) : (
            <p className="guest-stats-notice">
              게스트 경기 결과는 계정 전적에 저장되지 않습니다.
            </p>
          )}

          {user.kind === 'member' && (
            <FriendsPanel
              user={user}
              onJoinInvitedRoom={(roomCode) =>
                void joinRoomByInvitation(roomCode)
              }
            />
          )}

          <div className="lobby-actions-grid">
            <article className="lobby-action-card">
              <span aria-hidden="true">＋</span>
              <h2>새 게임방 만들기</h2>
              <p>방장이 되어 친구를 기다리고 초대 코드를 공유합니다.</p>
              <button
                type="button"
                disabled={
                  isLobbySubmitting ||
                  !appSyncConfigured ||
                  (user.kind === 'guest' && !guestOnlineConfigured)
                }
                onClick={createRoom}
              >
                {isLobbySubmitting ? '처리 중…' : '방 만들기'}
              </button>
            </article>

            <article className="lobby-action-card">
              <span aria-hidden="true">#</span>
              <h2>초대 코드로 참가</h2>
              <p>
                친구에게 받은 6자리 코드를 입력합니다. 진행 중인 게임에는
                관전자로 참가합니다.
              </p>
              <form className="join-room-form" onSubmit={joinRoom}>
                <input
                  type="text"
                  lang="en"
                  inputMode="text"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  value={joinCode}
                  maxLength={6}
                  pattern="[A-Za-z0-9]{6}"
                  aria-label="6자리 방 코드"
                  placeholder="ABC123"
                  onChange={(event) =>
                    setJoinCode(normalizeRoomCodeInput(event.target.value))
                  }
                />
                <button
                  type="submit"
                  disabled={
                    isLobbySubmitting ||
                    !appSyncConfigured ||
                    (user.kind === 'guest' && !guestOnlineConfigured)
                  }
                >
                  방 참가
                </button>
              </form>
            </article>
          </div>

          {notice && (
            <p className="lobby-notice" role="status">
              {notice}
            </p>
          )}
        </section>
      )}
    </main>
  )
}

export default YachtOnlinePage
