import test from 'node:test';
import assert from 'node:assert/strict';
import { extractTrackingSample, gazeFeatures, fitGazeModel, predictGaze, OneEuroFilter } from '../src/gaze.ts';

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function landmarks(offset = 0) {
  const p = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.4, z: 0 }));
  for (const [index, x, y] of [[33,.3,.4],[133,.42,.4],[362,.58,.4],[263,.7,.4],[159,.36,.38],[145,.36,.42],[386,.64,.38],[374,.64,.42],[468,.36+offset,.4],[473,.64+offset,.4]]) p[index] = { x, y, z: 0 };
  return p;
}

test('iris movement affects gaze features without moving the estimated head origin', () => {
  const straight = extractTrackingSample(landmarks(), .75, identity);
  const glance = extractTrackingSample(landmarks(.012), .75, identity);
  assert.equal(straight.x, glance.x);
  assert.equal(straight.y, glance.y);
  assert.ok(Math.abs(straight.eyes.x) < 1e-10);
  assert.ok(Math.abs(glance.eyes.x - .1) < 1e-10);
  assert.equal(gazeFeatures(glance).length, 6);
});

test('eye features are invariant to image translation and uniform scaling', () => {
  const original = extractTrackingSample(landmarks(.01), .75, identity);
  const transformed = landmarks(.01).map(p => ({ x: p.x * 1.2 + .05, y: p.y * 1.2 - .03, z: p.z }));
  const changed = extractTrackingSample(transformed, .75, identity);
  assert.ok(Math.abs(original.eyes.x - changed.eyes.x) < 1e-10);
  assert.ok(Math.abs(original.eyes.y - changed.eyes.y) < 1e-10);
  assert.notEqual(original.x, changed.x);
});

test('blinks suspend gaze rather than projecting an invalid pupil location', () => {
  const p = landmarks();
  for (const index of [159, 145, 386, 374]) p[index].y = .4;
  const sample = extractTrackingSample(p, .75, identity);
  assert.equal(sample.eyes.valid, false);
  assert.equal(gazeFeatures(sample), null);
});

test('a missing iris does not fabricate gaze features', () => {
  const sample = extractTrackingSample(landmarks().slice(0, 468), .75, identity);
  assert.equal(sample.eyes, null);
  assert.equal(gazeFeatures(sample), null);
});

function calibrationSamples() {
  const samples = [];
  for (const u of [.15,.5,.85]) for (const v of [.15,.5,.85]) for (let i = 0; i < 20; i++) {
    const jitter = Math.sin(i * 3) * .0003;
    samples.push({ features: [(u-.5)*.3+jitter, (v-.5)*.14-jitter, 0, 0, .5, .5], u, v });
  }
  return samples;
}

test('nine-point calibration recovers held-out screen coordinates', () => {
  const model = fitGazeModel(calibrationSamples(), 1280, 720);
  for (const [u,v] of [[.32,.68],[.7,.3],[.5,.5]]) {
    const point = predictGaze(model, [(u-.5)*.3,(v-.5)*.14,0,0,.5,.5]);
    assert.ok(Math.abs(point.u-u) < .015);
    assert.ok(Math.abs(point.v-v) < .015);
  }
  assert.ok(model.fitError < 12);
});

test('insufficient eye motion and incomplete calibration are rejected', () => {
  assert.throws(() => fitGazeModel(calibrationSamples().slice(0,20),1280,720), /不足/);
  const constant = calibrationSamples().map(s => ({...s, features:[0,0,0,0,.5,.5]}));
  assert.throws(() => fitGazeModel(constant,1280,720), /虹膜位移不足/);
});

test('adaptive filter suppresses stationary jitter and resets after a lost face', () => {
  const filter = new OneEuroFilter(1.4,.25);
  filter.filter(0,0);
  assert.ok(filter.filter(.1,40) < .1);
  assert.equal(filter.filter(2,1000),2);
  filter.reset();
  assert.equal(filter.filter(-1,1040),-1);
});
