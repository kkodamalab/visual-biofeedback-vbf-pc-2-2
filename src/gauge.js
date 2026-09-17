import { angleVariables, variableLabel, sampleValue } from "./experiment-math.js";

export function gaugeVariables(settings) {
  return [...angleVariables(settings), ...settings.positions.flatMap(name => [`${name}.x`, `${name}.y`])];
}

export function gaugeState(sample, key, target) {
  const position = key.endsWith(".x") || key.endsWith(".y");
  const max = position ? 1 : ["trunk", "headNeck"].includes(key) ? 90 : 180;
  const value = sampleValue(sample, key);
  const valid = Number.isFinite(value);
  const targetEnabled = !!target?.enabled && Number.isFinite(target.value);
  const tolerance = Math.max(0, target?.tolerance || 0);
  const clamped = number => Math.max(0, Math.min(100, number / max * 100));
  return {
    key, label: position ? `${variableLabel(key.split(".")[0])} ${key.endsWith(".x") ? "X" : "Y"}` : variableLabel(key),
    max, unit: position ? "" : "°", value, valid, targetEnabled,
    currentPercent: valid ? clamped(value) : 0,
    targetPercent: targetEnabled ? clamped(target.value) : 0,
    bandStart: targetEnabled ? clamped(target.value - tolerance) : 0,
    bandEnd: targetEnabled ? clamped(target.value + tolerance) : 0,
    inside: valid && targetEnabled && Math.abs(value - target.value) <= tolerance,
    targetValue: target?.value, tolerance
  };
}
