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
  RefreshCw,
  Lock,
} from 'lucide-react';

interface IncomePlaneViewProps {
  user: User | null;
  investments: Investment[];
  currency: Currency;
  onClaimYield: (investmentId?: string) => Promise<void>;
  onNavigateToMarketplace: () => void;
  onOpenAuth: () => void;
  onRefresh?: () => Promise<void> | void;
}

export const IncomePlaneView: React.FC<IncomePlaneViewProps> = ({
  user,
  investments,
  currency,
  onClaimYield,
  onNavigateToMarketplace,
  onOpenAuth,
  onRefresh,
}) => {
  const currencyInfo = CURRENCY_MAP[currency];
  const [isClaiming, setIsClaiming] = useState<boolean>(false);
  const [claimingInvId, setClaimingInvId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'PENDING' | 'ACTIVE' | 'COMPLETED'>('ALL');
  const [feedbackBanner, setFeedbackBanner] = useState<{
    type: 'success' | 'info';
    text: string;
  } | null>(null);

  const pendingInvs = investments.filter((i) => i.status === 'PENDING');
  const activeInvs = investments.filter((i) => i.status === 'ACTIVE');
  const completedInvs = investments.filter((i) => i.status === 'PAYOUT_COMPLETE');
  const hasConfirmedMachine =
    activeInvs.length > 0 ||
    completedInvs.length > 0 ||
    !!user?.has_bought_machine ||
    (user?.balance || 0) > 0;

  const filteredInvestments = investments.filter((inv) => {
    if (filterStatus === 'PENDING') return inv.status === 'PENDING';
    if (filterStatus === 'ACTIVE') return inv.status === 'ACTIVE';
    if (filterStatus === 'COMPLETED') return inv.status === 'PAYOUT_COMPLETE';
    return true;
  });

  const totalInvested = [...activeInvs, ...completedInvs].reduce((sum, i) => sum + i.amount_invested, 0);
  const totalExpectedReturn = [...activeInvs, ...completedInvs].reduce((sum, i) => sum + (i.total_return || 0), 0);
  const totalUnclaimed = activeInvs.reduce((sum, i) => sum + (i.unclaimed_earnings || 0), 0);
  const totalDailyYield = activeInvs.reduce((sum, i) => sum + (i.daily_yield || 0), 0);

  const getHoursUntilNextPayout = (lastClaimIso?: string) => {
    if (!lastClaimIso) return { hours: 24, minutes: 0 };
    const lastTime = new Date(lastClaimIso).getTime();
    const nextTime = lastTime + 24 * 60 * 60 * 1000;
    const diffMs = Math.max(0, nextTime - Date.now());
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    return { hours, minutes };
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      if (onRefresh) {
        await onRefresh();
      }
      setFeedbackBanner({
        type: 'info',
        text: `Income Plane synced! Active machines: ${activeInvs.length}, Pending confirmation: ${pendingInvs.length}, Daily yield rate: ${currencyInfo.format(totalDailyYield)}/day.`,
      });
      setTimeout(() => setFeedbackBanner(null), 4500);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleClaimAll = async () => {
    if (!user) {
      onOpenAuth();
      return;
    }
    if (!hasConfirmedMachine) {
      setFeedbackBanner({
        type: 'info',
        text:
          pendingInvs.length > 0
            ? '🔒 Plane Locked: Your machine payment is still awaiting Admin confirmation. The machine will only start running (Day 1) after Admin confirms your payment.'
            : '🔒 Plane Locked: You cannot access closed or locked planes until you buy a machine and Admin confirms your payment.',
      });
      setTimeout(() => setFeedbackBanner(null), 5000);
      return;
    }
    if (totalUnclaimed <= 0) {
      const nextPayout = getHoursUntilNextPayout(activeInvs[0]?.last_claim_at);
      setFeedbackBanner({
        type: 'info',
        text: `Next daily yield of ${currencyInfo.format(totalDailyYield)} is accruing and will unlock in ${nextPayout.hours}h ${nextPayout.minutes}m.`,
      });
      setTimeout(() => setFeedbackBanner(null), 5000);
      return;
    }
    if (isClaiming) return;
    setIsClaiming(true);
    try {
      await onClaimYield();
      setFeedbackBanner({
        type: 'success',
        text: `Successfully collected ${currencyInfo.format(totalUnclaimed)} into your balance!`,
      });
      setTimeout(() => setFeedbackBanner(null), 4500);
    } catch (err: any) {
      console.error('Claim error:', err);
    } finally {
      setIsClaiming(false);
    }
  };

  const handleClaimSingle = async (inv: Investment) => {
    if (!user) {
      onOpenAuth();
      return;
    }
    if (inv.status === 'PENDING') {
      setFeedbackBanner({
        type: 'info',
        text: `🔒 ${inv.machine_title} is locked on PENDING (Day 0 of ${inv.duration_days}). Only after Admin confirms your payment will the machine start running.`,
      });
      setTimeout(() => setFeedbackBanner(null), 5000);
      return;
    }
    if ((inv.unclaimed_earnings || 0) <= 0) {
      const nextPayout = getHoursUntilNextPayout(inv.last_claim_at);
      setFeedbackBanner({
        type: 'info',
        text: `${inv.machine_title}: Daily yield of ${currencyInfo.format(inv.daily_yield)} is accruing (${nextPayout.hours}h ${nextPayout.minutes}m until next 24h payout cycle).`,
      });
      setTimeout(() => setFeedbackBanner(null), 5000);
      return;
    }
    if (isClaiming || claimingInvId) return;
    setClaimingInvId(inv.id);
    try {
      await onClaimYield(inv.id);
      setFeedbackBanner({
        type: 'success',
        text: `Collected ${currencyInfo.format(inv.unclaimed_earnings)} from ${inv.machine_title} into your balance!`,
      });
      setTimeout(() => setFeedbackBanner(null), 4500);
    } catch (err: any) {
      console.error('Claim single error:', err);
    } finally {
      setClaimingInvId(null);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto text-white animate-fade-in pb-12">
      {/* 1. Header Banner */}
      <div className="relative shining-card rounded-3xl p-6 sm:p-8 overflow-hidden shadow-2xl border border-blue-900/60 bg-gradient-to-r from-[#061226]/90 via-[#0a1e3d]/85 to-[#051122]/90 backdrop-blur-xl">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyan-400 via-blue-500 to-indigo-600" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-10">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 px-3 py-1 rounded-full text-xs font-mono font-bold uppercase tracking-wider">
              {hasConfirmedMachine ? (
                <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
              ) : (
                <Lock className="w-3.5 h-3.5 text-amber-400" />
              )}
              <span>
                {hasConfirmedMachine
                  ? 'Avor invest Hardware Payout Tracker'
                  : 'Plane Locked • Admin Payment Confirmation Required'}
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-2.5">
              <span>Income</span>
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-400">Plane</span>
              {!hasConfirmedMachine && (
                <span className="text-xs font-mono font-extrabold bg-rose-950/85 text-rose-300 border border-rose-500/60 px-2.5 py-1 rounded-full inline-flex items-center gap-1">
                  <Lock className="w-3.5 h-3.5 text-rose-400" />
                  <span>Locked</span>
                </span>
              )}
            </h1>

            <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
              Track all <strong>machines bought</strong>, monitor live 24-hour yield cycles, and collect your daily returns directly into your balance.{' '}
              <strong className="text-amber-300">
                No machine starts running and no closed/locked plane unlocks until Admin confirms your payment.
              </strong>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isRefreshing}
              className="px-4 py-3 bg-[#091834] hover:bg-[#0e244d] text-cyan-300 font-bold text-xs rounded-xl border border-cyan-500/40 transition-all flex items-center gap-2 cursor-pointer active:scale-95"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>{isRefreshing ? 'Syncing...' : 'Sync Yield'}</span>
            </button>

            <button
              type="button"
              onClick={onNavigateToMarketplace}
              className="px-5 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-cyan-900/40 transition-all flex items-center gap-2 cursor-pointer border border-cyan-400/40 hover:scale-105 active:scale-95"
            >
              <Cpu className="w-4 h-4 text-white" />
              <span>Buy Machines</span>
              <ArrowRight className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>

        {/* Core Stats Overview Strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-6 pt-5 border-t border-blue-950/80 font-mono text-xs">
          <div className="bg-[#050c1c]/80 p-3.5 rounded-xl border border-blue-900/40">
            <span className="text-slate-400 text-[11px] uppercase tracking-wider font-sans font-bold block">
              Active Running Units
            </span>
            <span className="text-lg sm:text-xl font-black text-white mt-1 block">
              {activeInvs.length} Running
            </span>
            <span className="text-[10px] text-cyan-400">
              {pendingInvs.length} pending Admin confirm · {completedInvs.length} completed
            </span>
          </div>

          <div className="bg-[#050c1c]/80 p-3.5 rounded-xl border border-blue-900/40">
            <span className="text-slate-400 text-[11px] uppercase tracking-wider font-sans font-bold block">
              Daily Yield Rate
            </span>
            <span className="text-lg sm:text-xl font-black text-[#a3e635] mt-1 block">
              {currencyInfo.format(totalDailyYield)}
            </span>
            <span className="text-[10px] text-slate-400">Confirmed Invested: {currencyInfo.format(totalInvested)}</span>
          </div>

          <div className="bg-[#050c1c]/80 p-3.5 rounded-xl border border-blue-900/40">
            <span className="text-slate-400 text-[11px] uppercase tracking-wider font-sans font-bold block">
              Total Returns at Maturity
            </span>
            <span className="text-lg sm:text-xl font-black text-emerald-400 mt-1 block">
              {currencyInfo.format(totalExpectedReturn)}
            </span>
            <span className="text-[10px] text-emerald-400/90">Confirmed running contracts</span>
          </div>

          <div className="bg-[#050c1c]/80 p-3.5 rounded-xl border border-blue-900/40 flex flex-col justify-between">
            <div>
              <span className="text-slate-400 text-[11px] uppercase tracking-wider font-sans font-bold block">
                Claimable Vault
              </span>
              <span className="text-lg sm:text-xl font-black text-cyan-300 mt-1 block">
                {currencyInfo.format(totalUnclaimed)}
              </span>
            </div>
            <button
              type="button"
              onClick={handleClaimAll}
              disabled={isClaiming}
              className={`mt-2 w-full py-2 rounded-lg font-sans font-black text-[11px] transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm ${
                !hasConfirmedMachine
                  ? 'bg-rose-950/80 text-rose-300 border border-rose-500/50'
                  : totalUnclaimed > 0
                    ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 text-white'
                    : 'bg-[#0b1b36] hover:bg-[#10264a] text-cyan-300 border border-cyan-500/30'
              }`}
            >
              {!hasConfirmedMachine ? (
                <>
                  <Lock className="w-3.5 h-3.5 text-rose-400" />
                  <span>Locked (Admin Confirm)</span>
                </>
              ) : (
                <>
                  <Coins className="w-3.5 h-3.5" />
                  <span>
                    {isClaiming
                      ? 'Collecting...'
                      : totalUnclaimed > 0
                        ? `Claim All (${currencyInfo.format(totalUnclaimed)})`
                        : 'Collect Daily Yield'}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Closed/Locked Plane Notice when user has no Admin-confirmed running machine */}
      {user && !hasConfirmedMachine && (
        <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-rose-950/90 via-[#1f0a14]/90 to-amber-950/80 border border-rose-500/60 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-500/20 border border-rose-500/50 flex items-center justify-center shrink-0 text-rose-300">
              <Lock className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h3 className="text-xs sm:text-sm font-black text-rose-200 uppercase tracking-wide">
                🔒 Closed / Locked Plane — Admin Payment Confirmation Required
              </h3>
              <p className="text-xs text-slate-200 leading-relaxed">
                {pendingInvs.length > 0
                  ? `You have ${pendingInvs.length} machine order(s) awaiting Admin payment confirmation. Your machine is currently locked at Day 0 and will ONLY start running once Admin confirms your payment.`
                  : 'No one can access closed or locked planes or start running a machine unless Admin confirms their payment. Deposit or submit your machine payment first—only after Admin confirms your payment will the machine start running.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onNavigateToMarketplace}
            className="px-4 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-black text-xs rounded-xl shrink-0 cursor-pointer transition-all"
          >
            Go to Machine Plane
          </button>
        </div>
      )}

      {feedbackBanner && (
        <div
          className={`p-4 rounded-2xl flex items-center justify-between gap-3 text-xs font-bold animate-fade-in shadow-lg border ${
            feedbackBanner.type === 'success'
              ? 'bg-emerald-950/85 border-emerald-500/60 text-emerald-200'
              : 'bg-cyan-950/85 border-cyan-500/60 text-cyan-200'
          }`}
        >
          <div className="flex items-center gap-3">
            {feedbackBanner.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-cyan-400 shrink-0" />
            )}
            <span>{feedbackBanner.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackBanner(null)}
            className="text-[11px] underline opacity-80 hover:opacity-100 cursor-pointer shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 2. Machines Bought & Days Moved List */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-1">
          <div>
            <h2 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-cyan-400" />
              <span>Machines Bought Duration Progress</span>
            </h2>
            <p className="text-xs text-slate-400">
              Live progression of each unit towards completing its lock duration. Machines stay on Pending until Admin confirms payment.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 bg-[#060f22] p-1 rounded-xl border border-blue-900/60">
            {(
              [
                { id: 'ALL', label: `All (${investments.length})` },
                { id: 'PENDING', label: `Pending (${pendingInvs.length})` },
                { id: 'ACTIVE', label: `Active (${activeInvs.length})` },
                { id: 'COMPLETED', label: `Completed (${completedInvs.length})` },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterStatus(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  filterStatus === tab.id
                    ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-slate-950 font-black shadow-sm'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {!user ? (
          <div className="shining-card rounded-2xl p-10 text-center border border-blue-950/80 space-y-4 bg-[#050a18]/90 backdrop-blur-md">
            <Cpu className="w-12 h-12 text-blue-400 mx-auto" />
            <h3 className="text-base font-black text-white">Log in to view your Income Plane</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Please sign in to track the machines you have bought, check days moved, and collect daily returns.
            </p>
            <button
              type="button"
              onClick={onOpenAuth}
              className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-500 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer"
            >
              Log In / Register
            </button>
          </div>
        ) : filteredInvestments.length === 0 ? (
          <div className="shining-card rounded-2xl p-12 text-center border border-blue-950/80 space-y-4 bg-[#050a18]/90 backdrop-blur-md">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600/30 to-cyan-500/20 border border-cyan-500/40 flex items-center justify-center mx-auto text-cyan-400">
              <Cpu className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-white">
                {investments.length === 0 ? 'No Machines Bought Yet' : `No ${filterStatus.toLowerCase()} machines found`}
              </h3>
              <p className="text-xs text-slate-300 max-w-md mx-auto mt-1 leading-relaxed">
                {investments.length === 0
                  ? 'You have not bought any machines yet in the Machine Plane. Browse Series AV1, AV2, or AV Classes to activate equipment and earn daily income.'
                  : 'Switch filter tabs above or buy another machine from the Machine Plane.'}
              </p>
            </div>
            <button
              type="button"
              onClick={onNavigateToMarketplace}
              className="px-6 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 text-white font-black text-xs rounded-xl shadow-lg shadow-cyan-950/60 transition-all cursor-pointer inline-flex items-center gap-2"
            >
              <span>Explore Machine Plane</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {filteredInvestments.map((inv) => {
              const isPending = inv.status === 'PENDING';
              const daysElapsed = isPending
                ? 0
                : Math.min(inv.duration_days, Math.max(1, inv.days_elapsed || 1));
              const progressPct = isPending
                ? 0
                : Math.min(100, Math.round((daysElapsed / inv.duration_days) * 100));
              const daysRemaining = isPending
                ? inv.duration_days
                : Math.max(0, inv.duration_days - daysElapsed);
              const isCompleted = !isPending && (inv.status === 'PAYOUT_COMPLETE' || daysElapsed >= inv.duration_days);
              const hasUnclaimed = !isPending && (inv.unclaimed_earnings || 0) > 0;
              const isSingleClaiming = claimingInvId === inv.id;
              const nextPayout = getHoursUntilNextPayout(inv.last_claim_at);

              return (
                <div
                  key={inv.id}
                  className={`shining-card rounded-2xl p-5 sm:p-6 border transition-all flex flex-col justify-between space-y-4 ${
                    isPending
                      ? 'bg-gradient-to-r from-[#1a1305]/95 via-[#1f1606]/90 to-[#140e04]/95 border-amber-500/60 shadow-lg'
                      : isCompleted
                        ? 'bg-gradient-to-r from-[#04121a]/95 to-[#061e2b]/90 border-emerald-500/50 shadow-xl'
                        : 'bg-gradient-to-r from-[#060e22]/95 via-[#081736]/90 to-[#050c1e]/95 border-blue-900/60 shadow-lg'
                  }`}
                >
                  {/* Top Bar: Title, Series, Status */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-blue-950/70">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-900 flex items-center justify-center shrink-0 border border-blue-400/40 text-white font-bold">
                        <Cpu className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm sm:text-base font-extrabold text-white">
                            {inv.machine_title}
                          </h3>
                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-blue-950 border border-blue-500/40 text-blue-300 uppercase">
                            {inv.series_tag || 'Hardware Rig'}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">
                          Daily Income: {currencyInfo.format(inv.daily_yield)} / day • ID: {inv.id}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {isPending ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-mono font-bold bg-amber-950/90 text-amber-300 border border-amber-500/60 px-3 py-1 rounded-full animate-pulse">
                          <Clock className="w-3.5 h-3.5 text-amber-400" />
                          <span>Pending Admin Confirmation</span>
                        </span>
                      ) : isCompleted ? (
                        <span className="inline-flex items-center gap-1.5 text-xs font-mono font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-500/50 px-3 py-1 rounded-full">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Duration Completed</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-mono font-bold bg-blue-950/80 text-cyan-300 border border-cyan-500/40 px-3 py-1 rounded-full">
                          <Clock className="w-3.5 h-3.5 text-cyan-400 animate-spin" style={{ animationDuration: '6s' }} />
                          <span>Active ({daysRemaining}d left)</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Middle Section: Days Moved Indicator & Progress Bar */}
                  <div className="bg-[#040816]/80 p-4 rounded-xl border border-blue-950/80 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Calendar className={`w-4 h-4 ${isPending ? 'text-amber-400' : 'text-cyan-400'}`} />
                        <span className="text-xs font-bold text-slate-300">Days Moved to Complete Duration:</span>
                        <span
                          className={`text-xs sm:text-sm font-black font-mono px-2.5 py-0.5 rounded-lg border ${
                            isPending
                              ? 'text-amber-300 bg-amber-950/70 border-amber-500/50'
                              : 'text-cyan-300 bg-cyan-950/70 border-cyan-500/40'
                          }`}
                        >
                          Day {daysElapsed} of {inv.duration_days} Days ({progressPct}%)
                        </span>
                      </div>

                      <div className="text-right text-xs font-mono">
                        {isPending ? (
                          <span className="text-amber-300 font-bold">
                            ⏳ Waiting for Admin payment confirmation to start Day 1
                          </span>
                        ) : (
                          <>
                            <span className="text-slate-400">Next Payout Cycle: </span>
                            <strong className="text-cyan-300 font-bold">
                              {hasUnclaimed ? 'Ready Now!' : `${nextPayout.hours}h ${nextPayout.minutes}m`}
                            </strong>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Progress Track */}
                    <div className="w-full bg-[#02050e] h-3 rounded-full overflow-hidden border border-blue-950/90 relative">
                      <div
                        className={`h-full transition-all duration-700 ${
                          isPending
                            ? 'bg-amber-500/50'
                            : isCompleted
                              ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                              : 'bg-gradient-to-r from-blue-600 via-cyan-500 to-teal-400 shadow-md shadow-cyan-500/40'
                        }`}
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>
                  </div>

                  {/* Bottom Financial Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs font-mono">
                    <div className="bg-[#050b18] p-3 rounded-xl border border-blue-950/70">
                      <span className="text-[10px] text-slate-400 uppercase font-sans font-bold block">
                        Buy Cost
                      </span>
                      <span className="font-bold text-white text-sm mt-0.5 block">
                        {currencyInfo.format(inv.amount_invested)}
                      </span>
                    </div>

                    <div className="bg-[#050b18] p-3 rounded-xl border border-blue-950/70">
                      <span className="text-[10px] text-slate-400 uppercase font-sans font-bold block">
                        Total Payout
                      </span>
                      <span className="font-bold text-emerald-400 text-sm mt-0.5 block">
                        {currencyInfo.format(inv.total_return)}
                      </span>
                    </div>

                    <div className="bg-[#050b18] p-3 rounded-xl border border-blue-950/70">
                      <span className="text-[10px] text-slate-400 uppercase font-sans font-bold block">
                        Collected Return
                      </span>
                      <span className="font-bold text-cyan-300 text-sm mt-0.5 block">
                        {currencyInfo.format(inv.total_claimed || 0)}
                      </span>
                    </div>

                    <div className="bg-[#050b18] p-3 rounded-xl border border-blue-950/70 flex items-center justify-between gap-2">
                      <div>
                        <span className="text-[10px] text-slate-400 uppercase font-sans font-bold block">
                          Unclaimed
                        </span>
                        <span className="font-bold text-white text-sm mt-0.5 block">
                          {currencyInfo.format(inv.unclaimed_earnings || 0)}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleClaimSingle(inv)}
                        disabled={isSingleClaiming || isClaiming}
                        className={`px-3 py-1.5 rounded-lg font-sans font-bold text-xs transition-all cursor-pointer shadow-sm shrink-0 ${
                          isPending
                            ? 'bg-amber-950/90 text-amber-300 border border-amber-500/50'
                            : hasUnclaimed
                              ? 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 text-slate-950 font-black'
                              : 'bg-[#091834] hover:bg-[#0e244d] text-cyan-300 border border-cyan-500/40'
                        }`}
                      >
                        {isSingleClaiming
                          ? '...'
                          : isPending
                            ? '🔒 Locked (Pending)'
                            : hasUnclaimed
                              ? 'Collect'
                              : 'Check Yield'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 3. Complete Investment History Ledger Table */}
      {user && (
        <div className="shining-card border border-blue-900/60 rounded-2xl p-5 sm:p-6 shadow-xl bg-[#050a18]/95 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-blue-950/80">
            <div>
              <h3 className="text-base sm:text-lg font-black text-white">Complete Investment History</h3>
              <p className="text-xs text-slate-400">
                Full ledger of your machine orders, purchase dates, cycle durations, and maturity ending dates.
              </p>
            </div>
            <span className="text-xs font-mono text-amber-400 bg-amber-950/60 border border-amber-500/30 px-3 py-1 rounded-lg">
              Upcoming Endings (≤7d):{' '}
              {
                activeInvs.filter((inv) => {
                  const rem = Math.max(0, inv.duration_days - (inv.days_elapsed || 0));
                  return rem >= 0 && rem <= 7;
                }).length
              }
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="bg-[#070e1f] text-[10px] uppercase text-slate-400 border-b border-blue-950/80 font-mono">
                <tr>
                  <th className="py-3 px-4">Investment ID</th>
                  <th className="py-3 px-4">Machine</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Purchase Date</th>
                  <th className="py-3 px-4">Duration</th>
                  <th className="py-3 px-4">Ending Date</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-blue-950/60 font-mono text-xs">
                {investments.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-slate-500 font-sans">
                      No investment records found.
                    </td>
                  </tr>
                ) : (
                  investments.map((inv) => {
                    const isPending = inv.status === 'PENDING';
                    const isCompleted =
                      !isPending &&
                      (inv.status === 'PAYOUT_COMPLETE' || (inv.days_elapsed || 0) >= inv.duration_days);
                    const purchaseDate = (inv.start_date || new Date().toISOString()).split('T')[0];
                    const endingDate = inv.end_date
                      ? inv.end_date.split('T')[0]
                      : new Date(
                          new Date(inv.start_date || Date.now()).getTime() +
                            inv.duration_days * 24 * 60 * 60 * 1000
                        )
                          .toISOString()
                          .split('T')[0];

                    return (
                      <tr key={`hist-${inv.id}`} className="hover:bg-[#0c1630]/50 transition-colors">
                        <td className="py-3 px-4 font-semibold text-slate-200">{inv.id}</td>
                        <td className="py-3 px-4 text-emerald-400 font-bold">{inv.machine_title}</td>
                        <td className="py-3 px-4 font-sans font-bold text-white">
                          {currencyInfo.format(inv.amount_invested)}
                        </td>
                        <td className="py-3 px-4">{purchaseDate}</td>
                        <td className="py-3 px-4">{inv.duration_days} Days</td>
                        <td className="py-3 px-4">{isPending ? 'Pending Confirm' : endingDate}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-sans font-semibold ${
                              isPending
                                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                                : isCompleted
                                  ? 'bg-slate-700/50 text-slate-300'
                                  : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            }`}
                          >
                            {isPending ? 'Pending' : isCompleted ? 'Completed' : 'Active'}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
