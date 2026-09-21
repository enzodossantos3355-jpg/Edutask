import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import api from "@/lib/api";
import AIChatDialog from "@/components/AIChatDialog";

/**
 * Small AI banner shown on the student dashboard. Shows a 1-3 sentence daily
 * summary and offers a button to open the free chat tutor.
 */
export default function AIDailySummary() {
  const [summary, setSummary] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    api.get("/ai/daily-summary").then(({ data }) => setSummary(data)).catch(() => {});
  }, []);

  if (!summary) return null;

  return (
    <>
      <div
        className="nb-card p-4 sm:p-5 mb-6 bg-gradient-to-br from-violet-200 via-pink-100 to-amber-100 relative overflow-hidden"
        data-testid="ai-daily-summary"
      >
        <div className="absolute -top-4 -right-4 text-[100px] opacity-15 select-none">✨</div>
        <div className="relative z-10 flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="w-10 h-10 nb-card flex items-center justify-center bg-white flex-shrink-0">
              <Sparkles className="w-5 h-5 text-violet-600" strokeWidth={2.5} />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wider text-violet-900">Resumo do dia • IA</div>
              <p className="text-sm sm:text-base mt-1" data-testid="ai-summary-text">{summary.summary}</p>
            </div>
          </div>
          <button
            onClick={() => setChatOpen(true)}
            className="nb-btn bg-white hover:bg-violet-100 px-3 py-2 text-sm flex items-center gap-1.5 flex-shrink-0"
            data-testid="open-ai-chat"
          >
            <Sparkles className="w-4 h-4" strokeWidth={2.5} /> Tira-dúvida
          </button>
        </div>
      </div>

      <AIChatDialog
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        sessionKey="ai_chat_free"
        title="Tira-dúvida"
        initialAssistantMessage="Oi! Estou aqui pra te ajudar a entender qualquer matéria. Me conta o que você quer aprender hoje?"
      />
    </>
  );
}
