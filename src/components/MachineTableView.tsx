import React from 'react';
import { Machine, Currency } from '../types';
import { CURRENCY_MAP } from '../data/defaultMachines';
import { Lock, Clock, Zap, ArrowRight } from 'lucide-react';

interface MachineTableViewProps {
  machines: Machine[];
  currency: Currency;
  hasBoughtMachine?: boolean;
  invitedCount?: number;
  onInvestClick: (machine: Machine) => void;
}

const DEFAULT_CLASS_INVITES: Record<string, number> = {
  'A class': 4,
  'B class': 9,
  'C class': 20,
  'D class': 35,
  'E class': 70,
  'F class': 120,
  'G class': 300,
  'H class': 5000,
  'I class': 10000,
};

export const MachineTableView: React.FC<MachineTableViewProps> = ({
  machines,
  currency,
  hasBoughtMachine = false,
  invitedCount = 0,
  onInvestClick,
}) => {
  const currencyInfo = CURRENCY_MAP[currency];

  return (
    <div className="w-full space-y-4">
      {/* Desktop Table View */}
      <div className="hidden lg:block overflow-hidden shining-card rounded-2xl shadow-xl border border-blue-950/80">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#070e1f] border-b border-blue-950/80 text-[11px] uppercase tracking-wider text-slate-300 font-bold">
                <th className="py-3.5 px-4">Machine Unit</th>
                <th className="py-3.5 px-3">Specs / Capacity</th>
                <th className="py-3.5 px-3 text-right">Name</th>
                <th className="py-3.5 px-3 text-right">Series</th>
                <th className="py-3.5 px-3 text-right">Duration</th>
                <th className="py-3.5 px-3 text-right">Time Lock 🔐</th>
                <th className="py-3.5 px-3 text-right">Buy Price</th>
                <th className="py-3.5 px-3 text-right">Giving Back 💰</th>
                <th className="py-3.5 px-4 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-blue-950/60 text-xs">
              {machines.map((machine) => {
                const price = machine.total_cost || machine.price || 15000;
                const daily = machine.daily_yield || 3750;
                const duration = machine.duration_days || (machine.lockDurationMinutes ? Math.round(machine.lockDurationMinutes / 1440) : 12);
                const series = machine.series_tag || machine.series || 'AV1';
                const name = machine.title || machine.name || 'Mining Rig';
                const payoutAfterLock = machine.total_return || (daily * duration) || (price * 1.5);

                const isAvClass =
                  machine.is_av_class ||
                  machine.category?.startsWith('AV_CLASS') ||
                  ['A class', 'B class', 'C class', 'D class', 'E class', 'F class', 'G class', 'H class', 'I class'].includes(series);
                const requiredInvites =
                  machine.required_referral_buyers || DEFAULT_CLASS_INVITES[series] || (isAvClass ? 4 : 0);
                const isLockedPlane = isAvClass && (!hasBoughtMachine || invitedCount < requiredInvites);

                const isAV1 =
                  machine.category === 'AV1' ||
                  series === 'AV1' ||
                  machine.series_tag === 'AV1' ||
                  !!machine.only_one_unit ||
                  machine.max_units_per_user === 1;

                const isAV2 =
                  machine.category === 'AV2' ||
                  series === 'AV2' ||
                  machine.series_tag === 'AV2' ||
                  machine.max_units_per_user === 2;

                const walletOnly = isAV1 || isAV2;

                return (
                  <tr
                    key={machine.id}
                    className="hover:bg-[#0c1630]/60 transition-colors group"
                  >
                    {/* Machine Unit Preview */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl overflow-hidden bg-[#050a16] border border-blue-950/80 shrink-0 relative">
                          <img
                            src={
                              machine.image_url ||
                              machine.imageUrl ||
                              '/assets/aistudio/IMG-20261027-WA0004_0a0398d4.jpg'
                            }
                            alt={name}
                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
                          />
                        </div>
                        <div>
                          <span className="font-extrabold text-white text-sm block leading-tight">
                            {name}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            ID: {machine.id.slice(0, 10)}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* Specs / SLA */}
                    <td className="py-3.5 px-3">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1 text-slate-200 font-mono font-semibold text-[11px]">
                          <Zap className="w-3 h-3 text-blue-400 shrink-0" />
                          <span>{machine.hashrate_or_capacity || '85 TH/s'}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 truncate max-w-[140px]">
                          {isAvClass
                            ? `Requires ${requiredInvites.toLocaleString()} Invites (${invitedCount}/${requiredInvites.toLocaleString()})`
                            : isAV1
                              ? 'Max 1 Unit per User'
                              : isAV2
                                ? 'Max 2 Units per User'
                                : machine.power_consumption || '650W'}
                        </div>
                      </div>
                    </td>

                    {/* Name */}
                    <td className="py-3.5 px-3 text-right">
                      <span className="font-bold text-slate-200 text-xs block max-w-[130px] ml-auto truncate" title={name}>
                        {name}
                      </span>
                    </td>

                    {/* Category & Series */}
                    <td className="py-3.5 px-3 text-right">
                      <span
                        className={`inline-block border text-[10px] font-extrabold font-mono px-2.5 py-1 rounded-lg uppercase tracking-wider ${
                          isLockedPlane
                            ? 'bg-rose-950/80 border-rose-500/50 text-rose-300'
                            : isAvClass
                              ? 'bg-cyan-950/80 border-cyan-500/50 text-cyan-300'
                              : 'bg-blue-950/80 border-blue-500/50 text-blue-300'
                        }`}
                      >
                        {isAvClass ? `${isLockedPlane ? '🔐 ' : ''}AVclasses • ${series}` : `AVs • ${series}`}
                      </span>
                    </td>

                    {/* Time Duration */}
                    <td className="py-3.5 px-3 text-right">
                      <span className="font-bold text-slate-300 font-mono text-xs inline-flex items-center gap-1 justify-end">
                        <Clock className="w-3 h-3 text-sky-400" />
                        <span>{isAvClass ? 'Mon–Mon (21D)' : `${duration} Days`}</span>
                      </span>
                    </td>

                    {/* Time Lock / Everyday badge */}
                    <td className="py-3.5 px-3 text-right">
                      {isLockedPlane ? (
                        <span className="inline-flex items-center gap-1 bg-rose-950/80 border border-rose-500/50 text-rose-300 font-bold text-[10px] font-mono px-2.5 py-1 rounded-lg">
                          <Lock className="w-3 h-3 text-rose-400" />
                          <span>Need {requiredInvites.toLocaleString()} Invites ({invitedCount}/{requiredInvites.toLocaleString()})</span>
                        </span>
                      ) : isAvClass ? (
                        <span className="inline-flex items-center gap-1 bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 font-bold text-[10px] font-mono px-2.5 py-1 rounded-lg">
                          <Zap className="w-3 h-3 text-emerald-400" />
                          <span>Mon to Mon (Weekends)</span>
                        </span>
                      ) : isAV1 ? (
                        <span className="inline-flex items-center gap-1 bg-amber-950/80 border border-amber-500/50 text-amber-300 font-bold text-[10px] font-mono px-2.5 py-1 rounded-lg">
                          <span>1 Unit Only • {duration}D Lock</span>
                        </span>
                      ) : isAV2 ? (
                        <span className="inline-flex items-center gap-1 bg-blue-950/80 border border-blue-400/50 text-blue-300 font-bold text-[10px] font-mono px-2.5 py-1 rounded-lg">
                          <span>2 Units Max • {duration}D Lock</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-[#0d1733] border border-blue-900/50 text-sky-300 font-bold text-[10px] font-mono px-2.5 py-1 rounded-lg">
                          <Lock className="w-3 h-3 text-sky-400" />
                          <span>{duration} Days Lock 🔐</span>
                        </span>
                      )}
                    </td>

                    {/* Buy Price */}
                    <td className="py-3.5 px-3 text-right">
                      <div>
                        <span className="font-black text-white font-mono text-sm block">
                          {currencyInfo.format(price)}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {walletOnly ? 'Wallet Only' : 'Buy Price'}
                        </span>
                      </div>
                    </td>

                    {/* Receive After Lock */}
                    <td className="py-3.5 px-3 text-right">
                      <div>
                        <span className="font-black text-[#a3e635] font-mono text-sm block">
                          {currencyInfo.format(payoutAfterLock)}
                        </span>
                        <span className="text-[10px] text-blue-300 font-mono font-semibold">
                          Total ({duration}D Lock)
                        </span>
                      </div>
                    </td>

                    {/* Action */}
                    <td className="py-3.5 px-4 text-center">
                      <button
                        onClick={() => onInvestClick(machine)}
                        className={`px-3.5 py-2 font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 mx-auto cursor-pointer whitespace-nowrap border ${
                          isLockedPlane
                            ? 'bg-rose-950/90 text-rose-200 border-rose-500/60'
                            : 'bg-gradient-to-r from-[#0091ea] to-[#0077b6] text-white hover:brightness-110 border-[#00e5ff]/50 shadow-[0_0_12px_rgba(0,145,234,0.35)]'
                        }`}
                      >
                        {isLockedPlane ? (
                          <>
                            <Lock className="w-3.5 h-3.5 text-rose-400" />
                            <span>Locked ({requiredInvites.toLocaleString()} Invites)</span>
                          </>
                        ) : (
                          <>
                            <span>{walletOnly ? 'Buy (Wallet Only)' : 'Buy Unit'}</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </>
                        )}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Card-Table Hybrid View */}
      <div className="lg:hidden space-y-3">
        {machines.map((machine) => {
          const price = machine.total_cost || machine.price || 15000;
          const daily = machine.daily_yield || 3750;
          const duration = machine.duration_days || (machine.lockDurationMinutes ? Math.round(machine.lockDurationMinutes / 1440) : 12);
          const series = machine.series_tag || machine.series || 'AV1';
          const name = machine.title || machine.name || 'Mining Rig';
          const payoutAfterLock = machine.total_return || (daily * duration) || (price * 1.5);

          const isAvClass =
            machine.is_av_class ||
            machine.category?.startsWith('AV_CLASS') ||
            ['A class', 'B class', 'C class', 'D class', 'E class', 'F class', 'G class', 'H class', 'I class'].includes(series);
          const requiredInvites =
            machine.required_referral_buyers || DEFAULT_CLASS_INVITES[series] || (isAvClass ? 4 : 0);
          const isAV1 =
            machine.category === 'AV1' ||
            series === 'AV1' ||
            machine.series_tag === 'AV1' ||
            !!machine.only_one_unit ||
            machine.max_units_per_user === 1;

          const isAV2 =
            machine.category === 'AV2' ||
            series === 'AV2' ||
            machine.series_tag === 'AV2' ||
            machine.max_units_per_user === 2;

          const walletOnly = isAV1 || isAV2;
          const isLockedPlane = isAvClass && (!hasBoughtMachine || invitedCount < requiredInvites);

          return (
            <div
              key={machine.id}
              className="shining-card rounded-2xl p-4 space-y-3 shadow-md text-white border border-blue-950/80"
            >
              {/* Header with image & name */}
              <div className="flex items-start gap-3">
                <div className="w-16 h-16 rounded-xl overflow-hidden bg-[#050a16] border border-blue-950/80 shrink-0">
                  <img
                    src={
                      machine.image_url ||
                      machine.imageUrl ||
                      '/assets/aistudio/IMG-20261027-WA0004_0a0398d4.jpg'
                    }
                    alt={name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span
                      className={`inline-block border text-[10px] font-extrabold font-mono px-2 py-0.5 rounded uppercase ${
                        isLockedPlane
                          ? 'bg-rose-950/80 border-rose-500/50 text-rose-300'
                          : isAvClass
                            ? 'bg-cyan-950/80 border-cyan-500/50 text-cyan-300'
                            : 'bg-blue-950/80 border-blue-500/50 text-blue-300'
                      }`}
                    >
                      {isAvClass ? `${isLockedPlane ? '🔐 ' : ''}AVclasses • ${series}` : `AVs • ${series}`}
                    </span>
                    {isLockedPlane ? (
                      <span className="text-[10px] font-bold text-rose-300 bg-rose-950/80 border border-rose-500/40 px-1.5 py-0.5 rounded font-mono">
                        🔒 Need {requiredInvites.toLocaleString()} Invites
                      </span>
                    ) : isAvClass ? (
                      <span className="text-[10px] font-bold text-emerald-300 bg-emerald-950/80 border border-emerald-500/40 px-1.5 py-0.5 rounded font-mono">
                        Mon–Mon (Weekends) ⚡
                      </span>
                    ) : isAV1 ? (
                      <span className="text-[10px] font-bold text-amber-300 bg-amber-950/80 border border-amber-500/40 px-1.5 py-0.5 rounded font-mono">
                        Limit: 1 Unit Only
                      </span>
                    ) : isAV2 ? (
                      <span className="text-[10px] font-bold text-blue-300 bg-blue-950/80 border border-blue-400/40 px-1.5 py-0.5 rounded font-mono">
                        Limit: 2 Units Max
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-blue-300 bg-blue-950/80 border border-blue-500/40 px-1.5 py-0.5 rounded font-mono">
                        +{machine.estimated_return_pct}% Return
                      </span>
                    )}
                  </div>
                  <h4 className="text-sm font-extrabold text-white mt-1 truncate">
                    {name}
                  </h4>
                  <p className="text-[11px] text-slate-300 font-mono mt-0.5">
                    {machine.hashrate_or_capacity || '85 TH/s'}
                  </p>
                </div>
              </div>

              {/* Data Table Rows */}
              <div className="bg-[#070e1f] rounded-xl p-3 border border-blue-950/80 space-y-1.5 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-[11px]">Running Schedule:</span>
                  <span className="font-bold text-white font-mono">
                    {isAvClass ? 'Monday to Monday (counting weekends)' : `${duration} Days`}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-[11px]">Giving Back:</span>
                  <span className="font-black text-[#a3e635] font-mono">
                    {currencyInfo.format(payoutAfterLock)}
                  </span>
                </div>
                {isAvClass && (
                  <div className="flex justify-between items-center text-amber-300">
                    <span className="text-slate-400 text-[11px]">Class Requirement:</span>
                    <span className="font-bold font-mono text-[11px]">
                      {isLockedPlane ? `🔐 Need ${requiredInvites.toLocaleString()} Invited Buyers (${invitedCount}/${requiredInvites.toLocaleString()})` : `✅ ${requiredInvites.toLocaleString()}+ Invites Met`}
                    </span>
                  </div>
                )}
                {isAvClass && machine.referral_reward_ugx && (
                  <div className="flex justify-between items-center text-[#a3e635]">
                    <span className="text-slate-400 text-[11px]">Account Reward:</span>
                    <span className="font-bold font-mono text-[11px]">
                      +{currencyInfo.format(machine.referral_reward_ugx)}
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center pt-1 border-t border-blue-950/80">
                  <span className="text-slate-400 text-[11px]">Buy Price:</span>
                  <span className="font-black text-white font-mono text-sm">
                    {currencyInfo.format(price)}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 text-[11px]">Access Rule:</span>
                  <span className="font-mono text-xs font-bold text-blue-300">
                    {isLockedPlane
                      ? `🔒 Locked — Must Invite ${requiredInvites.toLocaleString()} People`
                      : walletOnly
                        ? 'Wallet Balance Only'
                        : isAV1
                          ? '1 Unit Max'
                          : isAV2
                            ? '2 Units Max'
                            : 'Wallet / Direct'}
                  </span>
                </div>
              </div>

              {/* Action Button */}
              <button
                onClick={() => onInvestClick(machine)}
                className={`w-full py-2.5 font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer border ${
                  isLockedPlane
                    ? 'bg-rose-950/90 text-rose-200 border-rose-500/60'
                    : 'bg-gradient-to-r from-[#0091ea] to-[#0077b6] text-white hover:brightness-110 border-[#00e5ff]/50 shadow-[0_0_12px_rgba(0,145,234,0.35)]'
                }`}
              >
                {isLockedPlane ? (
                  <>
                    <Lock className="w-3.5 h-3.5 text-rose-400" />
                    <span>Locked (Invite {requiredInvites.toLocaleString()} People to Access {series})</span>
                  </>
                ) : (
                  <>
                    <span>{walletOnly ? 'Buy Machine (Wallet Only)' : `Buy Machine (${currencyInfo.format(price)})`}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
