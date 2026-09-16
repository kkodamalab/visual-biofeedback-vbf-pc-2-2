export const ANGLES = ["knee", "hip", "ankle", "trunk", "headNeck"];
export const POSITIONS = ["head", "shoulder", "hip", "knee", "ankle", "wrist", "foot"];
export const LABELS = { knee: "Knee", hip: "Hip", ankle: "Ankle", trunk: "Trunk", headNeck: "Head / Neck", head: "Head", shoulder: "Shoulder", wrist: "Wrist", foot: "Foot" };
const PAIRS = { head: [7, 8], shoulder: [11, 12], hip: [23, 24], knee: [25, 26], ankle: [27, 28], wrist: [15, 16], foot: [31, 32] };
const clamp = value => Math.max(0, Math.min(1, value));
function midpoint(a, b) { return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, visibility: Math.min(a.visibility ?? 1, b.visibility ?? 1) }; }
function angle(a, b, c, aspect) {
  const u = { x: (a.x - b.x) * aspect, y: a.y - b.y }, v = { x: (c.x - b.x) * aspect, y: c.y - b.y };
  const length = Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y);
  return length ? Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y) / length))) * 180 / Math.PI : NaN;
}
function inclination(a, b, aspect) { return Math.atan2(Math.abs(a.x - b.x) * aspect, Math.abs(a.y - b.y)) * 180 / Math.PI; }
export function position(landmarks, name, side = "midpoint") {
  const pair = PAIRS[name]; if (!pair || !landmarks?.[pair[0]] || !landmarks?.[pair[1]]) return null;
  const point = side === "left" ? landmarks[pair[0]] : side === "right" ? landmarks[pair[1]] : midpoint(landmarks[pair[0]], landmarks[pair[1]]);
  return { x: +clamp(point.x).toFixed(5), y: +clamp(point.y).toFixed(5) };
}
export function angles(landmarks, side = "left", aspect = 1) {
  if (!landmarks || landmarks.length < 33) return null;
  const offset = side === "right" ? 1 : 0;
  const shoulder = landmarks[11 + offset], hip = landmarks[23 + offset], knee = landmarks[25 + offset];
  const ankle = landmarks[27 + offset], foot = landmarks[31 + offset];
  const head = landmarks[7 + offset] || landmarks[0];
  return Object.fromEntries([
    ["knee", angle(hip, knee, ankle, aspect)], ["hip", angle(shoulder, hip, knee, aspect)],
    ["ankle", angle(knee, ankle, foot, aspect)], ["trunk", inclination(shoulder, hip, aspect)],
    ["headNeck", inclination(head, shoulder, aspect)]
  ].map(([key, value]) => [key, Number.isFinite(value) ? +value.toFixed(1) : null]));
}
export function evaluate(landmarks, side = "left", positionSide = "midpoint", aspect = 1) {
  const a = angles(landmarks, side, aspect);
  if (!a) return null;
  return { angles: a, positions: Object.fromEntries(POSITIONS.map(name => [name, position(landmarks, name, positionSide)])) };
}
export function sampleValue(sample, variable) {
  if (!sample) return null;
  const [name, coordinate] = variable.split(".");
  const value = coordinate ? sample.positions?.[name]?.[coordinate] : sample.angles?.[name];
  return Number.isFinite(value) ? value : null;
}
