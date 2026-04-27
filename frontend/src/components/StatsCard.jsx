import { Flame, Trophy } from "lucide-react";
import { getTier, progressToNext } from "@/lib/tiers";

/**
 * Compact stats card showing points, streak and tier.
 * Used inside MyProfileBanner for students.
 */
export default function StatsCard({ stats }) {
  if (!stats) return null;
  const points = stats.points || 0;
  const tier = getTier(points);
  const pct = Math.round(progressToNext(points) * 100);
  const streak = stats.streak_count || 0;
  const longest = stats.longest_streak || 0;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full" data-testid="stats-card">
      <div className={`nb-card p-3 ${tier.bg}`} data-testid="stats-tier">
        <div className="flex items-center gap-2">
          <span className="text-2xl leading-none">{tier.emoji}</span>
          <div className="min-w-0">
            <div className={`text-[10px] font-bold uppercase tracking-wider ${tier.text} opacity-80`}>Patente</div>
            <div className={`font-heading font-black text-base leading-tight truncate ${tier.text}`}>{tier.name}</div>
          </div>
        </div>
        {tier.next && (
          <div className="mt-2">
            <div className="h-1.5 border border-black rounded-full overflow-hidden bg-white/40">
              <div className="h-full bg-emerald-400" style={{ width: `${pct}%` }} />
            </div>
            <div className={`text-[10px] mt-1 font-medium ${tier.text}`}>
              {tier.next.threshold - points} pts para {tier.next.name}
            </div>
          </div>
        )}
      </div>
      <div className="nb-card p-3 bg-amber-200" data-testid="stats-points">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5" strokeWidth={2.5} />
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider opacity-70">Pontos</div>
            <div className="font-heading font-black text-2xl leading-tight">{points}</div>
          </div>
        </div>
      </div>
      <div className="nb-card p-3 bg-orange-200" data-testid="stats-streak">
        <div className="flex items-center gap-2">
          <Flame className="w-5 h-5" strokeWidth={2.5} />
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider opacity-70">Sequência</div>
            <div className="font-heading font-black text-2xl leading-tight">{streak}🔥</div>
            {longest > streak && (
              <div className="text-[10px] opacity-70">Recorde: {longest}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
