import { type FormEvent, useState } from 'react'
import type { OnlineUser } from './types'

interface MemberProfileDialogProps {
  user: OnlineUser
  isSubmitting: boolean
  errorMessage: string
  noticeMessage: string
  onClose: () => void
  onSaveNickname: (nickname: string) => Promise<void>
  onRequestEmailChange: (email: string) => Promise<void>
  onConfirmEmailChange: (code: string) => Promise<void>
}

function MemberProfileDialog({
  user,
  isSubmitting,
  errorMessage,
  noticeMessage,
  onClose,
  onSaveNickname,
  onRequestEmailChange,
  onConfirmEmailChange,
}: MemberProfileDialogProps) {
  const [nickname, setNickname] = useState(user.nickname)
  const [email, setEmail] = useState(user.email ?? '')
  const [verificationCode, setVerificationCode] = useState('')
  const [isWaitingForEmailCode, setIsWaitingForEmailCode] = useState(false)

  const submitNickname = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await onSaveNickname(nickname.trim())
  }

  const requestEmailChange = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await onRequestEmailChange(email.trim().toLowerCase())
    setIsWaitingForEmailCode(true)
  }

  const confirmEmailChange = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    await onConfirmEmailChange(verificationCode.trim())
  }

  return (
    <div className="account-modal-backdrop" role="presentation">
      <section
        className="account-modal member-profile-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="member-profile-title"
      >
        <span>MEMBER PROFILE</span>
        <h2 id="member-profile-title">회원정보 수정</h2>
        <p>
          게임 닉네임과 로그인 이메일을 변경할 수 있습니다. 이메일 변경은
          새 주소로 전송된 인증 코드 확인이 필요합니다.
        </p>

        <section className="profile-edit-section">
          <h3>닉네임</h3>
          <form onSubmit={submitNickname}>
            <label>
              게임에서 표시할 이름
              <input
                type="text"
                value={nickname}
                minLength={1}
                maxLength={16}
                required
                onChange={(event) => setNickname(event.target.value)}
              />
            </label>
            <div>
              <button
                type="submit"
                disabled={isSubmitting || !nickname.trim()}
              >
                닉네임 저장
              </button>
            </div>
          </form>
        </section>

        <section className="profile-edit-section">
          <h3>로그인 이메일</h3>
          {!isWaitingForEmailCode ? (
            <form onSubmit={requestEmailChange}>
              <label>
                새 이메일
                <input
                  type="email"
                  value={email}
                  autoComplete="email"
                  required
                  onChange={(event) => setEmail(event.target.value)}
                />
                <small>
                  인증 전까지는 현재 이메일 {user.email}이 유지됩니다.
                </small>
              </label>
              <div>
                <button
                  type="submit"
                  disabled={
                    isSubmitting ||
                    !email.trim() ||
                    email.trim().toLowerCase() ===
                      user.email?.trim().toLowerCase()
                  }
                >
                  인증 코드 보내기
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={confirmEmailChange}>
              <label>
                새 이메일 인증 코드
                <input
                  type="text"
                  value={verificationCode}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="이메일로 받은 6자리 코드"
                  required
                  autoFocus
                  onChange={(event) =>
                    setVerificationCode(event.target.value)
                  }
                />
                <small>{email}로 보낸 인증 코드를 입력해주세요.</small>
              </label>
              <div>
                <button
                  className="secondary-action"
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => {
                    setIsWaitingForEmailCode(false)
                    setVerificationCode('')
                  }}
                >
                  이메일 다시 입력
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !verificationCode.trim()}
                >
                  이메일 변경 완료
                </button>
              </div>
            </form>
          )}
        </section>

        {noticeMessage && (
          <p className="account-modal-notice" role="status">
            {noticeMessage}
          </p>
        )}
        {errorMessage && (
          <p className="account-modal-error" role="alert">
            {errorMessage}
          </p>
        )}

        <div className="account-modal-actions">
          <button
            className="secondary-action"
            type="button"
            disabled={isSubmitting}
            onClick={onClose}
          >
            닫기
          </button>
        </div>
      </section>
    </div>
  )
}

export default MemberProfileDialog
