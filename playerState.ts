import { INITIAL_SPAWN } from './constants';

// Where the player is right now. Player (or the benchmark route, or the screenshot camera) writes it every
// frame; anything that cares reads it when it needs it. It lives outside React on purpose: pushing the
// position through state re-rendered the whole tree 60 times a second.
export const playerState = { x: INITIAL_SPAWN.x, y: INITIAL_SPAWN.y, z: INITIAL_SPAWN.z };
