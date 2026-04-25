import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Plus, Calendar as CalendarIcon, Trash2, Users, ListTodo, Paperclip, X, CheckCircle2, Circle, Upload, Eye, EyeOff, BookMarked, Wrench, Lock, CheckCircle, Megaphone } from "lucide-react";
import api, { API, formatApiError } from "@/lib/api";
import AppHeader from "@/components/AppHeader";
import RecipientSelector from "@/components/RecipientSelector";
import { getPriority, formatDateBR } from "@/lib/priority";

const STATUS_OPTS = [
  { key: "active", label: "Ativo", icon: CheckCircle, bg: "bg-emerald-200" },
  { key: "maintenance", label: "Em manutenção", icon: Wrench, bg: "bg-orange-300" },
  { key: "blocked", label: "Bloqueado", icon: Lock, bg: "bg-neutral-300" },
];

const subjectColors = ["bg-sky-200", "bg-amber-200", "bg-red-200", "bg-emerald-200", "bg-violet-200", "bg-rose-200"];
const colorFor = (s) => subjectColors[(s || "").length % subjectColors.length];

export default function AdminDashboard() {
  const [tab, setTab] = useState("tasks");
  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <AppHeader title="Painel do Administrador" />
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex flex-wrap gap-3 mb-8">
          <button
            onClick={() => setTab("tasks")}
            className={`nb-btn px-5 py-2.5 ${tab === "tasks" ? "bg-sky-400" : "bg-white"}`}
            data-testid="tab-tasks"
          >
            <ListTodo className="w-4 h-4 inline mr-2" /> Tarefas
          </button>
          <button
            onClick={() => setTab("announcements")}
            className={`nb-btn px-5 py-2.5 ${tab === "announcements" ? "bg-violet-300" : "bg-white"}`}
            data-testid="tab-announcements"
          >
            <Megaphone className="w-4 h-4 inline mr-2" /> Avisos
          </button>
          <button
            onClick={() => setTab("students")}
            className={`nb-btn px-5 py-2.5 ${tab === "students" ? "bg-amber-300" : "bg-white"}`}
            data-testid="tab-students"
          >
            <Users className="w-4 h-4 inline mr-2" /> Alunos
          </button>
          <button
            onClick={() => setTab("subjects")}
            className={`nb-btn px-5 py-2.5 ${tab === "subjects" ? "bg-red-300" : "bg-white"}`}
            data-testid="tab-subjects"
          >
            <BookMarked className="w-4 h-4 inline mr-2" /> Matérias
          </button>
        </div>
        {tab === "tasks" && <TasksPanel />}
        {tab === "announcements" && <AnnouncementsPanel />}
        {tab === "students" && <StudentsPanel />}
        {tab === "subjects" && <SubjectsPanel />}
      </div>
    </div>
  );
}

// --- Tasks panel ---
function TasksPanel() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/tasks");
      setTasks(data);
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onDelete = async () => {
    if (!confirmDelete) return;
    try {
      await api.delete(`/tasks/${confirmDelete.id}`);
      toast.success("Tarefa excluída");
      setConfirmDelete(null);
      load();
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail));
    }
  };

  return (
    <div>
      <div className="flex items-end justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="font-heading font-black text-4xl sm:text-5xl tracking-tight">Tarefas</h1>
          <p className="text-neutral-600 mt-1">Crie tarefas e acompanhe o progresso dos alunos.</p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="nb-btn bg-sky-400 px-5 py-3 flex items-center gap-2"
          data-testid="open-create-task-button"
        >
          <Plus className="w-4 h-4" strokeWidth={3} /> Nova tarefa
        </button>
      </div>

      {loading ? (
        <p className="text-neutral-500">Carregando...</p>
      ) : tasks.length === 0 ? (
        <EmptyState icon={ListTodo} title="Nenhuma tarefa ainda" subtitle="Clique em 'Nova tarefa' para criar a primeira." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {tasks.map((t, i) => (
            <AdminTaskCard key={t.id} task={t} onDelete={() => setConfirmDelete({ id: t.id, label: t.title })} index={i} />
          ))}
        </div>
      )}

      {creating && <CreateTaskDialog onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load(); }} />}
      {confirmDelete && (
        <ConfirmDialog
          title="Excluir tarefa?"
          message={`Tem certeza que deseja excluir "${confirmDelete.label}"? Esta ação não pode ser desfeita.`}
          confirmLabel="Excluir"
          confirmClass="bg-red-300"
          onCancel={() => setConfirmDelete(null)}
          onConfirm={onDelete}
        />
      )}
    </div>
  );
}

