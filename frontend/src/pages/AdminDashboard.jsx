import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Plus, Calendar as CalendarIcon, Trash2, Users, ListTodo, Paperclip, X, CheckCircle2, Circle, Upload, Eye, EyeOff, BookMarked, Wrench, Lock, CheckCircle, Megaphone, Pencil, Copy, History, BarChart3, Trophy, Minus, Cpu, Sparkles, Coins, ShoppingBag } from "lucide-react";
import api, { API, formatApiError } from "@/lib/api";
import AppHeader from "@/components/AppHeader";
import RecipientSelector from "@/components/RecipientSelector";
import MyProfileBanner from "@/components/MyProfileBanner";
import AvatarUploader from "@/components/AvatarUploader";
import EditProfileDialog from "@/components/EditProfileDialog";
import AnnouncementComments from "@/components/AnnouncementComments";
import Avatar from "@/components/Avatar";
import FirmwarePanel from "@/components/FirmwarePanel";
import AIEnhanceButton from "@/components/AIEnhanceButton";
import AIAdminPanel from "@/components/AIAdminPanel";
import StoreEffects from "@/components/StoreEffects";
import { getTier } from "@/lib/tiers";
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-5 sm:py-8 pb-24 sm:pb-8">
        <MyProfileBanner />
        <div className="flex flex-wrap gap-2 sm:gap-3 mb-6 sm:mb-8">
          <button
            onClick={() => setTab("tasks")}
            className={`nb-btn px-3 sm:px-5 py-2 sm:py-2.5 text-sm ${tab === "tasks" ? "bg-sky-400" : "bg-white"}`}
            data-testid="tab-tasks"
          >
            <ListTodo className="w-4 h-4 inline mr-1.5 sm:mr-2" /> Tarefas
          </button>
          <button
            onClick={() => setTab("announcements")}
            className={`nb-btn px-3 sm:px-5 py-2 sm:py-2.5 text-sm ${tab === "announcements" ? "bg-violet-300" : "bg-white"}`}
            data-testid="tab-announcements"
          >
            <Megaphone className="w-4 h-4 inline mr-1.5 sm:mr-2" /> Avisos
          </button>
          <button
            onClick={() => setTab("students")}
            className={`nb-btn px-3 sm:px-5 py-2 sm:py-2.5 text-sm ${tab === "students" ? "bg-amber-300" : "bg-white"}`}
            data-testid="tab-students"
          >
            <Users className="w-4 h-4 inline mr-1.5 sm:mr-2" /> Alunos
          </button>
          <button
            onClick={() => setTab("subjects")}
            className={`nb-btn px-3 sm:px-5 py-2 sm:py-2.5 text-sm ${tab === "subjects" ? "bg-red-300" : "bg-white"}`}
            data-testid="tab-subjects"
          >
            <BookMarked className="w-4 h-4 inline mr-1.5 sm:mr-2" /> Matérias
          </button>
          <button
            onClick={() => setTab("logs")}
            className={`nb-btn px-3 sm:px-5 py-2 sm:py-2.5 text-sm ${tab === "logs" ? "bg-emerald-300" : "bg-white"}`}
            data-testid="tab-logs"
          >
            <History className="w-4 h-4 inline mr-1.5 sm:mr-2" /> Acessos
          </button>
          <button
            onClick={() => setTab("stats")}
            className={`nb-btn px-3 sm:px-5 py-2 sm:py-2.5 text-sm ${tab === "stats" ? "bg-violet-400" : "bg-white"}`}
            data-testid="tab-stats"
          >
            <BarChart3 className="w-4 h-4 inline mr-1.5 sm:mr-2" /> Estatísticas
          </button>
          <button
            onClick={() => setTab("firmware")}
            className={`nb-btn px-3 sm:px-5 py-2 sm:py-2.5 text-sm ${tab === "firmware" ? "bg-sky-300" : "bg-white"}`}
            data-testid="tab-firmware"
          >
            <Cpu className="w-4 h-4 inline mr-1.5 sm:mr-2" /> Firmware
          </button>
          <button
            onClick={() => setTab("ai")}
            className={`nb-btn px-3 sm:px-5 py-2 sm:py-2.5 text-sm ${tab === "ai" ? "bg-gradient-to-r from-violet-300 to-pink-300" : "bg-white"}`}
            data-testid="tab-ai"
          >
            <Sparkles className="w-4 h-4 inline mr-1.5 sm:mr-2" /> IA
          </button>
          <button
            onClick={() => setTab("store")}
            className={`nb-btn px-3 sm:px-5 py-2 sm:py-2.5 text-sm ${tab === "store" ? "bg-amber-300" : "bg-white"}`}
            data-testid="tab-store"
          >
            <ShoppingBag className="w-4 h-4 inline mr-1.5 sm:mr-2" /> Loja
          </button>
        </div>
        {tab === "tasks" && <TasksPanel />}
        {tab === "announcements" && <AnnouncementsPanel />}
        {tab === "students" && <StudentsPanel />}
        {tab === "subjects" && <SubjectsPanel />}
        {tab === "logs" && <LoginLogsPanel />}
        {tab === "stats" && <StatsPanel />}
        {tab === "firmware" && <FirmwarePanel />}
        {tab === "ai" && <AIAdminPanel />}
        {tab === "store" && <StoreEffects />}
      </div>
    </div>
  );
}

