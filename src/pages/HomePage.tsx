import { Link } from 'react-router'
import NativeAppSettingsButton from '../components/NativeAppSettingsButton'

function HomePage() {
  return (
    <main className="page mode-page">
      <header className="site-header">
        <Link className="brand" to="/">
          MiniGameJoin
        </Link>
        <div className="header-actions">
          <span className="header-copy">원하는 방식으로 바로 플레이</span>
          <NativeAppSettingsButton />
        </div>
      </header>

      <section className="mode-hero">
        <p className="eyebrow">MINI GAME ARCADE</p>
        <h1>어떻게 플레이할까요?</h1>
        <p>한 화면에서 함께 플레이하거나 온라인에서 친구와 만나보세요.</p>
      </section>

      <section className="mode-grid" aria-label="플레이 방식 선택">
        <Link className="mode-card mode-card-local" to="/local">
          <span className="mode-icon" aria-hidden="true">
            🎲
          </span>
          <div>
            <span className="badge">한 화면에서 바로 시작</span>
            <h2>로컬 플레이</h2>
            <p>
              로그인 없이 같은 기기를 공유하며 준비된 로컬 게임을
              플레이합니다.
            </p>
          </div>
          <strong>로컬 게임 목록 →</strong>
        </Link>

        <Link className="mode-card mode-card-online" to="/online">
          <span className="mode-icon" aria-hidden="true">
            🌐
          </span>
          <div>
            <span className="badge">온라인 플레이 가능</span>
            <h2>웹 멀티플레이</h2>
            <p>
              로그인하거나 게스트로 입장한 뒤 온라인 게임을 선택하고 친구와
              플레이합니다.
            </p>
          </div>
          <strong>온라인 입장 →</strong>
        </Link>
      </section>
    </main>
  )
}

export default HomePage
