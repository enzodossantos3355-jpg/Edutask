/**
 * Auto-priority by due date.
 * Returns { key, label, color } where color is a Tailwind bg class.
 */

/**
 * Parse an ISO date-only string ("YYYY-MM-DD") as LOCAL midnight to avoid
 * timezone drift where "2026-01-15" becomes "14/01/2026" in UTC-3.
 * Accepts full ISO strings too (already timezone-aware).
 */
export function parseLocalDate(iso) {
  if (!iso) return null;
  const s = String(iso);
  // If it's a date-only ISO (10 chars YYYY-MM-DD), append local time
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const [y, m, d] = s.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date(s);
}

export function getPriority(dueDateIso, completed) {
  if (completed) return { key: "done", label: "Concluída", bg: "bg-emerald-200", icon: "✓" };
  if (!dueDateIso) return { key: "low", label: "Baixa", bg: "bg-emerald-200", icon: "·" };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = parseLocalDate(dueDateIso); due.setHours(0, 0, 0, 0);
  const days = Math.round((due - today) / (1000 * 60 * 60 * 24));
  if (days <= 0) return { key: "urgent", label: "Urgente", bg: "bg-red-300", icon: "!" };
  if (days <= 2) return { key: "high", label: "Alta", bg: "bg-orange-300", icon: "▲" };
  if (days <= 7) return { key: "medium", label: "Média", bg: "bg-amber-200", icon: "●" };
  return { key: "low", label: "Baixa", bg: "bg-emerald-200", icon: "·" };
}

export function formatDateBR(iso) {
  if (!iso) return "";
  try {
    const d = parseLocalDate(iso);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  } catch { return iso; }
}

export function daysUntil(iso) {
  if (!iso) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = parseLocalDate(iso); due.setHours(0, 0, 0, 0);
  return Math.round((due - today) / (1000 * 60 * 60 * 24));
}
