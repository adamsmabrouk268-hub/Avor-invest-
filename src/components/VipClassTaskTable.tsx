import React, { useState } from 'react';
import { Currency, User } from '../types';
import { CURRENCY_MAP } from '../data/defaultMachines';
import { CheckCircle2, AlertCircle, Sparkles, X, Gift } from 'lucide-react';

export interface VipClassRequirement {
  classLevel: string;
  name: string;
  requiredInvites: number;
  rewardUGX: number;
  tag: string;
}

export const VIP_CLASS_REQUIREMENTS: VipClassRequirement[] = [
  { classLevel: 'A', name: 'A class', requiredInvites: 4, rewardUGX: 25000, tag: 'Class A' },
  { classLevel: 'B', name: 'B class', requiredInvites: 9, rewardUGX: 60000, tag: 'Class B' },
  { classLevel: 'C', name: 'C class', requiredInvites: 20, rewardUGX: 110000, tag: 'Class C' },
  { classLevel: 'D', name: 'D class', requiredInvites: 35, rewardUGX: 220000, tag: 'Class D' },
  { classLevel: 'E', name: 'E class', requiredInvites: 70, rewardUGX: 450000, tag: 'Class E' },
  { classLevel: 'F', name: 'F class', requiredInvites: 120, rewardUGX: 850000, tag: 'Class F' },
  { classLevel: 'G', name: 'G class', requiredInvites: 300, rewardUGX: 1200000, tag: 'Class G' },
  { classLevel: 'H', name: 'H class', requiredInvites: 5000, rewardUGX: 3000000, tag: 'Class H' },
  { classLevel: 'I', name: 'I class', requiredInvites: 10000, rewardUGX: 8500000, tag: 'Class I' },
];

interface VipClassTaskTableProps {
  user: User | null;
  currency: Currency;
  invitedCount?: number;
  totalInvitedMachinesPrice?: number;
  onRewardClaimed?: (newBalance: number) => void;
  onClose?: () => void;
  isModal?: boolean;
}

