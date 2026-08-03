import { type CSSProperties, useEffect, useMemo, useRef, useState } from 'react'
import {
  playRpsHandSound,
  playRpsSound,
  setRpsMusic,
  stopRpsMusic,
  unlockRpsAudio,
} from '../../audio/rpsAudio'
import { isAndroidNativeApp, shareAndroidInvite } from '../../platform/nativeApp'
import {
  advanceOnlineRpsRound,
  getOnlineRoom,
  leaveOnlineRoom,
  prepareOnlineForfeitOnPageExit,
  prepareOnlineLeaveOnPageExit,
  returnOnlineRoomToWaiting,
  sendOnlineHeartbeat,
  sendOnlineLeaveOnPageExit,
  setOnlineReady,
  startOnlineGame,
  submitOnlineRpsHand,
  updateOnlineRpsSettings,
} from './appSyncApi'
import FriendsPanel from './FriendsPanel'
import OnlineChatPanel from './OnlineChatPanel'
import type { OnlineRoom, OnlineUser, RpsHand, RpsSettings } from './types'

interface OnlineRpsGameProps {
  room: OnlineRoom
  user: OnlineUser
  onRoomChange: (room: OnlineRoom) => void
  onReturnToLobby: () => void
  audioMuted: boolean
  onToggleAudio: () => void
}

const HANDS: Array<{ hand: RpsHand; emoji: string; label: string }> = [
  { hand: 'scissors', emoji: '✌️', label: '가위' },
  { hand: 'rock', emoji: '✊', label: '바위' },
  { hand: 'paper', emoji: '✋', label: '보' },
]

function getRemainingSeconds(deadline?: string | null): number {
  if (!deadline) return 0
  return Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 1000))
}

