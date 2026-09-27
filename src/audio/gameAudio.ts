const MUTE_STORAGE_KEY = 'finalDayz.muted'

/** Tune these. Values are relative to MASTER_GAIN. */
export const SOUND_VOLUME = {
  master: 0.42,
  pistolShot: 0.34,
  smgShot: 0.16,
  shotgunShot: 0.46,
  zombieHit: 0.18,
  zombieDeath: 0.28,
  playerHurt: 0.4,
  barricadeHit: 0.26,
  barricadeLow: 0.32,
  barricadeDestroyed: 0.48,
  repair: 0.3,
  purchase: 0.28,
  notEnoughCash: 0.24,
  waveStart: 0.34,
  waveComplete: 0.36,
  gameOver: 0.4,
  wardenWarn: 0.5,
  wardenDeath: 0.52,
} as const

export type SoundId = Exclude<keyof typeof SOUND_VOLUME, 'master'>

type Tone = {
  kind: 'tone' | 'noise'
  freq: number
  freqEnd?: number
  duration: number
  gain: number
  delay?: number
  type?: OscillatorType
}

const RECIPES: Record<SoundId, { throttleMs: number; tones: Tone[] }> = {
  pistolShot: { throttleMs: 0, tones: [{ kind: 'noise', freq: 1800, duration: 0.05, gain: 0.7 }, { kind: 'tone', freq: 640, freqEnd: 180, duration: 0.07, gain: 0.35, type: 'square' }] },
  smgShot: { throttleMs: 0, tones: [{ kind: 'noise', freq: 2400, duration: 0.03, gain: 0.45 }, { kind: 'tone', freq: 880, freqEnd: 320, duration: 0.04, gain: 0.22, type: 'square' }] },
  shotgunShot: { throttleMs: 0, tones: [{ kind: 'noise', freq: 700, duration: 0.12, gain: 0.9 }, { kind: 'tone', freq: 140, freqEnd: 50, duration: 0.14, gain: 0.55, type: 'sawtooth' }] },
  zombieHit: { throttleMs: 70, tones: [{ kind: 'tone', freq: 420, freqEnd: 180, duration: 0.04, gain: 0.4, type: 'square' }] },
  zombieDeath: { throttleMs: 40, tones: [{ kind: 'noise', freq: 900, duration: 0.1, gain: 0.5 }, { kind: 'tone', freq: 280, freqEnd: 70, duration: 0.12, gain: 0.35, type: 'triangle' }] },
  playerHurt: { throttleMs: 160, tones: [{ kind: 'tone', freq: 180, freqEnd: 60, duration: 0.12, gain: 0.7, type: 'sawtooth' }] },
  barricadeHit: { throttleMs: 110, tones: [{ kind: 'noise', freq: 420, duration: 0.06, gain: 0.55 }, { kind: 'tone', freq: 160, duration: 0.05, gain: 0.3, type: 'square' }] },
  barricadeLow: { throttleMs: 2200, tones: [{ kind: 'tone', freq: 740, duration: 0.08, gain: 0.35, type: 'square' }, { kind: 'tone', freq: 520, duration: 0.1, gain: 0.3, delay: 0.09, type: 'square' }] },
  barricadeDestroyed: { throttleMs: 80, tones: [{ kind: 'noise', freq: 280, duration: 0.18, gain: 0.8 }, { kind: 'tone', freq: 110, freqEnd: 40, duration: 0.2, gain: 0.5, type: 'sawtooth' }] },
  repair: { throttleMs: 80, tones: [{ kind: 'tone', freq: 520, duration: 0.06, gain: 0.35, type: 'square' }, { kind: 'tone', freq: 780, duration: 0.08, gain: 0.3, delay: 0.06, type: 'square' }] },
  purchase: { throttleMs: 60, tones: [{ kind: 'tone', freq: 880, duration: 0.05, gain: 0.3, type: 'square' }, { kind: 'tone', freq: 1320, duration: 0.07, gain: 0.25, delay: 0.05, type: 'square' }] },
  notEnoughCash: { throttleMs: 200, tones: [{ kind: 'tone', freq: 180, duration: 0.08, gain: 0.35, type: 'square' }, { kind: 'tone', freq: 140, duration: 0.1, gain: 0.3, delay: 0.08, type: 'square' }] },
  waveStart: { throttleMs: 200, tones: [{ kind: 'tone', freq: 392, duration: 0.08, gain: 0.35, type: 'square' }, { kind: 'tone', freq: 523, duration: 0.12, gain: 0.35, delay: 0.08, type: 'square' }] },
  waveComplete: { throttleMs: 200, tones: [{ kind: 'tone', freq: 523, duration: 0.07, gain: 0.32, type: 'square' }, { kind: 'tone', freq: 659, duration: 0.07, gain: 0.32, delay: 0.07, type: 'square' }, { kind: 'tone', freq: 784, duration: 0.14, gain: 0.34, delay: 0.14, type: 'square' }] },
  gameOver: { throttleMs: 400, tones: [{ kind: 'tone', freq: 392, duration: 0.12, gain: 0.35, type: 'sawtooth' }, { kind: 'tone', freq: 311, duration: 0.14, gain: 0.35, delay: 0.12, type: 'sawtooth' }, { kind: 'tone', freq: 196, duration: 0.28, gain: 0.4, delay: 0.26, type: 'sawtooth' }] },
  wardenWarn: { throttleMs: 400, tones: [{ kind: 'tone', freq: 98, duration: 0.28, gain: 0.55, type: 'sawtooth' }, { kind: 'tone', freq: 73, duration: 0.36, gain: 0.45, delay: 0.22, type: 'square' }] },
  wardenDeath: { throttleMs: 200, tones: [{ kind: 'noise', freq: 500, duration: 0.22, gain: 0.7 }, { kind: 'tone', freq: 220, freqEnd: 40, duration: 0.35, gain: 0.5, type: 'sawtooth' }] },
}

