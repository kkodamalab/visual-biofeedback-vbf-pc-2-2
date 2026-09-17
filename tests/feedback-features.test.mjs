import test from "node:test";
import assert from "node:assert/strict";
import { selectedPositionSegments } from "../src/position-connections.js";
import { lowPassSamples, estimatedNyquistHz } from "../src/wave-filter.js";
import { TargetEntryGate, BEEP_SOUNDS } from "../src/target-beep.js";

test("five distinct Web Audio presets remain short and have unique IDs", () => {
  assert.equal(BEEP_SOUNDS.length, 5);
  assert.equal(new Set(BEEP_SOUNDS.map(sound => sound.id)).size, 5);
  for (const sound of BEEP_SOUNDS) {
    assert.ok(sound.tones.length >= 1);
    assert.ok(sound.tones.every(tone => tone.frequency > 0 && tone.duration > 0 && (tone.delay || 0) + tone.duration < .5));
  }
});

test("selected positions connect adjacent anatomical segments without crossing sides", () => {
  const segments = selectedPositionSegments(["shoulder", "hip", "knee", "wrist"], ["left", "right"]);
  assert.deepEqual(segments.filter(segment => segment.side === "left").map(({ a, b }) => `${a}-${b}`), ["shoulder-hip", "hip-knee", "shoulder-wrist"]);
  assert.equal(segments.length, 6);
  assert.deepEqual(selectedPositionSegments(["shoulder", "knee"], ["left"]), []);
});

test("time-aware low-pass smooths display values without changing raw samples", () => {
  const raw = [{ t: 0, values: { "left.knee": 0 } }, { t: 100, values: { "left.knee": 100 } }, { t: 200, values: { "left.knee": 0 } }];
  const original = structuredClone(raw);
  const filtered = lowPassSamples(raw, ["left.knee"], 2);
  assert.ok(filtered[1].values["left.knee"] > 0 && filtered[1].values["left.knee"] < 100);
  assert.ok(filtered[2].values["left.knee"] > 0);
  assert.deepEqual(raw, original);
  assert.equal(estimatedNyquistHz([{ t: 0 }, { t: 100 }, { t: 200 }, { t: 300 }]), 4.7);
});

test("beep fires once on confirmed entry, waits through jitter, then rearms after exit", () => {
  const gate = new TargetEntryGate();
  const target = { enabled: true, beep: true, value: 90, tolerance: 5 };
  const update = (value, at) => gate.update("knee", value, target, at);
  assert.equal(update(100, 0), false);
  assert.equal(update(97, 100), false);
  assert.equal(update(94, 200), false);
  assert.equal(update(92, 300), true);
  assert.equal(update(90, 400), false);
  assert.equal(update(95.1, 500), false);
  assert.equal(update(94.9, 600), false);
  assert.equal(update(98, 700), false);
  assert.equal(update(98, 800), false);
  assert.equal(update(94, 900), false);
  assert.equal(update(92, 1000), true);
});
