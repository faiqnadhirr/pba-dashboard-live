// legend category keys per map colour mode, in legend order (derived from lib/mapmodes.js)
import { MAP_MODES } from "./mapmodes.js";
export const COLOR_MODES_LEGEND = Object.fromEntries(Object.entries(MAP_MODES).map(([k, m]) => [k, m.keys]));
