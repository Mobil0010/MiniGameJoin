import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { isAndroidUpdateRequired } from './androidUpdatePolicy.ts'

describe('required Android update gate', () => {
  it('blocks versions below the minimum and allows the minimum itself', () => {
    expect(isAndroidUpdateRequired(3, 4)).toBe(true)
    expect(isAndroidUpdateRequired(4, 4)).toBe(false)
  })

  it('keeps every published Android update mandatory', () => {
    const manifest = JSON.parse(
      readFileSync(new URL('../../public/app-update.json', import.meta.url), 'utf8'),
    )

    expect(manifest.android.minimumVersionCode).toBe(manifest.android.latestVersionCode)
    expect(manifest.android.apkUrl).toContain(
      `/download/v${manifest.android.latestVersionName}/`,
    )
  })
})
