import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import YachtDiceGame from '../games/yacht-dice/YachtDiceGame'
import YachtGuide from '../games/yacht-dice/components/YachtGuide'

const HIDE_GUIDE_STORAGE_KEY = 'minigamejoin:yacht-guide-hidden'

function YachtDicePage() {
  const [showGuide, setShowGuide] = useState(false)

  useEffect(() => {
    try {
      const shouldHideGuide =
        window.localStorage.getItem(HIDE_GUIDE_STORAGE_KEY) === 'true'
      setShowGuide(!shouldHideGuide)
    } catch {
      setShowGuide(true)
    }
  }, [])

  const hideGuidePermanently = () => {
    try {
      window.localStorage.setItem(HIDE_GUIDE_STORAGE_KEY, 'true')
    } catch {
      // 저장할 수 없는 환경에서도 현재 안내 화면은 정상적으로 닫습니다.
    }

    setShowGuide(false)
  }

  return (
    <>
      {showGuide && (
        <YachtGuide
          onClose={() => setShowGuide(false)}
          onDontShowAgain={hideGuidePermanently}
        />
      )}

      <main className="page yacht-page">
        <header className="site-header">
          <Link className="brand" to="/">
            MiniGameJoin
          </Link>
          <Link className="back-link" to="/local">
            ← 로컬 게임 목록
          </Link>
        </header>

        <section className="game-title">
          <div>
            <p className="eyebrow">DICE GAME</p>
            <h1>Yacht Dice</h1>
            <p>
              두 명이 번갈아 주사위를 최대 세 번 굴리고 점수 조합을
              선택하세요.
            </p>
          </div>
          <div className="game-title-actions">
            <button type="button" onClick={() => setShowGuide(true)}>
              게임 방법
            </button>
            <span className="status">로컬 2인</span>
          </div>
        </section>

        <YachtDiceGame />
      </main>
    </>
  )
}

export default YachtDicePage
