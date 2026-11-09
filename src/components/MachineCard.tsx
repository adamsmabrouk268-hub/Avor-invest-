import React from 'react';
import { Machine, Currency } from '../types';
import { CURRENCY_MAP } from '../data/defaultMachines';
import { ArrowRight, Lock } from 'lucide-react';

interface MachineCardProps {
  machine: Machine;
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

export const MachineCard: React.FC<MachineCardProps> = ({
  machine,
  currency,
  hasBoughtMachine = false,
  invitedCount = 0,
  onInvestClick,
}) => {
  const currencyInfo = CURRENCY_MAP[currency];
  const price = machine.total_cost || machine.price || 15000;
  const daily = machine.daily_yield || 3750;
  const duration =
    machine.duration_days ||
    (machine.lockDurationMinutes ? Math.round(machine.lockDurationMinutes / 1440) : 12);
  const series = machine.series_tag || machine.series || 'AV1';
  const name = machine.title || machine.name || 'Mining Rig';
  const payoutAfterLock = machine.total_return || daily * duration || price * 1.5;

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
      onClick={() => onInvestClick(machine)}
      className={`group relative rounded-2xl bg-[#030914]/95 hover:bg-[#050e1f] border ${
        isLockedPlane
          ? 'border-rose-500/40 hover:border-rose-500/70 opacity-95'
          : 'border-[#00d2c4]/25 hover:border-[#00e5ff]/60'
      } shadow-[0_8px_25px_rgba(0,10,24,0.7)] hover:shadow-[0_12px_32px_rgba(0,145,234,0.3)] transition-all flex flex-row overflow-hidden cursor-pointer select-none active:scale-[0.99] min-h-[135px] sm:min-h-[145px]`}
    >
      {/* Left Column: Machine Hardware Image */}
      <div className="w-32 sm:w-44 md:w-48 shrink-0 bg-[#02050e] relative overflow-hidden">
        <img
          src={
            machine.image_url ||
            machine.imageUrl ||
            '/assets/aistudio/IMG-20261027-WA0004_0a0398d4.jpg'
          }
          alt={name}
          className={`w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-500 ${
            isLockedPlane ? 'grayscale-[45%]' : ''
          }`}
        />

        {/* Series Badge Overlay */}
        <div className="absolute top-2 left-2">
          <span
            className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-md shadow-md backdrop-blur-md border uppercase ${
              isLockedPlane
                ? 'bg-rose-950/95 text-rose-300 border-rose-500/60'
                : isAvClass
                  ? 'bg-cyan-950/90 text-cyan-300 border-cyan-400/50'
                  : isAV1
                    ? 'bg-sky-950/90 text-sky-300 border-sky-400/50'
                    : 'bg-blue-950/90 text-blue-300 border-blue-400/50'
            }`}
          >
            {isLockedPlane ? `🔒 ${series}` : series}
          </span>
        </div>

        {/* Policy Indicator (Max Unit: 1 / Max Unit: 2 / Mon-Fri / Locked Class Requirement) */}
        <div className="absolute bottom-2 left-2 right-2">
          {isLockedPlane ? (
            <span className="text-[8px] font-mono font-extrabold px-1.5 py-0.5 rounded bg-rose-950/95 text-rose-300 border border-rose-500/60 block truncate">
              🔒 Need {requiredInvites.toLocaleString()} Customers ({invitedCount}/{requiredInvites.toLocaleString()})
            </span>
          ) : isAV1 ? (
            <span className="text-[8px] font-mono font-extrabold px-1.5 py-0.5 rounded bg-amber-950/90 text-amber-300 border border-amber-500/40 block truncate">
              Max Unit: 1 • Mon–Fri
            </span>
          ) : isAV2 ? (
            <span className="text-[8px] font-mono font-extrabold px-1.5 py-0.5 rounded bg-blue-950/90 text-blue-300 border border-blue-400/40 block truncate">
              Max Unit: 2 • Mon–Fri
            </span>
          ) : isAvClass ? (
            <span className="text-[8px] font-mono font-extrabold px-1.5 py-0.5 rounded bg-emerald-950/90 text-emerald-300 border border-emerald-500/40 block truncate">
              Unlocked ({requiredInvites.toLocaleString()}+ Customers) ⚡
            </span>
          ) : null}
        </div>
      </div>

      {/* Right Column: Machine Info & Details */}
      <div className="flex-1 p-3 sm:p-4 flex flex-col justify-between min-w-0 bg-gradient-to-r from-[#030914] via-[#040e22] to-[#020817]">
        <div className="space-y-1">
          {/* Title: Electric Cyan / Blue bold (Machine Name) */}
          <div className="flex items-center justify-between gap-1.5">
            <h3 className="text-base sm:text-lg font-black text-[#0091ea] group-hover:text-[#00e5ff] transition-colors tracking-tight truncate">
              {name}
            </h3>
            {isLockedPlane ? (
              <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-rose-950/90 text-rose-300 border border-rose-500/50 shrink-0 inline-flex items-center gap-1">
                <Lock className="w-2.5 h-2.5" />
                <span>Need {requiredInvites.toLocaleString()} Customers</span>
              </span>
            ) : walletOnly ? (
              <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-blue-950/90 text-sky-300 border border-sky-500/50 shrink-0 inline-block">
                Mon–Friday
              </span>
            ) : isAvClass ? (
              <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-950/90 text-emerald-300 border border-emerald-500/50 shrink-0 inline-block">
                All Week
              </span>
            ) : null}
          </div>

          {/* Line 1: Lock: X Days */}
          <p className="text-xs sm:text-sm text-slate-300 font-medium flex items-center gap-1.5">
            <span className="text-slate-400">Lock:</span>
            <span className="text-white font-bold font-mono">
              {duration} Days {isAvClass ? '(Throughout Week)' : '(Mon–Fri)'}
            </span>
          </p>

          {/* Line 2: Price: X USD / UGX */}
          <p className="text-xs sm:text-sm text-slate-300 font-medium flex items-center gap-1.5">
            <span className="text-slate-400">Price:</span>
            <span className="text-white font-bold font-mono">{currencyInfo.format(price)}</span>
          </p>

          {/* Line 3: Daily: X USD / UGX */}
          <p className="text-xs sm:text-sm text-slate-300 font-medium flex items-center gap-1.5">
            <span className="text-slate-400">Daily:</span>
            <span className="text-[#a3e635] font-black font-mono">{currencyInfo.format(daily)}</span>
          </p>
        </div>

        {/* Action Row: Giving Back & Buy Button */}
        <div className="pt-2 mt-1 border-t border-[#00d2c4]/15 flex items-center justify-between gap-2">
          <div className="text-[10px] text-slate-400 truncate">
            <span>Back: </span>
            <span className="text-slate-200 font-bold font-mono">
              {currencyInfo.format(payoutAfterLock)}
            </span>
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onInvestClick(machine);
            }}
            className={`px-3 sm:px-4 py-1.5 font-black text-xs rounded-xl flex items-center gap-1 transition-all cursor-pointer shrink-0 border ${
              isLockedPlane
                ? 'bg-rose-950/90 hover:bg-rose-900/90 text-rose-200 border-rose-500/60'
                : 'bg-gradient-to-r from-[#0091ea] to-[#0077b6] hover:brightness-110 active:scale-95 text-white shadow-[0_0_12px_rgba(0,145,234,0.5)] border-[#00e5ff]/50'
            }`}
          >
            {isLockedPlane ? (
              <>
                <Lock className="w-3 h-3 text-rose-400" />
                <span>Locked ({requiredInvites.toLocaleString()} Customers)</span>
              </>
            ) : (
              <>
                <span>Buy</span>
                <ArrowRight className="w-3 h-3" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
