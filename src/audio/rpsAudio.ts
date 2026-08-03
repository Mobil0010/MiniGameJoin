import type { RpsHand } from '../features/online-multiplayer/types'

export type RpsMusicScene =
  | 'lobby'
  | 'selecting'
  | 'urgent'
  | 'victory'
  | 'defeat'

export type RpsSoundEvent =
  | 'countdown'
  | 'countdown_urgent'
  | 'reveal'
  | 'round_win'
  | 'round_lose'
  | 'draw'
  | 'match_win'
  | 'match_lose'

const MUTE_STORAGE_KEY = 'minigamejoin:rps-audio-muted'

let audioContext: AudioContext | null = null
let musicGain: GainNode | null = null
let musicTimer: number | null = null
let currentScene: RpsMusicScene | null = null
let muted = false

try {
  muted = window.localStorage.getItem(MUTE_STORAGE_KEY) === 'true'
} catch {
  // 저장소를 사용할 수 없는 환경에서는 기본값을 사용합니다.
}

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const AudioContextClass = window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext
  if (!AudioContextClass) return null
  audioContext ??= new AudioContextClass()
  return audioContext
}

function scheduleTone(
  context: AudioContext,
  destination: AudioNode,
  frequency: number,
  startsAt: number,
  duration: number,
  volume: number,
  type: OscillatorType = 'sine',
): void {
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  oscillator.type = type
  oscillator.frequency.setValueAtTime(frequency, startsAt)
  gain.gain.setValueAtTime(0.0001, startsAt)
  gain.gain.exponentialRampToValueAtTime(volume, startsAt + 0.025)
  gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + duration)
  oscillator.connect(gain)
  gain.connect(destination)
  oscillator.start(startsAt)
  oscillator.stop(startsAt + duration + 0.03)
}

function scheduleNoise(
  context: AudioContext,
  destination: AudioNode,
  startsAt: number,
  duration: number,
  volume: number,
): void {
  const length = Math.max(1, Math.floor(context.sampleRate * duration))
  const buffer = context.createBuffer(1, length, context.sampleRate)
  const data = buffer.getChannelData(0)
  for (let index = 0; index < length; index += 1) {
    data[index] = (Math.random() * 2 - 1) * (1 - index / length)
  }
  const source = context.createBufferSource()
  const gain = context.createGain()
  const filter = context.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = 900
  filter.Q.value = 0.7
  source.buffer = buffer
  gain.gain.setValueAtTime(volume, startsAt)
  gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + duration)
  source.connect(filter)
  filter.connect(gain)
  gain.connect(destination)
  source.start(startsAt)
}

function scheduleMusicPhrase(scene: RpsMusicScene): void {
  const context = getAudioContext()
  if (!context || !musicGain || muted || context.state !== 'running') return
  const start = context.currentTime + 0.04

  if (scene === 'lobby') {
    ;[523.25, 659.25, 783.99, 659.25].forEach((frequency, index) => {
      scheduleTone(context, musicGain!, frequency, start + index * 0.42, 0.34, 0.12, 'sine')
    })
    scheduleTone(context, musicGain, 261.63, start, 1.65, 0.055, 'triangle')
    return
  }

  if (scene === 'selecting') {
    ;[110, 164.81, 110, 196].forEach((frequency, index) => {
      scheduleTone(context, musicGain!, frequency, start + index * 0.32, 0.22, 0.12, 'triangle')
    })
    ;[440, 523.25, 659.25].forEach((frequency, index) => {
      scheduleTone(context, musicGain!, frequency, start + 0.16 + index * 0.42, 0.18, 0.045, 'sine')
    })
    return
  }

  if (scene === 'urgent') {
    for (let index = 0; index < 6; index += 1) {
      scheduleTone(
        context,
        musicGain,
        index % 2 === 0 ? 146.83 : 220,
        start + index * 0.16,
        0.095,
        0.14,
        'square',
      )
    }
    return
  }

  const notes = scene === 'victory'
    ? [523.25, 659.25, 783.99, 1046.5]
    : [392, 349.23, 293.66, 261.63]
  notes.forEach((frequency, index) => {
    scheduleTone(context, musicGain!, frequency, start + index * 0.34, 0.42, 0.1, 'triangle')
  })
}

