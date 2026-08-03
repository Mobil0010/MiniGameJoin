import { useEffect, useState, type FormEvent } from 'react'
import {
  getFriendDashboard,
  inviteOnlineFriend,
  removeOnlineFriend,
  requestOnlineFriend,
  respondOnlineFriendRequest,
  searchOnlineMembers,
  touchOnlinePresence,
} from './appSyncApi'
import type {
  FriendDashboard,
  MemberSearchResult,
  OnlineUser,
} from './types'

interface FriendsPanelProps {
  user: OnlineUser
  roomCode?: string
  canInvite?: boolean
  onJoinInvitedRoom?: (roomCode: string) => void
}

const EMPTY_DASHBOARD: FriendDashboard = {
  friends: [],
  incomingRequests: [],
}

function FriendsPanel({
  user,
  roomCode,
  canInvite = false,
  onJoinInvitedRoom,
}: FriendsPanelProps) {
  const [dashboard, setDashboard] = useState(EMPTY_DASHBOARD)
  const [query, setQuery] = useState('')
  const [searchResults, setSearchResults] = useState<MemberSearchResult[]>([])
  const [notice, setNotice] = useState('')
  const [isBusy, setIsBusy] = useState(false)

  const refresh = async () => {
    await touchOnlinePresence()
    setDashboard(await getFriendDashboard())
  }

  useEffect(() => {
    let active = true

    const refreshSafely = () => {
      void touchOnlinePresence()
        .then(() => getFriendDashboard())
        .then((nextDashboard) => {
          if (active) {
            setDashboard(nextDashboard)
          }
        })
        .catch(() => undefined)
    }

    refreshSafely()
    const intervalId = window.setInterval(refreshSafely, 20000)
    return () => {
      active = false
      window.clearInterval(intervalId)
    }
  }, [user.id])

  const runAction = async (
    action: () => Promise<void>,
    successMessage: string,
  ) => {
    setIsBusy(true)
    setNotice('')
    try {
      await action()
      await refresh()
      setNotice(successMessage)
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : '친구 작업을 처리하지 못했습니다.',
      )
    } finally {
      setIsBusy(false)
    }
  }

  const search = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const normalizedQuery = query.trim()
    if (normalizedQuery.length < 2) {
      setNotice('닉네임 또는 이메일을 2자 이상 입력해 주세요.')
      return
    }

    setIsBusy(true)
    setNotice('')
    try {
      const results = await searchOnlineMembers(normalizedQuery)
      setSearchResults(results)
      if (results.length === 0) {
        setNotice('검색된 회원이 없습니다.')
      }
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : '회원을 검색하지 못했습니다.',
      )
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <section className="friends-panel" aria-label="친구">
      <div className="friends-panel-heading">
        <div>
          <span>MEMBER FRIENDS</span>
          <h2>친구</h2>
        </div>
        <small>회원 전용</small>
      </div>

      <form className="friend-search-form" onSubmit={search}>
        <input
          type="search"
          value={query}
          maxLength={64}
          placeholder="닉네임 또는 이메일"
          aria-label="친구 검색"
          onChange={(event) => setQuery(event.target.value)}
        />
        <button type="submit" disabled={isBusy}>검색</button>
      </form>

      {searchResults.length > 0 && (
        <div className="friend-search-results">
          {searchResults.map((member) => (
            <div key={member.userId}>
              <strong>{member.nickname}</strong>
              <button
                type="button"
                disabled={isBusy}
                onClick={() =>
                  void runAction(
                    () => requestOnlineFriend(member.userId),
                    '친구 요청을 보냈습니다.',
                  )
                }
              >
                친구 요청
              </button>
            </div>
          ))}
        </div>
      )}

      {dashboard.incomingRequests.length > 0 && (
        <div className="friend-request-list">
          <h3>받은 친구 요청</h3>
          {dashboard.incomingRequests.map((request) => (
            <div key={request.userId}>
              <strong>{request.nickname}</strong>
              <span>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() =>
                    void runAction(
                      () => respondOnlineFriendRequest(request.userId, 'accept'),
                      '친구 요청을 수락했습니다.',
                    )
                  }
                >
                  수락
                </button>
                <button
                  type="button"
                  disabled={isBusy}
                  onClick={() =>
                    void runAction(
                      () => respondOnlineFriendRequest(request.userId, 'reject'),
                      '친구 요청을 거절했습니다.',
                    )
                  }
                >
                  거절
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="friend-list">
        <h3>친구 목록</h3>
        {dashboard.friends.length === 0 ? (
          <p>아직 등록된 친구가 없습니다.</p>
        ) : (
          dashboard.friends.map((friend) => (
            <article key={friend.userId}>
              <span
                className={`friend-presence-dot ${
                  friend.isOnline ? 'friend-online' : 'friend-offline'
                }`}
                aria-hidden="true"
              />
              <div>
                <strong>{friend.nickname}</strong>
                <small>{friend.isOnline ? '온라인' : '오프라인'}</small>
              </div>
              <div className="friend-actions">
                {friend.invitedRoomCode && onJoinInvitedRoom && (
                  <button
                    type="button"
                    onClick={() => onJoinInvitedRoom(friend.invitedRoomCode!)}
                  >
                    초대 입장
                  </button>
                )}
                {roomCode && canInvite && (
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() =>
                      void runAction(
                        () => inviteOnlineFriend(roomCode, friend.userId),
                        `${friend.nickname}님에게 방 초대를 보냈습니다.`,
                      )
                    }
                  >
                    방 초대
                  </button>
                )}
                <button
                  className="friend-remove-button"
                  type="button"
                  disabled={isBusy}
                  onClick={() =>
                    void runAction(
                      () => removeOnlineFriend(friend.userId),
                      '친구를 삭제했습니다.',
                    )
                  }
                >
                  삭제
                </button>
              </div>
            </article>
          ))
        )}
      </div>

      {notice && <p className="friend-notice" role="status">{notice}</p>}
    </section>
  )
}

export default FriendsPanel
