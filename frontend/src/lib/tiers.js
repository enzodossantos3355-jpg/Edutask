/**
 * Tier (rank) configuration matching backend logic.
 * Returns tier object given total points.
 */
export const TIERS = [
  { name: "Obsidiana", threshold: 2000, bg: "bg-violet-900", text: "text-violet-200", ring: "ring-violet-500", emoji: "🪨" },
  { name: "Rubi",      threshold: 1200, bg: "bg-red-700",    text: "text-red-100",    ring: "ring-red-500",    emoji: "🔴" },
  { name: "Diamante",  threshold: 700,  bg: "bg-cyan-400",   text: "text-cyan-900",   ring: "ring-cyan-500",   emoji: "💎" },
  { name: "Platina",   threshold: 350,  bg: "bg-teal-400",   text: "text-teal-900",   ring: "ring-teal-500",   emoji: "✨" },
  { name: "Ouro",      threshold: 150,  bg: "bg-amber-400",  text: "text-amber-900",  ring: "ring-amber-500",  emoji: "🥇" },
  { name: "Prata",     threshold: 50,   bg: "bg-gray-300",   text: "text-gray-800",   ring: "ring-gray-400",   emoji: "🥈" },
  { name: "Bronze",    threshold: 0,    bg: "bg-orange-300", text: "text-orange-900", ring: "ring-orange-500", emoji: "🥉" },
];

export function getTier(points = 0) {
  for (let i = 0; i < TIERS.length; i++) {
    if (points >= TIERS[i].threshold) {
      return { ...TIERS[i], next: TIERS[i - 1] || null };
    }
  }
  return { ...TIERS[TIERS.length - 1], next: TIERS[TIERS.length - 2] };
}

export function progressToNext(points = 0) {
  const t = getTier(points);
  if (!t.next) return 1; // maxed out
  const range = t.next.threshold - t.threshold;
  const filled = points - t.threshold;
  return Math.max(0, Math.min(1, filled / range));
}
