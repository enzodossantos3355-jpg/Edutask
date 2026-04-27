import { useEffect, useState } from "react";
import { Trophy, Calendar as CalendarIcon, Star } from "lucide-react";
import api from "@/lib/api";
import Avatar from "@/components/Avatar";

/**
 * Banner showing the monthly prize, current leader and days remaining.
 * Visible to anyone authenticated (student dashboard).
 */
export default function PrizeBanner() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/monthly-prize").then(({ data }) => setData(data)).catch(() => {});
  }, []);

  if (!data || !data.prize) return null;
  const { prize, leader, days_remaining, month_label } = data;

  return (
    <div className="nb-card p-5 mb-8 bg-gradient-to-br from-amber-200 via-amber-100 to-amber-200 relative overflow-hidden" data-testid="prize-banner">
      <div className="absolute top-0 right-0 w-32 h-32 opacity-15 text-9xl select-none">{prize.emoji}</div>
      <div className="relative z-10 flex items-start justify-between flex-wrap gap-4">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 nb-card flex items-center justify-center bg-amber-300 text-2xl flex-shrink-0">
            {prize.emoji}
          </div>
          <div className="min-w-0">
            <div className="text-xs font-bold uppercase tracking-wider text-amber-900">Prêmio do mês • {month_label}</div>
            <h3 className="font-heading font-black text-xl sm:text-2xl leading-tight">{prize.title}</h3>
            {prize.description && (
              <p className="text-sm text-neutral-700 mt-1 max-w-md">{prize.description}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {leader && (
            <div className="flex items-center gap-2 nb-card bg-white px-3 py-2" data-testid="prize-leader">
              <Avatar userId={leader.id} name={leader.name} size={32} hasAvatar={leader.has_avatar} bg="bg-amber-200" />
              <div className="leading-tight">
                <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-600">Liderando</div>
                <div className="font-heading font-bold text-sm flex items-center gap-1">{leader.name} <Star className="w-3 h-3 text-amber-500" fill="currentColor" /></div>
                <div className="text-[10px] font-bold">{leader.points} pts</div>
              </div>
            </div>
          )}
          <div className="nb-card bg-white px-3 py-2 flex items-center gap-2" data-testid="prize-countdown">
            <CalendarIcon className="w-4 h-4" />
            <div className="leading-tight">
              <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-600">Restam</div>
              <div className="font-heading font-black text-base">{days_remaining}d</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
