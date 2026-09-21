import { useState } from "react";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { useAIStatus } from "@/context/AIStatusContext";

/**
 * Small "✨ Melhorar com IA" button. Calls a backend endpoint and passes result
 * back to parent via onResult(data). Shows loading state. Hidden if AI disabled.
 */
export default function AIEnhanceButton({
  endpoint,
  payload,
  onResult,
  label = "Melhorar com IA",
  className = "",
  disabled = false,
  testId,
}) {
  const [loading, setLoading] = useState(false);
  const { enabled } = useAIStatus();
  if (!enabled) return null;

  const run = async () => {
    setLoading(true);
    try {
      const { data } = await api.post(endpoint, payload);
      onResult(data);
      toast.success("Sugestão pronta! ✨");
    } catch (e) {
      toast.error(formatApiError(e?.response?.data?.detail) || "Falha ao chamar a IA");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={run}
      disabled={disabled || loading}
      className={`nb-btn bg-gradient-to-r from-violet-300 to-pink-300 hover:from-violet-400 hover:to-pink-400 px-3 py-1.5 text-xs flex items-center gap-1.5 ${className}`}
      data-testid={testId || "ai-enhance-button"}
      title="Deixar a IA sugerir"
    >
      <Sparkles className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} strokeWidth={2.5} />
      {loading ? "Pensando..." : label}
    </button>
  );
}
