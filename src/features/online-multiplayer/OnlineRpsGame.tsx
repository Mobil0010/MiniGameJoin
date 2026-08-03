import { useEffect, useMemo, useRef, useState } from 'react'
import {
  advanceOnlineRpsRound,
  getOnlineRoom,
  returnOnlineRoomToWaiting,
  sendOnlineHeartbeat,
  submitOnlineRpsHand,
} from './appSyncApi'
import OnlineChatPanel from './OnlineChatPanel'
import type {
  OnlineRoom,
  OnlineUser,
  RpsHand,
} from './types'

interface OnlineRpsGameProps {
  room: OnlineRoom
  user: OnlineUser
  onRoomChange: (room: OnlineRoom) => void
  onReturnToLobby: () => void
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
}: OnlineRpsGameProps) {
  const [selectedHand, setSelectedHand] = useState<RpsHand | null>(null)
  const [remainingSeconds, setRemainingSeconds] = useState(0)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [notice, setNotice] = useState('')
  const advancingVersionRef = useRef<number | null>(null)
  const currentPlayerIds = room.rpsCurrentPlayerIds ?? []
  const isCurrentPlayer = currentPlayerIds.includes(user.id)
  const hasSubmitted = (room.rpsSubmittedPlayerIds ?? []).includes(user.id)
  const settings = room.rpsSettings
  const playerById = useMemo(
    () => new Map(room.players.map((player) => [player.userId, player])),
    [room.players],
  )

  useEffect(() => {
    if (room.rpsPhase === 'selecting' && !hasSubmitted) {
      setSelectedHand(null)
    }
  }, [hasSubmitted, room.rpsPhase, room.rpsRound])

  useEffect(() => {
    if (room.status !== 'playing') return
    const updateTimer = () => {
      const deadline = room.rpsPhase === 'revealing'
        ? room.rpsRevealEndsAt
        : room.rpsRoundDeadline
      setRemainingSeconds(getRemainingSeconds(deadline))
    }
    updateTimer()
    const intervalId = window.setInterval(updateTimer, 250)
    return () => window.clearInterval(intervalId)
  }, [room.rpsPhase, room.rpsRevealEndsAt, room.rpsRoundDeadline, room.status])

  useEffect(() => {
    if (room.status !== 'playing') return
    void sendOnlineHeartbeat(room.code).catch(() => undefined)
    const intervalId = window.setInterval(() => {
      void sendOnlineHeartbeat(room.code).catch(() => undefined)
    }, 25_000)
    return () => window.clearInterval(intervalId)
  }, [room.code, room.status])

  useEffect(() => {
    if (room.status !== 'playing' || remainingSeconds > 0) return
    const deadline = room.rpsPhase === 'revealing'
      ? room.rpsRevealEndsAt
      : room.rpsRoundDeadline
    if (!deadline || new Date(deadline).getTime() > Date.now()) return
    if (advancingVersionRef.current === room.version) return
    advancingVersionRef.current = room.version ?? null
    void advanceOnlineRpsRound(room)
      .then((nextRoom) => {
        if (nextRoom.version === room.version) {
          advancingVersionRef.current = null
        }
        onRoomChange(nextRoom)
      })
      .catch(async () => {
        try {
          onRoomChange(await getOnlineRoom(room.code))
        } catch {
          // 다음 주기 조회에서 최신 상태를 다시 받습니다.
        }
      })
  }, [onRoomChange, remainingSeconds, room])

  const chooseHand = async (hand: RpsHand) => {
    if (!isCurrentPlayer || room.rpsPhase !== 'selecting' || isSubmitting) return
    setSelectedHand(hand)
    setIsSubmitting(true)
    setNotice('')
    try {
      let latestRoom = room
      let submittedRoom: OnlineRoom | null = null
      for (let attempt = 0; attempt < 3 && !submittedRoom; attempt += 1) {
        try {
          submittedRoom = await submitOnlineRpsHand(latestRoom, hand)
        } catch {
          latestRoom = await getOnlineRoom(room.code)
          if (
            latestRoom.status !== 'playing' ||
            latestRoom.rpsPhase !== 'selecting' ||
            !latestRoom.rpsCurrentPlayerIds?.includes(user.id)
          ) {
            submittedRoom = latestRoom
            break
          }
        }
      }
      if (!submittedRoom) {
        throw new Error('동시에 선택한 플레이어가 많습니다. 한 번 더 눌러주세요.')
      }
      onRoomChange(submittedRoom)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '선택을 전송하지 못했습니다.')
      try {
        onRoomChange(await getOnlineRoom(room.code))
      } catch {
        // 화면의 기존 상태를 유지합니다.
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const returnToWaitingRoom = async () => {
    setIsSubmitting(true)
    setNotice('')
    try {
      onRoomChange(await returnOnlineRoomToWaiting(room))
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '대기실로 돌아가지 못했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const winner = room.players.find((player) => player.userId === room.winnerId)
  const isDraw = room.rpsPhase === 'revealing' &&
    (room.rpsRoundWinnerIds?.length ?? 0) === 0

  return (
    <section className="rps-game-shell">
      <header className="rps-game-header">
        <div>
          <p className="eyebrow">ROCK PAPER SCISSORS</p>
          <h1>{settings?.mode === 'tournament' ? '1:1 토너먼트' : '전체 난투전'}</h1>
          <p>
            {settings?.mode === 'tournament'
              ? `${room.rpsTournamentRound ?? 1}단계 · ${settings.winsRequired}승 선취`
              : `라운드 ${room.rpsRound ?? 1} · 생명 ${settings?.winsRequired ?? 1}개`}
          </p>
        </div>
        {room.status === 'playing' && (
          <div className={`rps-timer ${remainingSeconds <= 3 ? 'rps-timer-urgent' : ''}`}>
            <span>{room.rpsPhase === 'revealing' ? '다음 라운드' : '남은 시간'}</span>
            <strong>{remainingSeconds}</strong>
          </div>
        )}
      </header>

      {room.status === 'finished' ? (
        <div className="rps-result-card rps-final-card">
          <span aria-hidden="true">🏆</span>
          <h2>{winner ? `${winner.nickname} 승리!` : '게임 종료'}</h2>
          <p>같은 참가자와 규칙으로 바로 다시 플레이할 수 있습니다.</p>
          <div className="rps-result-actions">
            <button type="button" disabled={isSubmitting} onClick={returnToWaitingRoom}>
              {isSubmitting ? '이동 중…' : '같은 방에서 다시 하기'}
            </button>
            <button className="secondary-action" type="button" onClick={onReturnToLobby}>
              온라인 로비로 나가기
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="rps-player-strip">
            {room.players.map((player) => {
              const state = room.rpsPlayerStates?.find(({ userId }) => userId === player.userId)
              const isActive = currentPlayerIds.includes(player.userId)
              const submitted = room.rpsSubmittedPlayerIds?.includes(player.userId)
              return (
                <article
                  className={`rps-player-chip ${isActive ? 'rps-player-chip-active' : ''} ${state?.eliminated ? 'rps-player-chip-out' : ''}`}
                  key={player.userId}
                >
                  <span>{player.isHost ? '방장' : isActive ? '대결 중' : state?.eliminated ? '탈락' : '대기'}</span>
                  <strong>{player.nickname}</strong>
                  <small>
                    {settings?.mode === 'tournament'
                      ? isActive ? `${state?.wins ?? 0} / ${settings.winsRequired}승${submitted ? ' · 선택 완료' : ''}` : '대진 대기'
                      : `생명 ${'♥'.repeat(state?.lives ?? 0)}${submitted ? ' · 선택 완료' : ''}`}
                  </small>
                </article>
              )
            })}
          </div>

          {room.rpsPhase === 'revealing' ? (
            <div className="rps-reveal-board">
              <p className="eyebrow">REVEAL</p>
              <h2>{isDraw ? '무승부! 다시 승부합니다' : '이번 라운드 결과'}</h2>
              <div className="rps-reveal-grid">
                {room.rpsRevealedSelections?.map((selection) => {
                  const hand = HANDS.find((item) => item.hand === selection.hand)
                  const won = room.rpsRoundWinnerIds?.includes(selection.userId)
                  return (
                    <article className={won ? 'rps-reveal-winner' : ''} key={selection.userId}>
                      <span>{hand?.emoji}</span>
                      <strong>{playerById.get(selection.userId)?.nickname}</strong>
                      <small>{won ? '승리' : hand?.label}</small>
                    </article>
                  )
                })}
              </div>
            </div>
          ) : isCurrentPlayer ? (
            <div className="rps-choice-board">
              <div>
                <p className="eyebrow">MAKE YOUR MOVE</p>
                <h2>{hasSubmitted ? '선택 완료! 변경할 수 있어요' : '무엇을 낼까요?'}</h2>
                <p>선택은 공개 전까지 상대에게 보이지 않습니다.</p>
              </div>
              <div className="rps-hand-grid">
                {HANDS.map(({ hand, emoji, label }) => (
                  <button
                    className={selectedHand === hand ? 'rps-hand-selected' : ''}
                    type="button"
                    disabled={isSubmitting}
                    key={hand}
                    onClick={() => void chooseHand(hand)}
                  >
                    <span aria-hidden="true">{emoji}</span>
                    <strong>{label}</strong>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="rps-result-card">
              <span aria-hidden="true">👀</span>
              <h2>현재 대결을 관전 중입니다</h2>
              <p>{currentPlayerIds.map((id) => playerById.get(id)?.nickname).join(' vs ')}</p>
            </div>
          )}
        </>
      )}

      {notice && <p className="lobby-notice" role="alert">{notice}</p>}

      <div className="rps-game-chat">
        <OnlineChatPanel
          roomCode={room.code}
          channel="game"
          user={user}
          isOpen
          onClose={() => undefined}
          onUnreadChange={() => undefined}
        />
      </div>
    </section>
  )
}

export default OnlineRpsGame
