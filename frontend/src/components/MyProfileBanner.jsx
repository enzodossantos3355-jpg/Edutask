import { useState } from "react";
import { Pencil } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import AvatarUploader from "@/components/AvatarUploader";
import EditProfileDialog from "@/components/EditProfileDialog";

/**
 * Banner shown at top of admin and student dashboards letting the user
 * change their own avatar, name and password.
 */
export default function MyProfileBanner({ bg = "bg-amber-200" }) {
  const { user, refresh } = useAuth();
  const [hasAvatar, setHasAvatar] = useState(Boolean(user?.has_avatar));
  const [editing, setEditing] = useState(false);

  if (!user) return null;

  return (
    <div className={`nb-card p-5 mb-8 ${bg}`} data-testid="my-profile-banner">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <AvatarUploader
            userId={user.id}
            name={user.name}
            hasAvatar={hasAvatar}
            onChanged={(present) => {
              setHasAvatar(present);
              refresh();
            }}
            path="/me/avatar"
            size={72}
            bg={user.role === "admin" ? "bg-red-300" : "bg-sky-300"}
          />
          <div>
            <p className="font-heading font-bold text-lg leading-tight">{user.name}</p>
            <p className="text-xs text-neutral-700">{user.role === "admin" ? "Administrador" : "Aluno"}</p>
            {user.role === "admin" && (
              <button
                onClick={() => setEditing(true)}
                className="nb-btn bg-white hover:bg-sky-100 px-3 py-1 text-xs flex items-center gap-1.5 mt-2"
                data-testid="open-edit-profile-button"
              >
                <Pencil className="w-3 h-3" />
                Editar nome / senha
              </button>
            )}
          </div>
        </div>
        <div className="text-sm text-neutral-700 max-w-sm">
          <p className="font-bold mb-1">Personalize seu perfil</p>
          <p>
            {user.role === "admin"
              ? "Sua foto e nome aparecem na tela de seleção de perfil."
              : "Você pode trocar sua foto. Para alterar nome ou senha, peça ao administrador."}
          </p>
        </div>
      </div>

      {editing && user.role === "admin" && (
        <EditProfileDialog
          initialName={user.name}
          path="/me"
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}
