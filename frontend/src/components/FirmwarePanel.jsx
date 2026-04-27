import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Cpu, Pencil, Plus, Trash2, X, Check, RefreshCcw, Sparkles, Download } from "lucide-react";
import api, { formatApiError } from "@/lib/api";

const STATUS_META = {
  stable: { label: "Estável", bg: "bg-emerald-200" },
  beta: { label: "Beta", bg: "bg-violet-200" },
  novo: { label: "Novo", bg: "bg-amber-200" },
};

/**
 * Firmware / App Version panel — admin only.
 * Shows current version, codename, release notes, and list of features.
 * Admin can edit everything inline.
 */
export default function FirmwarePanel() {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editingMeta, setEditingMeta] = useState(false);
  const [editingFeature, setEditingFeature] = useState(null); // { index, feature } or { index: -1, feature: blank } for new

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/app-info");
      setInfo(data);
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveMeta = async (patch) => {
    try {
      const { data } = await api.put("/app-info", patch);
      setInfo(data);
      toast.success("Atualizado!");
      setEditingMeta(false);
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail));
    }
  };

  const saveFeatures = async (features) => {
    try {
      const { data } = await api.put("/app-info", { features });
      setInfo(data);
      toast.success("Funções atualizadas!");
      setEditingFeature(null);
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail));
    }
  };

  const onDeleteFeature = async (idx) => {
    const next = (info.features || []).filter((_, i) => i !== idx);
    await saveFeatures(next);
  };

  const onSaveFeature = async ({ index, feature }) => {
    const list = [...(info.features || [])];
    if (index === -1) list.push(feature);
    else list[index] = feature;
    await saveFeatures(list);
  };

  const downloadInfo = () => {
    if (!info) return;
    const payload = {
      app: "Edutask",
      version: info.version,
      codename: info.codename || null,
      release_notes: info.release_notes || "",
      features: info.features || [],
      updated_at: info.updated_at || null,
      exported_at: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeVersion = (info.version || "0.0.0").replace(/[^a-zA-Z0-9._-]/g, "_");
    a.download = `edutask-firmware-v${safeVersion}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Firmware exportado!");
  };

  if (loading) return <p className="text-neutral-500">Carregando...</p>;
  if (!info) return null;

  const updatedLabel = info.updated_at
    ? new Date(info.updated_at).toLocaleString("pt-BR", {
        day: "2-digit", month: "2-digit", year: "numeric",
        hour: "2-digit", minute: "2-digit",
      })
    : "—";

  return (
    <div className="space-y-6" data-testid="firmware-panel">
      <div>
        <h1 className="font-heading font-black text-3xl sm:text-5xl tracking-tight flex items-center gap-3">
          <Cpu className="w-8 h-8 sm:w-10 sm:h-10" strokeWidth={2.2} />
          Firmware
        </h1>
        <p className="text-neutral-600 mt-1">Informações de versão e funcionalidades do Edutask.</p>
      </div>

      {/* Version banner */}
      <div className="nb-card p-5 sm:p-6 bg-gradient-to-br from-sky-200 via-sky-100 to-amber-100 relative overflow-hidden" data-testid="firmware-version-card">
        <div className="absolute -top-4 -right-4 text-[140px] opacity-10 select-none">⚙️</div>
        <div className="relative z-10 flex items-start justify-between flex-wrap gap-4">
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-sky-900">Versão instalada</div>
            <div className="flex items-baseline gap-3 mt-1 flex-wrap">
              <div className="font-heading font-black text-4xl sm:text-5xl" data-testid="firmware-version">v{info.version}</div>
              {info.codename && (
                <span className="nb-badge bg-white" data-testid="firmware-codename">{info.codename}</span>
              )}
            </div>
            <div className="text-xs text-neutral-700 mt-2">Última atualização: <span className="font-bold">{updatedLabel}</span></div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={load}
              className="nb-btn bg-white hover:bg-sky-100 px-3 py-2 text-sm flex items-center gap-1.5"
              data-testid="firmware-refresh"
              title="Recarregar"
            >
              <RefreshCcw className="w-3.5 h-3.5" /> Recarregar
            </button>
            <button
              onClick={downloadInfo}
              className="nb-btn bg-emerald-300 hover:bg-emerald-400 px-3 py-2 text-sm flex items-center gap-1.5"
              data-testid="firmware-download"
              title="Baixar informações em JSON"
            >
              <Download className="w-3.5 h-3.5" /> Baixar
            </button>
            <button
              onClick={() => setEditingMeta(true)}
              className="nb-btn bg-sky-400 hover:bg-sky-300 px-3 py-2 text-sm flex items-center gap-1.5"
              data-testid="firmware-edit-meta"
            >
              <Pencil className="w-3.5 h-3.5" /> Editar versão
            </button>
          </div>
        </div>
        {info.release_notes && (
          <div className="relative z-10 mt-4 nb-card bg-white p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1">Notas de lançamento</div>
            <p className="text-sm whitespace-pre-wrap" data-testid="firmware-notes">{info.release_notes}</p>
          </div>
        )}
      </div>

      {/* Features */}
      <div>
        <div className="flex items-end justify-between mb-3 flex-wrap gap-3">
          <div>
            <h2 className="font-heading font-bold text-xl sm:text-2xl flex items-center gap-2">
              <Sparkles className="w-5 h-5 sm:w-6 sm:h-6" /> Funções disponíveis
              <span className="nb-badge bg-white">{(info.features || []).length}</span>
            </h2>
            <p className="text-xs sm:text-sm text-neutral-600 mt-0.5">Lista de recursos ativos na versão atual.</p>
          </div>
          <button
            onClick={() => setEditingFeature({ index: -1, feature: { name: "", description: "", emoji: "✨", status: "stable" } })}
            className="nb-btn bg-amber-300 px-3 py-2 text-sm flex items-center gap-1.5"
            data-testid="firmware-add-feature"
          >
            <Plus className="w-4 h-4" strokeWidth={3} /> Nova função
          </button>
        </div>

        {(info.features || []).length === 0 ? (
          <div className="nb-card bg-white p-6 text-center text-sm text-neutral-600">
            Nenhuma função cadastrada.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
            {info.features.map((f, i) => {
              const meta = STATUS_META[f.status] || STATUS_META.stable;
              return (
                <div key={i} className="nb-card p-4 bg-white flex items-start gap-3" data-testid={`firmware-feature-${i}`}>
                  <div className="w-10 h-10 nb-card flex items-center justify-center bg-sky-100 text-xl flex-shrink-0">
                    {f.emoji || "✨"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <h3 className="font-heading font-bold text-base leading-tight">{f.name}</h3>
                      <span className={`nb-badge ${meta.bg} text-[10px]`}>{meta.label}</span>
                    </div>
                    {f.description && (
                      <p className="text-xs sm:text-sm text-neutral-700 mt-1">{f.description}</p>
                    )}
                    <div className="flex gap-1.5 mt-2">
                      <button
                        onClick={() => setEditingFeature({ index: i, feature: { ...f } })}
                        className="nb-btn bg-amber-200 hover:bg-amber-300 px-2 py-1 text-xs flex items-center gap-1"
                        data-testid={`firmware-edit-feature-${i}`}
                      >
                        <Pencil className="w-3 h-3" /> Editar
                      </button>
                      <button
                        onClick={() => onDeleteFeature(i)}
                        className="nb-btn bg-red-200 hover:bg-red-300 px-2 py-1 text-xs flex items-center gap-1"
                        data-testid={`firmware-delete-feature-${i}`}
                      >
                        <Trash2 className="w-3 h-3" /> Remover
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editingMeta && (
        <MetaDialog
          initial={info}
          onClose={() => setEditingMeta(false)}
          onSave={saveMeta}
        />
      )}
      {editingFeature && (
        <FeatureDialog
          initial={editingFeature.feature}
          isNew={editingFeature.index === -1}
          onClose={() => setEditingFeature(null)}
          onSave={(feature) => onSaveFeature({ index: editingFeature.index, feature })}
        />
      )}
    </div>
  );
}

function MetaDialog({ initial, onClose, onSave }) {
  const [version, setVersion] = useState(initial.version || "");
  const [codename, setCodename] = useState(initial.codename || "");
  const [notes, setNotes] = useState(initial.release_notes || "");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const v = version.trim();
    if (!v) return;
    setSubmitting(true);
    try {
      await onSave({ version: v, codename: codename.trim(), release_notes: notes.trim() });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3 sm:p-4" data-testid="firmware-meta-dialog">
      <div className="nb-card bg-white w-full max-w-md p-5 sm:p-7">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-heading font-black text-xl sm:text-2xl">Editar versão</h3>
          <button onClick={onClose} className="nb-btn bg-white px-2 py-2"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-bold mb-1.5">Versão</label>
            <input
              required
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              className="nb-input"
              placeholder="Ex.: 1.2.0"
              maxLength={40}
              data-testid="firmware-version-input"
            />
            <p className="text-xs text-neutral-500 mt-1">Use formato livre (SemVer recomendado, ex.: 1.2.3).</p>
          </div>
          <div>
            <label className="block text-sm font-bold mb-1.5">Codinome (opcional)</label>
            <input
              value={codename}
              onChange={(e) => setCodename(e.target.value)}
              className="nb-input"
              placeholder="Ex.: Neo-Brutalist Beta"
              maxLength={60}
              data-testid="firmware-codename-input"
            />
          </div>
          <div>
            <label className="block text-sm font-bold mb-1.5">Notas de lançamento</label>
            <textarea
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="nb-input resize-y"
              placeholder="O que mudou nesta versão?"
              data-testid="firmware-notes-input"
            />
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="nb-btn bg-white px-4 py-2">Cancelar</button>
            <button
              type="submit"
              disabled={submitting || !version.trim()}
              className="nb-btn bg-sky-400 px-4 py-2 flex items-center gap-1.5"
              data-testid="firmware-save-meta"
            >
              <Check className="w-4 h-4" /> {submitting ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function FeatureDialog({ initial, isNew, onClose, onSave }) {
  const [name, setName] = useState(initial.name || "");
  const [description, setDescription] = useState(initial.description || "");
  const [emoji, setEmoji] = useState(initial.emoji || "✨");
  const [status, setStatus] = useState(initial.status || "stable");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    setSubmitting(true);
    try {
      await onSave({ name: n, description: description.trim(), emoji: (emoji || "✨").trim() || "✨", status });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3 sm:p-4" data-testid="firmware-feature-dialog">
      <div className="nb-card bg-white w-full max-w-md p-5 sm:p-7">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-heading font-black text-xl sm:text-2xl">{isNew ? "Nova função" : "Editar função"}</h3>
          <button onClick={onClose} className="nb-btn bg-white px-2 py-2"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-[80px_1fr] gap-3">
            <div>
              <label className="block text-sm font-bold mb-1.5">Emoji</label>
              <input
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                maxLength={4}
                className="nb-input text-center text-2xl"
                data-testid="firmware-feature-emoji-input"
              />
            </div>
            <div>
              <label className="block text-sm font-bold mb-1.5">Nome</label>
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="nb-input"
                placeholder="Ex.: Upload de respostas"
                maxLength={80}
                data-testid="firmware-feature-name-input"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-bold mb-1.5">Descrição</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="nb-input resize-y"
              placeholder="O que essa função faz?"
              maxLength={280}
              data-testid="firmware-feature-description-input"
            />
          </div>
          <div>
            <label className="block text-sm font-bold mb-1.5">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="nb-input cursor-pointer"
              data-testid="firmware-feature-status-input"
            >
              <option value="stable">Estável</option>
              <option value="beta">Beta</option>
              <option value="novo">Novo</option>
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="nb-btn bg-white px-4 py-2">Cancelar</button>
            <button
              type="submit"
              disabled={submitting || !name.trim()}
              className="nb-btn bg-amber-300 px-4 py-2 flex items-center gap-1.5"
              data-testid="firmware-save-feature"
            >
              <Check className="w-4 h-4" /> {submitting ? "Salvando..." : isNew ? "Adicionar" : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
