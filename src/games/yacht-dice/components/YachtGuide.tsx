import { useEffect, useRef } from 'react'

export interface YachtGuideProps {
  onClose: () => void
  onDontShowAgain: () => void
}

function YachtGuide({ onClose, onDontShowAgain }: YachtGuideProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  return (
    <div
      className="guide-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="yacht-guide-title"
    >
      <section className="guide-card">
        <header className="guide-header">
          <span>GAME RULES</span>
          <h2 id="yacht-guide-title">Yacht Dice 게임 방법</h2>
          <p>
            두 명이 주사위 5개를 함께 사용해 번갈아 플레이합니다. 각자
            12개의 점수 항목을 한 번씩 채우고 더 높은 총점을 만든 사람이
            승리합니다.
          </p>
        </header>

        <section className="guide-rule-section">
          <h3>게임 진행</h3>
          <ol className="guide-steps">
            <li>
              <strong>1</strong>
              <div>
                <h4>첫 번째 굴리기</h4>
                <p>라운드를 시작하면 주사위 5개를 모두 굴립니다.</p>
              </div>
            </li>
            <li>
              <strong>2</strong>
              <div>
                <h4>주사위 보관</h4>
                <p>
                  남기고 싶은 주사위를 누르면 KEEP 상태가 되어 다음
                  굴리기에서도 숫자가 유지됩니다.
                </p>
              </div>
            </li>
            <li>
              <strong>3</strong>
              <div>
                <h4>최대 세 번 굴리기</h4>
                <p>
                  한 라운드에 최대 세 번까지 굴릴 수 있으며, 첫 번째나 두
                  번째 굴리기 후 바로 점수를 선택해도 됩니다.
                </p>
              </div>
            </li>
            <li>
              <strong>4</strong>
              <div>
                <h4>점수 확정</h4>
                <p>
                  현재 플레이어의 점수표에서 항목 하나를 선택하면 점수가
                  확정되고, 주사위가 초기화된 뒤 상대 플레이어에게 차례가
                  넘어갑니다.
                </p>
              </div>
            </li>
          </ol>
        </section>

        <section className="guide-rule-section">
          <h3>점수 항목</h3>
          <p className="guide-section-description">
            각 항목은 게임당 한 번만 선택할 수 있습니다. 조건을 만족하지
            못한 항목도 선택할 수 있지만 0점으로 확정됩니다.
          </p>

          <table className="guide-score-table">
            <colgroup>
              <col className="guide-category-column" />
              <col />
              <col className="guide-score-column" />
            </colgroup>
            <thead>
              <tr>
                <th scope="col">항목</th>
                <th scope="col">조건</th>
                <th scope="col">점수</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Ones</th>
                <td>1이 나온 주사위</td>
                <td>1의 합</td>
              </tr>
              <tr>
                <th scope="row">Twos</th>
                <td>2가 나온 주사위</td>
                <td>2의 합</td>
              </tr>
              <tr>
                <th scope="row">Threes</th>
                <td>3이 나온 주사위</td>
                <td>3의 합</td>
              </tr>
              <tr>
                <th scope="row">Fours</th>
                <td>4가 나온 주사위</td>
                <td>4의 합</td>
              </tr>
              <tr>
                <th scope="row">Fives</th>
                <td>5가 나온 주사위</td>
                <td>5의 합</td>
              </tr>
              <tr>
                <th scope="row">Sixes</th>
                <td>6이 나온 주사위</td>
                <td>6의 합</td>
              </tr>
              <tr>
                <th scope="row">Choice</th>
                <td>조건 없음</td>
                <td>5개 전체 합</td>
              </tr>
              <tr>
                <th scope="row">Four of a Kind</th>
                <td>같은 숫자가 4개 이상</td>
                <td>5개 전체 합</td>
              </tr>
              <tr>
                <th scope="row">Full House</th>
                <td>같은 숫자 3개 + 다른 같은 숫자 2개</td>
                <td>5개 전체 합</td>
              </tr>
              <tr>
                <th scope="row">Small Straight</th>
                <td>서로 다른 숫자 4개 이상이 연속</td>
                <td>15점</td>
              </tr>
              <tr>
                <th scope="row">Large Straight</th>
                <td>서로 다른 숫자 5개가 연속</td>
                <td>30점</td>
              </tr>
              <tr>
                <th scope="row">Yacht</th>
                <td>주사위 5개가 모두 같은 숫자</td>
                <td>50점</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section className="guide-rule-section">
          <h3>상단 보너스와 게임 종료</h3>
          <div className="guide-bonus-rule">
            <strong>+30</strong>
            <p>
              Ones부터 Sixes까지 숫자 점수의 합이 <b>63점 이상</b>이면
              보너스 30점이 자동으로 추가됩니다.
            </p>
          </div>
          <ul className="guide-notes">
            <li>
              1P부터 시작하며, 점수를 확정할 때마다 1P와 2P의 차례가
              자동으로 바뀝니다.
            </li>
            <li>
              각 플레이어는 총 12번의 차례 동안 매번 점수 항목 하나를
              확정합니다.
            </li>
            <li>확정한 항목은 다시 선택하거나 변경할 수 없습니다.</li>
            <li>
              같은 숫자 5개인 Yacht는 Full House 조건으로 인정하지 않습니다.
            </li>
            <li>
              두 플레이어가 모두 12개 항목을 채우면 보너스를 포함한 최종
              점수를 비교해 승자를 표시합니다.
            </li>
          </ul>
        </section>

        <footer className="guide-actions">
          <button
            className="guide-secondary-button"
            type="button"
            onClick={onDontShowAgain}
          >
            다시 보지 않기
          </button>
          <button
            ref={closeButtonRef}
            className="guide-primary-button"
            type="button"
            onClick={onClose}
          >
            게임 시작
          </button>
        </footer>
      </section>
    </div>
  )
}

export default YachtGuide
