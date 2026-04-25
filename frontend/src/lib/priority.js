/**
 * Auto-priority by due date.
 * Returns { key, label, color } where color is a Tailwind bg class.
 */
export function getPriority(dueDateIso, completed) {
  if (completed) return { key: "done", label: "Concluída", bg: "bg-emerald-200", icon: "✓" };
  if (!dueDateIso) return { key: "low", label: "Baixa", bg: "bg-emerald-200", icon: "·" };
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(dueDateIso); due.setHours(0, 0, 0, 0);
  const days = Math.round((due - today) / (1000 * 60 * 60 * 24));
  if (days <= 0) return { key: "urgent", label: "Urgente", bg: "bg-red-300", icon: "!" };
  if (days <= 2) return { key: "high", label: "Alta", bg: "bg-orange-300", icon: "▲" };
  if (days <= 7) return { key: "medium", label: "Média", bg: "bg-amber-200", icon: "●" };
  return { key: "low", label: "Baixa", bg: "bg-emerald-200", icon: "·" };
}

export function formatDateBR(iso) {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  } catch { return iso; }
}

export function daysUntil(iso) {
  if (!iso) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(iso); due.setHours(0, 0, 0, 0);
  return Math.round((due - today) / (1000 * 60 * 60 * 24));
}
