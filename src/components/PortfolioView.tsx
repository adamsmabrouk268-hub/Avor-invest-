import React, { useState } from 'react';
import { Investment, Currency, User } from '../types';
import { CURRENCY_MAP } from '../data/defaultMachines';
import {
  TrendingUp,
  Clock,
  Zap,
  CheckCircle2,
  Calendar,
  AlertCircle,
  Coins,
  Cpu,
  ArrowRight,
} from 'lucide-react';

interface PortfolioViewProps {
  user: User | null;
  investments: Investment[];
  currency: Currency;
  onClaimYield: (investmentId?: string) => Promise<void>;
  onExploreClick: () => void;
  onOpenWallet: () => void;
}

export const PortfolioView: React.FC<PortfolioViewProps> = ({
  user,
  investments,
  currency,
  onClaimYield,
  onExploreClick,
  onOpenWallet,
}) => {
  const currencyInfo = CURRENCY_MAP[currency];
  const [isClaiming, setIsClaiming] = useState<boolean>(false);
  const [claimedMessage, setClaimedMessage] = useState<string | null>(null);

  const activeInvs = investments.filter((i) => i.status === 'ACTIVE');
  const completedInvs = investments.filter((i) => i.status === 'PAYOUT_COMPLETE');

  const totalInvested = investments.reduce((sum, i) => sum + i.amount_invested, 0);
  const totalExpectedPayout = activeInvs.reduce((sum, i) => sum + (i.total_expected_return || i.total_return || 0), 0);
  const totalUnclaimed = investments.reduce((sum, i) => sum + (i.unclaimed_earnings || 0), 0);
  const totalClaimed = investments.reduce((sum, i) => sum + i.total_claimed, 0);

  const handleClaimAll = async () => {
    if (totalUnclaimed <= 0) return;
    setIsClaiming(true);
    try {
      await onClaimYield();
      setClaimedMessage(`Successfully collected ${currencyInfo.format(totalUnclaimed)} into your balance!`);
      setTimeout(() => setClaimedMessage(null), 4000);
    } catch (err: any) {
      console.error(err);
    } finally {
      setIsClaiming(false);
    }
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Portfolio Header Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Wallet Balance */}
        <div className="bg-slate-900 text-white p-5 rounded-3xl border border-slate-800 shadow-md relative overflow-hidden">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs text-slate-400 font-medium">Available Balance</p>
              <h3 className="text-2xl font-black text-white mt-1">
                {user ? currencyInfo.format(user.balance) : currencyInfo.format(0)}
              </h3>
            </div>
            <button
              onClick={onOpenWallet}
              className="p-2 bg-sky-500 text-slate-950 rounded-xl hover:bg-sky-400 font-bold transition-all text-xs"
            >
              Deposit / Cashout
            </button>
          </div>
          <p className="text-[11px] text-sky-400 mt-3 font-semibold">Ready for reinvestment or cashout</p>
        </div>

        {/* Total Invested */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-xs">
          <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Active Investment</p>
          <h3 className="text-2xl font-black text-slate-900 mt-1">
            {currencyInfo.format(totalInvested)}
          </h3>
          <p className="text-[11px] text-slate-500 mt-3 flex items-center space-x-1">
            <Cpu className="w-3.5 h-3.5 text-sky-600" />
            <span>{activeInvs.length} Active Machine Node{activeInvs.length !== 1 ? 's' : ''}</span>
          </p>
        </div>

        {/* Expected Returns After Lock */}
        <div className="bg-white p-5 rounded-3xl border border-slate-200/90 shadow-xs">
          <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider">Maturity Returns</p>
          <h3 className="text-2xl font-black text-emerald-600 mt-1">
            {currencyInfo.format(totalExpectedPayout)}
          </h3>
          <p className="text-[11px] text-emerald-600 font-medium mt-3 flex items-center space-x-1">
            <Zap className="w-3.5 h-3.5" />
            <span>Paid upon duration lock maturity</span>
          </p>
        </div>

        {/* Claimable Earnings Card */}
        <div className="bg-gradient-to-br from-sky-500 to-sky-600 text-white p-5 rounded-3xl shadow-lg shadow-sky-500/20 flex flex-col justify-between">
          <div>
            <p className="text-xs text-sky-100 font-semibold uppercase tracking-wider">Claimable Yield Vault</p>
            <h3 className="text-2xl font-black text-white mt-1">
              {currencyInfo.format(totalUnclaimed)}
            </h3>
          </div>

          <button
            onClick={handleClaimAll}
            disabled={totalUnclaimed <= 0 || isClaiming}
            className="w-full mt-3 bg-slate-950 hover:bg-slate-900 disabled:opacity-50 text-white text-xs font-black py-2.5 px-3 rounded-xl transition-all shadow-md flex items-center justify-center space-x-1.5 cursor-pointer"
          >
            <Coins className="w-4 h-4 text-blue-300" />
            <span>{isClaiming ? 'Claiming...' : 'Claim All Yield Now'}</span>
          </button>
        </div>
      </div>

      {claimedMessage && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-2xl flex items-center space-x-3 text-xs font-bold animate-bounce">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{claimedMessage}</span>
        </div>
      )}

      {/* Active Investments List */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <h2 className="text-lg font-black text-slate-900">My Machine Hardware Units</h2>
            <p className="text-xs text-slate-500">Track active machine yields, durations, and payout schedules.</p>
          </div>

          <button
            onClick={onExploreClick}
            className="bg-slate-900 text-white text-xs font-bold py-2.5 px-4 rounded-xl hover:bg-slate-800 transition-all flex items-center space-x-2"
          >
            <span>Buy More Machines</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {investments.length === 0 ? (
          <div className="text-center py-12 space-y-4">
            <div className="w-16 h-16 bg-sky-50 text-sky-500 rounded-full flex items-center justify-center mx-auto">
              <Cpu className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">No Active Machine Units</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1">
                You haven't bought any Avor Invest units yet. Browse the marketplace to start receiving daily returns!
              </p>
            </div>
            <button
              onClick={onExploreClick}
              className="bg-sky-500 hover:bg-sky-600 text-white text-xs font-bold py-3 px-6 rounded-xl shadow-md transition-all cursor-pointer"
            >
              Buy Machine Unit
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {investments.map((inv) => {
              const isPending = inv.status === 'PENDING';
              const daysElapsed = isPending ? 0 : inv.days_elapsed;
              const progressPct = isPending
                ? 0
                : Math.min(100, Math.round((daysElapsed / inv.duration_days) * 100));
              const totalPayoutAfterLock = inv.total_expected_return || (inv.daily_yield * inv.duration_days);

              return (
                <div
                  key={inv.id}
                  className="bg-slate-50/80 border border-slate-200/80 p-5 rounded-2xl flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:border-sky-300 transition-all"
                >
                  {/* Left Specs */}
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="bg-sky-500 text-slate-950 text-[10px] font-black px-2 py-0.5 rounded font-mono">
                        {inv.series_tag}
                      </span>
                      <span className="text-sm font-black text-slate-900">{inv.machine_title}</span>
                      {isPending && (
                        <span className="bg-amber-100 text-amber-800 border border-amber-300 text-[10px] font-black px-2 py-0.5 rounded-full font-mono uppercase">
                          Pending Admin Confirmation
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-500 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span>Buy Price: <strong className="text-slate-800">{currencyInfo.format(inv.amount_invested)}</strong></span>
                      <span>•</span>
                      <span className="text-emerald-700 font-bold bg-emerald-100/80 px-1.5 py-0.5 rounded font-mono text-[11px]">
                        Receive After Lock: {currencyInfo.format(totalPayoutAfterLock)}
                      </span>
                    </p>

                    <p className="text-xs text-slate-500 flex items-center space-x-1">
                      <Calendar className="w-3.5 h-3.5 text-sky-600" />
                      <span>
                        {isPending
                          ? `Lock Duration: 0 / ${inv.duration_days} Days (Waiting for Admin to confirm payment)`
                          : `Lock Duration: ${daysElapsed} / ${inv.duration_days} Days Completed`}
                      </span>
                    </p>
                  </div>

                  {/* Progress Bar */}
                  <div className="flex-1 max-w-xs space-y-1">
                    <div className="flex justify-between text-[11px] font-bold text-slate-600">
                      <span>{isPending ? 'Pending Confirmation' : 'Contract Cycle'}</span>
                      <span>{progressPct}%</span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isPending ? 'bg-amber-400' : 'bg-sky-500'
                        }`}
                        style={{ width: `${progressPct}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Right Yield & Claim button */}
                  <div className="flex items-center justify-between lg:justify-end gap-4 border-t lg:border-t-0 pt-3 lg:pt-0 border-slate-200">
                    <div className="text-left lg:text-right">
                      <p className="text-[10px] text-slate-500 uppercase font-semibold">Unclaimed Yield</p>
                      <p className="text-base font-black text-emerald-600">
                        {currencyInfo.format(isPending ? 0 : inv.unclaimed_earnings || 0)}
                      </p>
                    </div>

                    <button
                      onClick={() => onClaimYield(inv.id)}
                      disabled={isPending || !inv.unclaimed_earnings || inv.unclaimed_earnings <= 0 || isClaiming}
                      className="bg-sky-500 hover:bg-sky-600 disabled:opacity-40 text-white font-bold text-xs py-2.5 px-4 rounded-xl shadow-xs transition-all cursor-pointer"
                    >
                      {isPending ? 'Pending' : 'Collect Yield'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
