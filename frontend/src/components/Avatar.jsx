import { useState, useEffect } from "react";
import { API } from "@/lib/api";

/**
 * Avatar component. Shows user's avatar image if present, else colored initial.
 * Optional `tierBorderColor` (hex) renders a thicker colored border around the avatar.
 */
export default function Avatar({
  userId,
  name,
  size = 48,
  hasAvatar,
  version = 0,
  bg = "bg-sky-300",
  className = "",
  textClassName = "",
  tierBorderColor = null,
}) {
  const [src, setSrc] = useState(null);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    if (hasAvatar) {
      setSrc(`${API}/avatars/${userId}?v=${version}`);
      setErrored(false);
    } else {
      setSrc(null);
    }
  }, [userId, hasAvatar, version]);

  const showImage = src && !errored;
  const initial = (name?.[0] || "?").toUpperCase();
  const fontSize = size >= 60 ? "text-3xl" : size >= 40 ? "text-xl" : "text-base";

  const inner = (
    <div
      className={`nb-card flex items-center justify-center overflow-hidden ${showImage ? "bg-white" : bg} ${className}`}
      style={{ width: size, height: size }}
      data-testid={`avatar-${userId}`}
    >
      {showImage ? (
        <img
          src={src}
          alt={name}
          onError={() => setErrored(true)}
          className="w-full h-full object-cover"
          draggable={false}
        />
      ) : (
        <span className={`font-heading font-black ${fontSize} ${textClassName}`}>{initial}</span>
      )}
    </div>
  );

  if (!tierBorderColor) return inner;

  const ringSize = size + 12;
  return (
    <div
      className="inline-flex items-center justify-center"
      style={{
        width: ringSize,
        height: ringSize,
        background: tierBorderColor,
        borderRadius: "1.1rem",
        boxShadow: `0 0 0 2px #0a0a0a, 0 0 14px ${tierBorderColor}66`,
        padding: 6,
      }}
      data-testid={`avatar-tier-wrapper-${userId}`}
    >
      {inner}
    </div>
  );
}
