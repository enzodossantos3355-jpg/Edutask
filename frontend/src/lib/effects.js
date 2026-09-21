/**
 * Mapping effect id → CSS class (kept in sync with backend DEFAULT_EFFECTS).
 * A fresh call to /api/effects returns the definitive list; this map is a
 * lightweight fallback used by Avatar renders that don't fetch the catalog.
 */
export const EFFECT_CSS = {
  none: "",
  neon_pulse: "fx-neon-pulse",
  sunset: "fx-sunset",
  golden: "fx-golden",
  rainbow: "fx-rainbow",
  ice: "fx-ice",
  fire: "fx-fire",
  hologram: "fx-hologram",
  galaxy: "fx-galaxy",
  electric: "fx-electric",
  shadow: "fx-shadow",
  phoenix: "fx-phoenix",
  diamond: "fx-diamond",
};

export function effectClass(effectId) {
  if (!effectId) return "";
  return EFFECT_CSS[effectId] || "";
}

export const RARITY_META = {
  common: { label: "Comum", bg: "bg-neutral-200" },
  rare: { label: "Raro", bg: "bg-sky-200" },
  epic: { label: "Épico", bg: "bg-violet-200" },
  legendary: { label: "Lendário", bg: "bg-amber-300" },
};
