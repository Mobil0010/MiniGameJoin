interface MiniGameJoinNativeBridge {
  isAndroidApp?: () => boolean
  getInstalledVersionName?: () => string
  getInstalledVersionCode?: () => number
}

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