export const VipClassTaskTable: React.FC<VipClassTaskTableProps> = ({
  user,
  currency,
  invitedCount = 0,
  totalInvitedMachinesPrice = 0,
  onRewardClaimed,
  onClose,
  isModal = false,
}) => {
  const currencyInfo = CURRENCY_MAP[currency];
  const [isClaiming, setIsClaiming] = useState<boolean>(false);
  const [claimMessage, setClaimMessage] = useState<{ type: 'success' | 'info' | 'error'; text: string } | null>(null);
  const [showRewardRules, setShowRewardRules] = useState<boolean>(true);

  // Determine current achieved class and next class target
  const currentClass = [...VIP_CLASS_REQUIREMENTS]
    .reverse()
    .find((r) => invitedCount >= r.requiredInvites);

  const nextClass = VIP_CLASS_REQUIREMENTS.find((r) => invitedCount < r.requiredInvites);

  const formatReward = (rewardUGX: number) => {
    if (currency === 'UGX') {
      return `${rewardUGX.toLocaleString()} UGX`;
    }
    return currencyInfo.format(rewardUGX);
  };

  const calculated5PctReward = Math.round((Number(totalInvitedMachinesPrice) || 0) * 0.05);

  const handleClaimReward = async () => {
    setShowRewardRules(true);
    if (!user) {
      setClaimMessage({
        type: 'info',
        text: 'Please sign in to your account to claim last month\'s reward.',
      });
      return;
    }

    setIsClaiming(true);
    setClaimMessage(null);

    try {
      const res = await fetch('/api/user/claim-class-reward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to claim reward');
      }

      setClaimMessage({
        type: 'success',
        text:
          data.message ||
          `Congratulations! ${formatReward(data.amount_claimed || calculated5PctReward)} (5% of invited customers' total machine price) has been added to your balance!`,
      });

      if (onRewardClaimed && data.new_balance !== undefined) {
        onRewardClaimed(data.new_balance);
      }
    } catch (err: any) {
      if (invitedCount >= 4 && calculated5PctReward > 0) {
        setClaimMessage({
          type: 'info',
          text:
            err?.message ||
            `You have invited ${invitedCount} customers (5% reward: ${formatReward(calculated5PctReward)}).`,
        });
      } else {
        const needed = Math.max(1, 4 - invitedCount);
        setClaimMessage({
          type: 'info',
          text:
            err?.message ||
            `You currently have ${invitedCount} invited customer(s) who bought machines. Invite ${needed} more customer(s) to collect last month's 5% reward!`,
        });
      }
    } finally {
      setIsClaiming(false);
    }
  };

  const content = (
    <div className="w-full max-w-md mx-auto bg-[#03081a] rounded-2xl border border-[#0091ea]/60 p-4 sm:p-5 shadow-[0_0_25px_rgba(0,145,234,0.18)] text-white space-y-4 select-none">
      {/* Top Header if in Modal */}
      {isModal && (
        <div className="flex items-center justify-between pb-3 border-b border-[#0e2748]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-[#0091ea] flex items-center justify-center text-white shadow-md shadow-[#0091ea]/30">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black text-white tracking-wide">
                Class Requirements
              </h2>
              <p className="text-[10px] text-slate-400">Monthly referral reward settlement table</p>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Section Title Header */}
      {!isModal && (
        <div className="flex items-center justify-between pb-1">
          <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-sky-400 font-mono">
            Class Requirements
          </h3>
          <span className="text-[10px] font-mono text-slate-400">A class – I class</span>
        </div>
      )}

      {/* TOP PRIMARY ACTION BUTTON (Exact Screenshot Placement: "Get last month's reward") */}
      <button
        type="button"
        onClick={handleClaimReward}
        disabled={isClaiming}
        className="w-full py-3.5 sm:py-4 bg-[#0091ea] hover:bg-[#0081d6] active:scale-[0.99] disabled:opacity-75 text-white font-extrabold text-sm sm:text-base rounded-2xl shadow-[0_0_25px_rgba(0,145,234,0.45)] transition-all cursor-pointer flex items-center justify-center gap-2 border border-[#00e5ff]/50"
      >
        <Gift className="w-4 h-4 text-white" />
        <span>{isClaiming ? 'Processing Settlement...' : "Get last month's reward"}</span>
      </button>

      {/* CLEAR STATEMENTS FOR LAST MONTH'S REWARD */}
      {showRewardRules && (
        <div className="bg-[#08132c] border border-[#0091ea]/50 rounded-xl p-3.5 space-y-2 text-xs text-slate-100 leading-relaxed">
          <div className="flex items-start gap-2">
            <span className="text-[#a3e635] font-black text-sm leading-none mt-0.5">1.</span>
            <span>
              Last month&apos;s reward is to be always collected on every <strong>28th of every month</strong> to the customers&apos; balance for withdraw.
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-[#a3e635] font-black text-sm leading-none mt-0.5">*</span>
            <span>
              Last month&apos;s reward should be collected when a customer has invited <strong>4 or more customers</strong> (people who have bought machines)
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-[#a3e635] font-black text-sm leading-none mt-0.5">*</span>
            <span>
              Total last month&apos;s reward collected should be only <strong>5%</strong> the total the machine&apos;s price the invited customer has bought.
            </span>
          </div>
        </div>
      )}

      {/* Status Notice */}
      {claimMessage && (
        <div
          className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2.5 animate-fade-in ${
            claimMessage.type === 'success'
              ? 'bg-emerald-950/80 border border-emerald-500/50 text-emerald-300'
              : 'bg-[#08132c] border border-[#0091ea]/50 text-sky-200'
          }`}
        >
          {claimMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-[#0091ea] shrink-0" />
          )}
          <span>{claimMessage.text}</span>
        </div>
      )}

      {/* Progress Strip */}
      <div className="flex items-center justify-between px-3 py-2.5 bg-[#08132c] rounded-xl border border-[#0e2748] text-xs font-mono">
        <span className="text-slate-300">
          Invited Customers: <strong className="text-white font-bold">{invitedCount}</strong>
        </span>
        <span className="text-sky-400 font-bold">
          {nextClass
            ? `Need ${Math.max(0, nextClass.requiredInvites - invitedCount)} more`
            : 'All Classes Unlocked'}
        </span>
      </div>

      {/* TABLE FORMAT (MATCHING SCREENSHOT LAYOUT: Invite | Class | Reward) */}
      <div className="w-full overflow-hidden">
        {/* Table Header */}
        <div className="grid grid-cols-3 text-xs font-bold text-slate-400 py-2.5 border-b border-[#0e2748] tracking-wider uppercase">
          <div className="text-left font-mono pl-1">Invite</div>
          <div className="text-center font-mono">Class</div>
          <div className="text-right font-mono pr-1">Reward</div>
        </div>

        {/* Table Rows: 4 to 10,000 */}
        <div className="divide-y divide-[#0e2748]/80">
          {VIP_CLASS_REQUIREMENTS.map((tier) => {
            const isQualified = invitedCount >= tier.requiredInvites;
            const isNext = nextClass?.classLevel === tier.classLevel;

            return (
              <div
                key={tier.classLevel}
                className={`grid grid-cols-3 items-center py-3 sm:py-3.5 transition-colors ${
                  isQualified
                    ? 'bg-[#0091ea]/15 text-white font-semibold'
                    : isNext
                    ? 'bg-[#08132c]/60 text-slate-200'
                    : 'text-slate-300 hover:bg-[#08132c]/30'
                }`}
              >
                {/* 1. Invited Count */}
                <div className="text-left font-mono text-sm sm:text-base font-bold pl-1 flex items-center gap-1.5">
                  <span className={isQualified ? 'text-[#00e5ff]' : 'text-slate-200'}>
                    {tier.requiredInvites.toLocaleString()}
                  </span>
                  {isQualified && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#10b981]" />
                  )}
                </div>

                {/* 2. Class Name (A class, B class, etc.) */}
                <div className="text-center">
                  <span
                    className={`inline-block text-xs sm:text-sm font-black px-2.5 py-0.5 rounded-md font-mono ${
                      isQualified
                        ? 'bg-[#0091ea] text-white shadow-sm border border-[#00e5ff]/50'
                        : isNext
                        ? 'bg-[#082038] text-sky-300 border border-sky-500/40'
                        : 'text-slate-300'
                    }`}
                  >
                    {tier.name}
                  </span>
                </div>

                {/* 3. Reward Amount */}
                <div className="text-right font-mono text-xs sm:text-sm font-extrabold pr-1">
                  <span className={isQualified ? 'text-emerald-400' : 'text-white'}>
                    {formatReward(tier.rewardUGX)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer Details */}
      <div className="pt-2 border-t border-[#0e2748] text-[10px] text-slate-400 text-center leading-relaxed">
        <span>Class Requirements monthly settlements calculate active invited members. Claim rewards via the button above.</span>
      </div>
    </div>
  );

  if (isModal) {
    return (
      <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-fade-in overflow-y-auto">
        <div className="my-auto w-full max-w-md">{content}</div>
      </div>
    );
  }

  return content;
};
