import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  getOnlineSpeedQuizPrompt,
  returnOnlineRoomToWaiting,
  scoreOnlineSpeedQuizPrompt,
  startOnlineSpeedQuizTurn,
  submitOnlineSpeedQuizAnswer,
} from './appSyncApi'
import OnlineChatPanel from './OnlineChatPanel'
import type { OnlineRoom, OnlineUser } from './types'

interface Props {
  room: OnlineRoom
  user: OnlineUser
  onRoomChange: (room: OnlineRoom) => void
  onReturnToLobby: () => void
  services?: SpeedQuizServices
  showChat?: boolean
}

export interface SpeedQuizServices {
  getPrompt: typeof getOnlineSpeedQuizPrompt
  returnToWaiting: typeof returnOnlineRoomToWaiting
  scorePrompt: typeof scoreOnlineSpeedQuizPrompt
  startTurn: typeof startOnlineSpeedQuizTurn
  submitAnswer: typeof submitOnlineSpeedQuizAnswer
}

const DEFAULT_SERVICES: SpeedQuizServices = {
  getPrompt: getOnlineSpeedQuizPrompt,
  returnToWaiting: returnOnlineRoomToWaiting,
  scorePrompt: scoreOnlineSpeedQuizPrompt,
  startTurn: startOnlineSpeedQuizTurn,
  submitAnswer: submitOnlineSpeedQuizAnswer,
}

function secondsUntil(deadline?: string | null) {
  if (!deadline) return 0
  return Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 1000))
}

