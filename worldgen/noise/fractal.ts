import { SimplexNoise } from './SimplexNoise';

export interface FractalOptions {
  octaves?: number;     // default 4
  lacunarity?: number;  // frequency multiplier per octave, default 2
  gain?: number;        // amplitude multiplier per octave, default 0.5
}

// Every helper divides by the total amplitude, so the output range does not depend on the octave count.

// Layered noise. Range [-1, 1].
export const fbm = (n: SimplexNoise, x: number, z: number, o: FractalOptions = {}): number => {
  const octaves = o.octaves ?? 4;
  const lacunarity = o.lacunarity ?? 2;
  const gain = o.gain ?? 0.5;
  let sum = 0, amp = 1, norm = 0, f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * n.noise2(x * f, z * f);
    norm += amp;
    amp *= gain;
    f *= lacunarity;
  }
  return sum / norm;
};

export const fbm3 = (n: SimplexNoise, x: number, y: number, z: number, o: FractalOptions = {}): number => {
  const octaves = o.octaves ?? 4;
  const lacunarity = o.lacunarity ?? 2;
  const gain = o.gain ?? 0.5;
  let sum = 0, amp = 1, norm = 0, f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * n.noise3(x * f, y * f, z * f);
    norm += amp;
    amp *= gain;
    f *= lacunarity;
  }
  return sum / norm;
};

// Sharp ridges where the base noise crosses zero, for mountain spines. Range [0, 1], 1 on the crest.
export const ridged = (n: SimplexNoise, x: number, z: number, o: FractalOptions = {}): number => {
  const octaves = o.octaves ?? 4;
  const lacunarity = o.lacunarity ?? 2;
  const gain = o.gain ?? 0.5;
  let sum = 0, amp = 1, norm = 0, f = 1;
  for (let i = 0; i < octaves; i++) {
    const r = 1 - Math.abs(n.noise2(x * f, z * f));
    sum += amp * r * r;
    norm += amp;
    amp *= gain;
    f *= lacunarity;
  }
  return sum / norm;
};

// Rounded hills with creased valleys, the opposite of ridged. Range [0, 1], 0 in the creases.
export const billow = (n: SimplexNoise, x: number, z: number, o: FractalOptions = {}): number => {
  const octaves = o.octaves ?? 4;
  const lacunarity = o.lacunarity ?? 2;
  const gain = o.gain ?? 0.5;
  let sum = 0, amp = 1, norm = 0, f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * Math.abs(n.noise2(x * f, z * f));
    norm += amp;
    amp *= gain;
    f *= lacunarity;
  }
  return sum / norm;
};

export interface Point2 { x: number; z: number }

// Shifts a point by a smooth noise field so straight features (coasts, borders) wander. `amount` is the
// largest shift in blocks along each axis, `frequency` how quickly the shift changes. Pass `out` to avoid
// an allocation in hot loops.
export const domainWarp = (
  n: SimplexNoise, x: number, z: number, amount: number, frequency: number, out: Point2 = { x: 0, z: 0 },
): Point2 => {
  // The second sample is offset so the two axes are not the same field.
  out.x = x + amount * n.noise2(x * frequency + 31.7, z * frequency - 17.3);
  out.z = z + amount * n.noise2(x * frequency - 52.9, z * frequency + 8.1);
  return out;
};
