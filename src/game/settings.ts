const KEY = "breach_settings_v1";

export type Settings = {
  sensitivity: number; // 0.5 - 5
  fov: number; // 60 - 110
  graphics: "low" | "medium" | "high";
  showFps: boolean;
};

export const DEFAULT_SETTINGS: Settings = {
  sensitivity: 1.0,
  fov: 85,
  graphics: "medium",
  showFps: false,
};

export function loadSettings(): Settings {
  if (typeof window === "undefined") return { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Ignore storage failures, such as private mode or disabled localStorage.
  }
}
