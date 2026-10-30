import { clamp, type FaceSample } from './projection.ts';

export interface Landmark { x: number; y: number; z: number }
export interface HeadPose { yaw: number; pitch: number; roll: number }
export interface EyeObservation { x: number; y: number; openness: number; valid: boolean }
export interface TrackingSample extends FaceSample {
  landmarks: readonly Landmark[];
  pose: HeadPose;
  eyes: EyeObservation | null;
}

/** Roll-independent iris displacement, normalized by eye width rather than lid height. */
function eyeObservation(points: readonly Landmark[], indices: number[], aspect: number): EyeObservation | null {
  const [a, b, upper, lower, iris] = indices.map(index => points[index]);
  if (!a || !b || !upper || !lower || !iris) return null;
  const dx = b.x - a.x, dy = (b.y - a.y) * aspect;
  const width = Math.hypot(dx, dy);
  if (width < 0.008) return null;
  const ux = dx / width, uy = dy / width;
  const rx = iris.x - (a.x + b.x) / 2;
  const ry = (iris.y - (upper.y + lower.y) / 2) * aspect;
  const openness = Math.hypot(upper.x - lower.x, (upper.y - lower.y) * aspect) / width;
  const x = (rx * ux + (iris.y - (a.y + b.y) / 2) * aspect * uy) / width;
  const y = (-rx * uy + ry * ux) / width;
  return { x, y, openness, valid: openness > 0.115 && Math.abs(x) < 0.6 && Math.abs(y) < 0.45 };
}

export function extractTrackingSample(points: readonly Landmark[], aspect: number, matrix?: readonly number[]): TrackingSample | null {
  if (points.length < 468) return null;
  const corners = [33, 133, 362, 263].map(index => points[index]);
  if (corners.some(point => !point || !Number.isFinite(point.x + point.y + point.z))) return null;
  const pose: HeadPose = matrix && matrix.length === 16 ? {
    yaw: Math.atan2(matrix[8], matrix[10]),
    pitch: Math.atan2(-matrix[9], Math.hypot(matrix[8], matrix[10])),
    roll: Math.atan2(matrix[1], matrix[0]),
  } : { yaw: 0, pitch: 0, roll: 0 };
  const right = eyeObservation(points, [33, 133, 159, 145, 468], aspect);
  const left = eyeObservation(points, [362, 263, 386, 374, 473], aspect);
  const eyes = right && left ? {
    x: (right.x + left.x) / 2, y: (right.y + left.y) / 2,
    openness: Math.min(right.openness, left.openness),
    valid: right.valid && left.valid && Math.abs(pose.yaw) < 0.65 && Math.abs(pose.pitch) < 0.55,
  } : null;
  return {
    x: corners.reduce((sum, point) => sum + point.x, 0) / 4,
    y: corners.reduce((sum, point) => sum + point.y, 0) / 4,
    span: Math.hypot(corners[0].x - corners[3].x, (corners[0].y - corners[3].y) * aspect),
    pose, eyes, landmarks: points,
  };
}

export function gazeFeatures(sample: TrackingSample): number[] | null {
  if (!sample.eyes?.valid) return null;
  const values = [sample.eyes.x, sample.eyes.y, Math.sin(sample.pose.yaw), Math.sin(sample.pose.pitch), sample.x, sample.y];
  return values.every(Number.isFinite) ? values : null;
}

export interface CalibrationSample { features: number[]; u: number; v: number }
export interface GazePoint { u: number; v: number }
export interface GazeModel {
  means: number[];
  scales: number[];
  coefficientsX: number[];
  coefficientsY: number[];
  fitError: number;
  width: number;
  height: number;
}

function solve(matrix: number[][], vector: number[]) {
  const n = vector.length;
  const rows = matrix.map((row, i) => [...row, vector[i]]);
  for (let column = 0; column < n; column++) {
    let pivot = column;
    for (let row = column + 1; row < n; row++) if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    [rows[pivot], rows[column]] = [rows[column], rows[pivot]];
    if (Math.abs(rows[column][column]) < 1e-10) throw new Error('眼部变化不足，请在光线充足时重新校准。');
    const divisor = rows[column][column];
    for (let j = column; j <= n; j++) rows[column][j] /= divisor;
    for (let row = 0; row < n; row++) {
      if (row === column) continue;
      const factor = rows[row][column];
      for (let j = column; j <= n; j++) rows[row][j] -= factor * rows[column][j];
    }
  }
  return rows.map(row => row[n]);
}

