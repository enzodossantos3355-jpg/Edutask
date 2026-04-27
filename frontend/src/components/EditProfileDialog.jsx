import { useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import api, { formatApiError } from "@/lib/api";

/**
 * Dialog to edit a user's name and/or password.
 * - For self: pass `path="/me"` (default). Title shows "Editar meu perfil".
 * - For admin editing student: pass `path="/users/{id}"` and label.
 */
export default function EditProfileDialog({
  initialName = "",
  path = "/me",
  label,
  showPassword = true,
  onClose,
  onSaved,
}) {
  const [name, setName] = useState(initialName);
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    const payload = {};
    if (name.trim() && name.trim() !== initialName) payload.name = name.trim();
    if (password.trim()) payload.password = password.trim();
    if (Object.keys(payload).length === 0) {
      toast("Nenhuma alteração para salvar");
      onClose();
      return;
    }
    setSubmitting(true);
    try {
      await api.patch(path, payload);
      toast.success("Perfil atualizado!");
      onSaved?.();
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail) || "Falha ao atualizar");
    } finally {
      setSubmitting(false);
    }
  };

  const title = label ? `Editar ${label}` : "Editar meu perfil";

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-3 sm:p-4" data-testid="edit-profile-dialog">
      <div className="nb-card bg-white w-full max-w-md p-5 sm:p-7">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-heading font-black text-xl sm:text-2xl">{title}</h3>
          <button onClick={onClose} className="nb-btn bg-white px-2 py-2"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-bold mb-1.5">Nome</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="nb-input"
              placeholder="Nome do perfil"
              data-testid="edit-name-input"
            />
          </div>
          {showPassword && (
            <div>
              <label className="block text-sm font-bold mb-1.5">Nova senha</label>
              <input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="nb-input"
                placeholder="Deixe em branco para manter"
                minLength={4}
                data-testid="edit-password-input"
              />
              <p className="text-xs text-neutral-500 mt-1">Mínimo 4 caracteres. Deixe vazio para não alterar.</p>
            </div>
          )}
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={onClose} className="nb-btn bg-white px-5 py-2.5">Cancelar</button>
            <button type="submit" disabled={submitting} className="nb-btn bg-sky-400 px-5 py-2.5" data-testid="submit-edit-profile">
              {submitting ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
