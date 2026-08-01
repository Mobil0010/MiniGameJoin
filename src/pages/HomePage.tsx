import { Link } from 'react-router'
import NativeAppSettingsButton from '../components/NativeAppSettingsButton'

function HomePage() {
  return (
    <main className="page">
      <header className="site-header">
        <Link className="brand" to="/">
          MiniGameJoin
        </Link>
        <div className="header-actions">
          <span className="header-copy">웹 미니게임 모음</span>
          <NativeAppSettingsButton />
        </div>
      </header>

      <section className="home-hero">
        <p className="eyebrow">MINI GAME ARCADE</p>
        <h1>골라서 바로 즐겨보세요.</h1>
        <p>설치 없이 브라우저에서 가볍게 플레이하는 미니게임 공간입니다.</p>
      </section>

      <section aria-labelledby="game-list-title">
        <div className="section-title">
          <h2 id="game-list-title">게임 목록</h2>
          <span>1개 준비됨</span>
        </div>

        <div className="game-grid">
          <Link className="game-card game-card-ready" to="/yacht-dice">
            <span className="game-icon" aria-hidden="true">
              ⚄
            </span>
            <div>
              <span className="badge">로컬·온라인</span>
              <h3>Yacht Dice</h3>
              <p>두 명이 번갈아 주사위를 굴려 최고의 조합을 만들어보세요.</p>
            </div>
            <strong>입장하기 →</strong>
          </Link>

          <article className="game-card game-card-soon">
            <span className="game-icon" aria-hidden="true">
              ✌
            </span>
            <div>
              <span className="badge">준비 중</span>
              <h3>가위바위보</h3>
              <p>컴퓨터와 빠르게 승부하는 가위바위보 게임입니다.</p>
            </div>
          </article>

          <article className="game-card game-card-soon">
            <span className="game-icon" aria-hidden="true">
              ?
            </span>
            <div>
              <span className="badge">준비 중</span>
              <h3>스피드 퀴즈</h3>
              <p>제한 시간 안에 정답을 맞히는 퀴즈 게임입니다.</p>
            </div>
          </article>
        </div>
      </section>
    </main>
  )
}

export default HomePage