export function predictGaze(model: GazeModel, features: number[]): GazePoint {
  const row = [1, ...features.map((value, i) => (value - model.means[i]) / model.scales[i])];
  return {
    u: row.reduce((sum, value, i) => sum + value * model.coefficientsX[i], 0),
    v: row.reduce((sum, value, i) => sum + value * model.coefficientsY[i], 0),
  };
}

/** Person-specific ridge mapping. This is a calibrated estimate, not a measured optical axis. */
export function fitGazeModel(samples: CalibrationSample[], width: number, height: number): GazeModel {
  const targets = new Set(samples.map(sample => `${sample.u},${sample.v}`));
  if (samples.length < 72 || targets.size < 9) throw new Error('有效样本不足，请保持双眼清晰入镜后重试。');
  if (samples.some(sample => sample.features.length !== 6 || ![...sample.features, sample.u, sample.v].every(Number.isFinite))) throw new Error('校准数据无效，请重试。');
  const means = samples[0].features.map((_, i) => samples.reduce((sum, s) => sum + s.features[i], 0) / samples.length);
  const std = means.map((mean, i) => Math.sqrt(samples.reduce((sum, s) => sum + (s.features[i] - mean) ** 2, 0) / samples.length));
  if (std[0] < 0.008 || std[1] < 0.004) throw new Error('虹膜位移不足，请注视各圆点，保持头部相对稳定。');
  const floors = [0.025, 0.012, 0.12, 0.1, 0.06, 0.06];
  const scales = std.map((value, i) => Math.max(value, floors[i]));
  const dimensions = 7;
  const matrix = Array.from({ length: dimensions }, () => Array(dimensions).fill(0) as number[]);
  const bx = Array(dimensions).fill(0) as number[], by = [...bx];
  for (const sample of samples) {
    const row = [1, ...sample.features.map((value, i) => (value - means[i]) / scales[i])];
    for (let i = 0; i < dimensions; i++) {
      bx[i] += row[i] * sample.u;
      by[i] += row[i] * sample.v;
      for (let j = 0; j < dimensions; j++) matrix[i][j] += row[i] * row[j];
    }
  }
  for (let i = 1; i < dimensions; i++) matrix[i][i] += samples.length * 0.015;
  const model: GazeModel = { means, scales, coefficientsX: solve(matrix, bx), coefficientsY: solve(matrix, by), fitError: 0, width, height };
  model.fitError = Math.sqrt(samples.reduce((sum, s) => { const p = predictGaze(model, s.features); return sum + ((p.u - s.u) * width) ** 2 + ((p.v - s.v) * height) ** 2; }, 0) / samples.length);
  if (model.fitError > Math.hypot(width, height) * 0.13) throw new Error('校准拟合偏差较大，请重新校准，注视圆点时不要跟随鼠标。');
  return model;
}

export class OneEuroFilter {
  private value?: number;
  private previousRaw?: number;
  private derivative = 0;
  private time?: number;
  private minCutoff: number;
  private beta: number;
  constructor(minCutoff = 1.4, beta = 0.25) { this.minCutoff = minCutoff; this.beta = beta; }
  filter(raw: number, time: number) {
    if (this.value === undefined || this.time === undefined || this.previousRaw === undefined || time - this.time > 500) {
      this.value = this.previousRaw = raw; this.time = time; this.derivative = 0; return raw;
    }
    const dt = clamp((time - this.time) / 1000, 0.001, 0.2);
    const alpha = (cutoff: number) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));
    this.derivative += alpha(1) * ((raw - this.previousRaw) / dt - this.derivative);
    this.value += alpha(this.minCutoff + this.beta * Math.abs(this.derivative)) * (raw - this.value);
    this.previousRaw = raw; this.time = time;
    return this.value;
  }
  reset() { this.value = this.previousRaw = this.time = undefined; this.derivative = 0; }
}
