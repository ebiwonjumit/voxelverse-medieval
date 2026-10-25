import { describe, expect, it } from 'vitest';
import { parseDaylight, parseRenderDistance, parseShot } from '../bench/shot';

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

describe('parseDaylight', () => {
  it('reads a number from 0 to 1 and clamps the rest', () => {
    expect(parseDaylight('?daylight=0.25')).toBe(0.25);
    expect(parseDaylight('?shot=0,1,2,3,4&daylight=0')).toBe(0);
    expect(parseDaylight('?daylight=3')).toBe(1);
    expect(parseDaylight('?daylight=-1')).toBe(0);
  });

  it('returns null when absent, empty or not a number', () => {
    expect(parseDaylight('')).toBeNull();
    expect(parseDaylight('?daylight=')).toBeNull();
    expect(parseDaylight('?daylight=night')).toBeNull();
  });
});

describe('parseRenderDistance', () => {
  it('reads a whole number of chunks from 3 to 24', () => {
    expect(parseRenderDistance('?shot=0,1,2,3,4&rd=14')).toBe(14);
    expect(parseRenderDistance('?rd=3')).toBe(3);
  });

  it('ignores anything else', () => {
    expect(parseRenderDistance('')).toBeNull();
    expect(parseRenderDistance('?rd=')).toBeNull();
    expect(parseRenderDistance('?rd=2')).toBeNull();
    expect(parseRenderDistance('?rd=25')).toBeNull();
    expect(parseRenderDistance('?rd=8.5')).toBeNull();
    expect(parseRenderDistance('?rd=far')).toBeNull();
  });
});
