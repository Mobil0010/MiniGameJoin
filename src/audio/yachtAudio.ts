export type YachtMusicScene =
  | 'calm'
  | 'active'
  | 'decision'
  | 'finale'
  | 'victory'
  | 'defeat'
  | 'draw'

export type YachtResultSound = 'victory' | 'defeat' | 'draw'

const MUTE_STORAGE_KEY = 'minigamejoin:yacht-music-muted'

let audioContext: AudioContext | null = null
let musicGain: GainNode | null = null
let musicTimer: number | null = null
let currentScene: YachtMusicScene | null = null
let muted = false

try {
  muted = window.localStorage.getItem(MUTE_STORAGE_KEY) === 'true'
} catch {
  // 저장소를 사용할 수 없는 환경에서는 현재 페이지의 기본값을 사용합니다.
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
  gain.gain.exponentialRampToValueAtTime(volume, startsAt + 0.035)
  gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + duration)
  oscillator.connect(gain)
  gain.connect(destination)
  oscillator.start(startsAt)
  oscillator.stop(startsAt + duration + 0.04)
}

function scheduleSoftBeat(
  context: AudioContext,
  destination: AudioNode,
  startsAt: number,
  volume: number,
): void {
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(118, startsAt)
  oscillator.frequency.exponentialRampToValueAtTime(48, startsAt + 0.12)
  gain.gain.setValueAtTime(volume, startsAt)
  gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + 0.16)
  oscillator.connect(gain)
  gain.connect(destination)
  oscillator.start(startsAt)
  oscillator.stop(startsAt + 0.18)
}

function scheduleShimmer(
  context: AudioContext,
  destination: AudioNode,
  startsAt: number,
): void {
  const length = Math.floor(context.sampleRate * 0.42)
  const buffer = context.createBuffer(1, length, context.sampleRate)
  const channel = buffer.getChannelData(0)
  for (let index = 0; index < length; index += 1) {
    channel[index] = (Math.random() * 2 - 1) * (1 - index / length)
  }
  const source = context.createBufferSource()
  const filter = context.createBiquadFilter()
  const gain = context.createGain()
  source.buffer = buffer
  filter.type = 'highpass'
  filter.frequency.value = 2200
  gain.gain.setValueAtTime(0.055, startsAt)
  gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + 0.42)
  source.connect(filter)
  filter.connect(gain)
  gain.connect(destination)
  source.start(startsAt)
}

function schedulePhrase(scene: YachtMusicScene): void {
  const context = getAudioContext()
  if (!context || !musicGain || muted || context.state !== 'running') return
  const start = context.currentTime + 0.045

  if (scene === 'calm') {
    ;[261.63, 329.63, 392, 493.88].forEach((frequency, index) => {
      scheduleTone(context, musicGain!, frequency, start + index * 0.48, 0.7, 0.052)
    })
    scheduleTone(context, musicGain, 130.81, start, 2.05, 0.036, 'triangle')
    return
  }

  if (scene === 'active') {
    ;[293.66, 369.99, 440, 587.33].forEach((frequency, index) => {
      scheduleTone(context, musicGain!, frequency, start + index * 0.34, 0.38, 0.058, 'triangle')
      if (index % 2 === 0) scheduleSoftBeat(context, musicGain!, start + index * 0.34, 0.038)
    })
    return
  }

  if (scene === 'decision') {
    ;[220, 261.63, 329.63, 392, 329.63, 440].forEach((frequency, index) => {
      scheduleTone(context, musicGain!, frequency, start + index * 0.24, 0.28, 0.06, 'triangle')
      scheduleSoftBeat(context, musicGain!, start + index * 0.24, 0.032)
    })
    return
  }

  if (scene === 'finale') {
    ;[164.81, 246.94, 329.63, 493.88, 659.25, 493.88, 739.99, 659.25].forEach(
      (frequency, index) => {
        scheduleTone(context, musicGain!, frequency, start + index * 0.18, 0.22, 0.062, 'triangle')
        scheduleSoftBeat(context, musicGain!, start + index * 0.18, 0.04)
      },
    )
    return
  }

  const notes = scene === 'victory'
    ? [523.25, 659.25, 783.99, 1046.5]
    : scene === 'defeat'
      ? [392, 349.23, 293.66, 220]
      : [392, 440, 392, 329.63]
  notes.forEach((frequency, index) => {
    scheduleTone(context, musicGain!, frequency, start + index * 0.42, 0.62, 0.058, 'sine')
  })
}

function getSceneInterval(scene: YachtMusicScene): number {
  if (scene === 'calm') return 2300
  if (scene === 'active') return 1650
  if (scene === 'decision') return 1580
  if (scene === 'finale') return 1540
  return 2050
}

export function unlockYachtAudio(): void {
  if (muted) return
  const context = getAudioContext()
  if (!context || context.state === 'running') return
  void context.resume().then(() => {
    if (currentScene) schedulePhrase(currentScene)
  }).catch(() => undefined)
}

export function setYachtMusic(scene: YachtMusicScene): void {
  if (currentScene === scene && musicTimer !== null) return
  stopYachtMusic()
  currentScene = scene
  if (muted) return
  const context = getAudioContext()
  if (!context) return
  musicGain = context.createGain()
  musicGain.gain.value = 0.28
  musicGain.connect(context.destination)
  schedulePhrase(scene)
  musicTimer = window.setInterval(
    () => schedulePhrase(scene),
    getSceneInterval(scene),
  )
}

export function stopYachtMusic(): void {
  if (musicTimer !== null) {
    window.clearInterval(musicTimer)
    musicTimer = null
  }
  if (musicGain && audioContext) {
    const previousGain = musicGain
    const now = audioContext.currentTime
    previousGain.gain.cancelScheduledValues(now)
    previousGain.gain.setValueAtTime(Math.max(0.0001, previousGain.gain.value), now)
    previousGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.24)
    window.setTimeout(() => previousGain.disconnect(), 280)
  }
  musicGain = null
  currentScene = null
}

export function playYachtResultSound(result: YachtResultSound): void {
  if (muted) return
  const context = getAudioContext()
  if (!context) return

  const play = () => {
    const now = context.currentTime + 0.025
    const notes = result === 'victory'
      ? [523.25, 659.25, 783.99, 1046.5, 1318.51]
      : result === 'defeat'
        ? [440, 392, 329.63, 261.63, 196]
        : [392, 440, 392, 329.63]
    notes.forEach((frequency, index) => {
      scheduleTone(
        context,
        context.destination,
        frequency,
        now + index * (result === 'victory' ? 0.13 : 0.2),
        result === 'victory' ? 0.46 : 0.52,
        result === 'victory' ? 0.14 : 0.11,
        'triangle',
      )
    })
    if (result === 'victory') {
      scheduleShimmer(context, context.destination, now + 0.34)
      scheduleShimmer(context, context.destination, now + 0.68)
    } else if (result === 'defeat') {
      scheduleTone(context, context.destination, 98, now + 0.32, 1.2, 0.1, 'sine')
    }
  }

  if (context.state === 'running') {
    play()
  } else {
    void context.resume().then(play).catch(() => undefined)
  }
}

export function isYachtMusicMuted(): boolean {
  return muted
}

export function setYachtMusicMuted(nextMuted: boolean): void {
  muted = nextMuted
  try {
    window.localStorage.setItem(MUTE_STORAGE_KEY, String(nextMuted))
  } catch {
    // 저장 실패 시 현재 페이지의 설정만 유지합니다.
  }
  if (nextMuted) {
    stopYachtMusic()
  } else {
    unlockYachtAudio()
  }
}
