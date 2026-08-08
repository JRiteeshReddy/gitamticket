/**
 * Web Audio API Synthesizer for instant sound feedback without external audio assets.
 */

let audioCtx = null;
let isMuted = localStorage.getItem('ticket_scanner_muted') === 'true';

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

export function isAudioMuted() {
  return isMuted;
}

export function toggleAudioMute() {
  isMuted = !isMuted;
  localStorage.setItem('ticket_scanner_muted', isMuted);
  return isMuted;
}

/**
 * Play a high-pitched celebratory double chime for valid first-time entry
 */
export function playSuccessSound() {
  if (isMuted) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // First tone (E5 - 659Hz)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(659.25, now);
    gain1.gain.setValueAtTime(0.3, now);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.15);

    // Second tone higher (B5 - 987.77Hz + E6 - 1318.5Hz)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1318.5, now + 0.12);
    gain2.gain.setValueAtTime(0.4, now + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.12);
    osc2.stop(now + 0.45);
  } catch (e) {
    console.warn('Audio playback failed:', e);
  }
}

/**
 * Play a deep warning double-buzz for ALREADY ENTERED tickets
 */
export function playAlreadyEnteredSound() {
  if (isMuted) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // Buzz 1
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(180, now);
    osc1.frequency.exponentialRampToValueAtTime(120, now + 0.2);
    gain1.gain.setValueAtTime(0.35, now);
    gain1.gain.linearRampToValueAtTime(0.01, now + 0.2);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 0.2);

    // Buzz 2
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(180, now + 0.25);
    osc2.frequency.exponentialRampToValueAtTime(110, now + 0.5);
    gain2.gain.setValueAtTime(0.35, now + 0.25);
    gain2.gain.linearRampToValueAtTime(0.01, now + 0.5);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.25);
    osc2.stop(now + 0.5);
  } catch (e) {
    console.warn('Audio playback failed:', e);
  }
}

/**
 * Play an alert tone for Invalid / Unrecognized QR codes
 */
export function playInvalidSound() {
  if (isMuted) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.setValueAtTime(220, now + 0.15);
    gain.gain.setValueAtTime(0.25, now);
    gain.gain.linearRampToValueAtTime(0.01, now + 0.35);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.35);
  } catch (e) {
    console.warn('Audio playback failed:', e);
  }
}
