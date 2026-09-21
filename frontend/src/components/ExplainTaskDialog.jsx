import { useEffect, useState } from "react";
import { toast } from "sonner";
import { X, Sparkles, BookOpen, Lightbulb, Flag, MessageCircle } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import AIChatDialog from "@/components/AIChatDialog";

/**
 * Student dialog: explains a task using AI (no answers given), then offers a
 * follow-up chat that keeps the task as context.
 */
export default function ExplainTaskDialog({ open, onClose, task }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  useEffect(() => {
    if (!open || !task) return;
    setLoading(true);
    api.post("/ai/explain-task", { task_id: task.id })
      .then(({ data }) => setData(data))
      .catch((e) => toast.error(formatApiError(e?.response?.data?.detail) || "IA falhou"))
      .finally(() => setLoading(false));
  }, [open, task]);

  if (!open || !task) return null;

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" data-testid="explain-task-dialog">
        <div className="nb-card bg-white w-full max-w-2xl max-h-[92vh] overflow-auto p-5 sm:p-6 rounded-t-2xl sm:rounded-2xl">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-9 h-9 nb-card flex items-center justify-center bg-gradient-to-br from-violet-300 to-pink-300 flex-shrink-0">
                <Sparkles className="w-4 h-4" strokeWidth={2.5} />
              </div>
              <div className="min-w-0">
                <h3 className="font-heading font-black text-lg sm:text-xl truncate">Explicação da tarefa</h3>
                <p className="text-[10px] sm:text-xs text-neutral-500 truncate">{task.subject} • {task.title}</p>
              </div>
            </div>
            <button onClick={onClose} className="nb-btn bg-white px-2 py-1.5" data-testid="explain-close">
              <X className="w-4 h-4" />
            </button>
          </div>

          {loading ? (
            <div className="text-center py-10 text-neutral-500">
              <Sparkles className="w-6 h-6 mx-auto mb-2 animate-spin text-violet-500" />
              A IA está preparando a explicação...
            </div>
          ) : !data ? (
            <p className="text-sm text-neutral-500">Sem resposta.</p>
          ) : (
            <div className="space-y-4">
              <div className="nb-card bg-amber-50 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <BookOpen className="w-4 h-4" />
                  <span className="text-xs font-bold uppercase tracking-wider">O que a tarefa pede</span>
                </div>
                <p className="text-sm whitespace-pre-wrap" data-testid="explain-explanation">{data.explanation}</p>
              </div>

              {data.key_concepts?.length > 0 && (
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" /> Conceitos-chave
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {data.key_concepts.map((c, i) => (
                      <span key={i} className="nb-badge bg-sky-100">{c}</span>
                    ))}
                  </div>
                </div>
              )}

              {data.tips?.length > 0 && (
                <div className="nb-card bg-emerald-50 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Lightbulb className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase tracking-wider">Dicas para começar</span>
                  </div>
                  <ul className="space-y-1 text-sm">
                    {data.tips.map((t, i) => <li key={i} className="flex items-start gap-1.5"><span className="text-emerald-600 font-bold">•</span> {t}</li>)}
                  </ul>
                </div>
              )}

              {data.first_step && (
                <div className="nb-card bg-violet-100 p-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <Flag className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase tracking-wider">Primeiro passo</span>
                  </div>
                  <p className="text-sm font-medium">{data.first_step}</p>
                </div>
              )}

              <button
                onClick={() => setChatOpen(true)}
                className="nb-btn w-full bg-gradient-to-r from-violet-300 to-pink-300 hover:from-violet-400 hover:to-pink-400 px-4 py-3 flex items-center justify-center gap-2"
                data-testid="explain-open-chat"
              >
                <MessageCircle className="w-4 h-4" strokeWidth={2.5} />
                Tenho dúvidas — abrir chat com a IA
              </button>
              <p className="text-[10px] text-neutral-500 text-center">A IA vai te guiar, mas não vai entregar a resposta pronta 😉</p>
            </div>
          )}
        </div>
      </div>

      <AIChatDialog
        open={chatOpen}
        onClose={() => setChatOpen(false)}
        taskId={task.id}
        sessionKey={`ai_task_${task.id}`}
        title={`Ajuda: ${task.title}`}
        initialAssistantMessage={`Oi! Estou aqui pra te ajudar com "${task.title}" (${task.subject}). Me conta onde você travou ou o que quer entender.`}
      />
    </>
  );
}