function OnlineRpsGame({
  room,
  user,
  onRoomChange,
  onReturnToLobby,
  audioMuted,
  onToggleAudio,
}: OnlineRpsGameProps) {
  const [selectedHand, setSelectedHand] = useState<RpsHand | null>(null)
  const [remainingSeconds, setRemainingSeconds] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [notice, setNotice] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false)
  const advancingVersionRef = useRef<number | null>(null)
  const pageExitRequestRef = useRef<Awaited<ReturnType<typeof prepareOnlineLeaveOnPageExit>>>(null)
  const hasLeftRef = useRef(false)
  const lastCountdownRef = useRef<number | null>(null)
  const lastRevealKeyRef = useRef('')
  const lastFinalKeyRef = useRef('')
  const isWaiting = room.status === 'waiting' || room.status === 'ready'
  const currentParticipant = room.players.find((player) => player.userId === user.id)
  const isHost = currentParticipant?.isHost === true
  const activePlayers = room.players.filter((player) => player.isPlaying)
  const allPlayersReady = activePlayers.length >= 2 && activePlayers.every((player) => player.isReady)
  const currentPlayerIds = room.rpsCurrentPlayerIds ?? []
  const isCurrentPlayer = currentPlayerIds.includes(user.id)
  const hasSubmitted = (room.rpsSubmittedPlayerIds ?? []).includes(user.id)
  const settings = room.rpsSettings
  const isUrgent = room.rpsPhase === 'selecting' && remainingSeconds <= 3
  const timerTotalSeconds = settings?.timeLimitSeconds ?? 10
  const timerProgress = Math.min(1, Math.max(0, remainingSeconds / timerTotalSeconds))
  const timerStyle = {
    '--rps-timer-progress': `${timerProgress * 360}deg`,
  } as CSSProperties
  const playerById = useMemo(
    () => new Map(room.players.map((player) => [player.userId, player])),
    [room.players],
  )

  useEffect(() => {
    hasLeftRef.current = false
  }, [room.code])

  useEffect(() => {
    if (room.rpsPhase === 'selecting' && !hasSubmitted) setSelectedHand(null)
  }, [hasSubmitted, room.rpsPhase, room.rpsRound])

  useEffect(() => {
    if (room.status !== 'playing' || room.rpsPhase !== 'selecting') {
      setRemainingSeconds(0)
      return
    }
    const updateTimer = () => setRemainingSeconds(getRemainingSeconds(room.rpsRoundDeadline))
    updateTimer()
    const intervalId = window.setInterval(updateTimer, 250)
    return () => window.clearInterval(intervalId)
  }, [room.rpsPhase, room.rpsRoundDeadline, room.status])

  useEffect(() => {
    if (audioMuted) {
      stopRpsMusic()
      return
    }
    unlockRpsAudio()
    if (isWaiting) setRpsMusic('lobby')
    else if (room.status === 'finished') setRpsMusic(room.winnerId === user.id ? 'victory' : 'defeat')
    else if (room.rpsPhase === 'selecting') setRpsMusic(isUrgent ? 'urgent' : 'selecting')
    else stopRpsMusic()
    return () => stopRpsMusic()
  }, [audioMuted, isUrgent, isWaiting, room.rpsPhase, room.status, room.winnerId, user.id])

  useEffect(() => {
    if (
      audioMuted || room.status !== 'playing' || room.rpsPhase !== 'selecting' ||
      remainingSeconds < 1 || remainingSeconds > 5 || lastCountdownRef.current === remainingSeconds
    ) return
    lastCountdownRef.current = remainingSeconds
    playRpsSound(remainingSeconds <= 3 ? 'countdown_urgent' : 'countdown')
  }, [audioMuted, remainingSeconds, room.rpsPhase, room.status])

  useEffect(() => {
    if (audioMuted || room.rpsPhase !== 'revealing') return
    const revealKey = `${room.rpsRound}:${(room.rpsRevealedSelections ?? [])
      .map(({ userId, hand }) => `${userId}-${hand}`).join('|')}`
    if (!room.rpsRevealedSelections?.length || lastRevealKeyRef.current === revealKey) return
    lastRevealKeyRef.current = revealKey
    playRpsSound('reveal')
    const resultTimer = window.setTimeout(() => {
      if ((room.rpsRoundWinnerIds?.length ?? 0) === 0) playRpsSound('draw')
      else if (isCurrentPlayer) {
        playRpsSound(room.rpsRoundWinnerIds?.includes(user.id) ? 'round_win' : 'round_lose')
      }
    }, 430)
    return () => window.clearTimeout(resultTimer)
  }, [audioMuted, isCurrentPlayer, room.rpsPhase, room.rpsRevealedSelections, room.rpsRound, room.rpsRoundWinnerIds, user.id])

  useEffect(() => {
    if (audioMuted || room.status !== 'finished' || !room.winnerId) return
    const finalKey = `${room.code}:${room.version}:${room.winnerId}`
    if (lastFinalKeyRef.current === finalKey) return
    lastFinalKeyRef.current = finalKey
    playRpsSound(room.winnerId === user.id ? 'match_win' : 'match_lose')
  }, [audioMuted, room.code, room.status, room.version, room.winnerId, user.id])

  useEffect(() => {
    if (room.status !== 'playing') return
    void sendOnlineHeartbeat(room.code).catch(() => undefined)
    const intervalId = window.setInterval(() => {
      void sendOnlineHeartbeat(room.code).catch(() => undefined)
    }, 25_000)
    return () => window.clearInterval(intervalId)
  }, [room.code, room.status])

  useEffect(() => {
    if (
      room.status !== 'playing' || room.rpsPhase !== 'selecting' ||
      remainingSeconds > 0 || !room.rpsRoundDeadline ||
      new Date(room.rpsRoundDeadline).getTime() > Date.now()
    ) return
    if (advancingVersionRef.current === room.version) return
    advancingVersionRef.current = room.version ?? null
    void advanceOnlineRpsRound(room)
      .then((nextRoom) => {
        if (nextRoom.version === room.version) advancingVersionRef.current = null
        onRoomChange(nextRoom)
      })
      .catch(async () => {
        try { onRoomChange(await getOnlineRoom(room.code)) } catch { /* 다음 조회에서 갱신 */ }
      })
  }, [onRoomChange, remainingSeconds, room])

  useEffect(() => {
    if (!isWaiting && room.status !== 'playing') {
      pageExitRequestRef.current = null
      return
    }
    let active = true
    const prepareRequest = isWaiting
      ? prepareOnlineLeaveOnPageExit(room)
      : prepareOnlineForfeitOnPageExit(room)
    void prepareRequest.then((request) => {
      if (active) pageExitRequestRef.current = request
    }).catch(() => undefined)
    return () => { active = false }
  }, [isWaiting, room])

  useEffect(() => {
    if (!isWaiting && room.status !== 'playing') return
    const leaveOnExit = () => {
      if (!hasLeftRef.current) sendOnlineLeaveOnPageExit(pageExitRequestRef.current)
    }
    window.addEventListener('pagehide', leaveOnExit)
    window.addEventListener('beforeunload', leaveOnExit)
    return () => {
      window.removeEventListener('pagehide', leaveOnExit)
      window.removeEventListener('beforeunload', leaveOnExit)
    }
  }, [isWaiting, room.status])

  useEffect(() => {
    if (!isWaiting) return
    window.history.pushState({ rpsWaitingGuard: room.code }, '', window.location.href)
    const handleBack = () => {
      setShowLeaveConfirm(true)
      window.history.pushState({ rpsWaitingGuard: room.code }, '', window.location.href)
    }
    window.addEventListener('popstate', handleBack)
    return () => window.removeEventListener('popstate', handleBack)
  }, [isWaiting, room.code])

  const runRoomAction = async (action: () => Promise<OnlineRoom>, fallback: string) => {
    setIsSubmitting(true)
    setNotice('')
    try { onRoomChange(await action()) }
    catch (error) { setNotice(error instanceof Error ? error.message : fallback) }
    finally { setIsSubmitting(false) }
  }

  const updateRule = (patch: Partial<RpsSettings>) => {
    if (!settings || !isHost) return
    void runRoomAction(
      () => updateOnlineRpsSettings(room, { ...settings, ...patch }),
      '규칙을 변경하지 못했습니다.',
    )
  }

  const leaveRoom = async () => {
    hasLeftRef.current = true
    setIsSubmitting(true)
    setNotice('')
    try {
      await leaveOnlineRoom(room)
      onReturnToLobby()
    } catch (error) {
      hasLeftRef.current = false
      setNotice(error instanceof Error ? error.message : '게임방에서 나가지 못했습니다.')
    } finally {
      setIsSubmitting(false)
      setShowLeaveConfirm(false)
    }
  }

  const chooseHand = async (hand: RpsHand) => {
    if (!isCurrentPlayer || room.rpsPhase !== 'selecting' || isSubmitting) return
    unlockRpsAudio()
    playRpsHandSound(hand)
    setSelectedHand(hand)
    setIsSubmitting(true)
    setNotice('')
    try {
      let latestRoom = room
      let submittedRoom: OnlineRoom | null = null
      for (let attempt = 0; attempt < 3 && !submittedRoom; attempt += 1) {
        try { submittedRoom = await submitOnlineRpsHand(latestRoom, hand) }
        catch {
          latestRoom = await getOnlineRoom(room.code)
          if (
            latestRoom.status !== 'playing' || latestRoom.rpsPhase !== 'selecting' ||
            !latestRoom.rpsCurrentPlayerIds?.includes(user.id)
          ) submittedRoom = latestRoom
        }
      }
      if (!submittedRoom) throw new Error('동시에 선택한 플레이어가 많습니다. 한 번 더 눌러주세요.')
      onRoomChange(submittedRoom)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '선택을 전송하지 못했습니다.')
      try { onRoomChange(await getOnlineRoom(room.code)) } catch { /* 기존 상태 유지 */ }
    } finally { setIsSubmitting(false) }
  }

  const goToNextTurn = async () => {
    if (!isHost || room.rpsPhase !== 'revealing') return
    await runRoomAction(async () => {
      try { return await advanceOnlineRpsRound(room) }
      catch { return advanceOnlineRpsRound(await getOnlineRoom(room.code)) }
    }, '다음 턴으로 넘어가지 못했습니다.')
  }

  const renderSettings = () => settings && (
    <div className="rps-settings-card">
      <div className="room-members-heading">
        <div><p className="eyebrow">GAME RULES</p><h2>가위바위보 규칙</h2></div>
        <span>{isHost ? '방장 설정' : '규칙 확인'}</span>
      </div>
      <div className="rps-settings-grid">
        <label>게임 방식
          <select value={settings.mode} disabled={!isHost || isSubmitting}
            onChange={(event) => updateRule({ mode: event.target.value as RpsSettings['mode'] })}>
            <option value="tournament">1:1 토너먼트</option>
            <option value="all-play">전체 난투전</option>
          </select>
        </label>
        <label>선택 제한시간
          <select value={settings.timeLimitSeconds} disabled={!isHost || isSubmitting}
            onChange={(event) => updateRule({ timeLimitSeconds: Number(event.target.value) as RpsSettings['timeLimitSeconds'] })}>
            {[5, 10, 15, 20].map((seconds) => <option value={seconds} key={seconds}>{seconds}초</option>)}
          </select>
        </label>
        <label>{settings.mode === 'tournament' ? '경기 승리 조건' : '플레이어 생명'}
          <select value={settings.winsRequired} disabled={!isHost || isSubmitting}
            onChange={(event) => updateRule({ winsRequired: Number(event.target.value) as RpsSettings['winsRequired'] })}>
            {[1, 2, 3].map((count) => <option value={count} key={count}>{settings.mode === 'tournament' ? `${count}승 선취` : `${count}개`}</option>)}
          </select>
        </label>
        <label>방 정원
          <select value={settings.maxPlayers} disabled={!isHost || isSubmitting}
            onChange={(event) => updateRule({ maxPlayers: Number(event.target.value) as RpsSettings['maxPlayers'] })}>
            {[2, 3, 4, 5, 6].map((count) => <option value={count} key={count}>{count}명</option>)}
          </select>
        </label>
      </div>
      <p>시간 안에 고르지 않으면 무작위 손이 선택됩니다. 규칙을 바꾸면 참가자의 준비가 해제됩니다.</p>
    </div>
  )

  const winner = room.players.find((player) => player.userId === room.winnerId)
  const isDraw = room.rpsPhase === 'revealing' && (room.rpsRoundWinnerIds?.length ?? 0) === 0

  return (
    <section className={`rps-game-shell ${isWaiting ? 'rps-waiting-shell' : ''}`}>
      <header className="rps-game-header">
        <div className="rps-game-title">
          <p className="eyebrow">ROCK PAPER SCISSORS</p>
          <h1>{isWaiting ? '가위바위보' : settings?.mode === 'tournament' ? '1:1 토너먼트' : '전체 난투전'}</h1>
          <p>{isWaiting ? `방 ${room.code} · 참가자 ${room.players.length}/${room.maxPlayers}` : settings?.mode === 'tournament' ? `${room.rpsTournamentRound ?? 1}단계 · ${settings.winsRequired}승 선취` : `라운드 ${room.rpsRound ?? 1} · 생명 ${settings?.winsRequired ?? 1}개`}</p>
        </div>
        <div className="rps-header-actions">
          {isWaiting && <button className="rps-mobile-settings-button" type="button" onClick={() => setShowSettings(true)}>규칙 설정</button>}
          {isWaiting && (isHost ? (
            <button className="rps-primary-action" type="button" disabled={isSubmitting || !allPlayersReady}
              onClick={() => void runRoomAction(() => startOnlineGame(room), '게임을 시작하지 못했습니다.')}>게임 시작</button>
          ) : currentParticipant?.isPlaying ? (
            <button className={currentParticipant.isReady ? 'rps-ready-waiting' : 'rps-primary-action'} type="button" disabled={isSubmitting}
              aria-label={currentParticipant.isReady ? '준비 취소' : '준비 하기'}
              onClick={() => void runRoomAction(() => setOnlineReady(room, !currentParticipant.isReady), '준비 상태를 바꾸지 못했습니다.')}>
              {currentParticipant.isReady ? '대기 중' : '준비 하기'}
            </button>
          ) : null)}
          {isWaiting && <button className="rps-leave-button" type="button" onClick={() => setShowLeaveConfirm(true)}>방 나가기</button>}
          <button className="rps-audio-toggle" type="button" aria-label={audioMuted ? '가위바위보 소리 켜기' : '가위바위보 소리 끄기'} onClick={onToggleAudio}>{audioMuted ? '🔇' : '🔊'}</button>
        </div>
        {room.status === 'playing' && room.rpsPhase === 'selecting' && (
          <div className={`rps-timer ${remainingSeconds <= 3 ? 'rps-timer-urgent' : ''}`} style={timerStyle} aria-label={`${remainingSeconds}초 남음`}>
            <span>남은 시간</span><strong>{remainingSeconds}</strong>
          </div>
        )}
      </header>

      {isWaiting ? (
        <>
          <div className="rps-waiting-main">
            <div className="rps-room-code-card">
              <span>ROOM CODE</span><strong>{room.code}</strong>
              <p>친구에게 코드를 공유하면 이 화면으로 바로 참가합니다.</p>
              {isAndroidNativeApp() && <button type="button" onClick={() => shareAndroidInvite(room.code)}>초대 공유</button>}
            </div>
            <div className="rps-game-settings-desktop">{renderSettings()}</div>
          </div>
          <section className="rps-waiting-participants">
            <div className="room-members-heading"><h2>참가자</h2><span>{room.players.length} / {room.maxPlayers}</span></div>
            <div className="rps-player-strip">
              {Array.from({ length: room.maxPlayers }, (_, index) => {
                const player = room.players[index]
                return player ? (
                  <article className={`rps-player-chip ${player.isReady ? 'rps-player-chip-active' : ''}`} key={player.userId}>
                    <span>{player.isHost ? '방장' : player.isReady ? '준비 완료' : '준비 전'}</span>
                    <strong>{player.nickname}</strong><small>{player.isReady ? '대기 중' : '준비 필요'}</small>
                  </article>
                ) : <article className="rps-player-chip rps-player-chip-empty" key={index}><span>{index + 1}번 자리</span><strong>참가자 대기 중</strong><small>초대 코드로 참가</small></article>
              })}
            </div>
          </section>
          {user.kind === 'member' && <FriendsPanel user={user} roomCode={room.code} canInvite={isHost} />}
        </>
      ) : room.status === 'finished' ? (
        <div className="rps-result-card rps-final-card">
          <span aria-hidden="true">🏆</span><h2>{winner ? `${winner.nickname} 승리!` : '게임 종료'}</h2>
          <p>같은 참가자와 규칙으로 바로 다시 플레이할 수 있습니다.</p>
          <div className="rps-result-actions">
            <button type="button" disabled={isSubmitting} onClick={() => void runRoomAction(() => returnOnlineRoomToWaiting(room), '대기 상태로 돌아가지 못했습니다.')}>같은 방에서 다시 하기</button>
            <button className="secondary-action" type="button" disabled={isSubmitting} onClick={() => void leaveRoom()}>온라인 로비로 나가기</button>
          </div>
        </div>
      ) : (
        <>
          {room.rpsPhase === 'revealing' ? (
            <div className="rps-reveal-board">
              <p className="eyebrow">REVEAL</p><h2>{isDraw ? '무승부! 다시 승부합니다' : '이번 라운드 결과'}</h2>
              <div className="rps-reveal-grid">{room.rpsRevealedSelections?.map((selection) => {
                const hand = HANDS.find((item) => item.hand === selection.hand)
                const won = room.rpsRoundWinnerIds?.includes(selection.userId)
                return <article className={won ? 'rps-reveal-winner' : ''} key={selection.userId}><span>{hand?.emoji}</span><strong>{playerById.get(selection.userId)?.nickname}</strong><small>{won ? '승리' : hand?.label}</small></article>
              })}</div>
              <div className="rps-next-turn-actions">{isHost ? <button type="button" disabled={isSubmitting} onClick={() => void goToNextTurn()}>{isSubmitting ? '넘어가는 중…' : '다음 턴'}</button> : <p>방장이 다음 턴을 시작할 때까지 기다리는 중입니다.</p>}</div>
            </div>
          ) : isCurrentPlayer ? (
            <div className="rps-choice-board"><div><p className="eyebrow">MAKE YOUR MOVE</p><h2>{hasSubmitted ? '선택 완료! 변경할 수 있어요' : '무엇을 낼까요?'}</h2><p>선택은 공개 전까지 상대에게 보이지 않습니다.</p></div>
              <div className="rps-hand-grid">{HANDS.map(({ hand, emoji, label }) => <button className={selectedHand === hand ? 'rps-hand-selected' : ''} type="button" disabled={isSubmitting} key={hand} onClick={() => void chooseHand(hand)}><span aria-hidden="true">{emoji}</span><strong>{label}</strong></button>)}</div>
            </div>
          ) : <div className="rps-result-card"><span aria-hidden="true">👀</span><h2>현재 대결을 관전 중입니다</h2><p>{currentPlayerIds.map((id) => playerById.get(id)?.nickname).join(' vs ')}</p></div>}
          <div className="rps-player-strip">
            {room.players.map((player) => {
              const state = room.rpsPlayerStates?.find(({ userId }) => userId === player.userId)
              const isActive = currentPlayerIds.includes(player.userId)
              const submitted = room.rpsSubmittedPlayerIds?.includes(player.userId)
              return <article className={`rps-player-chip ${isActive ? 'rps-player-chip-active' : ''} ${state?.eliminated ? 'rps-player-chip-out' : ''}`} key={player.userId}>
                <span>{player.isHost ? '방장' : isActive ? '대결 중' : state?.eliminated ? '탈락' : '대기'}</span><strong>{player.nickname}</strong>
                <small>{settings?.mode === 'tournament' ? isActive ? `${state?.wins ?? 0} / ${settings.winsRequired}승${submitted ? ' · 선택 완료' : ''}` : '대진 대기' : `생명 ${'♥'.repeat(state?.lives ?? 0)}${submitted ? ' · 선택 완료' : ''}`}</small>
              </article>
            })}
          </div>
        </>
      )}

      {notice && <p className="lobby-notice" role="alert">{notice}</p>}
      <div className="rps-game-chat"><OnlineChatPanel roomCode={room.code} channel={isWaiting ? 'lobby' : 'game'} user={user} isOpen onClose={() => undefined} onUnreadChange={() => undefined} /></div>

      {showSettings && <div className="rps-settings-modal-backdrop" role="presentation" onMouseDown={() => setShowSettings(false)}><section className="rps-settings-modal" role="dialog" aria-modal="true" aria-label="가위바위보 규칙 설정" onMouseDown={(event) => event.stopPropagation()}><button className="rps-modal-close" type="button" aria-label="닫기" onClick={() => setShowSettings(false)}>×</button>{renderSettings()}</section></div>}
      {showLeaveConfirm && <div className="match-exit-backdrop" role="presentation"><section className="match-exit-dialog" role="dialog" aria-modal="true" aria-labelledby="rps-leave-title"><h2 id="rps-leave-title">방에서 나갈까요?</h2><p>대기 중인 가위바위보 방에서 나가게 됩니다.</p><div><button className="secondary-action" type="button" onClick={() => setShowLeaveConfirm(false)}>계속 대기</button><button type="button" disabled={isSubmitting} onClick={() => void leaveRoom()}>방 나가기</button></div></section></div>}
    </section>
  )
}

export default OnlineRpsGame
