import { describe, expect, it } from 'vitest';
import { decodePng, encodePng } from '../bench/png';
import { parseEffectSettings, toggleEffect } from '../render/effectSettings';

describe('effect settings', () => {
  it('start on, with nothing in the address', () => {
    expect(parseEffectSettings('')).toEqual({ sway: true, waterAnimation: true });
    expect(parseEffectSettings('?shot=1,2,3,0,0&sky=dusk')).toEqual({ sway: true, waterAnimation: true });
  });

  it('are switched off by ?sway=0 and ?waterfx=0, also spelt off, false and no', () => {
    expect(parseEffectSettings('?sway=0')).toEqual({ sway: false, waterAnimation: true });
    expect(parseEffectSettings('?waterfx=off')).toEqual({ sway: true, waterAnimation: false });
    expect(parseEffectSettings('?sway=OFF&waterfx=false')).toEqual({ sway: false, waterAnimation: false });
    expect(parseEffectSettings('?sway=no')).toEqual({ sway: false, waterAnimation: true });
  });

  it('stay on for anything else, so a typo does not hide an effect', () => {
    expect(parseEffectSettings('?sway=1&waterfx=on')).toEqual({ sway: true, waterAnimation: true });
    expect(parseEffectSettings('?sway=&waterfx=maybe')).toEqual({ sway: true, waterAnimation: true });
  });

  it('toggle one at a time and report the new value', () => {
    const settings = { sway: true, waterAnimation: true };
    expect(toggleEffect('sway', settings)).toBe(false);
    expect(settings).toEqual({ sway: false, waterAnimation: true });
    expect(toggleEffect('waterAnimation', settings)).toBe(false);
    expect(toggleEffect('sway', settings)).toBe(true);
    expect(settings).toEqual({ sway: true, waterAnimation: false });
  });
});

describe('decodePng', () => {
  it('reads back what encodePng wrote', () => {
    const w = 5;
    const h = 3;
    const rgba = new Uint8Array(w * h * 4).map((_, i) => (i * 37) % 256);
    const decoded = decodePng(encodePng(rgba, w, h));
    expect(decoded.width).toBe(w);
    expect(decoded.height).toBe(h);
    expect(Array.from(decoded.rgba)).toEqual(Array.from(rgba));
  });

  it('rejects something that is not a PNG', () => {
    expect(() => decodePng(new Uint8Array(32))).toThrow(/PNG/);
  });
});
