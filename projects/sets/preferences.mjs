export const PREFERENCE_STORAGE_KEY = "sets.preferences";

export const DEFAULT_PREFERENCES = Object.freeze({
  layoutMode: "inline",
  runMode: "score",
  difficulty: 6,
  complexity: null,
  colorBlind: false,
});

const RUN_MODES = new Set(["timed", "score", "unlimited"]);
const LAYOUT_MODES = new Set(["inline", "embedded"]);
const DIFFICULTIES = new Set([6, 9, 12, 15]);
const COMPLEXITIES = new Set([1, 2, 3, 4]);
const PREFERENCE_VERSION = 1;

export function normalizePreferences(value) {
  const preferences = value && typeof value === "object" ? value : {};

  return {
    layoutMode: LAYOUT_MODES.has(preferences.layoutMode)
      ? preferences.layoutMode
      : DEFAULT_PREFERENCES.layoutMode,
    runMode: RUN_MODES.has(preferences.runMode)
      ? preferences.runMode
      : DEFAULT_PREFERENCES.runMode,
    difficulty: DIFFICULTIES.has(preferences.difficulty)
      ? preferences.difficulty
      : DEFAULT_PREFERENCES.difficulty,
    complexity:
      preferences.complexity === null || COMPLEXITIES.has(preferences.complexity)
        ? preferences.complexity
        : DEFAULT_PREFERENCES.complexity,
    colorBlind:
      typeof preferences.colorBlind === "boolean"
        ? preferences.colorBlind
        : DEFAULT_PREFERENCES.colorBlind,
  };
}

export function loadPreferences(storage) {
  try {
    const target = storage ?? globalThis.localStorage;
    const saved = target.getItem(PREFERENCE_STORAGE_KEY);
    if (saved === null) return { ...DEFAULT_PREFERENCES };

    const parsed = JSON.parse(saved);
    if (parsed?.version !== PREFERENCE_VERSION) return { ...DEFAULT_PREFERENCES };
    return normalizePreferences(parsed);
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function savePreferences(preferences, storage) {
  try {
    const target = storage ?? globalThis.localStorage;
    const normalized = normalizePreferences(preferences);
    target.setItem(
      PREFERENCE_STORAGE_KEY,
      JSON.stringify({ version: PREFERENCE_VERSION, ...normalized }),
    );
    return true;
  } catch {
    return false;
  }
}
