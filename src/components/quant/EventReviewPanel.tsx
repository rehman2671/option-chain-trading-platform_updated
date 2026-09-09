import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Clock,
  FileCheck2,
  AlertCircle,
  TrendingUp,
  Activity,
  ShieldCheck,
  CheckCircle,
  XCircle,
  HelpCircle
} from 'lucide-react';
import { MarketEventItem, TimeOfDayEdgeProfile, TradeReviewRecord, DataQualityReport } from '../../quant/types';

interface Props {
  underlying: string;
}

export const EventReviewPanel: React.FC<Props> = ({ underlying }) => {
  const [events, setEvents] = useState<MarketEventItem[]>([]);
  const [currentTimeProfile, setCurrentTimeProfile] = useState<TimeOfDayEdgeProfile | null>(null);
  const [allTimeProfiles, setAllTimeProfiles] = useState<TimeOfDayEdgeProfile[]>([]);
  const [reviews, setReviews] = useState<TradeReviewRecord[]>([]);
  const [dataQuality, setDataQuality] = useState<DataQualityReport | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [eventsRes, reviewsRes, dqRes] = await Promise.all([
        fetch('/api/quant/events'),
        fetch('/api/quant/trade-reviews'),
        fetch(`/api/quant/data-quality?underlying=${underlying}`)
      ]);

      if (eventsRes.ok) {
        const d = await eventsRes.json();
        setEvents(d.events || []);
        setCurrentTimeProfile(d.currentTimeProfile || null);
        setAllTimeProfiles(d.allTimeProfiles || []);
      }
      if (reviewsRes.ok) setReviews(await reviewsRes.json());
      if (dqRes.ok) setDataQuality(await dqRes.json());
    } catch (err) {
      console.error('Error fetching event review data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [underlying]);

  return (
    <div className="space-y-6 font-mono">
      {/* Real-time Data Quality & Ingestion Health (Section 11) */}
      {dataQuality && (
        <div className="p-4 bg-slate-900/90 border border-slate-800 rounded-2xl space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-bold text-white flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-cyan-400" />
              <span>Real-Time Ingestion & Data Quality Engine (Section 11)</span>
            </span>
            <div className="flex items-center space-x-2">
              <span className="text-xs text-slate-400">Broker Latency: <strong className="text-white">{dataQuality.latencyMs}ms</strong></span>
              <span
                className={`px-2.5 py-0.5 rounded text-xs font-bold ${
                  dataQuality.score >= 85
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                }`}
              >
                Quality Score: {dataQuality.score}/100 ({dataQuality.status})
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-xs">
            {Object.entries(dataQuality.checks).map(([key, passed]) => (
              <div key={key} className="p-2.5 bg-slate-950 rounded-xl border border-slate-800/80 flex items-center justify-between">
                <span className="text-slate-400 capitalize truncate mr-2">
                  {key.replace(/([A-Z])/g, ' $1').trim()}
                </span>
                {passed ? (
                  <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                )}
              </div>
            ))}
          </div>

          {dataQuality.warnings && dataQuality.warnings.length > 0 && (
            <div className="text-[11px] text-amber-300 bg-amber-950/30 p-2 rounded-lg border border-amber-500/30">
              Warnings: {dataQuality.warnings.join(' • ')}
            </div>
          )}
        </div>
      )}

      {/* Upcoming Event Calendar (Section 36) */}
      <div className="p-5 bg-slate-900/90 border border-slate-800 rounded-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <Calendar className="w-4 h-4 text-cyan-400" />
              <span>Event Risk Calendar & Implied Volatility Premium (Section 36)</span>
            </h3>
            <p className="text-xs text-slate-400">
              Macro events trigger pre-event IV expansion and post-event IV crush. Trading restrictions enforced automatically.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          {events.map((evt) => (
            <div key={evt.id} className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-400">{evt.date}</span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    evt.impactLevel === 'EXTREME'
                      ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                      : evt.impactLevel === 'HIGH'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                  }`}
                >
                  {evt.impactLevel}
                </span>
              </div>

              <div className="font-bold text-white text-xs leading-snug">{evt.name}</div>

              <div className="space-y-1 text-[11px] bg-slate-900/70 p-2 rounded-lg border border-slate-800/60">
                <div className="flex justify-between">
                  <span className="text-slate-400">IV Premium:</span>
                  <span className="text-purple-300 font-bold">+{evt.impliedVolPremiumPct}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Restriction:</span>
                  <span className="text-rose-300 font-bold">{evt.tradingRestriction}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Time of Day Research Edge Matrix (Section 37) */}
      <div className="p-5 bg-slate-900/90 border border-slate-800 rounded-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <Clock className="w-4 h-4 text-purple-400" />
              <span>Time-of-Day Execution Edge Matrix (Section 37)</span>
            </h3>
            <p className="text-xs text-slate-400">
              Empirical historical win rates and market dynamics across 8 dedicated intraday time windows.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {allTimeProfiles.map((tp) => {
            const isCurrent = currentTimeProfile?.timeWindow === tp.timeWindow;
            return (
              <div
                key={tp.timeWindow}
                className={`p-3.5 bg-slate-950 border rounded-xl space-y-2 transition ${
                  isCurrent ? 'border-cyan-500 bg-cyan-950/20' : 'border-slate-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-cyan-300">{tp.timeWindow}</span>
                  {isCurrent && (
                    <span className="px-1.5 py-0.5 bg-cyan-500 text-slate-950 rounded text-[9px] font-bold">
                      ACTIVE NOW
                    </span>
                  )}
                </div>

                <div className="text-[11px] text-slate-300 leading-tight">{tp.characteristic}</div>

                <div className="space-y-1 text-[11px] bg-slate-900/60 p-2 rounded-lg border border-slate-800/60">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Win Rate:</span>
                    <span className={`font-bold ${tp.historicalWinRatePct >= 65 ? 'text-emerald-400' : 'text-slate-300'}`}>
                      {tp.historicalWinRatePct}%
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Avg Move:</span>
                    <span className="text-white font-bold">{tp.avgMovePoints} pts</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Optimal:</span>
                    <span className="text-purple-300 truncate max-w-[120px]">{tp.recommendedStrategyFamily}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Trade Review Engine & Post-Mortems (Section 52) */}
      <div className="p-5 bg-slate-900/90 border border-slate-800 rounded-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center space-x-2">
              <FileCheck2 className="w-4 h-4 text-emerald-400" />
              <span>Immutable Trade Review & Post-Mortem Ledger (Section 52)</span>
            </h3>
            <p className="text-xs text-slate-400">
              Systematic post-trade audit tracking thesis validity, execution slippage, MFE, MAE, and qualitative lessons.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {reviews.map((rev) => (
            <div
              key={rev.tradeId}
              className="p-4 bg-slate-950 border border-slate-800 rounded-xl text-xs space-y-2.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-white">{rev.symbol}</span>
                  <span className="text-slate-400">({rev.strategyName} v{rev.strategyVersion})</span>
                </div>
                <div className="flex items-center space-x-3">
                  <span className="text-slate-400">
                    Slippage: <strong className="text-rose-400">₹{rev.slippageIncurred}</strong>
                  </span>
                  <span
                    className={`font-bold ${
                      rev.netPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {rev.netPnl >= 0 ? '+' : ''}₹{rev.netPnl.toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-slate-300">
                <div className="space-y-1">
                  <div>
                    <strong className="text-slate-400">Entry Thesis: </strong>
                    <span>{rev.entryThesis}</span>
                  </div>
                  <div>
                    <strong className="text-slate-400">Exit Reason: </strong>
                    <span>{rev.exitReason}</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex space-x-4">
                    <span>
                      MFE: <strong className="text-emerald-400">+{rev.maxFavorableExcursionR}R</strong>
                    </span>
                    <span>
                      MAE: <strong className="text-rose-400">{rev.maxAdverseExcursionR}R</strong>
                    </span>
                    <span>
                      Thesis Valid:{' '}
                      <strong className={rev.thesisWasCorrect ? 'text-emerald-400' : 'text-rose-400'}>
                        {rev.thesisWasCorrect ? 'YES' : 'NO'}
                      </strong>
                    </span>
                  </div>
                  <div>
                    <strong className="text-cyan-400">Lesson Learned: </strong>
                    <span className="italic text-slate-300">{rev.lessonsLearned}</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
