interface MiniGameJoinNativeBridge {
  isAndroidApp?: () => boolean
}

declare global {
  interface Window {
    MiniGameJoinNative?: MiniGameJoinNativeBridge
  }
}

export function isAndroidNativeApp(): boolean {
  return typeof window.MiniGameJoinNative?.isAndroidApp === 'function'
}
