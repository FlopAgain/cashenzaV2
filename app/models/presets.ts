export const DESIGN_PRESETS = [
  {
    id: "atelier",
    name: "Bundle clean",
    tokens: {
      background: "#eef5ec",
      foreground: "#1f241f",
      accent: "#6f8b6d",
      border: "#dfe9dc",
      highlight: "#f4d313",
      timerBackground: "#111a12",
      timerForeground: "#ffffff",
      muted: "#5c655c",
      radius: "20px",
      font: "Aptos, Verdana, sans-serif",
    },
  },
  {
    id: "signal",
    name: "Signal net",
    tokens: {
      background: "#eff8f3",
      foreground: "#10231a",
      accent: "#158451",
      border: "#b7ddc8",
      radius: "14px",
      font: "Verdana, sans-serif",
    },
  },
  {
    id: "mono",
    name: "Mono efficace",
    tokens: {
      background: "#f5f5f2",
      foreground: "#1d1d1b",
      accent: "#111111",
      border: "#d9d8cf",
      radius: "8px",
      font: "Courier New, monospace",
    },
  },
] as const;

export const BADGE_PRESETS = [
  { id: "none", name: "Aucun badge", mode: "css" },
  { id: "best-seller-ribbon", name: "Best seller ruban", mode: "css" },
  { id: "save-pill", name: "Vignette economie", mode: "css" },
  { id: "png-burst-gold", name: "Burst PNG or", mode: "png", asset: "badge-burst-gold.png" },
] as const;

export const DOM_EFFECTS = [
  { id: "NONE", name: "Aucun" },
  { id: "FADE_UP", name: "Fade up" },
  { id: "SCALE_IN", name: "Scale in" },
  { id: "SLIDE_LEFT", name: "Slide left" },
] as const;
