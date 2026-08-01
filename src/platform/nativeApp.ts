interface MiniGameJoinNativeBridge {
  isAndroidApp?: () => boolean
  getInstalledVersionName?: () => string
  getInstalledVersionCode?: () => number
  performFeedback?: (eventName: AndroidFeedbackEvent) => void
  openSettings?: () => void
  shareInvite?: (roomCode: string) => void
  setGameSessionActive?: (active: boolean) => void
}

export type AndroidFeedbackEvent =
  | 'dice_roll'
  | 'dice_hold'
  | 'score_confirm'
  | 'yacht'
  | 'chat'
  | 'turn'

declare global {
  interface Window {
    MiniGameJoinNative?: MiniGameJoinNativeBridge
  }
}

export function isAndroidNativeApp(): boolean {
  return typeof window.MiniGameJoinNative?.isAndroidApp === 'function'
}

export function getAndroidAppVersion(): {
  versionName: string
  versionCode: number
} | null {
  const bridge = window.MiniGameJoinNative
  if (
    typeof bridge?.getInstalledVersionName !== 'function' ||
    typeof bridge.getInstalledVersionCode !== 'function'
  ) {
    return null
  }

  return {
    versionName: bridge.getInstalledVersionName(),
    versionCode: bridge.getInstalledVersionCode(),
  }
}

export function performAndroidFeedback(eventName: AndroidFeedbackEvent): void {
  window.MiniGameJoinNative?.performFeedback?.(eventName)
}

export function openAndroidAppSettings(): void {
  window.MiniGameJoinNative?.openSettings?.()
}

export function shareAndroidInvite(roomCode: string): void {
  window.MiniGameJoinNative?.shareInvite?.(roomCode)
}

export function setAndroidGameSessionActive(active: boolean): void {
  window.MiniGameJoinNative?.setGameSessionActive?.(active)
}
