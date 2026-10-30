import { create } from "zustand";

// Two skies: the 3 AM night (default) and a bright day. Both blue.
export const THEMES = [
  { type: "night", color: "#0b1838" },
  { type: "day", color: "#0690d4" },
];

function savedTheme() {
  try {
    const t = localStorage.getItem("wisprops-sky");
    return THEMES.find((x) => x.type === t) || THEMES[0];
  } catch { return THEMES[0]; }
}

export const useThemeStore = create((set, get) => ({
  theme: savedTheme(),
  nextTheme: () => {
    const i = THEMES.findIndex((t) => t.type === get().theme.type);
    const theme = THEMES[(i + 1) % THEMES.length];
    try { localStorage.setItem("wisprops-sky", theme.type); } catch { /* private window */ }
    set({ theme });
  },
}));

// Scroll position of the main story (0 to 1).
export const useScrollStore = create((set) => ({
  scrollProgress: 0,
  setScrollProgress: (scrollProgress) => set({ scrollProgress }),
}));

export const isMobile = typeof window !== "undefined" &&
  (matchMedia("(pointer: coarse)").matches || window.innerWidth < 760);
