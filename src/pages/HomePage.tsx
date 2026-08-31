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
        <div className="hero-status" aria-hidden="true">
          <span>● ONLINE</span>
          <span>2 GAME MODES</span>
        </div>
        <p className="eyebrow">MINI GAME ARCADE</p>
        <h1>
          오늘은 누구와<br />
          <em>한 판 할까?</em>
        </h1>
        <p>한 화면에서 바로 붙거나, 온라인에서 친구를 초대해 플레이해.</p>
        <div className="hero-decorations" aria-hidden="true">
          <span>✦</span>
          <span>⚡</span>
          <span>✦</span>
        </div>
      </section>

      <section className="mode-grid" aria-label="플레이 방식 선택">
        <Link className="mode-card mode-card-local" to="/local">
          <span className="mode-icon" aria-hidden="true">
            🎲
          </span>
          <span className="mode-number" aria-hidden="true">01</span>
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
          <span className="mode-number" aria-hidden="true">02</span>
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
