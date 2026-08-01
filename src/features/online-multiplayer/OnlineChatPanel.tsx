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
  isOpen: boolean
  onClose: () => void
  onUnreadChange: (hasUnread: boolean) => void
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
  isOpen,
  onClose,
  onUnreadChange,
}: OnlineChatPanelProps) {
  const [messages, setMessages] = useState<RealtimeChatMessage[]>([])
  const [message, setMessage] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [connectionMessage, setConnectionMessage] = useState('')
  const endRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const lastSeenMessageIdRef = useRef<string | null>(null)
  const isMessageBaselineReadyRef = useRef(false)

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
    let pollingId: number | null = null

    const refreshMessages = () => {
      void listOnlineChatMessages(roomCode)
        .then((items) => {
          if (active) {
            setMessages(items)
            setConnectionMessage('')
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
    }

    refreshMessages()

    const unsubscribe = subscribeToOnlineChat(
      roomCode,
      user.kind,
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

    if (user.kind === 'guest') {
      pollingId = window.setInterval(refreshMessages, 2500)
    }

    return () => {
      active = false
      unsubscribe()
      if (pollingId !== null) {
        window.clearInterval(pollingId)
      }
    }
  }, [roomCode, user.kind])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    const latestMessage = messages.at(-1)

    if (isLoading) {
      return
    }

    if (!isMessageBaselineReadyRef.current) {
      isMessageBaselineReadyRef.current = true
      lastSeenMessageIdRef.current = latestMessage?.id ?? null
      return
    }

    if (!latestMessage) {
      return
    }

    if (isOpen) {
      lastSeenMessageIdRef.current = latestMessage.id
      onUnreadChange(false)
      return
    }

    const lastSeenIndex = messages.findIndex(
      (item) => item.id === lastSeenMessageIdRef.current,
    )
    const newMessages =
      lastSeenIndex >= 0 ? messages.slice(lastSeenIndex + 1) : [latestMessage]

    if (newMessages.some((item) => item.senderId !== user.id)) {
      onUnreadChange(true)
    } else {
      lastSeenMessageIdRef.current = latestMessage.id
    }
  }, [isLoading, isOpen, messages, onUnreadChange, user.id])

  const submitMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const text = message.trim()

    if (!text || isSending) {
      return
    }

    setIsSending(true)
    setMessage('')
    setConnectionMessage('')
    inputRef.current?.focus()

    try {
      appendMessage(await sendOnlineChatMessage(roomCode, text))
    } catch (error) {
      setMessage((currentMessage) => currentMessage || text)
      setConnectionMessage(
        error instanceof Error
          ? error.message
          : '메시지를 보내지 못했습니다.',
      )
    } finally {
      setIsSending(false)
      window.requestAnimationFrame(() => inputRef.current?.focus())
    }
  }

  return (
    <aside
      className="online-chat-panel"
      aria-label="게임 채팅"
    >
      <button
        className="mobile-chat-close"
        type="button"
        aria-label="채팅 닫기"
        onClick={onClose}
      >
        ×
      </button>
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
                {chatMessage.senderId === user.id
                  ? '나'
                  : chatMessage.senderNickname || '상대'}
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
          ref={inputRef}
          type="text"
          value={message}
          maxLength={200}
          aria-label="채팅 메시지"
          placeholder="메시지를 입력하세요"
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
