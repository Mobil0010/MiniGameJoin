export function isAndroidUpdateRequired(
  installedVersionCode: number,
  minimumVersionCode: number,
): boolean {
  return installedVersionCode < minimumVersionCode
}
