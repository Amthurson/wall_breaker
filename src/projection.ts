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

/** Mirror camera X into the viewer's physical frame; compensate translation for distance. */
export function faceToEye(face: FaceSample, center: FaceSample, sensitivity: number): EyePosition {
  const span = Math.max(face.span, 0.025);
  const z = clamp(6 * (center.span / span), 3.2, 10);
  return {
    x: clamp((center.x - face.x) / span * 1.05 * sensitivity, -4.8, 4.8),
    y: clamp((center.y - face.y) / span * 0.8 * sensitivity, -2.8, 2.8),
    z,
  };
}
