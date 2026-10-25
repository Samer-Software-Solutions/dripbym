// The new-order chime: two short notes made with Web Audio, so there is no sound file to load.

let context: AudioContext | null = null

function audio(): AudioContext | null {
  if (context) return context
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  context = new Ctor()
  return context
}

/**
 * Browsers only allow sound after the person has clicked, tapped or typed on the page.
 * Call this from such an event so later chimes (from live updates) can play.
 */
export function unlockSound() {
  const ctx = audio()
  if (ctx?.state === 'suspended') void ctx.resume()
}

export function playChime() {
  const ctx = audio()
  if (!ctx) return
  if (ctx.state === 'suspended') void ctx.resume()
  const start = ctx.currentTime + 0.02
  const notes: [frequency: number, delay: number][] = [
    [880, 0],
    [1318.5, 0.16],
  ]
  for (const [frequency, delay] of notes) {
    const oscillator = ctx.createOscillator()
    const gain = ctx.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(0.0001, start + delay)
    gain.gain.exponentialRampToValueAtTime(0.35, start + delay + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + delay + 1.1)
    oscillator.connect(gain).connect(ctx.destination)
    oscillator.start(start + delay)
    oscillator.stop(start + delay + 1.2)
  }
}
