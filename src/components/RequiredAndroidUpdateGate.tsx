import { type ReactNode, useEffect, useState } from 'react'
import { getAndroidAppVersion } from '../platform/nativeApp'
import { isAndroidUpdateRequired } from './androidUpdatePolicy'

interface AndroidUpdateManifest {
  minimumVersionCode: number
  latestVersionCode: number
  latestVersionName?: string
  title?: string
  message?: string
  apkUrl?: string
  releasePageUrl?: string
}

type GateState =
  | { status: 'checking' }
  | { status: 'allowed' }
  | { status: 'required'; update: AndroidUpdateManifest }
  | { status: 'error' }

interface RequiredAndroidUpdateGateProps {
  children: ReactNode
}

function RequiredAndroidUpdateGate({ children }: RequiredAndroidUpdateGateProps) {
  const [installedVersion] = useState(() => getAndroidAppVersion())
  const [attempt, setAttempt] = useState(0)
  const [gateState, setGateState] = useState<GateState>(() =>
    installedVersion ? { status: 'checking' } : { status: 'allowed' },
  )

  useEffect(() => {
    if (!installedVersion) {
      setGateState({ status: 'allowed' })
      return
    }

    const controller = new AbortController()
    setGateState({ status: 'checking' })

    fetch(`/app-update.json?required-update-check=${Date.now()}`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Update manifest request failed: ${response.status}`)
        }
        return response.json()
      })
      .then((manifest: { android?: AndroidUpdateManifest }) => {
        const update = manifest.android
        if (
          !update ||
          !Number.isInteger(update.minimumVersionCode) ||
          !Number.isInteger(update.latestVersionCode)
        ) {
          throw new Error('Invalid Android update manifest')
        }

        setGateState(
          isAndroidUpdateRequired(installedVersion.versionCode, update.minimumVersionCode)
            ? { status: 'required', update }
            : { status: 'allowed' },
        )
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }
        setGateState({ status: 'error' })
      })

    return () => controller.abort()
  }, [attempt, installedVersion])

  if (gateState.status === 'allowed') {
    return children
  }

  const update = gateState.status === 'required' ? gateState.update : null
  const downloadUrl = update?.apkUrl || update?.releasePageUrl

  return (
    <main className="required-update-gate" role="dialog" aria-modal="true">
      <section className="required-update-card">
        <span className="required-update-label">ANDROID REQUIRED UPDATE</span>
        <h1>
          {gateState.status === 'checking'
            ? '앱 버전을 확인하고 있습니다'
            : gateState.status === 'error'
              ? '버전을 확인할 수 없습니다'
              : update?.title || '필수 업데이트가 있습니다'}
        </h1>

        {gateState.status === 'checking' && (
          <p>잠시만 기다려 주세요. 확인이 끝나기 전에는 게임을 시작할 수 없습니다.</p>
        )}

        {gateState.status === 'error' && (
          <>
            <p>안전한 플레이를 위해 버전 확인에 성공할 때까지 게임 실행을 중지합니다.</p>
            <button type="button" onClick={() => setAttempt((value) => value + 1)}>
              다시 확인
            </button>
          </>
        )}

        {gateState.status === 'required' && update && (
          <>
            <p>{update.message || '최신 버전을 설치해야 MiniGameJoin을 계속 이용할 수 있습니다.'}</p>
            <dl className="required-update-versions">
              <div>
                <dt>현재 버전</dt>
                <dd>{installedVersion?.versionName}</dd>
              </div>
              <div>
                <dt>필수 버전</dt>
                <dd>{update.latestVersionName || update.latestVersionCode}</dd>
              </div>
            </dl>
            <p className="required-update-help">
              위에 표시된 Android 업데이트 버튼으로 APK를 받은 뒤, 다운로드 완료 알림을 눌러 설치하세요.
              설치가 끝나면 앱을 다시 실행하면 됩니다.
            </p>
            {downloadUrl && (
              <button type="button" onClick={() => window.location.assign(downloadUrl)}>
                GitHub에서 업데이트 받기
              </button>
            )}
          </>
        )}
      </section>
    </main>
  )
}

export default RequiredAndroidUpdateGate
