/**
 * AI Narration & Interpretation Panel (Gemini @google/genai Tool-Calling Layer)
 */

import React, { useState, useEffect } from 'react';
import { OptionChainSnapshot, AiNarrationResponse } from '../types.js';
import { Cpu, Sparkles, Send, ShieldAlert, CheckCircle2, TrendingUp, Layers } from 'lucide-react';
import { apiFetch } from '../lib/api.js';

interface AiNarrationPanelProps {
  snapshot: OptionChainSnapshot | null;
}

export const AiNarrationPanel: React.FC<AiNarrationPanelProps> = ({ snapshot }) => {
  const [userPrompt, setUserPrompt] = useState('');
  const [narration, setNarration] = useState<AiNarrationResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleGenerate = async (prompt?: string) => {
    setIsLoading(true);
    try {
      const res = await apiFetch('/api/ai/narrate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: snapshot?.symbol || 'NIFTY',
          userPrompt: prompt || userPrompt
        })
      });
      const data: AiNarrationResponse = await res.json();
      setNarration(data);
    } catch (e) {
      console.error('Error generating AI narration:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    handleGenerate();
  }, [snapshot?.symbol]);

  return (
    <div className="space-y-6 font-mono text-xs">
      {/* Top Banner */}
      <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 space-y-3 shadow-xl">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl shadow-lg">
            <Cpu className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
              <span>AI Market Interpretation & Narration Engine</span>
              <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 px-2 py-0.5 rounded">
                "Algo First, AI Second" Architecture
              </span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Powered by server-side Gemini 3.6 Flash with function calling to translate deterministic math into human commentary.
            </p>
          </div>
        </div>

        {/* Prompt Input Form */}
        <div className="flex gap-2 pt-2">
          <input
            type="text"
            value={userPrompt}
            onChange={(e) => setUserPrompt(e.target.value)}
            placeholder={`Ask a question e.g. "What is the option sentiment for ${snapshot?.symbol || 'NIFTY'} around Max Pain?"`}
            className="flex-1 bg-slate-950 text-slate-100 border border-slate-700 px-4 py-2.5 rounded-xl focus:outline-none focus:border-emerald-500 text-xs"
            onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
          />
          <button
            onClick={() => handleGenerate()}
            disabled={isLoading}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-5 py-2.5 rounded-xl flex items-center space-x-2 transition shadow-lg disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            <span>{isLoading ? 'Analyzing...' : 'Ask AI'}</span>
          </button>
        </div>
      </div>

      {/* AI Analysis Cards */}
      {narration && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Executive Market Summary */}
          <div className="md:col-span-2 bg-slate-900 p-5 rounded-xl border border-slate-800 space-y-4 shadow-xl">
            <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center space-x-2">
              <Sparkles className="w-4 h-4" />
              <span>Executive Market Structure & Narrative</span>
            </h4>

            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 text-slate-200 leading-relaxed text-xs">
              {narration.summary}
            </div>

            <div className="space-y-2">
              <h5 className="font-bold text-slate-300">Greeks & Market Structure Assessment:</h5>
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 text-slate-400 leading-normal text-[11px]">
                {narration.marketStructure}
              </div>
            </div>

            <div className="space-y-2">
              <h5 className="font-bold text-slate-300">Actionable Trade Insights:</h5>
              <div className="space-y-1.5">
                {narration.actionableInsights.map((insight, idx) => (
                  <div key={idx} className="bg-slate-950 p-2.5 rounded-lg border border-slate-800 text-slate-300 text-[11px] flex items-start space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>{insight}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Key Risk Levels & Anchor Points */}
          <div className="bg-slate-900 p-5 rounded-xl border border-slate-800 space-y-4 shadow-xl">
            <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center space-x-2">
              <ShieldAlert className="w-4 h-4" />
              <span>Key Risk Levels & Anchors</span>
            </h4>

            <div className="space-y-3 font-mono">
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase">Max Pain Anchor</div>
                <div className="text-xl font-black text-cyan-300 mt-1">₹{narration.keyRiskLevels.maxPain}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Primary pin strike expectation at expiry</div>
              </div>

              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase">Estimated Resistance</div>
                <div className="text-xl font-black text-rose-400 mt-1">₹{narration.keyRiskLevels.resistance}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Call OI buildup ceiling boundary</div>
              </div>

              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                <div className="text-[10px] text-slate-400 uppercase">Estimated Support</div>
                <div className="text-xl font-black text-emerald-400 mt-1">₹{narration.keyRiskLevels.support}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Put OI buildup floor boundary</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
