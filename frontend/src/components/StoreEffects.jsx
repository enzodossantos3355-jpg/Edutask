import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { ShoppingBag, Check, Sparkles, Lock, Pencil, X, Coins } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import Avatar from "@/components/Avatar";
import { effectClass, RARITY_META } from "@/lib/effects";
import { useAuth } from "@/context/AuthContext";

/**
 * Effects store panel. Reused by both Admin and Student.
 * - Admin: everything unlocked, can edit cost (pencil button).
 * - Student: buy with points, equip anything owned.
 */
export default function StoreEffects() {
  const { user, refresh } = useAuth();
  const [effects, setEffects] = useState([]);
  const [owned, setOwned] = useState([]);
  const [equipped, setEquipped] = useState("none");
  const [points, setPoints] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [editing, setEditing] = useState(null);
  const isAdmin = user?.role === "admin";

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/effects");
      setEffects(data.effects || []);
      setOwned(data.owned || []);
      setEquipped(data.equipped || "none");
      setPoints(data.points || 0);
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Falha ao carregar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const buy = async (eff) => {
    setBusy(eff.id);
    try {
      await api.post("/me/effects/buy", { effect_id: eff.id });
      toast.success(`Comprou "${eff.name}"! ${eff.emoji}`);
      await load();
      if (refresh) refresh();
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Falha ao comprar");
    } finally {
      setBusy(null);
    }
  };

  const equip = async (eff) => {
    setBusy(eff.id);
    try {
      await api.post("/me/effects/equip", { effect_id: eff.id === "none" ? null : eff.id });
      toast.success(eff.id === "none" ? "Efeito removido" : `Equipou "${eff.name}"`);
      setEquipped(eff.id);
      if (refresh) refresh();
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Falha ao equipar");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6" data-testid="store-effects">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-heading font-black text-3xl sm:text-5xl tracking-tight flex items-center gap-3">
            <ShoppingBag className="w-8 h-8 sm:w-10 sm:h-10 text-violet-600" strokeWidth={2.2} />
            Loja de Efeitos
          </h1>
          <p className="text-neutral-600 mt-1">
            {isAdmin ? "Todos desbloqueados. Ajuste o preço de cada efeito." : "Compre com seus pontos e destaque seu perfil na tela inicial."}
          </p>
        </div>
        {!isAdmin && (
          <div className="nb-card bg-amber-100 px-4 py-2 flex items-center gap-2" data-testid="store-points">
            <Coins className="w-4 h-4 text-amber-700" />
            <span className="text-xs font-bold uppercase tracking-wider">Saldo:</span>
            <span className="font-heading font-black text-xl">{points}</span>
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-neutral-500">Carregando...</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {effects.map((eff) => {
            const isOwned = owned.includes(eff.id) || eff.id === "none";
            const isEquipped = equipped === eff.id || (eff.id === "none" && (!equipped || equipped === "none"));
            const canAfford = points >= eff.cost;
            const rarity = RARITY_META[eff.rarity] || RARITY_META.common;
            const cls = effectClass(eff.id);
            return (
              <div key={eff.id} className={`nb-card p-4 bg-white flex flex-col ${isEquipped ? "ring-4 ring-emerald-400" : ""}`} data-testid={`effect-card-${eff.id}`}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{eff.emoji}</span>
                    <div>
                      <h3 className="font-heading font-bold text-base leading-tight">{eff.name}</h3>
                      <span className={`nb-badge ${rarity.bg} text-[9px] mt-0.5`}>{rarity.label}</span>
                    </div>
                  </div>
                  {isAdmin && eff.id !== "none" && (
                    <button
                      onClick={() => setEditing(eff)}
                      className="nb-btn bg-white hover:bg-amber-100 px-2 py-1"
                      title="Editar preço"
                      data-testid={`edit-price-${eff.id}`}
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <div className="flex-1 flex items-center justify-center py-4 min-h-[100px]">
                  <div className={cls ? `fx-avatar-wrapper ${cls}` : ""} style={{ width: 78, height: 78 }}>
                    <Avatar
                      userId={`preview-${eff.id}`}
                      name={user?.name || "?"}
                      size={64}
                      hasAvatar={user?.has_avatar}
                      bg={isAdmin ? "bg-red-300" : "bg-sky-300"}
                    />
                  </div>
                </div>

                <p className="text-xs text-neutral-600 mb-3 min-h-[32px]">{eff.description}</p>

                {eff.id === "none" ? (
                  <button
                    onClick={() => equip(eff)}
                    disabled={isEquipped || busy === eff.id}
                    className={`nb-btn w-full py-2 text-sm ${isEquipped ? "bg-emerald-200" : "bg-white"}`}
                    data-testid={`equip-${eff.id}`}
                  >
                    {isEquipped ? (<><Check className="w-4 h-4 inline mr-1" /> Padrão ativo</>) : "Remover efeito"}
                  </button>
                ) : isOwned ? (
                  <button
                    onClick={() => equip(eff)}
                    disabled={isEquipped || busy === eff.id}
                    className={`nb-btn w-full py-2 text-sm ${isEquipped ? "bg-emerald-300" : "bg-sky-300 hover:bg-sky-400"}`}
                    data-testid={`equip-${eff.id}`}
                  >
                    {isEquipped ? (<><Check className="w-4 h-4 inline mr-1" /> Equipado</>) : "Equipar"}
                  </button>
                ) : (
                  <button
                    onClick={() => buy(eff)}
                    disabled={!canAfford || busy === eff.id}
                    className={`nb-btn w-full py-2 text-sm flex items-center justify-center gap-1.5 ${canAfford ? "bg-amber-300 hover:bg-amber-400" : "bg-neutral-200 cursor-not-allowed"}`}
                    data-testid={`buy-${eff.id}`}
                  >
                    {canAfford ? <Coins className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                    {busy === eff.id ? "..." : canAfford ? `Comprar (${eff.cost})` : `${eff.cost} pts`}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <EditPriceDialog
          effect={editing}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await load(); }}
        />
      )}
    </div>
  );
}

function EditPriceDialog({ effect, onClose, onSaved }) {
  const [cost, setCost] = useState(String(effect.cost));
  const [saving, setSaving] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    const value = parseInt(cost, 10);
    if (isNaN(value) || value < 0) {
      toast.error("Custo inválido");
      return;
    }
    setSaving(true);
    try {
      await api.put(`/effects/${effect.id}`, { cost: value });
      toast.success("Preço atualizado!");
      onSaved();
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Falha");
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-3 sm:p-4" data-testid="edit-price-dialog">
      <div className="nb-card bg-white w-full max-w-sm p-5 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-heading font-black text-xl">{effect.emoji} {effect.name}</h3>
          <button onClick={onClose} className="nb-btn bg-white px-2 py-2"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-bold mb-1.5">Custo em pontos</label>
            <input
              type="number"
              min="0"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              className="nb-input"
              autoFocus
              data-testid="edit-price-input"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="nb-btn bg-white px-4 py-2">Cancelar</button>
            <button type="submit" disabled={saving} className="nb-btn bg-sky-400 px-4 py-2" data-testid="save-price">
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
