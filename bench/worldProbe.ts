// The world renderer registers one of these so the bench and screenshot tools can ask it questions
// without knowing how it draws. Pure TypeScript on purpose: any renderer can plug in.
export interface WorldProbe {
  // True once the world around the camera has finished loading and will not change on its own.
  isReady(): boolean;
  // Renderer-specific counters, recorded next to the three.js numbers in the soak run.
  getStats?(): Record<string, number>;
}

let current: WorldProbe | null = null;

// Returns a function that unregisters the probe, for use as an effect cleanup.
export const registerWorldProbe = (probe: WorldProbe): (() => void) => {
  current = probe;
  return () => {
    if (current === probe) current = null;
  };
};

export const getWorldProbe = (): WorldProbe | null => current;
