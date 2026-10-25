// The switches for the living-world effects (docs/effects.md). Plain data, no three: the F3 debug panel flips them and
// `World` and `EffectsRig` hand the current values to the chunk renderer and the effects system once a frame, so the panel and
// the renderers never import each other. The starting values come from the address (?sway=0, ?waterfx=0, ?fireflies=0, ...), so
// a screenshot can ask for any one off, or all of them with ?fx=0.
export interface EffectSettings {
  /** Foliage and plants move in the wind. */
  sway: boolean;
  /** The water surface flows and ripples. */
  waterAnimation: boolean;
  /** Fireflies drift round the plants at dusk and night. */
  fireflies: boolean;
  /** Petals fall from sakura trees. */
  petals: boolean;
  /** Smoke rises from chimney pots. */
  smoke: boolean;
  /** Embers rise from hearths. */
  embers: boolean;
  /** Lanterns and hearths flicker, and block light shimmers a little. */
  flicker: boolean;
  /** A soft halo round lamps at night. */
  halos: boolean;
  /** The cloud layer. */
  clouds: boolean;
}

export type EffectName = keyof EffectSettings;

/** The effects in the order of the digit keys of the debug panel (1 to 9) and what the panel calls them. */
export const EFFECT_KEYS: ReadonlyArray<{ name: EffectName; label: string; param: string }> = [
  { name: 'sway', label: 'Foliage sway', param: 'sway' },
  { name: 'waterAnimation', label: 'Water animation', param: 'waterfx' },
  { name: 'fireflies', label: 'Fireflies', param: 'fireflies' },
  { name: 'petals', label: 'Sakura petals', param: 'petals' },
  { name: 'smoke', label: 'Chimney smoke', param: 'smoke' },
  { name: 'embers', label: 'Hearth embers', param: 'embers' },
  { name: 'flicker', label: 'Lantern flicker', param: 'flicker' },
  { name: 'halos', label: 'Lamp halos', param: 'halos' },
  { name: 'clouds', label: 'Clouds', param: 'clouds' },
];

const isOff = (value: string | null): boolean => value !== null && /^(0|off|false|no)$/i.test(value.trim());

// Reads ?sway=0|off, ?waterfx=0|off, ?fireflies=, ?petals=, ?smoke=, ?embers=, ?flicker=, ?halos= and ?clouds= the same way, and ?fx=0|off
// for all of them at once (an effect can still be asked back on after it: ?fx=0&clouds=1). Anything else, or nothing, leaves an effect on.
export const parseEffectSettings = (search: string): EffectSettings => {
  const params = new URLSearchParams(search);
  const all = !isOff(params.get('fx'));
  const on = (param: string): boolean => {
    const value = params.get(param);
    if (value === null) return all;
    return !isOff(value);
  };
  return {
    sway: on('sway'), waterAnimation: on('waterfx'), fireflies: on('fireflies'), petals: on('petals'), smoke: on('smoke'),
    embers: on('embers'), flicker: on('flicker'), halos: on('halos'), clouds: on('clouds'),
  };
};

export const effectSettings: EffectSettings = typeof window === 'undefined'
  ? parseEffectSettings('')
  : parseEffectSettings(window.location.search);

// Flips one switch and returns its new value.
export const toggleEffect = (name: EffectName, settings: EffectSettings = effectSettings): boolean => {
  settings[name] = !settings[name];
  return settings[name];
};
