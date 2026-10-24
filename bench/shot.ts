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

// Reads ?daylight=0..1, how much of the baked sky light shows (1 is noon, 0 is the darkest night). It lets a screenshot or a
// test of the lighting pick the time of day until the day/night cycle drives it. Returns null when absent or not a number.
export const parseDaylight = (search: string): number | null => {
  const value = new URLSearchParams(search).get('daylight');
  if (value === null || value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), 1) : null;
};

// Reads ?rd=chunks, a render distance for a screenshot (an aerial of a whole city needs more than the game's 8). Only the
// ?shot pages use it. Returns null when absent or not a whole number from 3 to 24.
export const parseRenderDistance = (search: string): number | null => {
  const value = new URLSearchParams(search).get('rd');
  if (value === null || value.trim() === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= 3 && n <= 24 ? n : null;
};
