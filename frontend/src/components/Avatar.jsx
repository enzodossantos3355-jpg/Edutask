import { useState, useEffect } from "react";
import { API } from "@/lib/api";

/**
 * Avatar component. Shows user's avatar image if present, else colored initial.
 * Uses public `/api/avatars/{userId}` endpoint with cache-busting via version key.
 */
export default function Avatar({ userId, name, size = 48, hasAvatar, version = 0, bg = "bg-sky-300", className = "", textClassName = "" }) {
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

  return (
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
}
