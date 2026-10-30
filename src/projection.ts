export interface EyePosition { x: number; y: number; z: number }

/** The physical screen is fixed at z=0; the viewer looks along -Z without rotating. */
export function screenFrustum(eye: EyePosition, halfWidth: number, halfHeight: number, near = 0.1) {
  if (eye.z <= near || halfWidth <= 0 || halfHeight <= 0) {
    throw new RangeError('The viewer must stay in front of a non-empty screen.');
  }
  const scale = near / eye.z;
  return {
    left: (-halfWidth - eye.x) * scale,
    right: (halfWidth - eye.x) * scale,
    top: (halfHeight - eye.y) * scale,
    bottom: (-halfHeight - eye.y) * scale,
    near,
  };
}

export const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export interface FaceSample { x: number; y: number; span: number }

export const FIXED_EYE_DISTANCE = 6;

/** Fixed depth and calibrated scale: forward motion and yaw never drive camera zoom. */
export function faceToEye(face: FaceSample, center: FaceSample, sensitivity: number): EyePosition {
  const span = Math.max(center.span, 0.025);
  return {
    x: clamp((center.x - face.x) / span * 1.05 * sensitivity, -4.8, 4.8),
    y: clamp((center.y - face.y) / span * 0.8 * sensitivity, -2.8, 2.8),
    z: FIXED_EYE_DISTANCE,
  };
}

/** Screen UV -> a point on the fixed window -> a unit ray continuing into the room. */
export function screenRay(eye: EyePosition, halfWidth: number, halfHeight: number, u: number, v: number) {
  const point = { x: (u * 2 - 1) * halfWidth, y: (1 - v * 2) * halfHeight, z: 0 };
  const dx = point.x - eye.x, dy = point.y - eye.y, dz = -eye.z;
  const length = Math.hypot(dx, dy, dz);
  return { origin: { ...eye }, screenPoint: point, direction: { x: dx / length, y: dy / length, z: dz / length } };
}
