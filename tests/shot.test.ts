import { describe, expect, it } from 'vitest';
import { parseShot } from '../bench/shot';

describe('parseShot', () => {
  it('reads x,y,z,yaw,pitch', () => {
    expect(parseShot('?shot=0,12,120,0,5')).toEqual({ x: 0, y: 12, z: 120, yawDeg: 0, pitchDeg: 5 });
    expect(parseShot('?bench&shot=-1500,14.5,0,90,-10')).toEqual({ x: -1500, y: 14.5, z: 0, yawDeg: 90, pitchDeg: -10 });
  });

  it('returns null when the parameter is absent', () => {
    expect(parseShot('')).toBeNull();
    expect(parseShot('?bench=soak')).toBeNull();
  });

  it('returns null for a wrong count or non-numeric parts', () => {
    expect(parseShot('?shot=1,2,3')).toBeNull();
    expect(parseShot('?shot=1,2,3,4,5,6')).toBeNull();
    expect(parseShot('?shot=1,2,x,4,5')).toBeNull();
    expect(parseShot('?shot=')).toBeNull();
  });
});
