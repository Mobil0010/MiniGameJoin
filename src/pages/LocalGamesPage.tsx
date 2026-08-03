import { Link } from 'react-router'

function LocalGamesPage() {
  return (
    <main className="page">
      <header className="site-header">
        <Link className="brand" to="/">
          MiniGameJoin
        </Link>
        <Link className="back-link" to="/">
          ← 플레이 방식
        </Link>
      </header>

      <section className="home-hero">
        <p className="eyebrow">LOCAL PLAY</p>
        <h1>로컬 플레이 게임</h1>
        <p>한 화면에서 두 명이 번갈아 플레이할 게임을 선택하세요.</p>
      </section>

      <section aria-labelledby="local-game-list-title">
        <div className="section-title">
          <h2 id="local-game-list-title">게임 목록</h2>
          <span>1개 플레이 가능</span>
        </div>

        <div className="game-grid single-game-grid">
          <Link
            className="game-card game-card-ready"
            to="/yacht-dice/local"
          >
            <span className="game-icon" aria-hidden="true">
              ⚄
            </span>
            <div>
              <span className="badge">로컬 2인</span>
              <h3>Yacht Dice</h3>
              <p>
                두 명이 번갈아 주사위를 굴려 최고의 점수 조합을 만듭니다.
              </p>
            </div>
            <strong>게임 시작 →</strong>
          </Link>
        </div>
      </section>
    </main>
  )
}

export default LocalGamesPage
