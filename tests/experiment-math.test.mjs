import test from "node:test";
import assert from "node:assert/strict";
import { angles, position, evaluate, sampleValue } from "../src/experiment-math.js";

function landmarks() {
  const points = Array.from({ length: 33 }, () => ({ x: .5, y: .5, visibility: 1 }));
  for (const offset of [0, 1]) {
    const x = offset ? .7 : .5;
    points[7 + offset] = { x, y: 0 };
    points[11 + offset] = { x, y: .1 };
    points[23 + offset] = { x, y: .3 };
    points[25 + offset] = { x, y: .5 };
    points[27 + offset] = { x, y: .7 };
    points[31 + offset] = { x: x + .2, y: .7 };
    points[15 + offset] = { x, y: .2 };
  }
  return points;
}
test("five angles use the expected 2D landmark geometry", () => {
  const values = angles(landmarks());
  assert.deepEqual(values, { knee: 180, hip: 180, ankle: 90, trunk: 0, headNeck: 0 });
  assert.equal(angles(landmarks(), "right").ankle, 90);
});
test("position is normalized and side or midpoint can be selected", () => {
  const points = landmarks();
  assert.deepEqual(position(points, "hip", "left"), { x: .5, y: .3 });
  assert.deepEqual(position(points, "hip", "right"), { x: .7, y: .3 });
  assert.deepEqual(position(points, "hip", "midpoint"), { x: .6, y: .3 });
  const sample = evaluate(points);
  assert.equal(sampleValue(sample, "ankle"), 90);
  assert.equal(sampleValue(sample, "hip.x"), .6);
  assert.equal(sampleValue(sample, "wrist.y"), .2);
});
test("angle calculation corrects the normalized X axis for video aspect ratio", () => {
  const points = landmarks();
  points[11] = { x: .6, y: .1 };
  const square = angles(points, "left", 1).trunk;
  const wide = angles(points, "left", 16 / 9).trunk;
  assert.ok(wide > square);
});
