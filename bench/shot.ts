// Pure parsing for the ?shot camera mode, kept apart from the React component so tests can import it.
export interface Shot {
  x: number;
  y: number;
  z: number;
  yawDeg: number;   // 0 looks toward -z, positive turns left
  pitchDeg: number; // positive looks up
}

// Reads ?shot=x,y,z,yawDeg,pitchDeg. Returns null when the parameter is absent or malformed.
export const parseShot = (search: string): Shot | null => {
  const value = new URLSearchParams(search).get('shot');
  if (value === null) return null;
  const parts = value.split(',').map(Number);
  if (parts.length !== 5 || parts.some((n) => !Number.isFinite(n))) return null;
  const [x, y, z, yawDeg, pitchDeg] = parts;
  return { x, y, z, yawDeg, pitchDeg };
};