// --- Tasks panel ---
function TasksPanel() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
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

  const copyTaskInfo = async (task) => {
    const recipients = task.all_students
      ? "Todos os alunos"
      : (task.progress || []).map((p) => p.name).join(", ") || "—";
    const attachments = (task.attachments || []).map((a) => a.original_filename).join(", ") || "—";
    const text = [
      `📚 ${task.subject} — ${task.title}`,
      `📅 Entrega: ${formatDateBR(task.due_date)}`,
      `👥 Destinatários: ${recipients}`,
      `📎 Anexos: ${attachments}`,
      "",
      task.description,
    ].join("\n");
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      toast.success("Informações copiadas!");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  return (
    <div>
      <div className="flex items-end justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="font-heading font-black text-3xl sm:text-5xl tracking-tight">Tarefas</h1>
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
            <AdminTaskCard
              key={t.id}
              task={t}
              onDelete={() => setConfirmDelete({ id: t.id, label: t.title })}
              onEdit={() => setEditing(t)}
              onCopy={() => copyTaskInfo(t)}
              index={i}
            />
          ))}
        </div>
      )}

      {creating && <TaskDialog onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />}
      {editing && <TaskDialog task={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
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

function AdminTaskCard({ task, onDelete, onEdit, onCopy, index }) {
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
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={onCopy}
            className="nb-btn bg-white hover:bg-sky-100 px-2 py-2"
            data-testid={`copy-task-${task.id}`}
            aria-label="Copiar informações"
            title="Copiar informações"
          >
            <Copy className="w-4 h-4" />
          </button>
          <button
            onClick={onEdit}
            className="nb-btn bg-amber-200 hover:bg-amber-300 px-2 py-2"
            data-testid={`edit-task-${task.id}`}
            aria-label="Editar tarefa"
            title="Editar"
          >
            <Pencil className="w-4 h-4" />
          </button>
          <button
            onClick={onDelete}
            className="nb-btn bg-red-200 hover:bg-red-300 px-2 py-2"
            data-testid={`delete-task-${task.id}`}
            aria-label="Excluir tarefa"
            title="Excluir"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
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

function TaskDialog({ task, onClose, onSaved }) {
  const [currentTask, setCurrentTask] = useState(task);
  const isEdit = Boolean(currentTask);
  const [subject, setSubject] = useState(currentTask?.subject || "");
  const [subjects, setSubjects] = useState([]);
  const [students, setStudents] = useState([]);
  const [assignedTo, setAssignedTo] = useState(currentTask?.assigned_to || []);
  const [title, setTitle] = useState(currentTask?.title || "");
  const [description, setDescription] = useState(currentTask?.description || "");
  const [dueDate, setDueDate] = useState(currentTask?.due_date || "");
  const [files, setFiles] = useState(
    (currentTask?.attachments || []).map((a) => ({ id: a.id, filename: a.original_filename }))
  );
  const [adminPhotos, setAdminPhotos] = useState(
    (currentTask?.admin_photos || []).map((a) => ({ id: a.id, filename: a.original_filename }))
  );
  const [answer, setAnswer] = useState(currentTask?.answer || "");
  const [points, setPoints] = useState(currentTask?.points ?? 10);
  const [uploading, setUploading] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [generatingAnswer, setGeneratingAnswer] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get("/subjects").then(({ data }) => {
      setSubjects(data);
      if (!isEdit && data.length > 0 && !subject) setSubject(data[0].name);
    }).catch(() => {});
    api.get("/users").then(({ data }) => setStudents(data)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const handlePhotoUpload = async (e) => {
    const list = Array.from(e.target.files || []);
    if (list.length === 0) return;
    setUploadingPhotos(true);
    try {
      for (const f of list) {
        if (!f.type.startsWith("image/")) {
          toast.error(`${f.name} não é imagem`);
          continue;
        }
        const fd = new FormData();
        fd.append("file", f);
        const { data } = await api.post("/files/upload", fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        setAdminPhotos((prev) => [...prev, data]);
      }
      toast.success("Foto adicionada");
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail) || "Falha ao enviar foto");
    } finally {
      setUploadingPhotos(false);
      e.target.value = "";
    }
  };

  const generateAnswer = async () => {
    // Save task first if new (need task_id for the AI endpoint)
    setGeneratingAnswer(true);
    try {
      let currentTaskId = currentTask?.id;
      if (!currentTaskId) {
        // Save-and-reload as draft
        const { data } = await api.post("/tasks", {
          subject, title, description, due_date: dueDate,
          attachments: files.map((f) => f.id),
          admin_photos: adminPhotos.map((f) => f.id),
          answer,
          points: Math.max(0, parseInt(points, 10) || 0),
          assigned_to: assignedTo,
        });
        currentTaskId = data.id;
        setCurrentTask({ ...data });
        toast.info("Rascunho salvo — gerando resposta...");
      } else {
        // Persist current photo list first
        await api.put(`/tasks/${currentTaskId}`, {
          admin_photos: adminPhotos.map((f) => f.id),
        });
      }
      const { data: gen } = await api.post("/ai/generate-task-answer", {
        task_id: currentTaskId,
      });
      setAnswer(gen.answer || "");
      toast.success(`Resposta gerada a partir de ${gen.photos_used} foto(s)! ✨`);
      // Dialog stays open so admin can review and click "Salvar alterações"
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail) || "Falha ao gerar resposta");
    } finally {
      setGeneratingAnswer(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        subject, title, description, due_date: dueDate,
        attachments: files.map((f) => f.id),
        admin_photos: adminPhotos.map((f) => f.id),
        answer,
        points: Math.max(0, parseInt(points, 10) || 0),
        assigned_to: assignedTo,
      };
      if (currentTask?.id) {
        await api.put(`/tasks/${currentTask.id}`, payload);
        toast.success("Tarefa atualizada!");
      } else {
        await api.post("/tasks", payload);
        toast.success("Tarefa criada!");
      }
      onSaved();
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3 sm:p-4 nb-fade-in" data-testid="task-dialog">
      <div className="nb-card bg-white w-full max-w-2xl max-h-[92vh] overflow-auto p-5 sm:p-7">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-heading font-black text-xl sm:text-2xl">{isEdit ? "Editar tarefa" : "Nova tarefa"}</h3>
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
            <label className="block text-sm font-bold mb-1.5 flex items-center gap-1.5">
              <Coins className="w-3.5 h-3.5" /> Pontos ao concluir
            </label>
            <input
              type="number"
              min="0"
              max="500"
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              className="nb-input"
              data-testid="task-points-input"
              placeholder="10"
            />
            <p className="text-[10px] text-neutral-500 mt-1">
              Aluno ganha <b>{parseInt(points,10)||10}</b> pts no prazo, <b>{Math.max(1, Math.floor((parseInt(points, 10) || 10) * 0.3))}</b> pts atrasado.
            </p>
          </div>
          <div>
            <label className="block text-sm font-bold mb-1.5">Título</label>
            <input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Lista de exercícios cap. 4" className="nb-input" data-testid="task-title-input" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5 gap-2 flex-wrap">
              <label className="block text-sm font-bold">Descrição</label>
              <AIEnhanceButton
                endpoint="/ai/improve-task"
                payload={{ title, subject, hint: description }}
                disabled={!title.trim()}
                label="Escrever com IA"
                testId="ai-improve-task-button"
                onResult={(data) => {
                  const parts = [data.description];
                  if (data.objectives?.length) parts.push("\n\n🎯 Objetivos:\n" + data.objectives.map((o) => `• ${o}`).join("\n"));
                  if (data.tips?.length) parts.push("\n\n💡 Dicas:\n" + data.tips.map((t) => `• ${t}`).join("\n"));
                  setDescription(parts.join(""));
                }}
              />
            </div>
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

          {/* Admin-only photos + AI answer generation */}
          <div className="nb-card p-4 bg-gradient-to-br from-violet-50 to-pink-50">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-4 h-4 text-violet-600" strokeWidth={2.5} />
              <h4 className="font-heading font-bold text-sm">Fotos da tarefa (só admin) + resposta com IA</h4>
            </div>
            <p className="text-xs text-neutral-600 mb-3">
              Envie fotos do enunciado. A IA analisa as imagens e gera o gabarito. Alunos NÃO veem as fotos — só a resposta final.
            </p>
            <label className="block w-full border-2 border-dashed border-black rounded-xl bg-white hover:bg-violet-100 p-4 cursor-pointer text-center" data-testid="task-photo-upload-zone">
              <Upload className="w-5 h-5 mx-auto mb-1" />
              <span className="text-sm font-bold">{uploadingPhotos ? "Enviando..." : "Adicionar fotos da tarefa"}</span>
              <p className="text-[10px] text-neutral-600">JPG / PNG</p>
              <input type="file" multiple accept="image/*" onChange={handlePhotoUpload} className="hidden" disabled={uploadingPhotos} data-testid="task-photo-input" />
            </label>
            {adminPhotos.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {adminPhotos.map((f) => (
                  <div key={f.id} className="flex items-center justify-between nb-card bg-white px-3 py-1.5 text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <Paperclip className="w-3.5 h-3.5 flex-shrink-0" />
                      <span className="truncate text-xs">{f.filename}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAdminPhotos((p) => p.filter((x) => x.id !== f.id))}
                      className="text-red-700 hover:text-red-900"
                      data-testid={`remove-photo-${f.id}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={generateAnswer}
              disabled={generatingAnswer || adminPhotos.length === 0 || !title.trim()}
              className="nb-btn w-full mt-3 px-4 py-2.5 bg-gradient-to-r from-violet-300 to-pink-300 hover:from-violet-400 hover:to-pink-400 flex items-center justify-center gap-2 text-sm disabled:opacity-50"
              data-testid="generate-answer-button"
            >
              <Sparkles className={`w-4 h-4 ${generatingAnswer ? "animate-spin" : ""}`} strokeWidth={2.5} />
              {generatingAnswer ? "Analisando fotos..." : "Gerar resposta com IA"}
            </button>
            <div className="mt-3">
              <label className="block text-xs font-bold mb-1.5">Resposta / Gabarito (visível aos alunos)</label>
              <textarea
                rows={6}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Preencha manualmente ou clique em 'Gerar resposta com IA'"
                className="nb-input resize-y bg-white"
                data-testid="task-answer-input"
              />
              {answer && (
                <p className="text-[10px] text-emerald-700 mt-1 font-bold">
                  ✓ Alunos verão essa resposta ao clicar em "Ver resposta"
                </p>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="nb-btn bg-white px-5 py-2.5">Cancelar</button>
            <button type="submit" disabled={submitting || subjects.length === 0} className="nb-btn bg-sky-400 px-5 py-2.5" data-testid="submit-task-button">
              {submitting ? "Salvando..." : isEdit ? "Salvar alterações" : "Criar tarefa"}
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
  const [editing, setEditing] = useState(null);
  const [adjustPoints, setAdjustPoints] = useState(null);
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
          <h1 className="font-heading font-black text-3xl sm:text-5xl tracking-tight">Alunos</h1>
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
                  <AvatarUploader
                    userId={s.id}
                    name={s.name}
                    hasAvatar={s.has_avatar}
                    onChanged={() => load()}
                    path={`/users/${s.id}/avatar`}
                    size={56}
                    bg="bg-sky-200"
                  />
                  <div className="flex flex-col gap-1.5">
                    <button
                      onClick={() => setEditing(s)}
                      className="nb-btn bg-amber-200 hover:bg-amber-300 px-2 py-2"
                      data-testid={`edit-student-${s.id}`}
                      aria-label="Editar perfil"
                      title="Editar nome / senha"
                    >
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setConfirmDelete({ id: s.id, label: s.name })}
                      className="nb-btn bg-red-200 hover:bg-red-300 px-2 py-2"
                      data-testid={`delete-student-${s.id}`}
                      aria-label="Remover aluno"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <h3 className="font-heading font-bold text-lg leading-tight">{s.name}</h3>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="nb-badge bg-amber-200 inline-flex items-center gap-1" data-testid={`student-points-${s.id}`}>
                    <Trophy className="w-3 h-3" /> {s.points || 0} pts
                  </span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setAdjustPoints({ student: s, sign: 1 })}
                      className="nb-btn bg-emerald-200 hover:bg-emerald-300 px-1.5 py-1 text-xs"
                      data-testid={`add-points-${s.id}`}
                      title="Adicionar pontos"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => setAdjustPoints({ student: s, sign: -1 })}
                      className="nb-btn bg-red-200 hover:bg-red-300 px-1.5 py-1 text-xs"
                      data-testid={`remove-points-${s.id}`}
                      title="Tirar pontos"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                  </div>
                </div>

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
      {editing && (
        <EditProfileDialog
          initialName={editing.name}
          path={`/users/${editing.id}`}
          label={`aluno: ${editing.name}`}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
      {adjustPoints && (
        <AdjustPointsDialog
          student={adjustPoints.student}
          sign={adjustPoints.sign}
          onClose={() => setAdjustPoints(null)}
          onSaved={() => { setAdjustPoints(null); load(); }}
        />
      )}
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
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3 sm:p-4" data-testid="create-student-dialog">
      <div className="nb-card bg-white w-full max-w-md p-5 sm:p-7">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-heading font-black text-xl sm:text-2xl">Novo aluno</h3>
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
        <h1 className="font-heading font-black text-3xl sm:text-5xl tracking-tight">Matérias</h1>
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
  const [editing, setEditing] = useState(null);
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

  const copyAnnouncement = async (a) => {
    const recipients = a.all_students
      ? "Todos os alunos"
      : (a.recipients || []).map((r) => r.name).join(", ") || "—";
    const text = [
      `📣 ${a.title}`,
      `👥 Destinatários: ${recipients}`,
      `📅 ${formatDateBR(a.created_at)}`,
      "",
      a.message,
    ].join("\n");
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      toast.success("Aviso copiado!");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  return (
    <div>
      <div className="flex items-end justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="font-heading font-black text-3xl sm:text-5xl tracking-tight">Avisos</h1>
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
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => copyAnnouncement(a)}
                    className="nb-btn bg-white hover:bg-sky-100 px-2 py-2"
                    data-testid={`copy-announcement-${a.id}`}
                    aria-label="Copiar aviso"
                    title="Copiar"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setEditing(a)}
                    className="nb-btn bg-amber-200 hover:bg-amber-300 px-2 py-2"
                    data-testid={`edit-announcement-${a.id}`}
                    aria-label="Editar aviso"
                    title="Editar"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setConfirmDelete({ id: a.id, label: a.title })}
                    className="nb-btn bg-red-200 hover:bg-red-300 px-2 py-2"
                    data-testid={`delete-announcement-${a.id}`}
                    aria-label="Remover aviso"
                    title="Excluir"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
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
              <AnnouncementComments announcementId={a.id} />
            </div>
          ))}
        </div>
      )}

      {creating && (
        <AnnouncementDialog
          students={students}
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); load(); }}
        />
      )}
      {editing && (
        <AnnouncementDialog
          announcement={editing}
          students={students}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
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

function AnnouncementDialog({ announcement, students, onClose, onSaved }) {
  const isEdit = Boolean(announcement);
  const [title, setTitle] = useState(announcement?.title || "");
  const [message, setMessage] = useState(announcement?.message || "");
  const [assignedTo, setAssignedTo] = useState(announcement?.assigned_to || []);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = { title, message, assigned_to: assignedTo };
      if (isEdit) {
        await api.put(`/announcements/${announcement.id}`, payload);
        toast.success("Aviso atualizado!");
      } else {
        await api.post("/announcements", payload);
        toast.success("Aviso publicado!");
      }
      onSaved();
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3 sm:p-4" data-testid="announcement-dialog">
      <div className="nb-card bg-white w-full max-w-xl max-h-[92vh] overflow-auto p-5 sm:p-7">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-heading font-black text-xl sm:text-2xl">{isEdit ? "Editar aviso" : "Novo aviso"}</h3>
          <button onClick={onClose} className="nb-btn bg-white px-2 py-2"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-bold mb-1.5">Título</label>
            <input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Reunião de pais" className="nb-input" data-testid="announcement-title-input" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5 gap-2 flex-wrap">
              <label className="block text-sm font-bold">Mensagem</label>
              <AIEnhanceButton
                endpoint="/ai/generate-announcement"
                payload={{ prompt: title || message }}
                disabled={!title.trim() && !message.trim()}
                label="Escrever com IA"
                testId="ai-generate-announcement-button"
                onResult={(data) => {
                  if (data.title && !title) setTitle(data.title);
                  setMessage(data.message);
                }}
              />
            </div>
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
              {submitting ? "Salvando..." : isEdit ? "Salvar alterações" : "Publicar aviso"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// --- Login logs panel ---
function LoginLogsPanel() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmClear, setConfirmClear] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/login-logs");
      setLogs(data);
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const clearAll = async () => {
    try {
      const { data } = await api.delete("/login-logs");
      toast.success(`${data.deleted} registro${data.deleted === 1 ? "" : "s"} apagado${data.deleted === 1 ? "" : "s"}`);
      setConfirmClear(false);
      load();
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail));
    }
  };

  const removeOne = async (id) => {
    try {
      await api.delete(`/login-logs/${id}`);
      toast.success("Registro removido");
      load();
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail));
    }
  };

  const formatDateTimeBR = (iso) => {
    try {
      return new Date(iso).toLocaleString("pt-BR", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
      });
    } catch { return iso; }
  };

  return (
    <div>
      <div className="flex items-end justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="font-heading font-black text-3xl sm:text-5xl tracking-tight">Acessos</h1>
          <p className="text-neutral-600 mt-1">Histórico de logins dos alunos. Apagado automaticamente após 7 dias.</p>
        </div>
        {logs.length > 0 && (
          <button
            onClick={() => setConfirmClear(true)}
            className="nb-btn bg-red-300 hover:bg-red-400 px-5 py-3 flex items-center gap-2"
            data-testid="clear-logs-button"
          >
            <Trash2 className="w-4 h-4" /> Limpar tudo
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-neutral-500">Carregando...</p>
      ) : logs.length === 0 ? (
        <EmptyState icon={History} title="Nenhum acesso registrado" subtitle="Quando os alunos fizerem login, aparecerá aqui." />
      ) : (
        <div className="nb-card bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[360px]" data-testid="logs-table">
            <thead className="bg-emerald-100 border-b-2 border-black">
              <tr>
                <th className="text-left p-3 text-sm font-heading font-bold">Aluno</th>
                <th className="text-left p-3 text-sm font-heading font-bold">Data e horário</th>
                <th className="text-right p-3 text-sm font-heading font-bold w-20"></th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l, i) => (
                <tr key={l.id} className={`${i % 2 === 0 ? "bg-white" : "bg-neutral-50"} border-b border-neutral-200`} data-testid={`log-${l.id}`}>
                  <td className="p-3 font-medium">{l.user_name}</td>
                  <td className="p-3 font-mono text-sm">{formatDateTimeBR(l.created_at)}</td>
                  <td className="p-3 text-right">
                    <button
                      onClick={() => removeOne(l.id)}
                      className="nb-btn bg-red-200 hover:bg-red-300 px-2 py-1.5"
                      data-testid={`delete-log-${l.id}`}
                      aria-label="Remover registro"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
        </div>
      )}

      {confirmClear && (
        <ConfirmDialog
          title="Limpar todos os registros?"
          message={`Isso apagará ${logs.length} registro${logs.length === 1 ? "" : "s"} de acesso. Esta ação não pode ser desfeita.`}
          confirmLabel="Limpar tudo"
          onCancel={() => setConfirmClear(false)}
          onConfirm={clearAll}
        />
      )}
    </div>
  );
}


// --- Stats panel (admin) ---
function StatsPanel() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/admin/stats")
      .then(({ data }) => setStats(data))
      .catch((e) => toast.error(formatApiError(e?.response?.data?.detail)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-neutral-500">Carregando...</p>;
  if (!stats) return null;

  const maxDayCount = Math.max(1, ...stats.completions_per_day.map((d) => d.count));
  const maxSubjCount = Math.max(1, ...(stats.top_subjects || []).map((s) => s.count));

  return (
    <div className="space-y-8">
      <div className="mb-2">
        <h1 className="font-heading font-black text-3xl sm:text-5xl tracking-tight">Estatísticas</h1>
        <p className="text-neutral-600 mt-1">Visão geral do engajamento da turma.</p>
      </div>

      <PrizeEditor />

      {/* Total cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatTile label="Tarefas" value={stats.totals.tasks} bg="bg-sky-200" />
        <StatTile label="Conclusões" value={stats.totals.completions} bg="bg-emerald-200" />
        <StatTile label="Avisos" value={stats.totals.announcements} bg="bg-violet-200" />
        <StatTile label="Alunos" value={stats.totals.students} bg="bg-amber-200" />
      </div>

      {/* Top alunos */}
      <div>
        <h2 className="font-heading font-bold text-2xl mb-3">Top alunos</h2>
        {(stats.top_students || []).length === 0 ? (
          <p className="text-neutral-600 text-sm">Nenhum aluno cadastrado.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {stats.top_students.map((s, i) => {
              const tier = getTier(s.points);
              return (
                <div key={s.id} className="nb-card p-4 bg-white flex items-center gap-3" data-testid={`top-student-${s.id}`}>
                  <div className={`font-heading font-black text-2xl w-8 text-center ${i === 0 ? "text-amber-500" : i === 1 ? "text-gray-400" : i === 2 ? "text-orange-700" : "text-neutral-500"}`}>
                    #{i + 1}
                  </div>
                  <Avatar userId={s.id} name={s.name} size={48} hasAvatar={s.has_avatar} bg="bg-sky-200" />
                  <div className="flex-1 min-w-0">
                    <div className="font-heading font-bold truncate">{s.name}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`nb-badge ${tier.bg} ${tier.text} text-[10px]`}>{tier.emoji} {tier.name}</span>
                      <span className="text-xs font-bold">{s.points} pts</span>
                    </div>
                  </div>
                  {s.streak_count > 0 && (
                    <div className="text-sm font-bold flex items-center gap-1">
                      🔥 {s.streak_count}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Conclusões últimos 7 dias */}
      <div>
        <h2 className="font-heading font-bold text-2xl mb-3">Conclusões nos últimos 7 dias</h2>
        <div className="nb-card bg-white p-5">
          <div className="flex items-end gap-2 h-40" data-testid="completions-chart">
            {stats.completions_per_day.map((d) => {
              const h = (d.count / maxDayCount) * 100;
              const day = new Date(d.date + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit" });
              return (
                <div key={d.date} className="flex-1 flex flex-col items-center justify-end gap-1.5">
                  <div className="text-xs font-bold">{d.count}</div>
                  <div
                    className="w-full nb-card bg-emerald-300"
                    style={{ height: `${Math.max(h, 4)}%`, minHeight: 4 }}
                  />
                  <div className="text-[10px] text-neutral-600 text-center">{day}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Top matérias */}
      {stats.top_subjects && stats.top_subjects.length > 0 && (
        <div>
          <h2 className="font-heading font-bold text-2xl mb-3">Matérias com mais tarefas</h2>
          <div className="nb-card bg-white p-5 space-y-3">
            {stats.top_subjects.map((s) => {
              const w = (s.count / maxSubjCount) * 100;
              return (
                <div key={s.subject} className="flex items-center gap-3">
                  <div className="w-32 font-bold text-sm truncate">{s.subject}</div>
                  <div className="flex-1 h-7 border-2 border-black rounded-lg overflow-hidden bg-neutral-50">
                    <div className="h-full bg-amber-300" style={{ width: `${w}%` }} />
                  </div>
                  <div className="w-10 text-right text-sm font-bold">{s.count}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function StatTile({ label, value, bg }) {
  return (
    <div className={`nb-card p-4 ${bg}`}>
      <div className="text-xs font-bold uppercase tracking-wider opacity-70">{label}</div>
      <div className="font-heading font-black text-3xl sm:text-4xl mt-1">{value}</div>
    </div>
  );
}


function AdjustPointsDialog({ student, sign, onClose, onSaved }) {
  const [amount, setAmount] = useState(5);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const isAdd = sign > 0;

  const submit = async (e) => {
    e.preventDefault();
    if (amount <= 0) return;
    setSubmitting(true);
    try {
      const { data } = await api.post(`/users/${student.id}/points`, {
        delta: isAdd ? amount : -amount,
        reason: reason.trim(),
      });
      toast.success(`${isAdd ? "+" : "-"}${amount} pts → ${data.total_points} pts totais`);
      onSaved();
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-3 sm:p-4" data-testid="adjust-points-dialog">
      <div className="nb-card bg-white w-full max-w-md p-5 sm:p-7">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-heading font-black text-xl sm:text-2xl">
            {isAdd ? "Adicionar pontos" : "Tirar pontos"}
          </h3>
          <button onClick={onClose} className="nb-btn bg-white px-2 py-2"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-sm text-neutral-600 mb-4">Aluno: <span className="font-bold">{student.name}</span> ({student.points || 0} pts atualmente)</p>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-bold mb-1.5">Quantidade</label>
            <input
              type="number"
              required
              min="1"
              max="1000"
              value={amount}
              onChange={(e) => setAmount(Math.max(1, parseInt(e.target.value, 10) || 0))}
              className="nb-input"
              data-testid="adjust-amount-input"
            />
          </div>
          <div>
            <label className="block text-sm font-bold mb-1.5">Motivo (opcional)</label>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={isAdd ? "Ex.: ajudou os colegas" : "Ex.: comportamento inadequado"}
              maxLength={200}
              className="nb-input"
              data-testid="adjust-reason-input"
            />
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="nb-btn bg-white px-5 py-2.5">Cancelar</button>
            <button
              type="submit"
              disabled={submitting}
              className={`nb-btn px-5 py-2.5 ${isAdd ? "bg-emerald-300" : "bg-red-300"}`}
              data-testid="submit-adjust-points"
            >
              {submitting ? "..." : isAdd ? `+${amount} pts` : `-${amount} pts`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// --- Prize editor (inside StatsPanel) ---
function PrizeEditor() {
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [emoji, setEmoji] = useState("🏆");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/monthly-prize");
      setData(data);
      if (data.prize) {
        setTitle(data.prize.title);
        setDescription(data.prize.description || "");
        setEmoji(data.prize.emoji || "🏆");
      }
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail));
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.put("/monthly-prize", { title, description, emoji });
      toast.success("Prêmio salvo!");
      setEditing(false);
      load();
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail));
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async () => {
    if (!window.confirm("Remover o prêmio do mês?")) return;
    try {
      await api.delete("/monthly-prize");
      toast.success("Prêmio removido");
      setTitle(""); setDescription(""); setEmoji("🏆");
      load();
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail));
    }
  };

  if (!data) return null;

  return (
    <div data-testid="prize-editor">
      <h2 className="font-heading font-bold text-2xl mb-3 flex items-center gap-2">
        <Trophy className="w-6 h-6" /> Prêmio do mês
      </h2>
      <div className="nb-card bg-amber-100 p-5">
        {!editing && data.prize ? (
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 nb-card flex items-center justify-center bg-amber-300 text-2xl">{data.prize.emoji}</div>
              <div className="flex-1 min-w-0">
                <h3 className="font-heading font-black text-xl">{data.prize.title}</h3>
                {data.prize.description && <p className="text-sm text-neutral-700 mt-1">{data.prize.description}</p>}
                <p className="text-xs text-neutral-600 mt-2">
                  Restam {data.days_remaining} dia{data.days_remaining === 1 ? "" : "s"}
                  {data.leader && (
                    <span> • Liderando: <span className="font-bold">{data.leader.name}</span> ({data.leader.points} pts)</span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setEditing(true)} className="nb-btn bg-white px-3 py-1.5 text-sm flex items-center gap-1.5" data-testid="edit-prize-button">
                <Pencil className="w-3.5 h-3.5" /> Editar
              </button>
              <button onClick={remove} className="nb-btn bg-red-200 hover:bg-red-300 px-3 py-1.5 text-sm flex items-center gap-1.5" data-testid="remove-prize-button">
                <Trash2 className="w-3.5 h-3.5" /> Remover
              </button>
            </div>
          </div>
        ) : !editing && !data.prize ? (
          <div className="text-center">
            <p className="text-sm text-neutral-700 mb-3">Nenhum prêmio configurado.</p>
            <button onClick={() => setEditing(true)} className="nb-btn bg-amber-300 px-4 py-2 flex items-center gap-2 mx-auto" data-testid="set-prize-button">
              <Plus className="w-4 h-4" /> Definir prêmio do mês
            </button>
          </div>
        ) : (
          <form onSubmit={save} className="space-y-3">
            <div className="grid grid-cols-[80px_1fr] gap-3">
              <div>
                <label className="block text-xs font-bold mb-1">Emoji</label>
                <input value={emoji} onChange={(e) => setEmoji(e.target.value)} maxLength={4} className="nb-input text-center text-2xl" data-testid="prize-emoji-input" />
              </div>
              <div>
                <label className="block text-xs font-bold mb-1">Prêmio</label>
                <input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: 1 caixa de bombom" className="nb-input" data-testid="prize-title-input" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold mb-1">Detalhes (opcional)</label>
              <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Ex.: entrega no último dia letivo" className="nb-input resize-none" data-testid="prize-description-input" />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={() => setEditing(false)} className="nb-btn bg-white px-4 py-2 text-sm">Cancelar</button>
              <button type="submit" disabled={submitting || !title.trim()} className="nb-btn bg-amber-300 px-4 py-2 text-sm" data-testid="save-prize-button">
                {submitting ? "Salvando..." : "Salvar prêmio"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

