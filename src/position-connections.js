import { position } from "./experiment-math.js";

// Only anatomically adjacent selected joints connect; wrist is a separate arm branch.
export const POSITION_EDGES = [["head", "shoulder"], ["shoulder", "hip"], ["hip", "knee"], ["knee", "ankle"], ["ankle", "foot"], ["shoulder", "wrist"]];

export function selectedPositionSegments(selected, sides) {
  const names = new Set(selected);
  return sides.flatMap(side => POSITION_EDGES.filter(([a, b]) => names.has(a) && names.has(b)).map(([a, b]) => ({ side, a, b })));
}

export function positionForSide(landmarks, name, side) {
  return position(landmarks, name, side);
}
