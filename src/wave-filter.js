// Time-aware, causal first-order RC low-pass. It derives display samples; callers retain raw arrays unchanged.
export function lowPassSamples(samples, variables, cutoffHz) {
  const previous = new Map(), lastTime = new Map();
  const frequency = Math.max(.1, Number(cutoffHz) || 6);
  return samples.map(sample => {
    const filtered = {};
    for (const key of variables) {
      const raw = sample.values[key];
      if (!Number.isFinite(raw)) { filtered[key] = null; continue; }
      const dt = Math.max(0, (sample.t - (lastTime.get(key) ?? sample.t)) / 1000);
      const nyquistSafe = dt ? Math.min(frequency, .49 / dt) : frequency;
      const alpha = dt ? 1 - Math.exp(-2 * Math.PI * nyquistSafe * dt) : 1;
      const value = previous.has(key) ? previous.get(key) + alpha * (raw - previous.get(key)) : raw;
      filtered[key] = value; previous.set(key, value); lastTime.set(key, sample.t);
    }
    return { t: sample.t, values: filtered };
  });
}

export function estimatedNyquistHz(samples) {
  const intervals = samples.slice(-31).map((sample, i, array) => i ? sample.t - array[i - 1].t : null).filter(dt => Number.isFinite(dt) && dt > 0);
  if (intervals.length < 3) return 15;
  intervals.sort((a, b) => a - b);
  const median = intervals[Math.floor(intervals.length / 2)];
  return Math.max(.1, Math.floor((500 / median) * .95 * 10) / 10);
}
