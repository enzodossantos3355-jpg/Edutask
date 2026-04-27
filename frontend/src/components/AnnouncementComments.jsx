import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MessageCircle, Send, Trash2 } from "lucide-react";
import api, { formatApiError } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";

export default function AnnouncementComments({ announcementId }) {
  const { user } = useAuth();
  const [comments, setComments] = useState([]);
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get(`/announcements/${announcementId}/comments`);
      setComments(data);
    } catch {
      // silent
    }
  };

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const submit = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSubmitting(true);
    try {
      await api.post(`/announcements/${announcementId}/comments`, { text: text.trim() });
      setText("");
      load();
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail));
    } finally {
      setSubmitting(false);
    }
  };

  const remove = async (id) => {
    try {
      await api.delete(`/announcements/${announcementId}/comments/${id}`);
      load();
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail));
    }
  };

  const formatTime = (iso) => {
    try {
      return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    } catch { return iso; }
  };

  return (
    <div className="mt-3" data-testid={`comments-section-${announcementId}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="nb-btn bg-white px-3 py-1.5 text-xs flex items-center gap-1.5"
        data-testid={`toggle-comments-${announcementId}`}
      >
        <MessageCircle className="w-3.5 h-3.5" />
        {open ? "Ocultar comentários" : `Comentários${comments.length > 0 ? ` (${comments.length})` : ""}`}
      </button>
      {open && (
        <div className="mt-3 space-y-3">
          {comments.length === 0 ? (
            <p className="text-xs text-neutral-600">Nenhum comentário ainda.</p>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="nb-card bg-white p-3" data-testid={`comment-${c.id}`}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm">{c.user_name}</span>
                    {c.user_role === "admin" && (
                      <span className="nb-badge bg-red-200 text-[9px]">Admin</span>
                    )}
                    <span className="text-[10px] text-neutral-500">{formatTime(c.created_at)}</span>
                  </div>
                  {(user?.role === "admin" || c.user_id === user?.id) && (
                    <button
                      onClick={() => remove(c.id)}
                      className="nb-btn bg-red-200 hover:bg-red-300 px-1.5 py-1 text-xs"
                      data-testid={`delete-comment-${c.id}`}
                      aria-label="Remover comentário"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <p className="text-sm whitespace-pre-wrap">{c.text}</p>
              </div>
            ))
          )}
          <form onSubmit={submit} className="flex gap-2" data-testid={`comment-form-${announcementId}`}>
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Escreva um comentário..."
              maxLength={500}
              className="nb-input flex-1 text-sm py-2"
              data-testid={`comment-input-${announcementId}`}
            />
            <button
              type="submit"
              disabled={submitting || !text.trim()}
              className="nb-btn bg-violet-300 px-3 py-2 flex items-center gap-1"
              data-testid={`submit-comment-${announcementId}`}
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