export class GameAudio {
  muted = false
  private context?: AudioContext
  private master?: GainNode
  private lastPlayed = new Map<SoundId, number>()
  private noiseCache = new Map<number, AudioBuffer>()

  constructor() {
    try {
      this.muted = window.localStorage.getItem(MUTE_STORAGE_KEY) === '1'
    } catch {
      this.muted = false
    }
  }

  unlock() {
    const context = this.getContext()
    if (context?.state === 'suspended') {
      void context.resume()
    }
  }

  toggleMute() {
    this.muted = !this.muted
    try {
      window.localStorage.setItem(MUTE_STORAGE_KEY, this.muted ? '1' : '0')
    } catch {
      // Preference is still applied for this session.
    }
    return this.muted
  }

  /**
   * Plays a dropped-in Phaser audio file when one is cached under the same id.
   * Otherwise synthesizes a short arcade cue. Missing files are ignored.
   */
  play(scene: Phaser.Scene, id: SoundId) {
    const recipe = RECIPES[id]
    const now = scene.time.now
    const last = this.lastPlayed.get(id) ?? 0

    if (recipe.throttleMs > 0 && now - last < recipe.throttleMs) {
      return
    }

    this.lastPlayed.set(id, now)

    if (this.muted) {
      return
    }

    if (scene.cache.audio.exists(id)) {
      scene.sound.play(id, { volume: SOUND_VOLUME[id] })
      return
    }

    this.synth(id, recipe.tones)
  }

  private getContext() {
    if (this.context) {
      return this.context
    }

    const AudioCtx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AudioCtx) {
      return undefined
    }

    this.context = new AudioCtx()
    this.master = this.context.createGain()
    this.master.gain.value = SOUND_VOLUME.master
    this.master.connect(this.context.destination)
    return this.context
  }

  private synth(id: SoundId, tones: Tone[]) {
    const context = this.getContext()
    if (!context || !this.master) {
      return
    }

    if (context.state === 'suspended') {
      void context.resume()
    }

    const volume = SOUND_VOLUME[id]
    const start = context.currentTime + 0.01

    tones.forEach((tone) => {
      const when = start + (tone.delay ?? 0)
      const gain = context.createGain()
      gain.gain.setValueAtTime(0.0001, when)
      gain.gain.exponentialRampToValueAtTime(Math.max(0.001, tone.gain * volume), when + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, when + tone.duration)
      gain.connect(this.master!)

      if (tone.kind === 'noise') {
        const source = context.createBufferSource()
        source.buffer = this.getNoise(context, tone.duration)
        const filter = context.createBiquadFilter()
        filter.type = 'lowpass'
        filter.frequency.value = tone.freq
        source.connect(filter)
        filter.connect(gain)
        source.start(when)
        source.stop(when + tone.duration + 0.02)
        return
      }

      const oscillator = context.createOscillator()
      oscillator.type = tone.type ?? 'square'
      oscillator.frequency.setValueAtTime(tone.freq, when)
      if (tone.freqEnd) {
        oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, tone.freqEnd), when + tone.duration)
      }
      oscillator.connect(gain)
      oscillator.start(when)
      oscillator.stop(when + tone.duration + 0.02)
    })
  }

  private getNoise(context: AudioContext, duration: number) {
    const key = Math.round(duration * 1000)
    const cached = this.noiseCache.get(key)
    if (cached) {
      return cached
    }

    const length = Math.max(1, Math.floor(context.sampleRate * duration))
    const buffer = context.createBuffer(1, length, context.sampleRate)
    const data = buffer.getChannelData(0)
    for (let index = 0; index < length; index += 1) {
      data[index] = Math.random() * 2 - 1
    }
    this.noiseCache.set(key, buffer)
    return buffer
  }
}
