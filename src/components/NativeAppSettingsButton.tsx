import {
  getAndroidAppVersion,
  isAndroidNativeApp,
  openAndroidAppSettings,
} from '../platform/nativeApp'

function NativeAppSettingsButton() {
  if (!isAndroidNativeApp()) {
    return null
  }

  const version = getAndroidAppVersion()

  return (
    <button
      className="native-app-settings-button"
      type="button"
      title={version ? `Android ${version.versionName}` : 'Android 앱 설정'}
      onClick={openAndroidAppSettings}
    >
      <span aria-hidden="true">⚙</span>
      앱 설정
    </button>
  )
}

export default NativeAppSettingsButton
