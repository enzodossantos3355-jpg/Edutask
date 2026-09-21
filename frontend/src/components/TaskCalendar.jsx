import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getPriority } from "@/lib/priority";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

const subjectColors = ["bg-sky-200", "bg-amber-200", "bg-red-200", "bg-emerald-200", "bg-violet-200", "bg-rose-200"];
const colorFor = (s) => subjectColors[(s || "").length % subjectColors.length];

export default function TaskCalendar({ tasks }) {
  const today = new Date();
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const tasksByDate = {};
  tasks.forEach((t) => {
    if (!t.due_date) return;
    if (!tasksByDate[t.due_date]) tasksByDate[t.due_date] = [];
    tasksByDate[t.due_date].push(t);
  });

  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const goPrev = () => setCursor(new Date(year, month - 1, 1));
  const goNext = () => setCursor(new Date(year, month + 1, 1));
  const goToday = () => setCursor(new Date(today.getFullYear(), today.getMonth(), 1));

  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ day: d, iso, tasks: tasksByDate[iso] || [] });
  }

  return (
    <div className="nb-card bg-white p-3 sm:p-6" data-testid="task-calendar">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h2 className="font-heading font-black text-xl sm:text-2xl">{MONTHS[month]} {year}</h2>
        <div className="flex items-center gap-2">
          <button onClick={goPrev} className="nb-btn bg-white px-3 py-2" data-testid="cal-prev"><ChevronLeft className="w-4 h-4" /></button>
          <button onClick={goToday} className="nb-btn bg-amber-200 px-3 py-2 text-sm" data-testid="cal-today">Hoje</button>
          <button onClick={goNext} className="nb-btn bg-white px-3 py-2" data-testid="cal-next"><ChevronRight className="w-4 h-4" /></button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {WEEKDAYS.map((d) => (
          <div key={d} className="text-center text-[10px] sm:text-xs font-bold uppercase tracking-wider text-neutral-600 py-1.5 sm:py-2">{d}</div>
        ))}
        {cells.map((c, i) => {
          if (!c) return <div key={`e-${i}`} />;
          const isToday = c.iso === todayIso;
          return (
            <div
              key={c.iso}
              className={`nb-card min-h-[60px] sm:min-h-[88px] p-1 sm:p-1.5 ${isToday ? "bg-amber-100" : "bg-white"}`}
              data-testid={`cal-day-${c.iso}`}
            >
              <div className={`text-[10px] sm:text-xs font-bold ${isToday ? "text-amber-900" : ""}`}>{c.day}</div>
              <div className="space-y-0.5 mt-0.5 sm:mt-1">
                {c.tasks.slice(0, 2).map((t) => {
                  const p = getPriority(t.due_date, t.completed);
                  return (
                    <div
                      key={t.id}
                      className={`text-[9px] sm:text-[10px] font-bold px-1 py-0.5 rounded border border-black truncate ${t.completed ? "line-through opacity-60" : ""} ${colorFor(t.subject)}`}
                      title={`${t.subject}: ${t.title} (${p.label})`}
                      data-testid={`cal-task-${t.id}`}
                    >
                      {t.title}
                    </div>
                  );
                })}
                {c.tasks.length > 2 && (
                  <div className="text-[9px] sm:text-[10px] text-neutral-600 font-bold">+{c.tasks.length - 2}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
