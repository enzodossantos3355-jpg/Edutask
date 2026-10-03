import { useState, useEffect } from "react";
import { API } from "@/lib/api";

/**
 * Circular avatar. Optional `effect` renders a decorative wrapper (frame).
 * Legacy `tierBorderColor` prop is accepted but ignored (tier system removed).
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
  // eslint-disable-next-line no-unused-vars
  tierBorderColor = null,
  effect = null,
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
      className={`flex items-center justify-center overflow-hidden rounded-full border-2 border-black ${showImage ? "bg-white" : bg} ${className}`}
      style={{
        width: size,
        height: size,
        boxShadow: "3px 3px 0 0 #0a0a0a",
      }}
      data-testid={`avatar-${userId}`}
    >
      {showImage ? (
        <img
          src={src}
          alt={name}
          onError={() => setErrored(true)}
          className="w-full h-full object-cover rounded-full"
          draggable={false}
        />
      ) : (
        <span className={`font-heading font-black ${fontSize} ${textClassName}`}>{initial}</span>
      )}
    </div>
  );

  if (!effect || effect === "none") return inner;
  return (
    <div
      className={`fx-avatar-wrapper ${effect}`}
      style={{ width: size + 10, height: size + 10 }}
      data-testid={`avatar-effect-${userId}`}
    >
      {inner}
    </div>
  );
}
