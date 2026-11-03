// Completion cues are synthesised with Web Audio instead of shipping audio
// files: no assets, no licensing, and they work offline in the Tauri shell.
import { useSettingsStore } from '@/stores/useSettingsStore'
import type { SoundEffect } from '@/types'

interface Tone {
  /** Frequency in Hz. */
  freq: number
  /** Offset from the start of the cue, in seconds. */
  at?: number
  /** Duration in seconds. */
  dur?: number
  type?: OscillatorType
  /** Peak gain; kept low so cues sit under the user's music. */
  gain?: number
  /** Attack time in seconds; longer attacks soften synthetic tones. */
  attack?: number
  /** Optional low-pass cutoff in Hz, for a warmer body. */
  filter?: number
  /** Optional cutoff at the end of the tone; the filter closes for a pluck. */
  filterTo?: number
  /** Optional soft-clip amount (0–1) for a grittier electronic edge. */
  drive?: number
  /** Optional pitch slide over the first 60% of the tone. */
  glideTo?: number
}

/** Overall cue level. Preset gains stay well below 1.0 to leave headroom for
 *  overlapping tones; this lifts the whole mix without clipping. */
const MASTER_GAIN = 2.5

const SOUNDS: Record<Exclude<SoundEffect, 'off'>, Tone[]> = {
  // Two-note bell: bright but short.
  chime: [
    { freq: 880, dur: 0.9, gain: 0.07 },
    { freq: 1318.51, at: 0.1, dur: 1.0, gain: 0.05 },
    { freq: 2637.02, at: 0.1, dur: 0.35, gain: 0.012 },
  ],
  // A single, gentle falling pair for late-night writing.
  soft: [
    { freq: 523.25, dur: 1.1, gain: 0.05 },
    { freq: 783.99, at: 0.14, dur: 1.2, gain: 0.035 },
  ],
  // Rolled C-major piano chord; each note has an octave partial for body.
  piano: [
    { freq: 261.63, dur: 1.9, gain: 0.032, attack: 0.006, filter: 4200 },
    { freq: 523.25, dur: 1.2, gain: 0.008, attack: 0.006, filter: 4200 },
    { freq: 329.63, at: 0.022, dur: 1.8, gain: 0.03, attack: 0.006, filter: 4200 },
    { freq: 659.25, at: 0.022, dur: 1.1, gain: 0.007, attack: 0.006, filter: 4200 },
    { freq: 392.0, at: 0.04, dur: 1.7, gain: 0.028, attack: 0.006, filter: 4200 },
    { freq: 783.99, at: 0.04, dur: 1.0, gain: 0.006, attack: 0.006, filter: 4200 },
    { freq: 523.25, at: 0.06, dur: 1.6, gain: 0.024, attack: 0.006, filter: 4200 },
    { freq: 1046.5, at: 0.06, dur: 0.8, gain: 0.005, attack: 0.006, filter: 4200 },
  ],
  // Warm marimba-like two-note figure: mallet attack, long wooden decay.
  wood: [
    { freq: 523.25, dur: 0.65, gain: 0.055, filter: 1800, attack: 0.006 },
    { freq: 1046.5, dur: 0.28, gain: 0.012, filter: 2600, attack: 0.004 },
    { freq: 783.99, at: 0.18, dur: 0.6, gain: 0.04, filter: 1800, attack: 0.006 },
    { freq: 1567.98, at: 0.18, dur: 0.25, gain: 0.008, filter: 2600, attack: 0.004 },
  ],
  // Punchy synth double-hit (E5 → B5): square lead, sub body, fast filter
  // sweep and a touch of soft clipping for grit.
  pulse: [
    { freq: 659.25, dur: 0.18, gain: 0.05, type: 'square', attack: 0.002, filter: 3800, filterTo: 900, drive: 0.35 },
    { freq: 164.81, dur: 0.2, gain: 0.02, type: 'sawtooth', attack: 0.002, filter: 900, filterTo: 300 },
    {
      freq: 987.77,
      at: 0.11,
      dur: 0.3,
      gain: 0.045,
      type: 'square',
      attack: 0.002,
      filter: 4200,
      filterTo: 1100,
      drive: 0.35,
    },
    { freq: 246.94, at: 0.11, dur: 0.32, gain: 0.018, type: 'sawtooth', attack: 0.002, filter: 1100, filterTo: 350 },
  ],
}

const driveCurves = new Map<number, Float32Array<ArrayBuffer>>()

function driveCurve(amount: number): Float32Array<ArrayBuffer> {
  const cached = driveCurves.get(amount)
  if (cached) return cached
  const n = 1024
  const curve = new Float32Array(new ArrayBuffer(n * Float32Array.BYTES_PER_ELEMENT))
  const k = Math.max(0.001, amount) * 30
  const norm = Math.tanh(k)
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1
    curve[i] = Math.tanh(k * x) / norm
  }
  driveCurves.set(amount, curve)
  return curve
}

let audioCtx: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!audioCtx) {
    const Ctor =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    try {
      audioCtx = new Ctor()
    } catch {
      return null
    }
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {})
  }
  return audioCtx
}

function playTone(ctx: AudioContext, tone: Tone): void {
  const start = ctx.currentTime + (tone.at ?? 0)
  const dur = tone.dur ?? 0.4
  const osc = ctx.createOscillator()
  const env = ctx.createGain()

  osc.type = tone.type ?? 'sine'
  osc.frequency.setValueAtTime(tone.freq, start)
  if (tone.glideTo) {
    osc.frequency.exponentialRampToValueAtTime(tone.glideTo, start + dur * 0.6)
  }

  // Exponential ramps need a non-zero starting value, hence 0.0001.
  const peak = (tone.gain ?? 0.06) * MASTER_GAIN
  const attack = Math.min(tone.attack ?? 0.012, dur * 0.5)
  env.gain.setValueAtTime(0.0001, start)
  env.gain.exponentialRampToValueAtTime(peak, start + attack)
  env.gain.exponentialRampToValueAtTime(0.0001, start + dur)

  let last: AudioNode = osc
  if (tone.filter) {
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(tone.filter, start)
    if (tone.filterTo) {
      filter.frequency.exponentialRampToValueAtTime(tone.filterTo, start + dur)
    }
    filter.Q.setValueAtTime(0.7, start)
    last.connect(filter)
    last = filter
  }
  if (tone.drive) {
    const shaper = ctx.createWaveShaper()
    shaper.curve = driveCurve(tone.drive)
    shaper.oversample = '2x'
    last.connect(shaper)
    last = shaper
  }
  last.connect(env)
  env.connect(ctx.destination)
  osc.start(start)
  osc.stop(start + dur + 0.02)
}

function runWhenReady(ctx: AudioContext, run: () => void): void {
  if (ctx.state === 'suspended') {
    ctx
      .resume()
      .then(run)
      .catch(() => {})
  } else {
    run()
  }
}

/**
 * Create/resume the AudioContext inside a user gesture. Browsers may otherwise
 * refuse to start audio when the cue is triggered later by the stream ending.
 */
export function primeCompletionSound(): void {
  getAudioContext()
}

export function playSound(effect: SoundEffect): void {
  if (effect === 'off') return
  const ctx = getAudioContext()
  if (!ctx) return
  const tones = SOUNDS[effect]
  if (!tones) return
  runWhenReady(ctx, () => {
    for (const tone of tones) playTone(ctx, tone)
  })
}

/** Play the cue the user picked in Settings. No-op when it is turned off. */
export function playAiCompletionSound(): void {
  playSound(useSettingsStore.getState().settings.soundEffect)
}
