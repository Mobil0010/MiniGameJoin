import { useEffect, useMemo, useRef, useState } from 'react'
import {
  MAX_ROLL_COUNT,
  ROLL_ANIMATION_MS,
  SCORE_CATEGORIES,
} from '../../games/yacht-dice/constants'
import DiceBoard from '../../games/yacht-dice/components/DiceBoard'
import RollButton from '../../games/yacht-dice/components/RollButton'
import ScoreBoard from '../../games/yacht-dice/components/ScoreBoard'
import YachtCelebration from '../../games/yacht-dice/components/YachtCelebration'
import {
  isAndroidNativeApp,
  performAndroidFeedback,
  setAndroidGameSessionActive,
} from '../../platform/nativeApp'
import {
  calculateScore,
  calculateScoreSummary,
} from '../../games/yacht-dice/logic/calculateScore'
import type {
  DiceValue,
  ScoreCard,
  ScoreCategory,
  YachtPlayer,
} from '../../games/yacht-dice/types/yacht'
import {
  confirmOnlineScore,
  forfeitOnlineGame,
  prepareOnlineForfeitOnPageExit,
  rollOnlineDice,
  sendOnlineForfeitOnPageExit,
  sendOnlineHeartbeat,
} from './appSyncApi'
import OnlineChatPanel from './OnlineChatPanel'
import OnlineMatchExitDialog from './OnlineMatchExitDialog'
import type { OnlineRoom, OnlineUser } from './types'
import { playGameSound } from '../../audio/gameAudio'

const CELEBRATION_DURATION_MS = 3000
const HEARTBEAT_INTERVAL_MS = 15000
const MOBILE_LAYOUT_MEDIA_QUERY = '(max-width: 760px)'

interface OnlineYachtGameProps {
  room: OnlineRoom
  user: OnlineUser
  onRoomChange: (room: OnlineRoom) => void
  onReturnToLobby: () => void
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds))
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)

  useEffect(() => {
    const mediaQuery = window.matchMedia(query)
    const updateMatches = (event: MediaQueryListEvent) => setMatches(event.matches)

    setMatches(mediaQuery.matches)
    mediaQuery.addEventListener('change', updateMatches)

    return () => mediaQuery.removeEventListener('change', updateMatches)
  }, [query])

  return matches
}

