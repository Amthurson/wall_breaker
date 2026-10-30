import test from 'node:test';
import assert from 'node:assert/strict';
import { screenFrustum, faceToEye } from '../src/projection.ts';

function project(x, y, z, eye) {
  const f = screenFrustum(eye, 5, 3);
  const cameraZ = eye.z - z;
  return [
    (2 * f.near * (x - eye.x) / cameraZ - f.right - f.left) / (f.right - f.left),
    (2 * f.near * (y - eye.y) / cameraZ - f.top - f.bottom) / (f.top - f.bottom),
  ];
}

test('screen corners stay pinned while the viewer moves in all three axes', () => {
  for (const eye of [{ x: 0, y: 0, z: 6 }, { x: 3, y: -2, z: 4 }, { x: -4, y: 2, z: 9 }]) {
    for (const [x, y] of [[-5, -3], [5, 3], [-5, 3], [5, -3]]) {
      const result = project(x, y, 0, eye);
      assert.ok(Math.abs(result[0] - x / 5) < 1e-10);
      assert.ok(Math.abs(result[1] - y / 3) < 1e-10);
    }
  }
});

test('moving right and up reveals objects hidden behind the left and bottom edges', () => {
  const hidden = project(-12, -7, -6, { x: 0, y: 0, z: 6 });
  const revealed = project(-12, -7, -6, { x: 4, y: 3, z: 6 });
  assert.ok(hidden[0] < -1 && hidden[1] < -1);
  assert.ok(revealed[0] >= -1 && revealed[1] >= -1);
});

test('camera-space eye position is mirrored, calibrated and distance sensitive', () => {
  const center = { x: 0.5, y: 0.5, span: 0.2 };
  assert.deepEqual(faceToEye(center, center, 1), { x: 0, y: 0, z: 6 });
  const eye = faceToEye({ x: 0.4, y: 0.4, span: 0.4 }, center, 1);
  assert.ok(eye.x > 0 && eye.y > 0);
  assert.equal(eye.z, 3.2);
});

test('projection rejects an eye behind the screen', () => {
  assert.throws(() => screenFrustum({ x: 0, y: 0, z: 0 }, 5, 3), RangeError);
});
