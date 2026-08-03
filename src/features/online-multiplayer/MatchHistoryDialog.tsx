import { useEffect, useState } from 'react'
import { SCORE_CATEGORY_LABELS } from '../../games/yacht-dice/constants'
import {
  getMyGameStats,
  getMyMatchHistory,
  getOnlineMatchDetail,
} from './appSyncApi'
import type {
  MatchDetail,
  MatchHistoryItem,
  OnlineGameId,
  OnlineGameStats,
  OnlineMatchEndReason,
} from './types'

interface MatchHistoryDialogProps {
  initialGameId?: OnlineGameId
  onClose: () => void
}

const GAME_LABELS: Record<OnlineGameId, string> = {
  'yacht-dice': 'Yacht Dice',
  'rock-paper-scissors': '가위바위보',
}

const RESULT_LABELS = {
  win: '승리',
  loss: '패배',
  draw: '무승부',
} as const

const REASON_LABELS: Record<OnlineMatchEndReason, string> = {
  completed: '정상 종료',
  forfeit: '기권',
  'disconnect-timeout': '연결 종료',
}

function formatFinishedAt(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function MatchHistoryDialog({
  initialGameId = 'yacht-dice',
  onClose,
}: MatchHistoryDialogProps) {
  const [gameId, setGameId] = useState<OnlineGameId>(initialGameId)
  const [stats, setStats] = useState<OnlineGameStats | null>(null)
  const [items, setItems] = useState<MatchHistoryItem[]>([])
  const [nextToken, setNextToken] = useState<string | null>(null)
  const [selectedMatch, setSelectedMatch] = useState<MatchDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    let active = true
    setIsLoading(true)
    setErrorMessage('')
    setItems([])
    setNextToken(null)
    setSelectedMatch(null)

    void Promise.all([getMyGameStats(gameId), getMyMatchHistory(gameId)])
      .then(([nextStats, page]) => {
        if (!active) {
          return
        }
        setStats(nextStats)
        setItems(page.items)
        setNextToken(page.nextToken)
      })
      .catch((error) => {
        if (active) {
          setErrorMessage(
            error instanceof Error
              ? error.message
              : '전적을 불러오지 못했습니다.',
          )
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [gameId])

  const loadMore = async () => {
    if (!nextToken || isLoadingMore) {
      return
    }

    setIsLoadingMore(true)
    setErrorMessage('')
    try {
      const page = await getMyMatchHistory(gameId, nextToken)
      setItems((current) => [...current, ...page.items])
      setNextToken(page.nextToken)
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : '추가 전적을 불러오지 못했습니다.',
      )
    } finally {
      setIsLoadingMore(false)
    }
  }

  const openDetail = async (matchId: string) => {
    setLoadingDetailId(matchId)
    setErrorMessage('')
    try {
      setSelectedMatch(await getOnlineMatchDetail(matchId))
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : '경기 상세 정보를 불러오지 못했습니다.',
      )
    } finally {
      setLoadingDetailId(null)
    }
  }

  return (
    <div className="account-modal-backdrop" role="presentation">
      <section
        className="account-modal match-history-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="match-history-title"
      >
        <button
          className="account-modal-close"
          type="button"
          aria-label="전적 창 닫기"
          onClick={onClose}
        >
          ×
        </button>
        <span>MATCH HISTORY</span>
        <h2 id="match-history-title">게임별 전적</h2>

        <div className="match-history-tabs" role="tablist" aria-label="게임 선택">
          {(Object.entries(GAME_LABELS) as Array<[OnlineGameId, string]>).map(
            ([id, label]) => (
              <button
                className={gameId === id ? 'match-history-tab-active' : ''}
                type="button"
                role="tab"
                aria-selected={gameId === id}
                key={id}
                onClick={() => setGameId(id)}
              >
                {label}
              </button>
            ),
          )}
        </div>

        <div className="match-history-summary">
          <div>
            <span>승리</span>
            <strong>{stats?.wins ?? 0}</strong>
          </div>
          <div>
            <span>패배</span>
            <strong>{stats?.losses ?? 0}</strong>
          </div>
          <div>
            <span>무승부</span>
            <strong>{stats?.draws ?? 0}</strong>
          </div>
          <div>
            <span>승률</span>
            <strong>{stats?.winRate ?? 0}%</strong>
          </div>
        </div>

        {errorMessage && (
          <p className="account-modal-error" role="alert">
            {errorMessage}
          </p>
        )}

        {isLoading ? (
          <div className="match-history-empty" role="status">
            <strong>전적을 불러오는 중…</strong>
          </div>
        ) : items.length === 0 ? (
          <div className="match-history-empty">
            <strong>아직 완료한 {GAME_LABELS[gameId]} 경기가 없습니다.</strong>
            <p>경기를 끝내면 상대, 점수, 종료 사유가 이곳에 기록됩니다.</p>
          </div>
        ) : (
          <div className="match-history-list">
            {items.map((item) => (
              <article
                className={`match-history-item match-result-${item.result}`}
                key={item.matchId}
              >
                <div className="match-history-item-heading">
                  <strong>{RESULT_LABELS[item.result]}</strong>
                  <time>{formatFinishedAt(item.finishedAt)}</time>
                </div>
                <div className="match-history-opponent">
                  <span>vs. {item.opponentNickname}</span>
                  <strong>{gameId === 'rock-paper-scissors'
                    ? item.result === 'win' ? '우승' : '탈락'
                    : `${item.myScore} : ${item.opponentScore}`}</strong>
                </div>
                <small>
                  {REASON_LABELS[item.reason]} · 방 {item.roomCode}
                </small>
                <button
                  type="button"
                  disabled={loadingDetailId === item.matchId}
                  onClick={() => openDetail(item.matchId)}
                >
                  {loadingDetailId === item.matchId
                    ? '불러오는 중…'
                    : gameId === 'yacht-dice' ? '점수표 보기' : '경기 결과 보기'}
                </button>
              </article>
            ))}
          </div>
        )}

        {nextToken && (
          <button
            className="match-history-more"
            type="button"
            disabled={isLoadingMore}
            onClick={loadMore}
          >
            {isLoadingMore ? '불러오는 중…' : '이전 경기 더 보기'}
          </button>
        )}

        {selectedMatch && (
          <section className="match-detail-card">
            <div className="match-detail-heading">
              <div>
                <span>GAME DETAIL</span>
                <h3>{formatFinishedAt(selectedMatch.finishedAt)}</h3>
              </div>
              <button
                type="button"
                aria-label="경기 상세 닫기"
                onClick={() => setSelectedMatch(null)}
              >
                ×
              </button>
            </div>
            <p>
              {RESULT_LABELS[selectedMatch.result]} ·{' '}
              {REASON_LABELS[selectedMatch.reason]}
            </p>
            <div className="match-detail-players">
              {selectedMatch.players.map((player) => (
                <article key={player.userId}>
                  <div>
                    <span>{player.slot}P</span>
                    <strong>{player.nickname}</strong>
                    <b>{player.totalScore}점</b>
                  </div>
                  {selectedMatch.gameId === 'rock-paper-scissors' ? (
                    <p>{player.userId === selectedMatch.winnerId ? '최종 우승' : '탈락'}</p>
                  ) : Object.keys(player.scores).length === 0 ? (
                    <p>이전 버전에서 저장된 경기라 세부 점수표가 없습니다.</p>
                  ) : (
                    <ul>
                      {Object.entries(player.scores).map(
                        ([category, score]) => (
                          <li key={category}>
                            <span>
                              {
                                SCORE_CATEGORY_LABELS[
                                  category as keyof typeof SCORE_CATEGORY_LABELS
                                ]
                              }
                            </span>
                            <strong>{score}</strong>
                          </li>
                        ),
                      )}
                    </ul>
                  )}
                </article>
              ))}
            </div>
          </section>
        )}

      </section>
    </div>
  )
}

export default MatchHistoryDialog
