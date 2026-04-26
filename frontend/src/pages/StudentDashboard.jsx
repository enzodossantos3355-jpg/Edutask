import { useEffect, useState, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { Calendar as CalendarIcon, Paperclip, Check, BookOpen, Filter, Megaphone } from "lucide-react";
import api, { API, formatApiError } from "@/lib/api";
import AppHeader from "@/components/AppHeader";
import { getPriority, formatDateBR, daysUntil } from "@/lib/priority";

const subjectColors = ["bg-sky-200", "bg-amber-200", "bg-red-200", "bg-emerald-200", "bg-violet-200", "bg-rose-200"];
const colorFor = (s) => subjectColors[(s || "").length % subjectColors.length];

export default function StudentDashboard() {
  const [tasks, setTasks] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("todas");
  const [subjectFilter, setSubjectFilter] = useState("todas");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: t }, { data: a }] = await Promise.all([
        api.get("/tasks"),
        api.get("/announcements"),
      ]);
      setTasks(t);
      setAnnouncements(a);
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const subjects = useMemo(() => {
    const s = new Set(tasks.map((t) => t.subject));
    return ["todas", ...Array.from(s)];
  }, [tasks]);

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (subjectFilter !== "todas" && t.subject !== subjectFilter) return false;
      if (filter === "pendentes" && t.completed) return false;
      if (filter === "concluidas" && !t.completed) return false;
      return true;
    });
  }, [tasks, filter, subjectFilter]);

  const total = tasks.length;
  const done = tasks.filter((t) => t.completed).length;
  const pending = total - done;

  const toggle = async (task) => {
    try {
      if (task.completed) {
        await api.post(`/tasks/${task.id}/uncomplete`);
        toast("Tarefa desmarcada");
      } else {
        await api.post(`/tasks/${task.id}/complete`);
        toast.success("Tarefa concluída! 🎉");
      }
      load();
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail));
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <AppHeader title="Minhas tarefas" />
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="font-heading font-black text-4xl sm:text-5xl tracking-tight">Olá! Vamos estudar?</h1>
          <p className="text-neutral-600 mt-1">Marque suas tarefas conforme as conclui.</p>
        </div>

        {/* Announcements */}
        {announcements.length > 0 && (
          <div className="mb-10" data-testid="student-announcements">
            <h2 className="font-heading font-bold text-2xl mb-4 flex items-center gap-2">
              <Megaphone className="w-6 h-6" strokeWidth={2.5} />
              Avisos
              <span className="nb-badge bg-violet-200 ml-1">{announcements.length}</span>
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {announcements.map((a, i) => (
                <div
                  key={a.id}
                  className="nb-card p-5 bg-violet-100 nb-fade-in"
                  style={{ animationDelay: `${i * 50}ms` }}
                  data-testid={`student-announcement-${a.id}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 nb-card flex items-center justify-center bg-violet-300 flex-shrink-0">
                      <Megaphone className="w-5 h-5" strokeWidth={2.5} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-heading font-bold text-lg leading-tight mb-1">{a.title}</h3>
                      <p className="text-sm text-neutral-800 whitespace-pre-wrap mb-2">{a.message}</p>
                      <span className="text-xs text-neutral-600 font-medium">{formatDateBR(a.created_at)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8 max-w-2xl">
          <StatCard label="Total" value={total} bg="bg-sky-200" testId="stat-total" />
          <StatCard label="Pendentes" value={pending} bg="bg-amber-200" testId="stat-pending" />
          <StatCard label="Concluídas" value={done} bg="bg-emerald-200" testId="stat-done" />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6 items-center">
          <div className="flex items-center gap-1.5 text-sm font-bold mr-1">
            <Filter className="w-4 h-4" /> Filtrar:
          </div>
          {[["todas", "Todas"], ["pendentes", "Pendentes"], ["concluidas", "Concluídas"]].map(([k, label]) => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={`nb-btn px-4 py-2 text-sm ${filter === k ? "bg-sky-400" : "bg-white"}`}
              data-testid={`filter-${k}`}
            >
              {label}
            </button>
          ))}
          {subjects.length > 1 && (
            <select
              value={subjectFilter}
              onChange={(e) => setSubjectFilter(e.target.value)}
              className="nb-btn bg-white px-3 py-2 text-sm cursor-pointer"
              data-testid="subject-filter"
            >
              {subjects.map((s) => (
                <option key={s} value={s}>{s === "todas" ? "Todas as matérias" : s}</option>
              ))}
            </select>
          )}
        </div>

        {loading ? (
          <p className="text-neutral-500">Carregando...</p>
        ) : filtered.length === 0 ? (
          <div className="nb-card bg-white p-12 text-center max-w-xl mx-auto">
            <div className="w-14 h-14 nb-card bg-amber-100 mx-auto mb-4 flex items-center justify-center">
              <BookOpen className="w-6 h-6" />
            </div>
            <h3 className="font-heading font-bold text-xl mb-1">
              {tasks.length === 0 ? "Nenhuma tarefa por enquanto" : "Nada por aqui"}
            </h3>
            <p className="text-neutral-600 text-sm">
              {tasks.length === 0
                ? "Quando seu professor criar tarefas, elas aparecerão aqui."
                : "Tente alterar os filtros."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            {filtered.map((t, i) => (
              <StudentTaskCard key={t.id} task={t} onToggle={() => toggle(t)} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, bg, testId }) {
  return (
    <div className={`nb-card p-4 ${bg}`} data-testid={testId}>
      <div className="text-xs font-bold uppercase tracking-wider">{label}</div>
      <div className="font-heading font-black text-3xl sm:text-4xl mt-1">{value}</div>
    </div>
  );
}

function StudentTaskCard({ task, onToggle, index }) {
  const days = daysUntil(task.due_date);
  const priority = getPriority(task.due_date, task.completed);
  let dueLabel = formatDateBR(task.due_date);
  let dueBg = "bg-white";
  if (!task.completed && days != null) {
    if (days < 0) { dueLabel = `Atrasada (${Math.abs(days)}d)`; dueBg = "bg-red-200"; }
    else if (days === 0) { dueLabel = "Entrega hoje!"; dueBg = "bg-amber-200"; }
    else if (days <= 2) { dueLabel = `Em ${days} dia${days > 1 ? "s" : ""}`; dueBg = "bg-amber-100"; }
  }

  return (
    <div
      className={`nb-card nb-card-hover p-6 nb-fade-in ${task.completed ? "opacity-75" : ""}`}
      style={{ animationDelay: `${index * 60}ms` }}
      data-testid={`student-task-card-${task.id}`}
    >
      <div className="flex items-start justify-between gap-2 mb-3 flex-wrap">
        <span className={`nb-badge ${colorFor(task.subject)}`}>{task.subject}</span>
        <span className={`nb-badge ${priority.bg}`} data-testid={`student-task-priority-${task.id}`}>
          {priority.icon} {priority.label}
        </span>
      </div>
      <div className="flex items-center gap-2 text-xs mb-3">
        <span className={`nb-badge ${dueBg}`}>
          <CalendarIcon className="w-3 h-3 inline mr-1 -mt-0.5" /> {dueLabel}
        </span>
      </div>
      <h3 className={`font-heading font-bold text-xl mb-1 leading-tight ${task.completed ? "line-through" : ""}`}>
        {task.title}
      </h3>
      <p className="text-sm text-neutral-700 mb-4 whitespace-pre-wrap">{task.description}</p>

      {task.attachments?.length > 0 && (
        <div className="mb-4 space-y-1.5">
          <div className="text-xs font-bold text-neutral-600 uppercase tracking-wide">Anexos</div>
          {task.attachments.map((a) => <AttachmentLink key={a.id} file={a} />)}
        </div>
      )}

      <button
        onClick={onToggle}
        className={`nb-btn w-full px-4 py-2.5 flex items-center justify-center gap-2 ${task.completed ? "bg-white" : "bg-emerald-300"}`}
        data-testid={`toggle-complete-${task.id}`}
      >
        <Check className="w-4 h-4" strokeWidth={3} />
        {task.completed ? "Desmarcar" : "Marcar como concluída"}
      </button>
    </div>
  );
}

function AttachmentLink({ file }) {
  const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : "";
  const url = `${API}/files/${file.id}/download?auth=${encodeURIComponent(token || "")}`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-2 nb-card bg-amber-50 hover:bg-amber-100 px-3 py-1.5 text-xs font-medium"
      data-testid={`attachment-${file.id}`}
    >
      <Paperclip className="w-3.5 h-3.5" />
      <span className="truncate">{file.original_filename}</span>
    </a>
  );
}
