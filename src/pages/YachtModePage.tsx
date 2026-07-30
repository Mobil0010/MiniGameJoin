import { Link } from 'react-router'

function YachtModePage() {
  return (
    <main className="page mode-page">
      <header className="site-header">
        <Link className="brand" to="/">
          MiniGameJoin
        </Link>
        <Link className="back-link" to="/">
          ← 게임 목록
        </Link>
      </header>

      <section className="mode-hero">
        <p className="eyebrow">YACHT DICE</p>
        <h1>어떻게 플레이할까요?</h1>
        <p>같은 화면에서 즐기거나 온라인에서 친구와 방을 만들어보세요.</p>
      </section>

      <section className="mode-grid" aria-label="플레이 방식 선택">
        <Link className="mode-card mode-card-local" to="/yacht-dice/local">
          <span className="mode-icon" aria-hidden="true">
            🎲
          </span>
          <div>
            <span className="badge">바로 플레이</span>
            <h2>로컬 2인 플레이</h2>
            <p>
              한 모니터에서 주사위 하나를 공유하고 1P와 2P가 번갈아
              플레이합니다.
            </p>
          </div>
          <strong>로컬 게임 시작 →</strong>
        </Link>

        <Link className="mode-card mode-card-online" to="/yacht-dice/online">
          <span className="mode-icon" aria-hidden="true">
            🌐
          </span>
          <div>
            <span className="badge">온라인 준비 중</span>
            <h2>웹 멀티플레이</h2>
            <p>
              로그인하거나 게스트로 입장한 뒤 방을 만들고 초대 코드로
              친구와 만납니다.
            </p>
          </div>
          <strong>온라인 로비 입장 →</strong>
        </Link>
      </section>
    </main>
  )
}

export default YachtModePage
