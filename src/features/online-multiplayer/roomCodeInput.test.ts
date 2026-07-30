import { describe, expect, it } from 'vitest'
import { normalizeRoomCodeInput } from './roomCodeInput'

describe('normalizeRoomCodeInput', () => {
  it('keeps English letters and numbers and normalizes them to uppercase', () => {
    expect(normalizeRoomCodeInput('ab-c12!')).toBe('ABC12')
  })

  it('does not convert Korean input into a room code', () => {
    expect(normalizeRoomCodeInput('한글ABC123')).toBe('ABC123')
  })

  it('limits a room code to six characters', () => {
    expect(normalizeRoomCodeInput('QWERTY7')).toBe('QWERTY')
  })
})
