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
export const BEEP_SOUNDS = [
  { id: "classic", label: "1. 従来の短いBeep", tones: [{ frequency: 660, duration: .17, wave: "sine", gain: .16 }] },
  { id: "clear", label: "2. 明瞭な高音", tones: [{ frequency: 880, duration: .24, wave: "triangle", gain: .28 }] },
  { id: "low", label: "3. 低めのアラート", tones: [{ frequency: 440, duration: .28, wave: "square", gain: .19 }] },
  { id: "double", label: "4. ダブルBeep", tones: [{ frequency: 740, duration: .12, wave: "triangle", gain: .25 }, { frequency: 740, delay: .18, duration: .12, wave: "triangle", gain: .25 }] },
  { id: "rise", label: "5. 上昇チャイム", tones: [{ frequency: 587, duration: .16, wave: "sine", gain: .24 }, { frequency: 880, delay: .17, duration: .22, wave: "sine", gain: .27 }] }
];
export async function unlockBeepAudio() {
  const Audio = window.AudioContext || window.webkitAudioContext;
  if (!Audio) throw new Error("Web Audio非対応のブラウザです");
  audioContext ??= new Audio();
  if (audioContext.state !== "running") await audioContext.resume();
}
export function playBeepTone(soundId = "clear", volume = .8) {
  if (!audioContext || audioContext.state !== "running") return false;
  const sound = BEEP_SOUNDS.find(item => item.id === soundId) || BEEP_SOUNDS[1];
  const level = Math.max(0, Math.min(1, Number(volume) || 0));
  for (const tone of sound.tones) {
    const start = audioContext.currentTime + (tone.delay || 0);
    const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
    oscillator.type = tone.wave; oscillator.frequency.value = tone.frequency;
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(.0001, tone.gain * level), start + .012);
    gain.gain.exponentialRampToValueAtTime(.0001, start + tone.duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(start); oscillator.stop(start + tone.duration + .01);
  }
  return true;
}
