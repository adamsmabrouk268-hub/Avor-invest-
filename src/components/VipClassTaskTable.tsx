import React, { useState } from 'react';
import { Currency, User } from '../types';
import { CURRENCY_MAP } from '../data/defaultMachines';
import { CheckCircle2, AlertCircle, Sparkles, X, Gift, Lock, Unlock } from 'lucide-react';

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
  hasBoughtMachine?: boolean;
  invitedCount?: number;
  totalInvitedMachinesPrice?: number;
  onRewardClaimed?: (newBalance: number) => void;
  onNavigateToMarketplace?: () => void;
  onClose?: () => void;
  isModal?: boolean;
}

export const VipClassTaskTable: React.FC<VipClassTaskTableProps> = ({
  user,
  currency,
  hasBoughtMachine = false,
  invitedCount = 0,
  totalInvitedMachinesPrice = 0,
  onRewardClaimed,
  onNavigateToMarketplace,
  onClose,
  isModal = false,
}) => {
  const currencyInfo = CURRENCY_MAP[currency];
  const [isClaiming, setIsClaiming] = useState<boolean>(false);
  const [claimMessage, setClaimMessage] = useState<{ type: 'success' | 'info' | 'error'; text: string } | null>(null);
  const [showRewardRules, setShowRewardRules] = useState<boolean>(true);

  // Determine current achieved class and next class target (requires both machine purchase AND required invited people)
  const currentClass = hasBoughtMachine
    ? [...VIP_CLASS_REQUIREMENTS]
        .reverse()
        .find((r) => invitedCount >= r.requiredInvites)
    : undefined;

  const nextClass = VIP_CLASS_REQUIREMENTS.find(
    (r) => !hasBoughtMachine || invitedCount < r.requiredInvites
  );

  const formatReward = (rewardUGX: number) => {
    if (currency === 'UGX') {
      return `${rewardUGX.toLocaleString()} UGX`;
    }
    return currencyInfo.format(rewardUGX);
  };

  const calculated5PctReward = Math.round((Number(totalInvitedMachinesPrice) || 0) * 0.05);
  const isAClassUnlocked = hasBoughtMachine && invitedCount >= 4;

  const handleRowClick = (tier: VipClassRequirement) => {
    const isUnlocked = hasBoughtMachine && invitedCount >= tier.requiredInvites;
    if (isUnlocked) {
      setClaimMessage({
        type: 'success',
        text: `✅ ${tier.name} Unlocked! You have invited ${invitedCount.toLocaleString()} people (Required: ${tier.requiredInvites.toLocaleString()}). Reward tier: ${formatReward(tier.rewardUGX)}.`,
      });
      return;
    }

    const needed = Math.max(0, tier.requiredInvites - invitedCount);
    if (!hasBoughtMachine) {
      setClaimMessage({
        type: 'error',
        text: `🔐 ${tier.name} is Locked! You must first buy a machine and invite ${tier.requiredInvites.toLocaleString()} people to access ${tier.name} (${formatReward(tier.rewardUGX)} reward).`,
      });
    } else {
      setClaimMessage({
        type: 'error',
        text: `🔐 ${tier.name} is Locked! To access ${tier.name} (${formatReward(tier.rewardUGX)} reward), you must have invited ${tier.requiredInvites.toLocaleString()} people who bought a machine (You have ${invitedCount}/${tier.requiredInvites.toLocaleString()} — need ${needed.toLocaleString()} more).`,
      });
    }
  };

  const handleClaimReward = async () => {
    setShowRewardRules(true);
    if (!user) {
      setClaimMessage({
        type: 'info',
        text: "Please sign in to your account to claim last month's reward.",
      });
      return;
    }

    if (!hasBoughtMachine) {
      setClaimMessage({
        type: 'error',
        text: '🔐 Class Requirements Locked! You must buy a machine first and invite at least 4 people to unlock A class and claim rewards.',
      });
      return;
    }

    if (invitedCount < 4) {
      const needed = Math.max(1, 4 - invitedCount);
      setClaimMessage({
        type: 'error',
        text: `🔐 A class is Locked! To access A class and collect rewards, you must have invited 4 people who bought a machine. You currently have ${invitedCount}/4 invited people (${needed} more needed).`,
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
          type: 'error',
          text:
            err?.message ||
            `🔐 Locked: You currently have ${invitedCount} invited customer(s) who bought machines. Invite ${needed} more customer(s) (minimum 4 people) to unlock A class and collect last month's 5% reward!`,
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
              <h2 className="text-sm sm:text-base font-black text-white tracking-wide flex items-center gap-1.5">
                <span>Class Requirements</span>
                {!isAClassUnlocked && <span className="text-xs">🔐</span>}
              </h2>
              <p className="text-[10px] text-slate-400">
                Locked until user buys a machine &amp; invites required people (4 for A class)
              </p>
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
          <div className="flex items-center gap-1.5">
            <h3 className="text-xs sm:text-sm font-black uppercase tracking-wider text-sky-400 font-mono">
              Class Requirements {!isAClassUnlocked ? '🔐' : ''}
            </h3>
            <span
              className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-md border flex items-center gap-1 ${
                isAClassUnlocked
                  ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
                  : 'bg-amber-950/80 border-amber-500/50 text-amber-300'
              }`}
            >
              {isAClassUnlocked ? (
                <>
                  <Unlock className="w-3 h-3 text-emerald-400" />
                  <span>{currentClass?.name || 'A class'} Open</span>
                </>
              ) : (
                <>
                  <Lock className="w-3 h-3 text-amber-400" />
                  <span>Locked • Need 4 Invites for A class</span>
                </>
              )}
            </span>
          </div>
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
        {!isAClassUnlocked ? (
          <Lock className="w-4 h-4 text-amber-300" />
        ) : (
          <Gift className="w-4 h-4 text-white" />
        )}
        <span>
          {isClaiming
            ? 'Processing Settlement...'
            : !isAClassUnlocked
              ? "🔐 Get last month's reward"
              : "Get last month's reward"}
        </span>
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
              : claimMessage.type === 'error'
                ? 'bg-amber-950/80 border border-amber-500/50 text-amber-200'
                : 'bg-[#08132c] border border-[#0091ea]/50 text-sky-200'
          }`}
        >
          {claimMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : claimMessage.type === 'error' ? (
            <Lock className="w-4 h-4 text-amber-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-[#0091ea] shrink-0" />
          )}
          <div className="flex-1 space-y-1.5">
            <span className="block">{claimMessage.text}</span>
            {!hasBoughtMachine && onNavigateToMarketplace && (
              <button
                type="button"
                onClick={onNavigateToMarketplace}
                className="px-3 py-1 bg-[#0091ea] hover:bg-[#0081d6] text-white font-bold rounded-lg text-[11px] cursor-pointer inline-block"
              >
                Buy a Machine Now
              </button>
            )}
          </div>
        </div>
      )}

      {/* Progress Strip */}
      <div className="flex items-center justify-between px-3 py-2.5 bg-[#08132c] rounded-xl border border-[#0e2748] text-xs font-mono">
        <span className="text-slate-300">
          Invited Customers: <strong className="text-white font-bold">{invitedCount}</strong> / 4 for A class
        </span>
        <span className="text-amber-300 font-bold flex items-center gap-1">
          {nextClass ? (
            <>
              <Lock className="w-3 h-3 text-amber-400" />
              <span>
                Need {Math.max(0, nextClass.requiredInvites - invitedCount)} more for {nextClass.name}
              </span>
            </>
          ) : (
            <span className="text-emerald-400">All Classes Unlocked</span>
          )}
        </span>
      </div>

      {/* TABLE FORMAT (MATCHING SCREENSHOT LAYOUT: Invite | Class | Reward, with Lock 🔐 on locked classes) */}
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
            const isQualified = hasBoughtMachine && invitedCount >= tier.requiredInvites;
            const isNext = nextClass?.classLevel === tier.classLevel;

            return (
              <div
                key={tier.classLevel}
                onClick={() => handleRowClick(tier)}
                title={
                  isQualified
                    ? `${tier.name} Unlocked`
                    : `Locked: Invite ${tier.requiredInvites.toLocaleString()} people who buy a machine to unlock ${tier.name}`
                }
                className={`grid grid-cols-3 items-center py-3 sm:py-3.5 transition-colors cursor-pointer ${
                  isQualified
                    ? 'bg-[#0091ea]/15 text-white font-semibold'
                    : isNext
                      ? 'bg-[#08132c]/60 text-slate-200 hover:bg-[#08132c]'
                      : 'text-slate-300 hover:bg-[#08132c]/40'
                }`}
              >
                {/* 1. Invited Count */}
                <div className="text-left font-mono text-sm sm:text-base font-bold pl-1 flex items-center gap-1.5">
                  <span className={isQualified ? 'text-[#00e5ff]' : 'text-slate-200'}>
                    {tier.requiredInvites.toLocaleString()}
                  </span>
                  {isQualified ? (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_#10b981]" />
                  ) : (
                    <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  )}
                </div>

                {/* 2. Class Name (A class, B class, etc.) with Lock 🔐 when locked */}
                <div className="text-center">
                  <span
                    className={`inline-flex items-center justify-center gap-1 text-xs sm:text-sm font-black px-2.5 py-0.5 rounded-md font-mono ${
                      isQualified
                        ? 'bg-[#0091ea] text-white shadow-sm border border-[#00e5ff]/50'
                        : isNext
                          ? 'bg-[#082038] text-sky-300 border border-sky-500/40'
                          : 'bg-[#061226]/80 text-slate-300 border border-[#0e2748]'
                    }`}
                  >
                    {!isQualified && <span className="text-[11px]">🔐</span>}
                    <span>{tier.name}</span>
                  </span>
                </div>

                {/* 3. Reward Amount */}
                <div className="text-right font-mono text-xs sm:text-sm font-extrabold pr-1 flex items-center justify-end gap-1">
                  {!isQualified && <Lock className="w-3 h-3 text-amber-400/80 shrink-0 sm:hidden" />}
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
        <span>
          🔐 All classes are locked until you buy a machine and invite the required number of people (4 invited people to access A class).
        </span>
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
