import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import AvatarUploader from "@/components/AvatarUploader";

/**
 * Banner shown at top of admin and student dashboards letting the user
 * change their own avatar.
 */
export default function MyProfileBanner({ bg = "bg-amber-200" }) {
  const { user, refresh } = useAuth();
  const [hasAvatar, setHasAvatar] = useState(Boolean(user?.has_avatar));

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
        </div>
        <div className="text-sm text-neutral-700 max-w-sm">
          <p className="font-bold mb-1">Personalize seu perfil</p>
          <p>Sua foto aparece na tela de seleção de perfil quando você fizer login.</p>
        </div>
      </div>
    </div>
  );
}
