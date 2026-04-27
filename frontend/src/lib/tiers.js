/**
 * Tier (rank) configuration matching backend logic.
 * Each tier has explicit hex border colors (used in inline style — Tailwind JIT
 * cannot generate ring-{color}-500 from dynamic strings).
 */
export const TIERS = [
  { name: "Obsidiana", threshold: 2000, bg: "bg-violet-900",  text: "text-violet-200",  borderHex: "#7c3aed", glowHex: "#a78bfa", emoji: "🪨" },
  { name: "Rubi",      threshold: 1200, bg: "bg-red-700",     text: "text-red-100",     borderHex: "#dc2626", glowHex: "#fca5a5", emoji: "🔴" },
  { name: "Diamante",  threshold: 700,  bg: "bg-cyan-400",    text: "text-cyan-900",    borderHex: "#06b6d4", glowHex: "#a5f3fc", emoji: "💎" },
  { name: "Platina",   threshold: 350,  bg: "bg-teal-400",    text: "text-teal-900",    borderHex: "#14b8a6", glowHex: "#5eead4", emoji: "✨" },
  { name: "Ouro",      threshold: 150,  bg: "bg-amber-400",   text: "text-amber-900",   borderHex: "#f59e0b", glowHex: "#fde68a", emoji: "🥇" },
  { name: "Prata",     threshold: 50,   bg: "bg-gray-300",    text: "text-gray-800",    borderHex: "#9ca3af", glowHex: "#e5e7eb", emoji: "🥈" },
  { name: "Bronze",    threshold: 0,    bg: "bg-orange-300",  text: "text-orange-900",  borderHex: "#ea580c", glowHex: "#fed7aa", emoji: "🥉" },
];

export function getTier(points = 0) {
  for (let i = 0; i < TIERS.length; i++) {
    if (points >= TIERS[i].threshold) {
      return { ...TIERS[i], next: TIERS[i - 1] || null };
    }
  }
  return { ...TIERS[TIERS.length - 1], next: TIERS[TIERS.length - 2] };
}

/** Get tier just by its name (used when only the name is available). */
export function getTierByName(name) {
  return TIERS.find((t) => t.name === name) || TIERS[TIERS.length - 1];
}

export function progressToNext(points = 0) {
  const t = getTier(points);
  if (!t.next) return 1;
  const range = t.next.threshold - t.threshold;
  const filled = points - t.threshold;
  return Math.max(0, Math.min(1, filled / range));
}
