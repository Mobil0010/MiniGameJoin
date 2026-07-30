import {
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from 'react'
import {
  listOnlineChatMessages,
  sendOnlineChatMessage,
  subscribeToOnlineChat,
} from './appSyncApi'
import type { RealtimeChatMessage } from './realtimeGateway'
import type { OnlineUser } from './types'

interface OnlineChatPanelProps {
  roomCode: string
  user: OnlineUser
}

function formatMessageTime(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

function OnlineChatPanel({
  roomCode,
  user,
}: OnlineChatPanelProps) {
  const [messages, setMessages] = useState<RealtimeChatMessage[]>([])
  const [message, setMessage] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [connectionMessage, setConnectionMessage] = useState('')
  const endRef = useRef<HTMLDivElement | null>(null)

  const appendMessage = (nextMessage: RealtimeChatMessage) => {
    setMessages((current) => {
      if (current.some((item) => item.id === nextMessage.id)) {
        return current
      }

      return [...current, nextMessage].slice(-100)
    })
  }

  useEffect(() => {
    let active = true

    void listOnlineChatMessages(roomCode)
      .then((items) => {
        if (active) {
          setMessages(items)
        }
      })
      .catch((error) => {
        if (active) {
          setConnectionMessage(
            error instanceof Error
              ? error.message
              : '채팅 내용을 불러오지 못했습니다.',
          )
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false)
        }
      })

    const unsubscribe = subscribeToOnlineChat(
      roomCode,
      (nextMessage) => {
        if (active) {
          appendMessage(nextMessage)
          setConnectionMessage('')
        }
      },
      (errorMessage) => {
        if (active) {
          setConnectionMessage(errorMessage)
        }
      },
    )

    return () => {
      active = false
      unsubscribe()
    }
  }, [roomCode])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const submitMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const text = message.trim()

    if (!text || isSending) {
      return
    }

    setIsSending(true)
    setConnectionMessage('')
    try {
      appendMessage(await sendOnlineChatMessage(roomCode, text))
      setMessage('')
    } catch (error) {
      setConnectionMessage(
        error instanceof Error
          ? error.message
          : '메시지를 보내지 못했습니다.',
      )
    } finally {
      setIsSending(false)
    }
  }

  return (
    <aside
      className="online-chat-panel"
      role="dialog"
      aria-modal="false"
      aria-labelledby="online-chat-title"
    >
      <header>
        <div>
          <span>LIVE CHAT · ROOM {roomCode}</span>
          <h2 id="online-chat-title">게임 채팅</h2>
        </div>
      </header>

      <div className="chat-message-list" aria-live="polite">
        {isLoading ? (
          <p className="chat-state-message">채팅을 불러오는 중…</p>
        ) : messages.length === 0 ? (
          <p className="chat-state-message">
            아직 메시지가 없습니다. 먼저 인사해보세요.
          </p>
        ) : (
          messages.map((chatMessage) => (
            <article
              className={`chat-message ${
                chatMessage.senderId === user.id
                  ? 'chat-message-mine'
                  : 'chat-message-player'
              }`}
              key={chatMessage.id}
            >
              <strong
                className="chat-sender"
                title={
                  chatMessage.senderId === user.id
                    ? user.nickname
                    : chatMessage.senderNickname
                }
              >
                {chatMessage.senderId === user.id ? '나' : '상대'}
              </strong>
              <span className="chat-separator">:</span>
              <p>{chatMessage.text}</p>
              <time>{formatMessageTime(chatMessage.sentAt)}</time>
            </article>
          ))
        )}
        <div ref={endRef} />
      </div>

      <form className="chat-compose" onSubmit={submitMessage}>
        {connectionMessage && (
          <p className="chat-connection-message" role="status">
            {connectionMessage}
          </p>
        )}
        <input
          type="text"
          value={message}
          maxLength={200}
          aria-label="채팅 메시지"
          placeholder="메시지를 입력하세요"
          disabled={isSending}
          onChange={(event) => setMessage(event.target.value)}
        />
        <button
          type="submit"
          disabled={isSending || !message.trim()}
        >
          {isSending ? '전송 중' : '전송'}
        </button>
      </form>
    </aside>
  )
}

export default OnlineChatPanel
