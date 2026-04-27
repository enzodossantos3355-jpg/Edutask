import { useEffect, useState } from "react";
import { Clock as ClockIcon } from "lucide-react";

/**
 * Floating clock fixed to the bottom-right corner.
 * Shows current time and date in pt-BR (BRT timezone of the user device).
 */
export default function Clock() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(i);
  }, []);

  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  const date = now.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" });

  return (
    <div
      className="fixed top-20 right-4 z-40 nb-card bg-white px-3 py-2 flex items-center gap-2 select-none"
      data-testid="floating-clock"
    >
      <ClockIcon className="w-4 h-4" strokeWidth={2.5} />
      <div className="leading-tight">
        <div className="font-mono font-bold text-base tabular-nums">{hh}:{mm}:{ss}</div>
        <div className="text-[10px] text-neutral-600 uppercase tracking-wider">{date}</div>
      </div>
    </div>
  );
}
