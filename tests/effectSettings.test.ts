import { describe, expect, it } from 'vitest';
import { decodePng, encodePng } from '../bench/png';
import { EFFECT_KEYS, EffectSettings, parseEffectSettings, toggleEffect } from '../render/effectSettings';

// Every effect on, with some overrides: the shape of EffectSettings is nine switches now (sway and the water came first).
const on = (overrides: Partial<EffectSettings> = {}): EffectSettings => ({
  sway: true, waterAnimation: true, fireflies: true, petals: true, smoke: true, embers: true, flicker: true, halos: true, clouds: true,
  ...overrides,
});

describe('effect settings', () => {
  it('start on, with nothing in the address', () => {
    expect(parseEffectSettings('')).toEqual(on());
    expect(parseEffectSettings('?shot=1,2,3,0,0&sky=dusk')).toEqual(on());
  });

  it('are switched off by ?sway=0 and ?waterfx=0, also spelt off, false and no', () => {
    expect(parseEffectSettings('?sway=0')).toEqual(on({ sway: false }));
    expect(parseEffectSettings('?waterfx=off')).toEqual(on({ waterAnimation: false }));
    expect(parseEffectSettings('?sway=OFF&waterfx=false')).toEqual(on({ sway: false, waterAnimation: false }));
    expect(parseEffectSettings('?sway=no')).toEqual(on({ sway: false }));
  });

  it('switch each of the other effects off by its own parameter', () => {
    for (const { name, param } of EFFECT_KEYS) {
      expect(parseEffectSettings(`?${param}=0`)).toEqual(on({ [name]: false }));
    }
    expect(parseEffectSettings('?fireflies=off&clouds=no')).toEqual(on({ fireflies: false, clouds: false }));
  });

  it('switch everything off with ?fx=0, and let one be asked back on after it', () => {
    expect(Object.values(parseEffectSettings('?fx=0')).every((v) => v === false)).toBe(true);
    expect(parseEffectSettings('?fx=off&clouds=1')).toEqual({ ...parseEffectSettings('?fx=0'), clouds: true });
    expect(parseEffectSettings('?fx=1')).toEqual(on());
  });

  it('stay on for anything else, so a typo does not hide an effect', () => {
    expect(parseEffectSettings('?sway=1&waterfx=on')).toEqual(on());
    expect(parseEffectSettings('?sway=&waterfx=maybe')).toEqual(on());
  });

  it('list nine effects for the digit keys, each once, in the settings', () => {
    expect(EFFECT_KEYS).toHaveLength(9);
    expect(new Set(EFFECT_KEYS.map((e) => e.name)).size).toBe(9);
    expect(new Set(EFFECT_KEYS.map((e) => e.param)).size).toBe(9);
    expect(EFFECT_KEYS.map((e) => e.name).sort()).toEqual(Object.keys(on()).sort());
  });

  it('toggle one at a time and report the new value', () => {
    const settings = on();
    expect(toggleEffect('sway', settings)).toBe(false);
    expect(settings).toEqual(on({ sway: false }));
    expect(toggleEffect('waterAnimation', settings)).toBe(false);
    expect(toggleEffect('sway', settings)).toBe(true);
    expect(settings).toEqual(on({ waterAnimation: false }));
    expect(toggleEffect('clouds', settings)).toBe(false);
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
