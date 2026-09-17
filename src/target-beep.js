export class TargetEntryGate {
  constructor({ minIntervalMs = 600, confirmFrames = 2, exitFrames = 2 } = {}) {
    this.minIntervalMs = minIntervalMs; this.confirmFrames = confirmFrames; this.exitFrames = exitFrames;
    this.states = new Map();
  }
  reset(key) { if (key) this.states.delete(key); else this.states.clear(); }
  update(key, value, target, nowMs) {
    if (!target?.enabled || !target.beep || !Number.isFinite(value)) { this.reset(key); return false; }
    const tolerance = Math.max(0, target.tolerance || 0);
    const inside = Math.abs(value - target.value) <= tolerance;
    const outside = Math.abs(value - target.value) > tolerance + Math.max(1, tolerance * .2);
    const state = this.states.get(key) || { armed: true, insideFrames: 0, outsideFrames: 0, last: -Infinity };
    if (inside) {
      state.insideFrames++; state.outsideFrames = 0;
      if (state.armed && state.insideFrames >= this.confirmFrames && nowMs - state.last >= this.minIntervalMs) {
        state.armed = false; state.last = nowMs; this.states.set(key, state); return true;
      }
    } else if (outside) {
      state.outsideFrames++; state.insideFrames = 0;
      if (state.outsideFrames >= this.exitFrames) state.armed = true;
    } else { state.insideFrames = 0; state.outsideFrames = 0; }
    this.states.set(key, state); return false;
  }
}

let audioContext;
export async function unlockBeepAudio() {
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) throw new Error("Web Audio非対応のブラウザです");
  audioContext ??= new Audio();
  if (audioContext.state !== "running") await audioContext.resume();
}
export function playBeepTone() {
  if (!audioContext || audioContext.state !== "running") return false;
  const start = audioContext.currentTime, oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
  oscillator.type = "sine"; oscillator.frequency.value = 660;
  gain.gain.setValueAtTime(.0001, start); gain.gain.exponentialRampToValueAtTime(.16, start + .015);
  gain.gain.exponentialRampToValueAtTime(.0001, start + .16);
  oscillator.connect(gain).connect(audioContext.destination); oscillator.start(start); oscillator.stop(start + .17);
  return true;
}