function OnlineYachtGame({
  room,
  user,
  onRoomChange,
  onReturnToLobby,
}: OnlineYachtGameProps) {
  const [heldIndexes, setHeldIndexes] = useState<Set<number>>(
    () =>
      new Set(
        (room.dice ?? [])
          .filter((die) => die.isHeld)
          .map((die) => die.id),
      ),
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isRollingDice, setIsRollingDice] = useState(false)
  const [isRemoteDiceRolling, setIsRemoteDiceRolling] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [showExitDialog, setShowExitDialog] = useState(false)
  const [showYachtCelebration, setShowYachtCelebration] = useState(false)
  const [isMobileChatOpen, setIsMobileChatOpen] = useState(false)
  const [hasUnreadChat, setHasUnreadChat] = useState(false)
  const isMobileLayout = useMediaQuery(MOBILE_LAYOUT_MEDIA_QUERY)
  const isChatVisible = !isMobileLayout || isMobileChatOpen
  const celebrationTimerRef = useRef<number | null>(null)
  const remoteRollTimerRef = useRef<number | null>(null)
  const previousRollSnapshotRef = useRef('')
  const localRollSnapshotRef = useRef<string | null>(null)
  const lastCelebratedVersionRef = useRef<number | null>(null)
  const pageExitRequestRef = useRef<Awaited<
    ReturnType<typeof prepareOnlineForfeitOnPageExit>
  >>(null)
  const heldStateKey = `${room.activePlayerId ?? ''}:${room.rollCount ?? 0}`
  const lastHeldStateKeyRef = useRef(heldStateKey)

  const players = useMemo<YachtPlayer[]>(
    () =>
      room.players.map((player, index) => ({
        id: player.userId,
        nickname: player.nickname,
        slot: player.slot ?? ((index + 1) as 1 | 2),
        scores: player.scores ?? {},
      })),
    [room.players],
  )
  const activePlayer =
    players.find((player) => player.id === room.activePlayerId) ?? players[0]
  const isMyTurn =
    room.status === 'playing' && room.activePlayerId === user.id
  const previousIsMyTurnRef = useRef(isMyTurn)
  const displayedDice = (room.dice ?? []).map((die) => ({
    ...die,
    isHeld: heldIndexes.has(die.id),
  }))
  const diceValues = displayedDice.map((die) => die.value)
  const roomRollSnapshot = `${room.activePlayerId ?? ''}:${room.rollCount ?? 0}:${(
    room.dice ?? []
  )
    .map((die) => `${die.id}-${die.value ?? 0}`)
    .join(',')}`
  const hasCompleteDice =
    displayedDice.length === 5 &&
    diceValues.every((value) => value !== null)
  const playerSummaries = Object.fromEntries(
    players.map((player) => [
      player.id,
      calculateScoreSummary(player.scores),
    ]),
  )
  const previewScores = useMemo<ScoreCard>(() => {
    if (!hasCompleteDice || (room.rollCount ?? 0) < 1 || !activePlayer) {
      return {}
    }

    const values = diceValues as DiceValue[]
    return Object.fromEntries(
      SCORE_CATEGORIES.filter(
        (category) => activePlayer.scores[category] === undefined,
      ).map((category) => [category, calculateScore(category, values)]),
    ) as ScoreCard
  }, [
    activePlayer,
    diceValues,
    hasCompleteDice,
    room.rollCount,
  ])
  const activeCompletedCount = activePlayer
    ? Object.keys(activePlayer.scores).length
    : 0
  const round = Math.min(activeCompletedCount + 1, SCORE_CATEGORIES.length)
  const finalPlayers = players.map((player) => ({
    ...player,
    total: playerSummaries[player.id].total,
  }))
  const highestTotal =
    finalPlayers.length > 0
      ? Math.max(...finalPlayers.map((player) => player.total))
      : 0

  useEffect(() => {
    setAndroidGameSessionActive(room.status === 'playing')
    return () => setAndroidGameSessionActive(false)
  }, [room.status])

  useEffect(() => {
    if (!previousIsMyTurnRef.current && isMyTurn) {
      performAndroidFeedback('turn')
      playGameSound('turn')
    }
    previousIsMyTurnRef.current = isMyTurn
  }, [isMyTurn])

  useEffect(() => {
    if (lastHeldStateKeyRef.current === heldStateKey) {
      return
    }

    lastHeldStateKeyRef.current = heldStateKey
    setHeldIndexes(
      new Set(
        (room.dice ?? [])
          .filter((die) => die.isHeld)
        .map((die) => die.id),
      ),
    )
  }, [heldStateKey, room.dice])

  useEffect(() => {
    if (room.status !== 'playing' || isAndroidNativeApp()) {
      return
    }

    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [room.status])

  useEffect(() => {
    if (room.status !== 'playing' || isAndroidNativeApp()) {
      pageExitRequestRef.current = null
      return
    }

    let active = true

    void prepareOnlineForfeitOnPageExit(room)
      .then((request) => {
        if (active) {
          pageExitRequestRef.current = request
        }
      })
      .catch(() => {
        if (active) {
          pageExitRequestRef.current = null
        }
      })

    return () => {
      active = false
    }
  }, [room, user.id])

  useEffect(() => {
    if (room.status !== 'playing' || isAndroidNativeApp()) {
      return
    }

    const forfeitAfterConfirmedPageExit = () => {
      sendOnlineForfeitOnPageExit(pageExitRequestRef.current)
    }

    window.addEventListener('pagehide', forfeitAfterConfirmedPageExit)
    return () =>
      window.removeEventListener('pagehide', forfeitAfterConfirmedPageExit)
  }, [room])

  useEffect(() => {
    if (room.status !== 'playing') {
      return
    }

    const guardState = {
      ...window.history.state,
      miniGameJoinMatchGuard: room.code,
    }
    window.history.pushState(guardState, '', window.location.href)

    const interceptBackNavigation = () => {
      window.history.pushState(guardState, '', window.location.href)
      setShowExitDialog(true)
    }

    window.addEventListener('popstate', interceptBackNavigation)
    return () => window.removeEventListener('popstate', interceptBackNavigation)
  }, [room.code, room.status])

  useEffect(() => {
    if (room.status !== 'playing') {
      return
    }

    void sendOnlineHeartbeat(room.code).catch(() => undefined)
    const intervalId = window.setInterval(() => {
      void sendOnlineHeartbeat(room.code).catch(() => undefined)
    }, HEARTBEAT_INTERVAL_MS)

    return () => window.clearInterval(intervalId)
  }, [room.code, room.status])

  useEffect(() => {
    return () => {
      if (celebrationTimerRef.current !== null) {
        window.clearTimeout(celebrationTimerRef.current)
      }
      if (remoteRollTimerRef.current !== null) {
        window.clearTimeout(remoteRollTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    const previousSnapshot = previousRollSnapshotRef.current
    previousRollSnapshotRef.current = roomRollSnapshot

    if (localRollSnapshotRef.current === roomRollSnapshot) {
      localRollSnapshotRef.current = null
      return
    }

    if (
      previousSnapshot === '' ||
      previousSnapshot === roomRollSnapshot ||
      room.status !== 'playing' ||
      (room.rollCount ?? 0) < 1 ||
      !hasCompleteDice
    ) {
      return
    }

    setIsRemoteDiceRolling(true)
    playGameSound('dice_roll')
    if (remoteRollTimerRef.current !== null) {
      window.clearTimeout(remoteRollTimerRef.current)
    }
    remoteRollTimerRef.current = window.setTimeout(() => {
      setIsRemoteDiceRolling(false)
      remoteRollTimerRef.current = null
    }, ROLL_ANIMATION_MS)
  }, [hasCompleteDice, room.status, room.rollCount, roomRollSnapshot])

  useEffect(() => {
    if (
      !hasCompleteDice ||
      room.version === undefined ||
      lastCelebratedVersionRef.current === room.version ||
      calculateScore('yacht', diceValues as DiceValue[]) !== 50
    ) {
      return
    }

    lastCelebratedVersionRef.current = room.version
    performAndroidFeedback('yacht')
    playGameSound('yacht')
    setShowYachtCelebration(true)

    if (celebrationTimerRef.current !== null) {
      window.clearTimeout(celebrationTimerRef.current)
    }

    celebrationTimerRef.current = window.setTimeout(() => {
      setShowYachtCelebration(false)
      celebrationTimerRef.current = null
    }, CELEBRATION_DURATION_MS)
  }, [diceValues, hasCompleteDice, room.version])

  const toggleHold = (dieId: number) => {
    if (!isMyTurn || isSubmitting || (room.rollCount ?? 0) < 1) {
      return
    }

    performAndroidFeedback('dice_hold')
    playGameSound('dice_hold')
    setHeldIndexes((current) => {
      const next = new Set(current)
      if (next.has(dieId)) {
        next.delete(dieId)
      } else {
        next.add(dieId)
      }
      return next
    })
  }

  const roll = async () => {
    if (
      !isMyTurn ||
      isSubmitting ||
      (room.rollCount ?? 0) >= MAX_ROLL_COUNT
    ) {
      return
    }

    performAndroidFeedback('dice_roll')
    playGameSound('dice_roll')
    setIsSubmitting(true)
    setIsRollingDice(true)
    setErrorMessage('')

    try {
      const [nextRoom] = await Promise.all([
        rollOnlineDice(room, [...heldIndexes]),
        wait(ROLL_ANIMATION_MS),
      ])
      localRollSnapshotRef.current = `${nextRoom.activePlayerId ?? ''}:${
        nextRoom.rollCount ?? 0
      }:${(nextRoom.dice ?? [])
        .map((die) => `${die.id}-${die.value ?? 0}`)
        .join(',')}`
      onRoomChange(nextRoom)
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : '주사위를 굴리지 못했습니다.',
      )
    } finally {
      setIsRollingDice(false)
      setIsSubmitting(false)
    }
  }

  const selectScore = async (category: ScoreCategory) => {
    if (!isMyTurn || isSubmitting || !hasCompleteDice) {
      return
    }

    setIsSubmitting(true)
    setErrorMessage('')

    try {
      onRoomChange(await confirmOnlineScore(room, category))
      performAndroidFeedback('score_confirm')
      playGameSound('score_confirm')
      setHeldIndexes(new Set())
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : '점수를 확정하지 못했습니다.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const confirmForfeit = async () => {
    setIsSubmitting(true)
    setErrorMessage('')

    try {
      await forfeitOnlineGame(room)
      setShowExitDialog(false)
      onReturnToLobby()
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : '기권 처리에 실패했습니다.',
      )
      setShowExitDialog(false)
    } finally {
      setIsSubmitting(false)
    }
  }

  const guideMessage =
    room.status === 'finished'
      ? '게임이 종료되었습니다.'
      : !isMyTurn
        ? `${activePlayer?.nickname ?? '상대방'}의 차례입니다.`
        : isSubmitting
          ? '처리 중입니다...'
          : (room.rollCount ?? 0) === 0
            ? '주사위를 굴려 턴을 시작하세요.'
            : (room.rollCount ?? 0) < MAX_ROLL_COUNT
              ? '남길 주사위를 선택하거나 점수 항목을 확정하세요.'
              : '세 번 모두 굴렸습니다. 점수 항목을 선택하세요.'

  return (
    <div className="online-game-shell">
      {showExitDialog && (
        <OnlineMatchExitDialog
          isSubmitting={isSubmitting}
          onCancel={() => setShowExitDialog(false)}
          onConfirmForfeit={confirmForfeit}
        />
      )}
      <section className="yacht-layout" aria-label="온라인 Yacht Dice 게임">
        <div className="panel play-panel" aria-busy={isSubmitting}>
          {showYachtCelebration && (
            <YachtCelebration
              nickname={activePlayer?.nickname ?? '플레이어'}
              onDismiss={() => setShowYachtCelebration(false)}
            />
          )}

          {room.status === 'finished' ? (
            <div className="game-result">
              <span>ONLINE FINAL RESULT</span>
              <div className="final-score-list">
                {finalPlayers.map((player) => (
                  <div
                    className={
                      player.total === highestTotal
                        ? 'final-score-winner'
                        : ''
                    }
                    key={player.id}
                  >
                    <span>
                      {player.slot}P · {player.nickname}
                    </span>
                    <strong>{player.total}</strong>
                  </div>
                ))}
              </div>
              <p>
                {room.winnerId
                  ? `${
                      players.find((player) => player.id === room.winnerId)
                        ?.nickname ?? '승자'
                    } 승리!`
                  : '동점입니다!'}
              </p>
              <button type="button" onClick={onReturnToLobby}>
                온라인 로비로 돌아가기
              </button>
            </div>
          ) : (
            <>
              <div className="panel-title play-panel-title">
                <div>
                  <span>{activePlayer?.slot ?? '-'}P TURN</span>
                  <h2>{activePlayer?.nickname ?? '플레이어'}</h2>
                </div>
                <div className="turn-meta">
                  <span>
                    라운드 {round} / {SCORE_CATEGORIES.length}
                  </span>
                  <strong>
                    굴리기 {room.rollCount ?? 0} / {MAX_ROLL_COUNT}
                  </strong>
                </div>
              </div>

              <DiceBoard
                dice={displayedDice}
                disabled={
                  !isMyTurn || (room.rollCount ?? 0) === 0 || isSubmitting
                }
                isRolling={isRollingDice || isRemoteDiceRolling}
                onToggleHold={toggleHold}
              />
              <p className="game-guide" aria-live="polite">
                {guideMessage}
              </p>
              <RollButton
                rollCount={room.rollCount ?? 0}
                maxRollCount={MAX_ROLL_COUNT}
                disabled={
                  !isMyTurn ||
                  isSubmitting ||
                  (room.rollCount ?? 0) >= MAX_ROLL_COUNT
                }
                isRolling={isRollingDice}
                onRoll={roll}
              />
              <div className="online-game-actions">
                <button
                  className="mobile-chat-toggle"
                  type="button"
                  aria-expanded={isMobileChatOpen}
                  aria-controls="online-game-chat"
                  onClick={() => {
                    setIsMobileChatOpen(true)
                    setHasUnreadChat(false)
                  }}
                >
                  채팅
                  {hasUnreadChat && (
                    <span className="chat-unread-badge" aria-label="새 메시지">
                      NEW
                    </span>
                  )}
                </button>
                <button
                  className="danger-action"
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setShowExitDialog(true)}
                >
                  게임 나가기
                </button>
              </div>
              {errorMessage && (
                <p className="lobby-notice" role="alert">
                  {errorMessage}
                </p>
              )}
            </>
          )}
        </div>

        {players.map((player) => {
          const isActive =
            room.status === 'playing' && player.id === room.activePlayerId

          return (
            <ScoreBoard
              key={player.id}
              player={player}
              previewScores={isActive ? previewScores : {}}
              scoreSummary={playerSummaries[player.id]}
              isActive={isActive}
              canSelect={isActive && isMyTurn && !isSubmitting}
              onSelectScore={selectScore}
              onNicknameChange={() => undefined}
            />
          )
        })}
      </section>

      <div
        className={`online-chat-section ${
          isChatVisible
            ? 'online-chat-section-open'
            : 'online-chat-section-closed'
        }`}
        id="online-game-chat"
        onMouseDown={(event) => {
          if (isMobileLayout && event.target === event.currentTarget) {
            setIsMobileChatOpen(false)
          }
        }}
      >
        <OnlineChatPanel
          roomCode={room.code}
          user={user}
          isOpen={isChatVisible}
          onClose={() => setIsMobileChatOpen(false)}
          onUnreadChange={setHasUnreadChat}
        />
      </div>
    </div>
  )
}

export default OnlineYachtGame
