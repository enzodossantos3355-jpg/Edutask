import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Trophy, Calendar as CalendarIcon, Star, Sparkles, ChevronDown, Loader2 } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import Avatar from "@/components/Avatar";
import { useAuth } from "@/context/AuthContext";
import { useAIStatus } from "@/context/AIStatusContext";

/**
 * Banner showing the monthly prize, current leader and days remaining.
 * Visible to anyone authenticated (student dashboard).
 */
export default function PrizeBanner() {
  const [data, setData] = useState(null);
  const [tips, setTips] = useState(null);
  const [tipsLoading, setTipsLoading] = useState(false);
  const [tipsOpen, setTipsOpen] = useState(false);
  const { user } = useAuth();
  const { enabled: aiEnabled } = useAIStatus();

  useEffect(() => {
    api.get("/monthly-prize").then(({ data }) => setData(data)).catch(() => {});
  }, []);

  const loadTips = async () => {
    setTipsOpen(true);
    if (tips) return;
    setTipsLoading(true);
    try {
      const { data } = await api.get("/ai/prize-tips");
      setTips(data);
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Falha ao buscar dicas");
      setTipsOpen(false);
    } finally {
      setTipsLoading(false);
    }
  };

  if (!data || !data.prize) return null;
  const { prize, leader, days_remaining, month_label } = data;
  const showAiButton = aiEnabled && user?.role === "aluno";

  return (
    <div className="nb-card p-5 mb-8 bg-gradient-to-br from-amber-200 via-amber-100 to-amber-200 relative overflow-hidden" data-testid="prize-banner">
      <div className="absolute top-0 right-0 w-32 h-32 opacity-15 text-9xl select-none">{prize.emoji}</div>
      <div className="relative z-10 flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 nb-card flex items-center justify-center bg-amber-300 text-2xl flex-shrink-0">
            {prize.emoji}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold uppercase tracking-wider text-amber-900">Prêmio do mês • {month_label}</div>
            <h3 className="font-heading font-black text-xl sm:text-2xl leading-tight">{prize.title}</h3>
            {prize.description && (
              <p className="text-sm text-neutral-700 mt-1 max-w-md">{prize.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {leader && (
            <div className="flex items-center gap-2 nb-card bg-white px-3 py-2" data-testid="prize-leader">
              <Avatar userId={leader.id} name={leader.name} size={32} hasAvatar={leader.has_avatar} bg="bg-amber-200" />
              <div className="leading-tight">
                <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-600">Liderando</div>
                <div className="font-heading font-bold text-sm flex items-center gap-1">{leader.name} <Star className="w-3 h-3 text-amber-500" fill="currentColor" /></div>
                <div className="text-[10px] font-bold">{leader.points} pts</div>
              </div>
            </div>
          )}
          <div className="nb-card bg-white px-3 py-2 flex items-center gap-2" data-testid="prize-countdown">
            <CalendarIcon className="w-4 h-4" />
            <div className="leading-tight">
              <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-600">Restam</div>
              <div className="font-heading font-black text-base">{days_remaining}d</div>
            </div>
          </div>
        </div>
      </div>

      {showAiButton && (
        <div className="relative z-10 mt-4">
          {!tipsOpen ? (
            <button
              onClick={loadTips}
              className="nb-btn bg-gradient-to-r from-violet-300 to-pink-300 hover:from-violet-400 hover:to-pink-400 px-3 py-2 text-sm flex items-center gap-1.5"
              data-testid="prize-tips-button"
            >
              <Sparkles className="w-4 h-4" strokeWidth={2.5} />
              Como melhorar minhas chances?
            </button>
          ) : (
            <div className="nb-card bg-white p-4" data-testid="prize-tips-panel">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider">
                  <Sparkles className="w-3.5 h-3.5 text-violet-500" strokeWidth={2.5} />
                  Coach IA
                </div>
                <button onClick={() => setTipsOpen(false)} className="text-xs text-neutral-500 hover:underline">Fechar</button>
              </div>
              {tipsLoading ? (
                <div className="flex items-center gap-2 text-sm text-neutral-500">
                  <Loader2 className="w-4 h-4 animate-spin" /> analisando...
                </div>
              ) : tips ? (
                <>
                  <div className="flex flex-wrap gap-2 mb-2">
                    <span className="nb-badge bg-sky-200 text-[10px]">Posição {tips.rank}º / {tips.total}</span>
                    <span className="nb-badge bg-amber-200 text-[10px]">{tips.my_points} pts</span>
                    {tips.gap_to_leader > 0 && <span className="nb-badge bg-red-200 text-[10px]">{tips.gap_to_leader} atrás do líder</span>}
                  </div>
                  <p className="text-sm whitespace-pre-wrap" data-testid="prize-tips-text">{tips.tips}</p>
                </>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
