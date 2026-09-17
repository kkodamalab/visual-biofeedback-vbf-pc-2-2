import test from "node:test";
import assert from "node:assert/strict";
import { gaugeState, gaugeVariables } from "../src/gauge.js";

test("angle gauge maps current and target to a common degree scale", () => {
  const sample = { angles: { knee: 90 } };
  const gauge = gaugeState(sample, "knee", { enabled: true, value: 90, tolerance: 5 });
  assert.equal(gauge.currentPercent, 50);
  assert.equal(gauge.targetPercent, 50);
  assert.equal(gauge.inside, true);
  assert.ok(gauge.bandStart < gauge.targetPercent && gauge.bandEnd > gauge.targetPercent);
});

test("position gauges use normalized 0–1 and do not claim success without a target", () => {
  const sample = { positions: { hip: { x: .4, y: .6 } } };
  assert.deepEqual(gaugeVariables({ angles: ["knee"], angleSides: ["left", "right"], positions: ["hip"] }), ["left.knee", "right.knee", "hip.x", "hip.y"]);
  assert.equal(gaugeState(sample, "hip.x", { enabled: true, value: .4, tolerance: .05 }).inside, true);
  assert.equal(gaugeState(sample, "hip.y", { enabled: false, value: .6, tolerance: .05 }).inside, false);
  assert.equal(gaugeState(sample, "hip.y", { enabled: false, value: .6, tolerance: .05 }).currentPercent, 60);
});
