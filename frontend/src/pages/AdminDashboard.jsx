import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Plus, BookOpen, Calendar as CalendarIcon, Trash2, Users, ListTodo, Paperclip, X, CheckCircle2, Circle, Upload } from "lucide-react";
import api, { API, formatApiError } from "@/lib/api";
import AppHeader from "@/components/AppHeader";

const subjectColors = ["bg-sky-200", "bg-amber-200", "bg-red-200", "bg-emerald-200", "bg-violet-200", "bg-rose-200"];
const colorFor = (s) => subjectColors[(s || "").length % subjectColors.length];

function formatDate(iso) {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
  } catch {
    return iso;
  }
}

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
            onClick={() => setTab("students")}
            className={`nb-btn px-5 py-2.5 ${tab === "students" ? "bg-amber-300" : "bg-white"}`}
            data-testid="tab-students"
          >
            <Users className="w-4 h-4 inline mr-2" /> Alunos
          </button>
        </div>
        {tab === "tasks" ? <TasksPanel /> : <StudentsPanel />}
      </div>
    </div>
  );
}

// --- Tasks panel ---
function TasksPanel() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

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

  const onDelete = async (id) => {
    if (!window.confirm("Excluir esta tarefa?")) return;
    try {
      await api.delete(`/tasks/${id}`);
      toast.success("Tarefa excluída");
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
            <AdminTaskCard key={t.id} task={t} onDelete={onDelete} index={i} />
          ))}
        </div>
      )}

      {creating && <CreateTaskDialog onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load(); }} />}
    </div>
  );
}

function AdminTaskCard({ task, onDelete, index }) {
  const pct = task.total_students > 0 ? Math.round((task.completed_count / task.total_students) * 100) : 0;
  return (
    <div className="nb-card nb-card-hover p-6 nb-fade-in" style={{ animationDelay: `${index * 60}ms` }} data-testid={`admin-task-card-${task.id}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <span className={`nb-badge ${colorFor(task.subject)}`}>{task.subject}</span>
        <button
          onClick={() => onDelete(task.id)}
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
        <span className="font-medium">Entrega: {formatDate(task.due_date)}</span>
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
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [files, setFiles] = useState([]); // { id, filename }
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

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
              <input required value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Matemática" className="nb-input" data-testid="task-subject-input" />
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
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="nb-btn bg-white px-5 py-2.5">Cancelar</button>
            <button type="submit" disabled={submitting} className="nb-btn bg-sky-400 px-5 py-2.5" data-testid="submit-task-button">
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

  const onDelete = async (id) => {
    if (!window.confirm("Remover este aluno?")) return;
    try {
      await api.delete(`/users/${id}`);
      toast.success("Aluno removido");
      load();
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail));
    }
  };

  return (
    <div>
      <div className="flex items-end justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="font-heading font-black text-4xl sm:text-5xl tracking-tight">Alunos</h1>
          <p className="text-neutral-600 mt-1">Gerencie as contas dos seus alunos.</p>
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
          {students.map((s, i) => (
            <div key={s.id} className="nb-card nb-card-hover p-5 nb-fade-in" style={{ animationDelay: `${i * 50}ms` }} data-testid={`student-card-${s.id}`}>
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="w-12 h-12 nb-card flex items-center justify-center bg-sky-200 font-heading font-black text-lg">
                  {s.name?.[0]?.toUpperCase() || "A"}
                </div>
                <button onClick={() => onDelete(s.id)} className="nb-btn bg-red-200 hover:bg-red-300 px-2 py-2" data-testid={`delete-student-${s.id}`} aria-label="Remover aluno">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <h3 className="font-heading font-bold text-lg leading-tight">{s.name}</h3>
              <p className="text-sm text-neutral-600 truncate">{s.email}</p>
              <span className="nb-badge bg-sky-200 mt-3 inline-block">Aluno</span>
            </div>
          ))}
        </div>
      )}

      {creating && <CreateStudentDialog onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load(); }} />}
    </div>
  );
}

function CreateStudentDialog({ onClose, onCreated }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/users", { name, email, password });
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
            <label className="block text-sm font-bold mb-1.5">Nome completo</label>
            <input required value={name} onChange={(e) => setName(e.target.value)} className="nb-input" data-testid="student-name-input" />
          </div>
          <div>
            <label className="block text-sm font-bold mb-1.5">Email</label>
            <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="nb-input" data-testid="student-email-input" />
          </div>
          <div>
            <label className="block text-sm font-bold mb-1.5">Senha provisória</label>
            <input required type="text" minLength={4} value={password} onChange={(e) => setPassword(e.target.value)} className="nb-input" data-testid="student-password-input" />
            <p className="text-xs text-neutral-500 mt-1">Compartilhe esta senha com o aluno.</p>
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