function getSceneInterval(scene: RpsMusicScene): number {
  if (scene === 'lobby') return 1850
  if (scene === 'selecting') return 1450
  if (scene === 'urgent') return 1050
  return 1750
}

export function unlockRpsAudio(): void {
  if (muted) return
  const context = getAudioContext()
  if (!context || context.state === 'running') return
  void context.resume().then(() => {
    if (currentScene) scheduleMusicPhrase(currentScene)
  }).catch(() => undefined)
}

export function setRpsMusic(scene: RpsMusicScene): void {
  if (currentScene === scene && musicTimer !== null) return
  stopRpsMusic()
  currentScene = scene
  if (muted) return
  const context = getAudioContext()
  if (!context) return
  musicGain = context.createGain()
  musicGain.gain.value = 0.34
  musicGain.connect(context.destination)
  scheduleMusicPhrase(scene)
  musicTimer = window.setInterval(
    () => scheduleMusicPhrase(scene),
    getSceneInterval(scene),
  )
}

export function stopRpsMusic(): void {
  if (musicTimer !== null) {
    window.clearInterval(musicTimer)
    musicTimer = null
  }
  if (musicGain && audioContext) {
    const previousGain = musicGain
    const now = audioContext.currentTime
    previousGain.gain.cancelScheduledValues(now)
    previousGain.gain.setValueAtTime(Math.max(0.0001, previousGain.gain.value), now)
    previousGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18)
    window.setTimeout(() => previousGain.disconnect(), 220)
  }
  musicGain = null
  currentScene = null
}

export function playRpsHandSound(hand: RpsHand): void {
  if (muted) return
  unlockRpsAudio()
  const context = getAudioContext()
  if (!context || context.state !== 'running') return
  const frequency = hand === 'scissors' ? 880 : hand === 'rock' ? 220 : 587.33
  scheduleTone(context, context.destination, frequency, context.currentTime, 0.13, 0.12, 'triangle')
  scheduleTone(context, context.destination, frequency * 1.5, context.currentTime + 0.035, 0.09, 0.055, 'sine')
}

export function playRpsSound(event: RpsSoundEvent): void {
  if (muted) return
  const context = getAudioContext()
  if (!context || context.state !== 'running') return
  const now = context.currentTime

  if (event === 'countdown' || event === 'countdown_urgent') {
    scheduleTone(
      context,
      context.destination,
      event === 'countdown_urgent' ? 880 : 440,
      now,
      event === 'countdown_urgent' ? 0.12 : 0.08,
      event === 'countdown_urgent' ? 0.13 : 0.075,
      'square',
    )
    return
  }

  if (event === 'reveal') {
    scheduleNoise(context, context.destination, now, 0.34, 0.2)
    scheduleTone(context, context.destination, 110, now + 0.12, 0.38, 0.2, 'sawtooth')
    scheduleTone(context, context.destination, 440, now + 0.24, 0.22, 0.11, 'triangle')
    return
  }

  const patterns: Record<Exclude<RpsSoundEvent, 'countdown' | 'countdown_urgent' | 'reveal'>, number[]> = {
    round_win: [523.25, 659.25, 783.99],
    round_lose: [392, 329.63, 261.63],
    draw: [440, 440, 440],
    match_win: [523.25, 659.25, 783.99, 1046.5],
    match_lose: [392, 349.23, 293.66, 220],
  }
  patterns[event].forEach((frequency, index) => {
    scheduleTone(
      context,
      context.destination,
      frequency,
      now + index * 0.13,
      event.startsWith('match') ? 0.34 : 0.2,
      event.startsWith('match') ? 0.15 : 0.1,
      'triangle',
    )
  })
}

export function isRpsAudioMuted(): boolean {
  return muted
}

export function setRpsAudioMuted(nextMuted: boolean): void {
  muted = nextMuted
  try {
    window.localStorage.setItem(MUTE_STORAGE_KEY, String(nextMuted))
  } catch {
    // 저장 실패 시 현재 페이지의 설정만 유지합니다.
  }
  if (nextMuted) {
    stopRpsMusic()
  } else {
    unlockRpsAudio()
  }
}