function AdminTaskCard({ task, onDelete, index }) {
  const pct = task.total_students > 0 ? Math.round((task.completed_count / task.total_students) * 100) : 0;
  const priority = getPriority(task.due_date, false);
  return (
    <div className="nb-card nb-card-hover p-6 nb-fade-in" style={{ animationDelay: `${index * 60}ms` }} data-testid={`admin-task-card-${task.id}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`nb-badge ${colorFor(task.subject)}`}>{task.subject}</span>
          <span className={`nb-badge ${priority.bg}`} data-testid={`task-priority-${task.id}`}>
            {priority.icon} {priority.label}
          </span>
          <span className="nb-badge bg-white" data-testid={`task-recipients-${task.id}`}>
            <Users className="w-3 h-3 inline mr-1 -mt-0.5" />
            {task.all_students ? "Todos" : `${task.total_students} aluno${task.total_students === 1 ? "" : "s"}`}
          </span>
        </div>
        <button
          onClick={onDelete}
          className="nb-btn bg-red-200 hover:bg-red-300 px-2 py-2"
          data-testid={`delete-task-${task.id}`}
          aria-label="Excluir tarefa"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      <h3 className="font-heading font-bold text-xl mb-1 leading-tight">{task.title}</h3>
      <p className="text-sm text-neutral-700 mb-4 line-clamp-3 whitespace-pre-wrap">{task.description}</p>

      <div className="flex items-center gap-2 text-sm mb-4">
        <CalendarIcon className="w-4 h-4" />
        <span className="font-medium">Entrega: {formatDateBR(task.due_date)}</span>
      </div>

      {task.attachments?.length > 0 && (
        <div className="mb-4 space-y-1.5">
          <div className="text-xs font-bold text-neutral-600 uppercase tracking-wide">Anexos</div>
          {task.attachments.map((a) => (
            <FileLink key={a.id} file={a} />
          ))}
        </div>
      )}

      <div className="border-t-2 border-dashed border-black/30 pt-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-bold">Progresso</span>
          <span className="text-sm font-bold">{task.completed_count} / {task.total_students}</span>
        </div>
        <div className="h-3 border-2 border-black rounded-full overflow-hidden bg-white mb-3">
          <div className="h-full bg-emerald-300 transition-all" style={{ width: `${pct}%` }} />
        </div>
        <div className="space-y-1 max-h-32 overflow-auto">
          {task.progress?.length === 0 && <p className="text-xs text-neutral-500">Nenhum aluno cadastrado.</p>}
          {task.progress?.map((p) => (
            <div key={p.user_id} className="flex items-center gap-2 text-xs">
              {p.completed ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" strokeWidth={3} />
              ) : (
                <Circle className="w-3.5 h-3.5 text-neutral-400" />
              )}
              <span className={p.completed ? "font-bold" : ""}>{p.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function FileLink({ file }) {
  const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : "";
  const url = `${API}/files/${file.id}/download?auth=${encodeURIComponent(token || "")}`;
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="flex items-center gap-2 nb-card bg-amber-50 hover:bg-amber-100 px-3 py-1.5 text-xs font-medium"
      data-testid={`file-link-${file.id}`}
    >
      <Paperclip className="w-3.5 h-3.5" />
      <span className="truncate">{file.original_filename}</span>
    </a>
  );
}

function CreateTaskDialog({ onClose, onCreated }) {
  const [subject, setSubject] = useState("");
  const [subjects, setSubjects] = useState([]);
  const [students, setStudents] = useState([]);
  const [assignedTo, setAssignedTo] = useState([]); // [] = all
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [files, setFiles] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get("/subjects").then(({ data }) => {
      setSubjects(data);
      if (data.length > 0) setSubject(data[0].name);
    }).catch(() => {});
    api.get("/users").then(({ data }) => setStudents(data)).catch(() => {});
  }, []);

  const handleUpload = async (e) => {
    const list = Array.from(e.target.files || []);
    if (list.length === 0) return;
    setUploading(true);
    try {
      for (const f of list) {
        const fd = new FormData();
        fd.append("file", f);
        const { data } = await api.post("/files/upload", fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        setFiles((prev) => [...prev, data]);
      }
      toast.success("Anexo enviado");
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail) || "Falha ao enviar arquivo");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/tasks", {
        subject, title, description, due_date: dueDate,
        attachments: files.map((f) => f.id),
        assigned_to: assignedTo,
      });
      toast.success("Tarefa criada!");
      onCreated();
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 nb-fade-in" data-testid="create-task-dialog">
      <div className="nb-card bg-white w-full max-w-2xl max-h-[90vh] overflow-auto p-7">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-heading font-black text-2xl">Nova tarefa</h3>
          <button onClick={onClose} className="nb-btn bg-white px-2 py-2" data-testid="close-task-dialog">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-bold mb-1.5">Matéria</label>
              {subjects.length > 0 ? (
                <select
                  required
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="nb-input cursor-pointer"
                  data-testid="task-subject-select"
                >
                  {subjects.map((s) => (
                    <option key={s.id} value={s.name}>{s.name}</option>
                  ))}
                </select>
              ) : (
                <div className="nb-card bg-amber-50 p-3 text-sm">
                  <p className="font-bold mb-1">Nenhuma matéria cadastrada</p>
                  <p className="text-xs text-neutral-700">Crie matérias na aba "Matérias" antes de criar tarefas.</p>
                </div>
              )}
            </div>
            <div>
              <label className="block text-sm font-bold mb-1.5">Data de entrega</label>
              <input type="date" required value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="nb-input" data-testid="task-due-date-input" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-bold mb-1.5">Título</label>
            <input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Lista de exercícios cap. 4" className="nb-input" data-testid="task-title-input" />
          </div>
          <div>
            <label className="block text-sm font-bold mb-1.5">Descrição</label>
            <textarea required rows={5} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Detalhes da tarefa..." className="nb-input resize-y" data-testid="task-description-input" />
          </div>
          <div>
            <label className="block text-sm font-bold mb-1.5">Anexos</label>
            <label className="block w-full border-2 border-dashed border-black rounded-xl bg-sky-50 hover:bg-sky-100 p-6 cursor-pointer transition-colors text-center" data-testid="task-file-upload-zone">
              <Upload className="w-6 h-6 mx-auto mb-1.5" />
              <span className="text-sm font-bold">{uploading ? "Enviando..." : "Clique para anexar arquivos"}</span>
              <p className="text-xs text-neutral-600">PDF, imagens, documentos</p>
              <input type="file" multiple onChange={handleUpload} className="hidden" disabled={uploading} data-testid="task-file-input" />
            </label>
            {files.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {files.map((f) => (
                  <div key={f.id} className="flex items-center justify-between nb-card bg-amber-50 px-3 py-2 text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <Paperclip className="w-4 h-4 flex-shrink-0" />
                      <span className="truncate">{f.filename}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFiles((p) => p.filter((x) => x.id !== f.id))}
                      className="text-red-700 hover:text-red-900"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="block text-sm font-bold mb-1.5">Destinatários</label>
            <RecipientSelector
              students={students}
              value={assignedTo}
              onChange={setAssignedTo}
              testIdPrefix="task-recipients"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="nb-btn bg-white px-5 py-2.5">Cancelar</button>
            <button type="submit" disabled={submitting || subjects.length === 0} className="nb-btn bg-sky-400 px-5 py-2.5" data-testid="submit-task-button">
              {submitting ? "Salvando..." : "Criar tarefa"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// --- Students panel ---
function StudentsPanel() {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [revealedIds, setRevealedIds] = useState(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/users");
      setStudents(data);
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onDelete = async () => {
    if (!confirmDelete) return;
    try {
      await api.delete(`/users/${confirmDelete.id}`);
      toast.success("Aluno removido");
      setConfirmDelete(null);
      load();
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Erro ao remover");
    }
  };

  const toggleReveal = (id) => {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div>
      <div className="flex items-end justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="font-heading font-black text-4xl sm:text-5xl tracking-tight">Alunos</h1>
          <p className="text-neutral-600 mt-1">Gerencie as contas dos seus alunos e veja as senhas.</p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="nb-btn bg-amber-300 px-5 py-3 flex items-center gap-2"
          data-testid="open-create-student-button"
        >
          <Plus className="w-4 h-4" strokeWidth={3} /> Novo aluno
        </button>
      </div>

      {loading ? (
        <p className="text-neutral-500">Carregando...</p>
      ) : students.length === 0 ? (
        <EmptyState icon={Users} title="Nenhum aluno cadastrado" subtitle="Clique em 'Novo aluno' para criar a primeira conta." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {students.map((s, i) => {
            const revealed = revealedIds.has(s.id);
            const status = s.status || "active";
            const statusOpt = STATUS_OPTS.find((o) => o.key === status) || STATUS_OPTS[0];
            const StatusIcon = statusOpt.icon;
            return (
              <div key={s.id} className="nb-card nb-card-hover p-5 nb-fade-in" style={{ animationDelay: `${i * 50}ms` }} data-testid={`student-card-${s.id}`}>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="w-12 h-12 nb-card flex items-center justify-center bg-sky-200 font-heading font-black text-lg">
                    {s.name?.[0]?.toUpperCase() || "A"}
                  </div>
                  <button
                    onClick={() => setConfirmDelete({ id: s.id, label: s.name })}
                    className="nb-btn bg-red-200 hover:bg-red-300 px-2 py-2"
                    data-testid={`delete-student-${s.id}`}
                    aria-label="Remover aluno"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <h3 className="font-heading font-bold text-lg leading-tight">{s.name}</h3>

                <div className="mt-3">
                  <label className="block text-xs font-bold uppercase tracking-wider text-neutral-600 mb-1">Status</label>
                  <select
                    value={status}
                    onChange={async (e) => {
                      const newStatus = e.target.value;
                      try {
                        await api.patch(`/users/${s.id}/status`, { status: newStatus });
                        toast.success(`Status alterado para ${STATUS_OPTS.find(o => o.key === newStatus).label}`);
                        load();
                      } catch (err) {
                        toast.error(formatApiError(err?.response?.data?.detail) || "Erro");
                      }
                    }}
                    className={`nb-input cursor-pointer text-sm py-2 ${statusOpt.bg}`}
                    data-testid={`student-status-select-${s.id}`}
                  >
                    {STATUS_OPTS.map((o) => (
                      <option key={o.key} value={o.key}>{o.label}</option>
                    ))}
                  </select>
                  <div className="flex items-center gap-1.5 mt-1.5 text-xs font-bold">
                    <StatusIcon className="w-3.5 h-3.5" strokeWidth={2.5} />
                    <span>{statusOpt.label}</span>
                  </div>
                </div>

                <div className="mt-4 nb-card bg-amber-50 p-3">
                  <div className="text-xs font-bold uppercase tracking-wider text-neutral-600 mb-1">Senha</div>
                  <div className="flex items-center justify-between gap-2">
                    <code className="text-sm font-mono font-bold truncate" data-testid={`student-password-${s.id}`}>
                      {revealed ? (s.password || "—") : "••••••••"}
                    </code>
                    <button
                      onClick={() => toggleReveal(s.id)}
                      className="nb-btn bg-white px-2 py-1 flex-shrink-0"
                      aria-label={revealed ? "Ocultar senha" : "Mostrar senha"}
                      data-testid={`toggle-password-${s.id}`}
                    >
                      {revealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {creating && <CreateStudentDialog onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load(); }} />}
      {confirmDelete && (
        <ConfirmDialog
          title="Remover aluno?"
          message={`Tem certeza que deseja remover "${confirmDelete.label}"? Todos os progressos deste aluno serão apagados.`}
          confirmLabel="Remover"
          confirmClass="bg-red-300"
          onCancel={() => setConfirmDelete(null)}
          onConfirm={onDelete}
        />
      )}
    </div>
  );
}

function CreateStudentDialog({ onClose, onCreated }) {
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/users", { name, password });
      toast.success(`Aluno ${name} criado`);
      onCreated();
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" data-testid="create-student-dialog">
      <div className="nb-card bg-white w-full max-w-md p-7">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-heading font-black text-2xl">Novo aluno</h3>
          <button onClick={onClose} className="nb-btn bg-white px-2 py-2"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-bold mb-1.5">Nome do aluno</label>
            <input required value={name} onChange={(e) => setName(e.target.value)} className="nb-input" placeholder="Ex.: Ana Beatriz" data-testid="student-name-input" />
          </div>
          <div>
            <label className="block text-sm font-bold mb-1.5">Senha</label>
            <input required type="text" minLength={4} value={password} onChange={(e) => setPassword(e.target.value)} className="nb-input" placeholder="Mínimo 4 caracteres" data-testid="student-password-input" />
            <p className="text-xs text-neutral-500 mt-1">Você poderá ver esta senha depois nesta página.</p>
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="nb-btn bg-white px-5 py-2.5">Cancelar</button>
            <button type="submit" disabled={submitting} className="nb-btn bg-amber-300 px-5 py-2.5" data-testid="submit-student-button">
              {submitting ? "Criando..." : "Criar aluno"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ConfirmDialog({ title, message, confirmLabel, confirmClass = "bg-red-300", onCancel, onConfirm }) {
  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" data-testid="confirm-dialog">
      <div className="nb-card bg-white w-full max-w-sm p-6">
        <h3 className="font-heading font-black text-xl mb-2">{title}</h3>
        <p className="text-sm text-neutral-700 mb-5">{message}</p>
        <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="nb-btn bg-white px-4 py-2" data-testid="confirm-cancel">Cancelar</button>
          <button onClick={onConfirm} className={`nb-btn ${confirmClass} px-4 py-2`} data-testid="confirm-ok">{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

// --- Subjects panel ---
function SubjectsPanel() {
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/subjects");
      setSubjects(data);
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const add = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setAdding(true);
    try {
      await api.post("/subjects", { name: newName.trim() });
      toast.success("Matéria adicionada");
      setNewName("");
      load();
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail));
    } finally {
      setAdding(false);
    }
  };

  const onDelete = async () => {
    if (!confirmDelete) return;
    try {
      await api.delete(`/subjects/${confirmDelete.id}`);
      toast.success("Matéria removida");
      setConfirmDelete(null);
      load();
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail));
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-heading font-black text-4xl sm:text-5xl tracking-tight">Matérias</h1>
        <p className="text-neutral-600 mt-1">As matérias aparecem como opções ao criar uma tarefa.</p>
      </div>

      <form onSubmit={add} className="flex gap-3 mb-8 max-w-xl" data-testid="subject-form">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Ex.: Filosofia"
          className="nb-input"
          maxLength={50}
          data-testid="subject-name-input"
        />
        <button type="submit" disabled={adding || !newName.trim()} className="nb-btn bg-red-300 px-5 py-3 flex items-center gap-2" data-testid="add-subject-button">
          <Plus className="w-4 h-4" strokeWidth={3} /> Adicionar
        </button>
      </form>

      {loading ? (
        <p className="text-neutral-500">Carregando...</p>
      ) : subjects.length === 0 ? (
        <EmptyState icon={BookMarked} title="Nenhuma matéria cadastrada" subtitle="Adicione matérias para usá-las em tarefas." />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {subjects.map((s, i) => (
            <div
              key={s.id}
              className={`nb-card p-4 flex items-center justify-between gap-2 nb-fade-in ${colorFor(s.name)}`}
              style={{ animationDelay: `${i * 40}ms` }}
              data-testid={`subject-item-${s.id}`}
            >
              <span className="font-heading font-bold truncate">{s.name}</span>
              <button
                onClick={() => setConfirmDelete({ id: s.id, label: s.name })}
                className="nb-btn bg-white px-2 py-1.5 flex-shrink-0"
                data-testid={`delete-subject-${s.id}`}
                aria-label="Remover matéria"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog
          title="Remover matéria?"
          message={`Tem certeza que deseja remover "${confirmDelete.label}"? Tarefas existentes que usam esta matéria continuam intactas.`}
          confirmLabel="Remover"
          onCancel={() => setConfirmDelete(null)}
          onConfirm={onDelete}
        />
      )}
    </div>
  );
}

function EmptyState({ icon: Icon, title, subtitle }) {
  return (
    <div className="nb-card bg-white p-12 text-center max-w-xl mx-auto">
      <div className="w-14 h-14 nb-card bg-amber-100 mx-auto mb-4 flex items-center justify-center">
        <Icon className="w-6 h-6" strokeWidth={2.2} />
      </div>
      <h3 className="font-heading font-bold text-xl mb-1">{title}</h3>
      <p className="text-neutral-600 text-sm">{subtitle}</p>
    </div>
  );
}

// --- Announcements panel ---
function AnnouncementsPanel() {
  const [items, setItems] = useState([]);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: anns }, { data: studs }] = await Promise.all([
        api.get("/announcements"),
        api.get("/users"),
      ]);
      setItems(anns);
      setStudents(studs);
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onDelete = async () => {
    if (!confirmDelete) return;
    try {
      await api.delete(`/announcements/${confirmDelete.id}`);
      toast.success("Aviso removido");
      setConfirmDelete(null);
      load();
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail));
    }
  };

  return (
    <div>
      <div className="flex items-end justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="font-heading font-black text-4xl sm:text-5xl tracking-tight">Avisos</h1>
          <p className="text-neutral-600 mt-1">Comunique-se com seus alunos. Avisos aparecem no dashboard deles.</p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="nb-btn bg-violet-300 px-5 py-3 flex items-center gap-2"
          data-testid="open-create-announcement-button"
        >
          <Plus className="w-4 h-4" strokeWidth={3} /> Novo aviso
        </button>
      </div>

      {loading ? (
        <p className="text-neutral-500">Carregando...</p>
      ) : items.length === 0 ? (
        <EmptyState icon={Megaphone} title="Nenhum aviso publicado" subtitle="Clique em 'Novo aviso' para criar." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {items.map((a, i) => (
            <div key={a.id} className="nb-card nb-card-hover p-5 nb-fade-in" style={{ animationDelay: `${i * 50}ms` }} data-testid={`announcement-card-${a.id}`}>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="w-10 h-10 nb-card flex items-center justify-center bg-violet-200 flex-shrink-0">
                  <Megaphone className="w-5 h-5" strokeWidth={2.5} />
                </div>
                <button
                  onClick={() => setConfirmDelete({ id: a.id, label: a.title })}
                  className="nb-btn bg-red-200 hover:bg-red-300 px-2 py-2"
                  data-testid={`delete-announcement-${a.id}`}
                  aria-label="Remover aviso"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <h3 className="font-heading font-bold text-lg leading-tight mb-1">{a.title}</h3>
              <p className="text-sm text-neutral-700 whitespace-pre-wrap mb-3">{a.message}</p>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="nb-badge bg-white">
                  <Users className="w-3 h-3 inline mr-1 -mt-0.5" />
                  {a.all_students
                    ? "Todos os alunos"
                    : `${(a.recipients || []).length} aluno${(a.recipients || []).length === 1 ? "" : "s"}`}
                </span>
                <span className="text-neutral-500">{formatDateBR(a.created_at)}</span>
              </div>
              {!a.all_students && (a.recipients || []).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {(a.recipients || []).slice(0, 5).map((r) => (
                    <span key={r.id} className="nb-badge bg-sky-100 text-xs">{r.name}</span>
                  ))}
                  {(a.recipients || []).length > 5 && (
                    <span className="nb-badge bg-white text-xs">+{(a.recipients || []).length - 5}</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {creating && (
        <CreateAnnouncementDialog
          students={students}
          onClose={() => setCreating(false)}
          onCreated={() => { setCreating(false); load(); }}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          title="Remover aviso?"
          message={`Tem certeza que deseja remover "${confirmDelete.label}"?`}
          confirmLabel="Remover"
          onCancel={() => setConfirmDelete(null)}
          onConfirm={onDelete}
        />
      )}
    </div>
  );
}

function CreateAnnouncementDialog({ students, onClose, onCreated }) {
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [assignedTo, setAssignedTo] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/announcements", { title, message, assigned_to: assignedTo });
      toast.success("Aviso publicado!");
      onCreated();
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" data-testid="create-announcement-dialog">
      <div className="nb-card bg-white w-full max-w-xl max-h-[90vh] overflow-auto p-7">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-heading font-black text-2xl">Novo aviso</h3>
          <button onClick={onClose} className="nb-btn bg-white px-2 py-2"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-bold mb-1.5">Título</label>
            <input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Reunião de pais" className="nb-input" data-testid="announcement-title-input" />
          </div>
          <div>
            <label className="block text-sm font-bold mb-1.5">Mensagem</label>
            <textarea required rows={4} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Detalhes do aviso..." className="nb-input resize-y" data-testid="announcement-message-input" />
          </div>
          <div>
            <label className="block text-sm font-bold mb-1.5">Destinatários</label>
            <RecipientSelector
              students={students}
              value={assignedTo}
              onChange={setAssignedTo}
              testIdPrefix="announcement-recipients"
            />
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="nb-btn bg-white px-5 py-2.5">Cancelar</button>
            <button type="submit" disabled={submitting} className="nb-btn bg-violet-300 px-5 py-2.5" data-testid="submit-announcement-button">
              {submitting ? "Publicando..." : "Publicar aviso"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
