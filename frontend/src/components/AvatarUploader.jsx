import { useRef, useState } from "react";
import { Camera, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import api, { formatApiError } from "@/lib/api";
import Avatar from "@/components/Avatar";

/**
 * AvatarUploader: shows a big avatar with buttons to change / remove.
 * - For self: pass `path="/me/avatar"` (default).
 * - For admin managing another user: pass `path="/users/{id}/avatar"`.
 */
export default function AvatarUploader({
  userId,
  name,
  hasAvatar,
  onChanged,
  path = "/me/avatar",
  size = 96,
  bg = "bg-sky-300",
  tierBorderColor = null,
  effect = null,
}) {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [version, setVersion] = useState(0);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione uma imagem");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api.post(path, fd, { headers: { "Content-Type": "multipart/form-data" } });
      setVersion((v) => v + 1);
      toast.success("Foto atualizada!");
      onChanged?.(true);
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail) || "Falha ao enviar imagem");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const remove = async () => {
    try {
      await api.delete(path);
      setVersion((v) => v + 1);
      toast.success("Foto removida");
      onChanged?.(false);
    } catch (err) {
      toast.error(formatApiError(err?.response?.data?.detail) || "Falha ao remover");
    }
  };

  return (
    <div className="flex items-center gap-4" data-testid="avatar-uploader">
      <div className="relative">
        <Avatar userId={userId} name={name} size={size} hasAvatar={hasAvatar} version={version} bg={bg} tierBorderColor={tierBorderColor} effect={effect} />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="absolute -bottom-1 -right-1 nb-btn bg-amber-300 hover:bg-amber-400 px-1.5 py-1.5"
          data-testid="avatar-upload-button"
          title="Trocar foto"
          aria-label="Trocar foto"
        >
          <Camera className="w-3.5 h-3.5" strokeWidth={2.5} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          onChange={handleFile}
          className="hidden"
          data-testid="avatar-file-input"
        />
      </div>
      <div className="hidden sm:flex flex-col gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="nb-btn bg-white hover:bg-sky-100 px-3 py-1.5 text-sm flex items-center gap-1.5"
          data-testid="avatar-change-button"
        >
          <Upload className="w-3.5 h-3.5" />
          {uploading ? "Enviando..." : hasAvatar ? "Trocar foto" : "Adicionar foto"}
        </button>
        {hasAvatar && (
          <button
            type="button"
            onClick={remove}
            className="nb-btn bg-red-200 hover:bg-red-300 px-3 py-1.5 text-sm flex items-center gap-1.5"
            data-testid="avatar-remove-button"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Remover
          </button>
        )}
      </div>
    </div>
  );
}
