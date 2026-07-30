import { useState } from 'react'

export interface AccountDeletionDialogProps {
  isSubmitting: boolean
  onCancel: () => void
  onConfirm: () => void
}

function AccountDeletionDialog({
  isSubmitting,
  onCancel,
  onConfirm,
}: AccountDeletionDialogProps) {
  const [confirmation, setConfirmation] = useState('')
  const canDelete = confirmation === '회원탈퇴' && !isSubmitting

  return (
    <div
      className="account-delete-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-delete-title"
      aria-describedby="account-delete-description"
    >
      <section className="account-delete-dialog">
        <span>DELETE ACCOUNT</span>
        <h2 id="account-delete-title">정말 회원탈퇴하시겠습니까?</h2>
        <p id="account-delete-description">
          탈퇴하면 계정과 저장된 전적을 더 이상 이용할 수 없습니다. 실제
          서버 연결 후에는 이 작업을 되돌릴 수 없습니다.
        </p>

        <label>
          계속하려면 <b>회원탈퇴</b>를 입력하세요.
          <input
            type="text"
            value={confirmation}
            autoFocus
            autoComplete="off"
            placeholder="회원탈퇴"
            disabled={isSubmitting}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </label>

        <div>
          <button
            className="secondary-action"
            type="button"
            disabled={isSubmitting}
            onClick={onCancel}
          >
            취소
          </button>
          <button
            className="danger-action"
            type="button"
            disabled={!canDelete}
            onClick={onConfirm}
          >
            {isSubmitting ? '탈퇴 처리 중...' : '회원탈퇴'}
          </button>
        </div>
      </section>
    </div>
  )
}

export default AccountDeletionDialog
