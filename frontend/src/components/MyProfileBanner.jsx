import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import api from "@/lib/api";
import AvatarUploader from "@/components/AvatarUploader";
import EditProfileDialog from "@/components/EditProfileDialog";
import StatsCard from "@/components/StatsCard";
import Avatar from "@/components/Avatar";
import { getTier } from "@/lib/tiers";

/**
 * Banner shown at top of admin and student dashboards letting the user
 * change their own avatar, name and password. Also shows stats for alunos.
 */
export default function MyProfileBanner({ bg = "bg-amber-200" }) {
  const { user, refresh } = useAuth();
  const [hasAvatar, setHasAvatar] = useState(Boolean(user?.has_avatar));
  const [editing, setEditing] = useState(false);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    if (user?.role === "aluno") {
      api.get("/me/stats").then(({ data }) => setStats(data)).catch(() => {});
    }
  }, [user?.role]);

  if (!user) return null;
  const isAluno = user.role === "aluno";
  const tier = stats ? getTier(stats.points || 0) : null;

  return (
    <div className={`nb-card p-5 mb-8 ${bg}`} data-testid="my-profile-banner">
      <div className="flex items-start justify-between flex-wrap gap-5">
        <div className="flex items-center gap-4">
          <div className={tier ? `rounded-full ring-4 ring-offset-2 ${tier.ring} ring-offset-transparent inline-block` : "inline-block"}>
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
          </div>
          <div>
            <p className="font-heading font-bold text-lg leading-tight flex items-center gap-2">
              {user.name}
              {tier && <span className="text-xl" title={tier.name}>{tier.emoji}</span>}
            </p>
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
        {isAluno && stats && (
          <div className="flex-1 min-w-[280px] max-w-2xl">
            <StatsCard stats={stats} />
          </div>
        )}
        {!isAluno && (
          <div className="text-sm text-neutral-700 max-w-sm">
            <p className="font-bold mb-1">Personalize seu perfil</p>
            <p>Sua foto e nome aparecem na tela de seleção de perfil.</p>
          </div>
        )}
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
