// The switches for the living-world effects (docs/effects.md). Plain data, no three: the F3 debug panel flips them and
// `World` hands the current values to the chunk renderer once a frame, so the panel and the renderer never import each
// other. The starting values come from the address (?sway=0, ?waterfx=0), so a screenshot can ask for either one off.
export interface EffectSettings {
  /** Foliage and plants move in the wind. */
  sway: boolean;
  /** The water surface flows and ripples. */
  waterAnimation: boolean;
}

export type EffectName = keyof EffectSettings;

const isOff = (value: string | null): boolean => value !== null && /^(0|off|false|no)$/i.test(value.trim());

// Reads ?sway=0|off and ?waterfx=0|off. Anything else, or nothing, leaves the effect on.
export const parseEffectSettings = (search: string): EffectSettings => {
  const params = new URLSearchParams(search);
  return { sway: !isOff(params.get('sway')), waterAnimation: !isOff(params.get('waterfx')) };
};

export const effectSettings: EffectSettings = typeof window === 'undefined'
  ? { sway: true, waterAnimation: true }
  : parseEffectSettings(window.location.search);

// Flips one switch and returns its new value.
export const toggleEffect = (name: EffectName, settings: EffectSettings = effectSettings): boolean => {
  settings[name] = !settings[name];
  return settings[name];
};
