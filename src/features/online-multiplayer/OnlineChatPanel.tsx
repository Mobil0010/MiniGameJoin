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
import type { OnlineChatChannel } from './types'
import { performAndroidFeedback } from '../../platform/nativeApp'

interface OnlineChatPanelProps {
  roomCode: string
  channel: OnlineChatChannel
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
  channel,
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
  const panelRef = useRef<HTMLElement | null>(null)
  const messageListRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const lastSeenMessageIdRef = useRef<string | null>(null)
  const lastFeedbackMessageIdRef = useRef<string | null>(null)
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
      void listOnlineChatMessages(roomCode, channel)
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
      channel,
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
  }, [channel, roomCode, user.kind])

  useEffect(() => {
    const messageList = messageListRef.current
    if (!messageList) {
      return
    }
    messageList.scrollTo({
      top: messageList.scrollHeight,
      behavior: isLoading ? 'auto' : 'smooth',
    })
  }, [isLoading, messages])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    const viewport = window.visualViewport
    const section = panelRef.current?.closest<HTMLElement>(
      '.online-chat-section',
    )
    if (!viewport || !section) {
      return
    }

    const updateViewport = () => {
      section.style.setProperty(
        '--chat-visual-height',
        `${viewport.height}px`,
      )
      section.style.setProperty('--chat-visual-top', `${viewport.offsetTop}px`)
    }
    updateViewport()
    viewport.addEventListener('resize', updateViewport)
    viewport.addEventListener('scroll', updateViewport)

    return () => {
      viewport.removeEventListener('resize', updateViewport)
      viewport.removeEventListener('scroll', updateViewport)
      section.style.removeProperty('--chat-visual-height')
      section.style.removeProperty('--chat-visual-top')
    }
  }, [isOpen])

  useEffect(() => {
    const latestMessage = messages.at(-1)

    if (isLoading) {
      return
    }

    if (!isMessageBaselineReadyRef.current) {
      isMessageBaselineReadyRef.current = true
      lastSeenMessageIdRef.current = latestMessage?.id ?? null
      lastFeedbackMessageIdRef.current = latestMessage?.id ?? null
      return
    }

    if (!latestMessage) {
      return
    }

    const lastSeenIndex = messages.findIndex(
      (item) => item.id === lastSeenMessageIdRef.current,
    )
    const newMessages =
      lastSeenIndex >= 0 ? messages.slice(lastSeenIndex + 1) : [latestMessage]
    const newestOpponentMessage = [...newMessages]
      .reverse()
      .find((item) => item.senderId !== user.id)

    if (
      newestOpponentMessage &&
      newestOpponentMessage.id !== lastFeedbackMessageIdRef.current
    ) {
      lastFeedbackMessageIdRef.current = newestOpponentMessage.id
      performAndroidFeedback('chat')
    }

    if (isOpen) {
      lastSeenMessageIdRef.current = latestMessage.id
      onUnreadChange(false)
      return
    }

    if (newestOpponentMessage) {
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
    inputRef.current?.focus({ preventScroll: true })

    try {
      appendMessage(await sendOnlineChatMessage(roomCode, channel, text))
    } catch (error) {
      setMessage((currentMessage) => currentMessage || text)
      setConnectionMessage(
        error instanceof Error
          ? error.message
          : '메시지를 보내지 못했습니다.',
      )
    } finally {
      setIsSending(false)
      window.requestAnimationFrame(() =>
        inputRef.current?.focus({ preventScroll: true }),
      )
    }
  }

  return (
    <aside
      ref={panelRef}
      className="online-chat-panel"
      aria-label={channel === 'lobby' ? '대기실 채팅' : '게임 채팅'}
    >
      <button
        className="mobile-chat-close"
        type="button"
        aria-label="채팅 닫기"
        onClick={onClose}
      >
        ×
      </button>
      <div
        ref={messageListRef}
        className="chat-message-list"
        aria-live="polite"
      >
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
