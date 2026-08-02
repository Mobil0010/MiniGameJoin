export type GameSoundEvent =
  | 'dice_roll'
  | 'dice_hold'
  | 'score_confirm'
  | 'combination'
  | 'yacht'
  | 'turn'

interface SoundDefinition {
  sources: readonly string[]
  volume: number
  minimumIntervalMs: number
  playbackRateVariance?: number
}

const SOUND_DEFINITIONS: Record<GameSoundEvent, SoundDefinition> = {
  dice_roll: {
    sources: [
      '/audio/dice-roll-1.ogg',
      '/audio/dice-roll-2.ogg',
      '/audio/dice-roll-3.ogg',
    ],
    volume: 0.72,
    minimumIntervalMs: 260,
    playbackRateVariance: 0.045,
  },
  dice_hold: {
    sources: ['/audio/dice-hold-1.ogg', '/audio/dice-hold-2.ogg'],
    volume: 0.56,
    minimumIntervalMs: 90,
    playbackRateVariance: 0.035,
  },
  score_confirm: {
    sources: ['/audio/score-confirm.ogg'],
    volume: 0.58,
    minimumIntervalMs: 350,
  },
  combination: {
    sources: ['/audio/combination.ogg'],
    volume: 0.64,
    minimumIntervalMs: 550,
  },
  yacht: {
    sources: ['/audio/yacht.ogg'],
    volume: 0.78,
    minimumIntervalMs: 1200,
  },
  turn: {
    sources: ['/audio/turn.ogg'],
    volume: 0.48,
    minimumIntervalMs: 650,
  },
}

const lastPlayedAt: Partial<Record<GameSoundEvent, number>> = {}

function chooseSource(sources: readonly string[]) {
  return sources[Math.floor(Math.random() * sources.length)] ?? sources[0]
}

export function playGameSound(event: GameSoundEvent): void {
  if (typeof Audio === 'undefined') {
    return
  }

  const definition = SOUND_DEFINITIONS[event]
  const now = performance.now()
  const previousPlayedAt = lastPlayedAt[event] ?? Number.NEGATIVE_INFINITY
  if (now - previousPlayedAt < definition.minimumIntervalMs) {
    return
  }
  lastPlayedAt[event] = now

  const audio = new Audio(chooseSource(definition.sources))
  audio.preload = 'auto'
  audio.volume = definition.volume

  if (definition.playbackRateVariance) {
    const variance = definition.playbackRateVariance
    audio.playbackRate = 1 + (Math.random() * 2 - 1) * variance
  }

  void audio.play().catch(() => {
    // Browsers may reject sound until the user has interacted with the page.
  })
}
