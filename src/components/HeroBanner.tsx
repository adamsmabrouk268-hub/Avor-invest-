import React from 'react';
import { Currency } from '../types';
import { CURRENCY_MAP } from '../data/defaultMachines';
import { Zap, ShieldCheck, TrendingUp, Award, ArrowRight, CheckCircle2 } from 'lucide-react';

interface HeroBannerProps {
  currency: Currency;
  stats: {
    total_invested: number;
    total_payouts_delivered: number;
    active_machines_count: number;
    total_investors_count: number;
  };
  onExploreClick: () => void;
  onOpenCalculator: () => void;
}

export const HeroBanner: React.FC<HeroBannerProps> = ({
  currency,
  stats,
  onExploreClick,
  onOpenCalculator,
}) => {
  const currencyInfo = CURRENCY_MAP[currency];

  return (
    <div className="relative overflow-hidden bg-transparent border-b border-blue-950/80 pt-8 pb-12">
      {/* Grid Pattern Background */}
      <div
        className="absolute inset-0 opacity-15 pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(#2563eb 1px, transparent 1px)`,
          backgroundSize: '24px 24px',
        }}
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left Hero Text */}
          <div className="lg:col-span-7 space-y-6 text-left">
            <div className="inline-flex items-center space-x-2 bg-blue-950/70 border border-blue-500/40 text-blue-300 text-xs font-bold px-3 py-1.5 rounded-full shadow-xs">
              <Zap className="w-4 h-4 text-blue-400 animate-bounce" />
              <span>AVOR INVEST OFFICIAL EQUIPMENT MARKETPLACE</span>
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shadow-xs shadow-blue-400"></span>
              <span className="text-white font-extrabold">SERIES AV1, AV2, AV3 & VIP CLASS A–E</span>
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-tight">
              Invest in High-Performance <span className="text-blue-400">Avor Invest Machines</span> & Computing Nodes.
            </h1>

            <p className="text-slate-300 text-sm sm:text-base leading-relaxed font-normal max-w-2xl">
              Buy hardware units from <strong className="text-white">AV1</strong>, <strong className="text-white">AV2</strong>, up to <strong className="text-white">AV Class A through I</strong>. 
              Lease compute capacity at <span className="font-bold text-white">{currencyInfo.format(35000)}</span> for 18 days giving back <span className="font-bold text-blue-300">{currencyInfo.format(50000)}</span>.
            </p>

            {/* Feature Highlights */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
              <div className="flex items-center space-x-2 text-xs font-semibold text-white shining-card p-2.5 rounded-xl border border-blue-950/80">
                <CheckCircle2 className="w-4 h-4 text-blue-400 shrink-0" />
                <span>Daily Payout Vault</span>
              </div>
              <div className="flex items-center space-x-2 text-xs font-semibold text-white shining-card p-2.5 rounded-xl border border-blue-950/80">
                <ShieldCheck className="w-4 h-4 text-sky-400 shrink-0" />
                <span>Automated Timelocks</span>
              </div>
              <div className="flex items-center space-x-2 text-xs font-semibold text-white shining-card p-2.5 rounded-xl border border-blue-950/80">
                <Award className="w-4 h-4 text-blue-400 shrink-0" />
                <span>10% Referral Gifts</span>
              </div>
            </div>

            {/* CTAs */}
            <div className="flex flex-wrap gap-4 pt-2">
              <button
                onClick={onExploreClick}
                className="bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-800 hover:from-blue-500 hover:to-blue-700 text-white text-sm font-black py-3.5 px-6 rounded-2xl shadow-xl shadow-blue-900/40 transition-all flex items-center space-x-2 cursor-pointer border border-blue-400/40"
              >
                <span>Browse Machine Series</span>
                <ArrowRight className="w-4 h-4 text-white" />
              </button>

              <button
                onClick={onOpenCalculator}
                className="shining-card text-white hover:text-blue-300 hover:border-blue-500/50 text-sm font-bold py-3.5 px-6 rounded-2xl transition-all flex items-center space-x-2 cursor-pointer border border-blue-900/50"
              >
                <TrendingUp className="w-4 h-4 text-blue-400" />
                <span>Calculate My Yield</span>
              </button>
            </div>
          </div>

          {/* Right Stats & Highlights Box */}
          <div className="lg:col-span-5">
            <div className="shining-card-glow text-white p-6 sm:p-8 rounded-3xl shadow-2xl relative overflow-hidden border border-blue-900/60">
              {/* Glow Accent */}
              <div className="absolute -right-12 -top-12 w-40 h-40 bg-blue-600/20 rounded-full blur-2xl pointer-events-none"></div>

              <div className="flex items-center justify-between pb-6 border-b border-blue-950/80">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-2xl bg-[#081126] flex items-center justify-center font-bold text-white border border-blue-900/50">
                    <ShieldCheck className="w-5 h-5 text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold tracking-tight text-white">Live Node Network</h3>
                    <p className="text-[10px] text-blue-300 font-mono">AV1 · AV2 · AV3 · VIP CLASS A–E</p>
                  </div>
                </div>
                <span className="text-[10px] bg-blue-950/70 text-blue-300 font-mono font-bold px-2.5 py-1 rounded-full border border-blue-500/40">
                  Active 24/7
                </span>
              </div>

              {/* Numbers Grid */}
              <div className="grid grid-cols-2 gap-4 py-6">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Total Funded</span>
                  <span className="text-xl sm:text-2xl font-black font-mono tracking-tight text-white block mt-1">
                    {currencyInfo.format(stats.total_invested || 48500000)}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Payouts Delivered</span>
                  <span className="text-xl sm:text-2xl font-black font-mono tracking-tight text-blue-400 block mt-1">
                    {currencyInfo.format(stats.total_payouts_delivered || 29800000)}
                  </span>
                </div>

                <div className="pt-2">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Live Machines</span>
                  <span className="text-xl sm:text-2xl font-black font-mono tracking-tight text-white block mt-1">
                    {(stats.active_machines_count || 10).toLocaleString()} Nodes
                  </span>
                </div>

                <div className="pt-2">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">Active Investors</span>
                  <span className="text-xl sm:text-2xl font-black font-mono tracking-tight text-blue-400 block mt-1">
                    {(stats.total_investors_count || 1420).toLocaleString()}+
                  </span>
                </div>
              </div>

              {/* Verified Badge Bottom Bar */}
              <div className="pt-4 border-t border-blue-950/80 flex items-center justify-between text-xs text-slate-300 font-mono">
                <div className="flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></span>
                  <span>99.9% Grid SLA Uptime</span>
                </div>
                <span className="text-blue-400 font-bold">100% Backed Rigs</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