export default function OnlineSpeedQuizGame({
  room,
  user,
  onRoomChange,
  onReturnToLobby,
  services = DEFAULT_SERVICES,
  showChat = true,
}: Props) {
  const [prompt, setPrompt] = useState('')
  const [remaining, setRemaining] = useState(secondsUntil(room.speedQuizTurnDeadline))
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [notice, setNotice] = useState('')
  const [answer, setAnswer] = useState('')
  const [answerFeedback, setAnswerFeedback] = useState('')
  const timeoutVersionRef = useRef<number | null>(null)
  const participant = room.players.find((player) => player.userId === user.id)
  const describer = room.players.find(
    (player) => player.userId === room.speedQuizDescriberId,
  )
  const isDescriber = room.speedQuizDescriberId === user.id
  const isActiveTeamGuesser =
    !isDescriber && participant?.speedQuizTeam === room.speedQuizActiveTeam
  const canResolveTimeout = isDescriber || participant?.isHost === true
  const teams = useMemo(() => ({
    A: room.players.filter((player) => player.speedQuizTeam === 'A'),
    B: room.players.filter((player) => player.speedQuizTeam === 'B'),
  }), [room.players])

  useEffect(() => {
    if (room.status !== 'playing' || room.speedQuizPhase !== 'turn') {
      setRemaining(0)
      return
    }
    const update = () => setRemaining(secondsUntil(room.speedQuizTurnDeadline))
    update()
    const timer = window.setInterval(update, 250)
    return () => window.clearInterval(timer)
  }, [room.speedQuizPhase, room.speedQuizTurnDeadline, room.status])

  useEffect(() => {
    setPrompt('')
    if (!isDescriber || room.speedQuizPhase !== 'turn') return
    void services.getPrompt(room.code)
      .then(setPrompt)
      .catch((error) => setNotice(error instanceof Error ? error.message : '제시어를 불러오지 못했습니다.'))
  }, [isDescriber, room.code, room.speedQuizPhase, room.speedQuizPromptKey, services])

  useEffect(() => {
    setAnswer('')
    setAnswerFeedback('')
  }, [room.speedQuizPromptKey, room.speedQuizTurn])

  useEffect(() => {
    if (
      room.status !== 'playing' ||
      room.speedQuizPhase !== 'turn' ||
      remaining > 0 ||
      !canResolveTimeout ||
      timeoutVersionRef.current === room.version
    ) return
    timeoutVersionRef.current = room.version ?? null
    void services.scorePrompt(room, 'timeout')
      .then(onRoomChange)
      .catch(() => undefined)
  }, [canResolveTimeout, onRoomChange, remaining, room, services])

  const run = async (action: () => Promise<OnlineRoom>) => {
    setIsSubmitting(true)
    setNotice('')
    try {
      onRoomChange(await action())
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '게임 상태를 변경하지 못했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const submitAnswer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const submittedAnswer = answer.trim()
    if (!submittedAnswer || isSubmitting) return

    setIsSubmitting(true)
    setAnswerFeedback('')
    try {
      const nextRoom = await services.submitAnswer(room, submittedAnswer)
      setAnswer('')
      setAnswerFeedback('정답! +1점')
      onRoomChange(nextRoom)
    } catch (error) {
      setAnswerFeedback(
        error instanceof Error ? error.message : '정답을 확인하지 못했습니다.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  if (room.status === 'finished') {
    const winner = room.speedQuizWinnerTeam
    return (
      <section className="speed-quiz-game speed-quiz-finished">
        <p className="eyebrow">SPEED QUIZ · FINAL</p>
        <h1>{winner ? `${winner}팀 승리!` : '무승부!'}</h1>
        <div className="speed-quiz-scoreboard">
          <strong>A팀 <em>{room.speedQuizTeamAScore ?? 0}</em></strong>
          <span>:</span>
          <strong>B팀 <em>{room.speedQuizTeamBScore ?? 0}</em></strong>
        </div>
        <div className="speed-quiz-actions">
          <button type="button" disabled={isSubmitting} onClick={() => void run(() => services.returnToWaiting(room))}>
            같은 방에서 다시 하기
          </button>
          <button type="button" className="secondary-action" onClick={onReturnToLobby}>온라인 로비로 나가기</button>
        </div>
        {notice && <p className="lobby-notice">{notice}</p>}
      </section>
    )
  }

  return (
    <section className="speed-quiz-game">
      <header className="speed-quiz-header">
        <div>
          <p className="eyebrow">TEAM RELAY · 60 SECONDS</p>
          <h1>스피드 퀴즈</h1>
          <p>{room.speedQuizTurn ?? 1} / {room.speedQuizTotalTurns ?? 6} 차례</p>
        </div>
        <div className="speed-quiz-scoreboard" aria-label="팀 점수">
          <strong>A <em>{room.speedQuizTeamAScore ?? 0}</em></strong>
          <span>:</span>
          <strong>B <em>{room.speedQuizTeamBScore ?? 0}</em></strong>
        </div>
      </header>

      <div className="speed-quiz-team-grid">
        {(['A', 'B'] as const).map((team) => (
          <article className={`speed-quiz-team speed-quiz-team-${team.toLowerCase()}`} key={team}>
            <h2>{team}팀</h2>
            <p>{teams[team].map((player) => player.nickname).join(' · ')}</p>
          </article>
        ))}
      </div>

      <div className="speed-quiz-stage">
        <span className="badge">{room.speedQuizActiveTeam}팀 차례</span>
        <h2>{describer?.nickname ?? '설명자'} 님이 설명해요</h2>
        {room.speedQuizPhase === 'between-turns' ? (
          isDescriber ? (
            <>
              <p>준비되면 시작해. 시작과 동시에 60초가 흘러.</p>
              <button type="button" disabled={isSubmitting} onClick={() => void run(() => services.startTurn(room))}>내 차례 시작</button>
            </>
          ) : <p>설명자가 준비하고 있어. 제시어는 설명자에게만 보여.</p>
        ) : (
          <>
            <div className={`speed-quiz-timer ${remaining <= 10 ? 'speed-quiz-timer-urgent' : ''}`}>{remaining}</div>
            {isDescriber ? (
              <>
                <div className="speed-quiz-prompt">{prompt || '제시어 불러오는 중…'}</div>
                <p>정답 단어와 포함된 글자는 말하면 안 돼.</p>
                <div className="speed-quiz-actions">
                  <button type="button" disabled={isSubmitting || !prompt} onClick={() => void run(() => services.scorePrompt(room, 'correct'))}>정답 +1</button>
                  <button type="button" className="secondary-action" disabled={isSubmitting || !prompt || (room.speedQuizPassCount ?? 0) >= 3} onClick={() => void run(() => services.scorePrompt(room, 'pass'))}>
                    패스 {room.speedQuizPassCount ?? 0}/3
                  </button>
                </div>
              </>
            ) : isActiveTeamGuesser ? (
              <div className="speed-quiz-answer-area">
                <p className="speed-quiz-hidden-prompt">설명을 듣고 정답을 입력해!</p>
                <form onSubmit={submitAnswer}>
                  <label htmlFor="speed-quiz-answer">정답 입력</label>
                  <div>
                    <input
                      id="speed-quiz-answer"
                      type="text"
                      value={answer}
                      maxLength={80}
                      autoComplete="off"
                      autoCapitalize="off"
                      placeholder="정답을 입력하고 Enter"
                      disabled={isSubmitting || remaining <= 0}
                      onChange={(event) => setAnswer(event.target.value)}
                      onKeyDown={(event) => {
                        if (
                          event.key === 'Enter' &&
                          !event.nativeEvent.isComposing
                        ) {
                          event.preventDefault()
                          event.currentTarget.form?.requestSubmit()
                        }
                      }}
                    />
                    <button type="submit" disabled={isSubmitting || !answer.trim() || remaining <= 0}>
                      정답 제출
                    </button>
                  </div>
                </form>
                {answerFeedback && (
                  <p className="speed-quiz-answer-feedback" role="status">{answerFeedback}</p>
                )}
                <small>띄어쓰기는 달라도 정답으로 인정돼.</small>
              </div>
            ) : (
              <p className="speed-quiz-hidden-prompt">
                {room.speedQuizActiveTeam}팀이 정답을 맞히고 있어!<br />
                <small>상대 팀 차례에는 정답을 입력할 수 없어.</small>
              </p>
            )}
          </>
        )}
        {notice && <p className="lobby-notice">{notice}</p>}
      </div>

      {showChat && (
        <div className="speed-quiz-chat">
          <h2>게임 채팅</h2>
          <OnlineChatPanel roomCode={room.code} channel="game" user={user} isOpen onClose={() => undefined} onUnreadChange={() => undefined} />
        </div>
      )}
    </section>
  )
}
