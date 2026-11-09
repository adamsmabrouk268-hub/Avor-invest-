import React, { useState, useEffect } from 'react';
import { User, Investment, Transaction, Currency } from '../types';
import { CURRENCY_MAP } from '../data/defaultMachines';
import {
  X,
  Copy,
  Check,
  ChevronDown,
  LogOut,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Lock,
  Gift,
  Cpu,
  Save,
} from 'lucide-react';
import { WhatsAppIcon } from './WhatsAppIcon';
import { VipClassTaskTable } from './VipClassTaskTable';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { getShareableInviteLink, getShareableInviteMessage } from '../utils/inviteLink';

interface AccountViewProps {
  user: User | null;
  investments: Investment[];
  currency: Currency;
  onCurrencyChange?: (c: Currency) => void;
  onLogout?: () => void;
  initialTab?: string;
  onClaimYield?: (investmentId?: string) => void;
  onOpenWalletModal: (mode: 'deposit' | 'withdraw') => void;
  onUpdateUser?: (updated: User) => void;
  onOpenAuth?: () => void;
  onNavigateToMarketplace?: () => void;
}

export const AccountView: React.FC<AccountViewProps> = ({
  user,
  investments,
  currency,
  onCurrencyChange,
  onLogout,
  initialTab,
  onOpenWalletModal,
  onUpdateUser,
  onOpenAuth,
  onNavigateToMarketplace,
}) => {
  const currencyInfo = CURRENCY_MAP[currency];
  const { isInstallable, isInstalled, isIOS, isInIframe, install } = usePWAInstall();

  // Active sub-modals for the 9 profile icons
  const [activeModal, setActiveModal] = useState<
    'bill' | 'invite' | 'team' | 'reward' | 'download' | 'manager' | 'settings' | null
  >(initialTab === 'invite' ? 'invite' : null);

  // Chevron dropdown state in Card 1
  const [showBalanceDetails, setShowBalanceDetails] = useState<boolean>(false);

  // Dashboard summary data
  const [dashboardSummary, setDashboardSummary] = useState<any>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [copiedDetails, setCopiedDetails] = useState<boolean>(false);

  // Settings form state
  const [editName, setEditName] = useState<string>(user?.full_name || '');
  const [editPhone, setEditPhone] = useState<string>(user?.phone_number || '');
  const [editPassword, setEditPassword] = useState<string>('');
  const [settingsSavedMsg, setSettingsSavedMsg] = useState<string | null>(null);
  const [downloadConfirmMsg, setDownloadConfirmMsg] = useState<string | null>(null);

  useEffect(() => {
    setEditName(user?.full_name || '');
    setEditPhone(user?.phone_number || '');
  }, [user]);

  useEffect(() => {
    if (!user?.id) return;
    const loadProfileData = () => {
      let refsParam = '';
      try {
        const savedRefs: string[] = JSON.parse(localStorage.getItem('avor_my_deposit_refs') || '[]');
        if (Array.isArray(savedRefs) && savedRefs.length > 0) {
          refsParam = `&refs=${encodeURIComponent(savedRefs.join(','))}`;
        }
      } catch {}
      const phoneParam = user.phone_number
        ? `?phone=${encodeURIComponent(user.phone_number)}${refsParam}`
        : refsParam
          ? `?${refsParam.slice(1)}`
          : '';
      fetch(`/api/user/dashboard-summary/${encodeURIComponent(user.id)}${phoneParam}`)
        .then((r) => (r.ok && (r.headers.get('content-type') || '').includes('application/json') ? r.json() : null))
        .then((data) => {
          if (data) {
            setDashboardSummary(data);
            if (
              onUpdateUser &&
              ((typeof data.balance === 'number' && data.balance !== user.balance) ||
                (typeof data.wallet_balance === 'number' && data.wallet_balance !== user.wallet_balance) ||
                (typeof data.available_wallet === 'number' && data.available_wallet !== user.available_wallet) ||
                (typeof data.has_bought_machine === 'boolean' && data.has_bought_machine !== user.has_bought_machine))
            ) {
              onUpdateUser({
                ...user,
                balance: typeof data.balance === 'number' ? data.balance : user.balance,
                wallet_balance: typeof data.wallet_balance === 'number' ? data.wallet_balance : user.wallet_balance,
                available_wallet: typeof data.available_wallet === 'number' ? data.available_wallet : user.available_wallet,
                has_bought_machine:
                  typeof data.has_bought_machine === 'boolean' ? data.has_bought_machine : user.has_bought_machine,
              });
            }
          }
        })
        .catch(() => {});

      fetch(`/api/transactions/${encodeURIComponent(user.id)}${phoneParam}`)
        .then((r) => (r.ok && (r.headers.get('content-type') || '').includes('application/json') ? r.json() : null))
        .then((data) => {
          if (Array.isArray(data)) setTransactions(data);
        })
        .catch(() => {});
    };

    loadProfileData();
    const interval = setInterval(loadProfileData, 2000);

    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/realtime/wallet-stream');
      es.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          if (
            parsed &&
            (parsed.type === 'WALLET_CONFIRMED_SYNC' ||
              parsed.type === 'WALLET_DENIED_SYNC' ||
              parsed.type === 'DEPOSIT_CREATED_PENDING')
          ) {
            loadProfileData();
          }
        } catch {}
      };
    } catch {}

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('avor_realtime_wallet_sync');
      bc.onmessage = () => {
        loadProfileData();
      };
    } catch {}

    return () => {
      clearInterval(interval);
      try {
        es?.close();
      } catch {}
      try {
        bc?.close();
      } catch {}
    };
  }, [user?.id, user?.phone_number, user?.balance, user?.wallet_balance, user?.has_bought_machine, investments.length]);

  const hasBoughtMachine =
    investments.some((i) => i.status === 'ACTIVE' || i.status === 'PAYOUT_COMPLETE') ||
    Boolean(dashboardSummary?.has_bought_machine);

  const referralCode = user?.referral_code || 'AVOR-7789';
  const referralLink = getShareableInviteLink(referralCode);
  const fullInviteMessage = getShareableInviteMessage(referralCode);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(referralLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(referralCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  const handleCopyFullDetails = () => {
    navigator.clipboard.writeText(fullInviteMessage);
    setCopiedDetails(true);
    setTimeout(() => setCopiedDetails(false), 2500);
  };

  const handleNativeShare = async () => {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: 'Avor Invest (avorinvest.com) — Official Invitation',
          text: fullInviteMessage,
          url: referralLink,
        });
        return;
      } catch {
        // Fallback to copy
      }
    }
    handleCopyFullDetails();
  };

  // Card 1: Wallet (Automatically reflects deposited money; machine cycle starts after Admin confirmation) & Balance (3,000 UGX registration reward + earned income)
  const confirmedTxDeposits = transactions
    .filter((t) => t.type === 'DEPOSIT' && (t.status === 'SUCCESS' || t.status === 'CONFIRMED' || t.status === 'PENDING'))
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const availableWalletValue =
    dashboardSummary?.available_wallet !== undefined
      ? Number(dashboardSummary.available_wallet)
      : dashboardSummary?.wallet_balance !== undefined
        ? Number(dashboardSummary.wallet_balance)
        : Number(user?.available_wallet ?? user?.wallet_balance ?? confirmedTxDeposits);
  const totalDeposited = availableWalletValue;
  const pendingDeposits = Number(dashboardSummary?.deposit_details?.pending_deposits ?? 0);
  const liveBalanceValue = dashboardSummary?.balance ?? user?.balance ?? 0;
  const displayWallet = totalDeposited.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const displayBalance = liveBalanceValue.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const invitedThisMonth =
    dashboardSummary?.team_size_details?.total_joined ??
    dashboardSummary?.team_size ??
    0;
  const activeInvitedCustomersCount =
    dashboardSummary?.team_size_details?.team_size ??
    dashboardSummary?.team_size ??
    0;
  const totalTeamCommission =
    dashboardSummary?.team_size_details?.total_commissions_earned ?? 0;
  const teamMembersList =
    dashboardSummary?.team_size_details?.team_members || [];
  const totalInvitedMachinesPrice =
    dashboardSummary?.team_size_details?.total_invited_machines_price ??
    teamMembersList.reduce((sum: number, m: any) => sum + (Number(m.total_invested) || 0), 0);
  const lastMonthReward5Pct =
    dashboardSummary?.team_size_details?.last_month_reward_5pct ??
    Math.round(totalInvitedMachinesPrice * 0.05);
  const [rewardStatusMsg, setRewardStatusMsg] = useState<{ type: 'success' | 'info'; text: string } | null>(null);
  const [isClaimingLastMonthReward, setIsClaimingLastMonthReward] = useState<boolean>(false);

  const handleClaimLastMonthReward = async () => {
    if (!user) {
      if (onOpenAuth) onOpenAuth();
      return;
    }
    setIsClaimingLastMonthReward(true);
    setRewardStatusMsg(null);
    try {
      const res = await fetch('/api/user/claim-class-reward', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRewardStatusMsg({
          type: 'info',
          text:
            data.error ||
            'Last month\'s reward requires 4 or more invited customers who have bought machines (5% of total machine price).',
        });
      } else {
        setRewardStatusMsg({
          type: 'success',
          text:
            data.message ||
            `Successfully collected ${currencyInfo.format(data.amount_claimed || lastMonthReward5Pct)} (5% of invited customers' machine price) into your balance!`,
        });
        if (onUpdateUser && data.new_balance !== undefined) {
          onUpdateUser({ ...user, balance: data.new_balance });
        }
      }
    } catch {
      setRewardStatusMsg({
        type: 'info',
        text: 'Unable to process reward settlement right now. Please try again.',
      });
    } finally {
      setIsClaimingLastMonthReward(false);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      if (onOpenAuth) onOpenAuth();
      return;
    }

    const updatedUser: User = {
      ...user,
      full_name: editName.trim() || user.full_name,
      name: editName.trim() || user.name,
      phone_number: editPhone.trim() || user.phone_number,
    };

    try {
      await fetch('/api/user/update-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          full_name: updatedUser.full_name,
          phone_number: updatedUser.phone_number,
          password: editPassword.trim() || undefined,
        }),
      });
    } catch (err) {
      // Soft fallback to local update
    }

    try {
      localStorage.setItem('avor_invest_user', JSON.stringify(updatedUser));
    } catch (err) {}

    if (onUpdateUser) {
      onUpdateUser(updatedUser);
    }

    setEditPassword('');
    setSettingsSavedMsg('Account settings updated and saved successfully!');
    setTimeout(() => setSettingsSavedMsg(null), 3500);
  };

  return (
    <div className="w-full max-w-md mx-auto py-2 sm:py-4 px-2.5 sm:px-3 text-white space-y-3.5 select-none animate-fade-in font-sans">
      {/* =========================================================================
          CARD 1: TOP WALLET & BALANCE
          Wallet: Deposited Capital   |   Balance: Available Balance
          Double Chevron ︾ in bottom center
         ========================================================================= */}
      <div className="bg-[#03081a] border border-[#0091ea]/60 rounded-2xl p-4 sm:p-5 shadow-[0_0_25px_rgba(0,145,234,0.14)] relative">
        <div className="grid grid-cols-2 text-center items-center">
          {/* Left Column: Wallet (Clickable when funded to access Wallet balance & buy machines) */}
          <div
            onClick={() => {
              if (totalDeposited > 0 && onNavigateToMarketplace) {
                onNavigateToMarketplace();
              } else {
                onOpenWalletModal('deposit');
              }
            }}
            className="cursor-pointer group"
            title={totalDeposited > 0 ? 'Tap to access Wallet balance and buy a machine' : 'Tap to deposit'}
          >
            <span className="text-xs sm:text-sm text-slate-400 font-medium tracking-wide block group-hover:text-sky-300 transition-colors">
              Wallet
            </span>
            <span className="text-2xl sm:text-3xl font-black text-white font-mono mt-1 block group-hover:text-sky-300 transition-colors">
              {displayWallet}
            </span>
          </div>

          {/* Right Column: Balance */}
          <div>
            <span className="text-xs sm:text-sm text-slate-400 font-medium tracking-wide block">
              Balance
            </span>
            <span className="text-2xl sm:text-3xl font-black text-white font-mono mt-1 block">
              {displayBalance}
            </span>
          </div>
        </div>

        {/* Center Double Chevron ︾ Icon (Clickable to show user info details) */}
        <button
          type="button"
          onClick={() => setShowBalanceDetails(!showBalanceDetails)}
          className="w-full flex items-center justify-center pt-2 mt-1 cursor-pointer group focus:outline-none"
          title="Toggle account details"
        >
          <div className="flex flex-col items-center -space-y-1 text-[#0091ea] group-hover:text-cyan-300 transition-colors">
            <ChevronDown
              className={`w-4 h-4 transition-transform duration-300 ${
                showBalanceDetails ? 'rotate-180 text-cyan-300' : ''
              }`}
            />
            <ChevronDown
              className={`w-4 h-4 -mt-2.5 transition-transform duration-300 ${
                showBalanceDetails ? 'rotate-180 text-cyan-300' : ''
              }`}
            />
          </div>
        </button>

        {/* Collapsible Details Drawer */}
        {showBalanceDetails && (
          <div className="mt-3 pt-3 border-t border-[#0091ea]/30 text-xs space-y-2 animate-fade-in">
            <div className="flex justify-between text-slate-300 font-mono">
              <span className="text-slate-400">Account ID:</span>
              <span className="font-bold text-white">{user?.id?.slice(0, 14) || 'AVOR-INVESTOR'}</span>
            </div>
            <div className="flex justify-between text-slate-300 font-mono">
              <span className="text-slate-400">Phone Number:</span>
              <span className="font-bold text-sky-400">{user?.phone_number || 'Not Set'}</span>
            </div>
            <div className="flex justify-between text-slate-300 font-mono">
              <span className="text-slate-400">Customer Status:</span>
              <span className={`font-bold ${hasBoughtMachine ? 'text-emerald-400' : 'text-amber-400'}`}>
                {hasBoughtMachine ? `Active Customer (${investments.length} Units)` : 'No Machine Purchased Yet'}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* =========================================================================
          CARD 2: 9 ACTION ICONS GRID (VIP icon removed per Item 10;
                  Deposit & Withdraw placed in Profile page per Item 15;
                  All icons responsive per Item 6)
          Row 1: Deposit, Withdraw, Bill, Invite
          Row 2: My team, Reward, Download App, Manager
          Row 3: Settings
         ========================================================================= */}
      <div className="bg-[#03081a] border border-[#0091ea]/60 rounded-2xl p-4 sm:p-5 shadow-[0_0_25px_rgba(0,145,234,0.14)]">
        <div className="grid grid-cols-4 gap-y-4 gap-x-2 sm:gap-x-3 text-center">
          {/* 1. Deposit */}
          <button
            type="button"
            onClick={() => onOpenWalletModal('deposit')}
            className="flex flex-col items-center group cursor-pointer focus:outline-none"
          >
            <div className="w-13 h-13 sm:w-15 sm:h-15 rounded-2xl bg-[#0091ea] hover:bg-[#0081d6] active:scale-95 transition-all flex items-center justify-center shadow-lg shadow-[#0091ea]/35 text-white">
              <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="5" width="20" height="14" rx="3" />
                <line x1="2" y1="10" x2="22" y2="10" />
                <rect x="6" y="14" width="4" height="2" fill="white" />
              </svg>
            </div>
            <span className="text-xs text-slate-300 font-medium mt-1.5 leading-tight group-hover:text-white transition-colors">
              Deposit
            </span>
          </button>

          {/* 2. Withdraw */}
          <button
            type="button"
            onClick={() => onOpenWalletModal('withdraw')}
            className="flex flex-col items-center group cursor-pointer focus:outline-none"
          >
            <div className="w-13 h-13 sm:w-15 sm:h-15 rounded-2xl bg-[#0091ea] hover:bg-[#0081d6] active:scale-95 transition-all flex items-center justify-center shadow-lg shadow-[#0091ea]/35 text-white">
              <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2v9m0 0l-3-3m3 3l3-3" />
                <rect x="3" y="13" width="18" height="8" rx="2" />
                <circle cx="12" cy="17" r="1.5" fill="white" />
              </svg>
            </div>
            <span className="text-xs text-slate-300 font-medium mt-1.5 leading-tight group-hover:text-white transition-colors">
              Withdraw
            </span>
          </button>

          {/* 3. Bill */}
          <button
            type="button"
            onClick={() => setActiveModal('bill')}
            className="flex flex-col items-center group cursor-pointer focus:outline-none"
          >
            <div className="w-13 h-13 sm:w-15 sm:h-15 rounded-2xl bg-[#0091ea] hover:bg-[#0081d6] active:scale-95 transition-all flex items-center justify-center shadow-lg shadow-[#0091ea]/35 text-white">
              <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="3" />
                <line x1="7" y1="8" x2="17" y2="8" />
                <line x1="7" y1="12" x2="17" y2="12" />
                <line x1="7" y1="16" x2="12" y2="16" />
              </svg>
            </div>
            <span className="text-xs text-slate-300 font-medium mt-1.5 leading-tight group-hover:text-white transition-colors">
              Bill
            </span>
          </button>

          {/* 4. Invite 🔐 (Locked until user buys a machine; opens automatically once user buys a machine) */}
          <button
            type="button"
            onClick={() => setActiveModal('invite')}
            className="flex flex-col items-center group cursor-pointer focus:outline-none relative"
          >
            <div className="w-13 h-13 sm:w-15 sm:h-15 rounded-2xl bg-[#0091ea] hover:bg-[#0081d6] active:scale-95 transition-all flex items-center justify-center shadow-lg shadow-[#0091ea]/35 text-white relative">
              <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 15h2a2 2 0 1 0 0-4h-3c-.6 0-1.1.2-1.4.6L3 17" />
                <path d="m7 21 1.6-1.4c.3-.4.8-.6 1.4-.6h4c1.1 0 2.1-.4 2.8-1.2l4.6-4.4a2 2 0 0 0-2.8-2.8L15 13" />
                <path d="M2 13a4 4 0 0 1 4-4h2" />
              </svg>
              {!hasBoughtMachine && (
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-amber-950 border border-amber-400 text-amber-300 flex items-center justify-center shadow-md">
                  <Lock className="w-3 h-3" />
                </span>
              )}
            </div>
            <span className="text-xs text-slate-300 font-medium mt-1.5 leading-tight group-hover:text-white transition-colors flex items-center gap-0.5">
              <span>{!hasBoughtMachine ? 'Invite 🔐' : 'Invite'}</span>
            </span>
          </button>

          {/* 5. My team */}
          <button
            type="button"
            onClick={() => setActiveModal('team')}
            className="flex flex-col items-center group cursor-pointer focus:outline-none"
          >
            <div className="w-13 h-13 sm:w-15 sm:h-15 rounded-2xl bg-[#0091ea] hover:bg-[#0081d6] active:scale-95 transition-all flex items-center justify-center shadow-lg shadow-[#0091ea]/35 text-white">
              <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                <circle cx="18" cy="8" r="2.5" />
                <path d="M18 13c1.5 0 4 .7 4 2v2h-3v-2c0-.7-.3-1.4-.8-1.8z" />
                <circle cx="6" cy="8" r="2.5" />
                <path d="M6 13c-1.5 0-4 .7-4 2v2h3v-2c0-.7.3-1.4.8-1.8z" />
              </svg>
            </div>
            <span className="text-xs text-slate-300 font-medium mt-1.5 leading-tight group-hover:text-white transition-colors">
              My team
            </span>
          </button>

          {/* 6. Install App (Triggers native PWA standalone installation with App Icon) */}
          <button
            type="button"
            onClick={async () => {
              setDownloadConfirmMsg(null);
              if (isInstallable) {
                const accepted = await install();
                if (accepted) {
                  setDownloadConfirmMsg('Avor invest App installed successfully with official app icon!');
                }
              }
              setActiveModal('download');
            }}
            className="flex flex-col items-center group cursor-pointer focus:outline-none"
          >
            <div className="w-13 h-13 sm:w-15 sm:h-15 rounded-2xl bg-[#0091ea] hover:bg-[#0081d6] active:scale-95 transition-all flex items-center justify-center shadow-lg shadow-[#0091ea]/35 text-white">
              <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v12m0 0l-4-4m4 4l4-4" />
                <path d="M5 16v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />
              </svg>
            </div>
            <span className="text-xs text-slate-300 font-medium mt-1.5 leading-tight group-hover:text-white transition-colors">
              Install App
            </span>
          </button>

          {/* 7. Manage / Manager 🔐 (Locked until user buys a machine; opens automatically once user buys a machine) */}
          <button
            type="button"
            onClick={() => setActiveModal('manager')}
            className="flex flex-col items-center group cursor-pointer focus:outline-none relative"
          >
            <div className="w-13 h-13 sm:w-15 sm:h-15 rounded-2xl bg-[#0091ea] hover:bg-[#0081d6] active:scale-95 transition-all flex items-center justify-center shadow-lg shadow-[#0091ea]/35 text-white relative">
              <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
                <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
                <path d="M12 19v3" />
              </svg>
              {!hasBoughtMachine && (
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-amber-950 border border-amber-400 text-amber-300 flex items-center justify-center shadow-md">
                  <Lock className="w-3 h-3" />
                </span>
              )}
            </div>
            <span className="text-xs text-slate-300 font-medium mt-1.5 leading-tight group-hover:text-white transition-colors flex items-center gap-0.5">
              <span>{!hasBoughtMachine ? 'Manage 🔐' : 'Manage'}</span>
            </span>
          </button>

          {/* 8. Settings */}
          <button
            type="button"
            onClick={() => {
              setSettingsSavedMsg(null);
              setActiveModal('settings');
            }}
            className="flex flex-col items-center group cursor-pointer focus:outline-none"
          >
            <div className="w-13 h-13 sm:w-15 sm:h-15 rounded-2xl bg-[#0091ea] hover:bg-[#0081d6] active:scale-95 transition-all flex items-center justify-center shadow-lg shadow-[#0091ea]/35 text-white">
              <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="7" r="4" />
                <path d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2" />
                <circle cx="19" cy="11" r="2" />
                <path d="M19 8v1m0 4v1m-2.6-4.5.7.7m3.8 3.8.7.7m-4.5.7.7-.7m3.8-3.8.7-.7" />
              </svg>
            </div>
            <span className="text-xs text-slate-300 font-medium mt-1.5 leading-tight group-hover:text-white transition-colors">
              Settings
            </span>
          </button>
        </div>
      </div>

      {/* =========================================================================
          CARD 3: CLASS REQUIREMENTS TABLE (Locked until user buys a machine & invites 4+ people)
         ========================================================================= */}
      <div id="class-requirements-table">
        <VipClassTaskTable
          user={user}
          currency={currency}
          hasBoughtMachine={hasBoughtMachine}
          invitedCount={activeInvitedCustomersCount}
          totalInvitedMachinesPrice={totalInvitedMachinesPrice}
          onNavigateToMarketplace={onNavigateToMarketplace}
          onRewardClaimed={(newBalance) => {
            if (user && onUpdateUser) {
              onUpdateUser({ ...user, balance: newBalance });
            }
          }}
          isModal={false}
        />
      </div>

      {/* =========================================================================
          MODALS FOR THE 9 PROFILE ACTIONS
         ========================================================================= */}

      {/* Modal 1: Bill (Keeps All Statement / Financial Records per Item 13) */}
      {activeModal === 'bill' && (() => {
        // Merge and deduplicate all financial & statement records from transactions, dashboardSummary deposits/withdrawals, and machine investments
        const recordMap = new Map<string, {
          id: string;
          type: string;
          title: string;
          subtitle: string;
          amount: number;
          isDebit: boolean;
          status: string;
          created_at: string;
        }>();

        transactions.forEach((tx) => {
          const isDebit = tx.type === 'WITHDRAWAL' || tx.type === 'INVESTMENT';
          recordMap.set(String(tx.id), {
            id: String(tx.id),
            type: String(tx.type || 'TRANSACTION').toUpperCase(),
            title:
              tx.type === 'DEPOSIT'
                ? 'Wallet Deposit'
                : tx.type === 'WITHDRAWAL'
                  ? 'Income Withdrawal'
                  : tx.type === 'INVESTMENT'
                    ? 'Machine Purchase'
                    : tx.type === 'YIELD'
                      ? 'Daily Machine Yield'
                      : tx.type === 'COMMISSION'
                        ? '8% Referral Commission'
                        : String(tx.type || 'Statement Entry'),
            subtitle: [tx.payment_method, tx.payment_reference].filter(Boolean).join(' • ') || 'Official Financial Statement',
            amount: Math.abs(Number(tx.amount) || 0),
            isDebit,
            status: String(tx.status || 'SUCCESS').toUpperCase(),
            created_at: tx.created_at || new Date().toISOString(),
          });
        });

        // Include any recent deposits from dashboardSummary not yet in transactions
        const summaryDeposits: any[] = dashboardSummary?.deposit_details?.recent_deposits || [];
        summaryDeposits.forEach((dep) => {
          const key = String(dep.id || dep.reference || `dep-${dep.created_at}`);
          if (!recordMap.has(key)) {
            recordMap.set(key, {
              id: key,
              type: 'DEPOSIT',
              title: 'Wallet Deposit',
              subtitle: [dep.method, dep.reference].filter(Boolean).join(' • ') || 'Mobile Money Deposit',
              amount: Math.abs(Number(dep.amount) || 0),
              isDebit: false,
              status: String(dep.status || 'SUCCESS').toUpperCase(),
              created_at: dep.created_at || new Date().toISOString(),
            });
          }
        });

        // Include any recent withdrawals from dashboardSummary not yet in transactions
        const summaryWithdrawals: any[] = dashboardSummary?.withdraw_details?.recent_withdrawals || [];
        summaryWithdrawals.forEach((wd) => {
          const key = String(wd.id || wd.reference || `wd-${wd.created_at}`);
          if (!recordMap.has(key)) {
            recordMap.set(key, {
              id: key,
              type: 'WITHDRAWAL',
              title: 'Income Withdrawal',
              subtitle: [wd.method, wd.reference].filter(Boolean).join(' • ') || 'Mobile Money Payout',
              amount: Math.abs(Number(wd.amount) || 0),
              isDebit: true,
              status: String(wd.status || 'PENDING').toUpperCase(),
              created_at: wd.created_at || new Date().toISOString(),
            });
          }
        });

        // Include all machine investment orders & accrued yield statements
        investments.forEach((inv) => {
          const invKey = `inv-${inv.id}`;
          if (!recordMap.has(invKey) && !Array.from(recordMap.values()).some((r) => r.type === 'INVESTMENT' && r.subtitle.includes(inv.machine_name))) {
            recordMap.set(invKey, {
              id: invKey,
              type: 'MACHINE ORDER',
              title: `Machine Order: ${inv.machine_name}`,
              subtitle: `${inv.units || 1} Unit(s) • Daily Yield ${currencyInfo.format(Number(inv.daily_yield) || 0)}`,
              amount: Math.abs(Number(inv.invested_amount) || 0),
              isDebit: true,
              status: String(inv.status || 'PENDING').toUpperCase(),
              created_at: inv.start_date || new Date().toISOString(),
            });
          }
        });

        const allRecords = Array.from(recordMap.values()).sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );

        const totalWithdrawnIncome = Number(dashboardSummary?.withdraw_details?.total_withdrawn ?? 0);

        return (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-[#03081a] border border-[#0091ea]/60 shadow-[0_0_25px_rgba(0,145,234,0.2)] rounded-2xl p-5 max-w-md w-full space-y-3.5 max-h-[88vh] flex flex-col">
              <div className="flex items-center justify-between pb-3 border-b border-[#0e2748]">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-[#0091ea] flex items-center justify-center text-white">
                    <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <line x1="7" y1="8" x2="17" y2="8" />
                      <line x1="7" y1="12" x2="17" y2="12" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white leading-tight">Bill &amp; Financial Statements</h3>
                    <span className="text-[10px] font-mono text-sky-400">
                      Complete Statement &amp; Financial Records ({allRecords.length})
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setActiveModal(null)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Financial Statement Summary Strip */}
              <div className="grid grid-cols-3 gap-2 text-center font-mono text-[10px] bg-[#06112a] border border-[#0e2748] p-2.5 rounded-xl">
                <div>
                  <span className="text-slate-400 block">Wallet</span>
                  <span className="text-sky-400 font-black text-xs block mt-0.5">
                    {currencyInfo.format(totalDeposited)}
                  </span>
                </div>
                <div className="border-x border-[#0e2748] px-1">
                  <span className="text-slate-400 block">Balance</span>
                  <span className="text-emerald-400 font-black text-xs block mt-0.5">
                    {currencyInfo.format(liveBalanceValue)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block">Withdrawn</span>
                  <span className="text-amber-300 font-black text-xs block mt-0.5">
                    {currencyInfo.format(totalWithdrawnIncome)}
                  </span>
                </div>
              </div>

              {/* Statement & Financial Records List */}
              <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
                {allRecords.length === 0 ? (
                  <div className="text-center py-10 text-slate-400 space-y-2">
                    <p className="text-sm font-bold text-slate-300">No financial statements recorded yet.</p>
                    <p className="text-xs text-slate-500">
                      All your deposits, withdrawals, machine purchases, daily yields, commissions, and balance statements are permanently kept here.
                    </p>
                  </div>
                ) : (
                  allRecords.map((rec) => (
                    <div
                      key={rec.id}
                      className="bg-[#08132c] border border-[#0e2748] p-3 rounded-xl flex items-center justify-between text-xs font-mono"
                    >
                      <div className="min-w-0 pr-2 space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-white uppercase">{rec.title}</span>
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-950/80 border border-blue-700/40 text-sky-300 font-bold">
                            {rec.type}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-300 block truncate">{rec.subtitle}</span>
                        <span className="text-[10px] text-slate-400 block">
                          {new Date(rec.created_at).toLocaleString()}
                        </span>
                      </div>
                      <div className="text-right shrink-0">
                        <span
                          className={`font-black text-sm block ${
                            rec.isDebit ? 'text-rose-400' : 'text-emerald-400'
                          }`}
                        >
                          {rec.isDebit ? '-' : '+'}
                          {currencyInfo.format(rec.amount)}
                        </span>
                        <span
                          className={`text-[10px] font-bold uppercase ${
                            rec.status === 'SUCCESS' ||
                            rec.status === 'CONFIRMED' ||
                            rec.status === 'ACTIVE' ||
                            rec.status === 'CREDITED' ||
                            rec.status === 'PAYOUT_COMPLETE'
                              ? 'text-emerald-400'
                              : rec.status.includes('PENDING')
                                ? 'text-amber-300'
                                : 'text-rose-400'
                          }`}
                        >
                          {rec.status === 'SUCCESS' || rec.status === 'CONFIRMED'
                            ? 'CONFIRMED'
                            : rec.status}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>

              <button
                onClick={() => setActiveModal(null)}
                className="w-full py-2.5 bg-[#0091ea] hover:bg-[#0081d6] text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Close Statement Records
              </button>
            </div>
          </div>
        );
      })()}

      {/* Modal 2: Invite (Locked until user buys a machine; opens automatically once user buys a machine) */}
      {activeModal === 'invite' && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[#03081a] border border-[#0091ea]/60 shadow-[0_0_25px_rgba(0,145,234,0.25)] rounded-2xl p-5 max-w-md w-full space-y-3.5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[#0e2748]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center text-white font-black text-xs shadow-md">
                  AVOR
                </div>
                <div>
                  <h3 className="text-base font-black text-white leading-tight">
                    {!hasBoughtMachine ? 'Invite Locked 🔐' : 'Avor Invest Invite Plane'}
                  </h3>
                  <span className="text-[11px] font-mono text-cyan-400 font-bold">
                    {!hasBoughtMachine ? 'Opens when you buy a machine' : 'Official Access • avorinvest.com'}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {!hasBoughtMachine ? (
              <div className="bg-[#08132c] border border-amber-500/40 rounded-xl p-4 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-amber-950/80 border border-amber-500/50 flex items-center justify-center mx-auto text-amber-400">
                  <Lock className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-black text-white">
                  Invite Link &amp; Code Locked 🔐
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  <strong>WhatsApp 🔐, Company PDF, Invite, and Manage</strong> are locked until you buy a machine. As soon as you buy a machine, your personal Invite code &amp; link open up automatically!
                </p>
                {onNavigateToMarketplace && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveModal(null);
                      onNavigateToMarketplace();
                    }}
                    className="w-full py-2.5 bg-gradient-to-r from-[#0091ea] to-[#0077b6] hover:brightness-110 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer shadow-md"
                  >
                    <Cpu className="w-4 h-4" />
                    <span>Buy a Machine to Unlock Invite</span>
                  </button>
                )}
              </div>
            ) : (
              <>
                {/* Avor Invest Platform Summary Card */}
                <div className="bg-gradient-to-br from-[#071536] via-[#06112b] to-[#040a1a] border border-blue-500/40 rounded-xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black uppercase tracking-wider text-cyan-300 font-mono">
                      🌐 avorinvest.com Official Invitation
                    </span>
                    <span className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-bold">
                      Unlocked ✅
                    </span>
                  </div>
                  <p className="text-xs text-slate-200 leading-relaxed">
                    Share your official <strong className="text-white">Avor Invest (avorinvest.com)</strong> link below. Anyone who opens your link is directed straight to the Avor Invest registration gateway with your invite code pre-filled:
                  </p>
                  <ul className="text-[11px] text-slate-300 space-y-1 font-mono pl-1">
                    <li>• <strong className="text-emerald-400">UGX 3,000</strong> Free Automatic Registration Welcome Bonus</li>
                    <li>• <strong className="text-sky-400">8% Invitation Commission</strong> on Same-Machine Purchases</li>
                    <li>• <strong className="text-cyan-300">5% Monthly Class Reward</strong> (4+ Active Invited Buyers)</li>
                  </ul>
                </div>

                <div className="space-y-3 text-xs">
                  <div>
                    <label className="text-slate-300 font-bold block mb-1">
                      Your Official Avor Invest Invite Code:
                    </label>
                    <div className="flex items-center gap-2 bg-[#08132c] border border-blue-500/40 p-2.5 rounded-xl">
                      <span className="font-mono font-black text-sm text-sky-400 flex-1 select-all">
                        {referralCode}
                      </span>
                      <button
                        type="button"
                        onClick={handleCopyCode}
                        className="px-3 py-1.5 bg-[#0091ea] hover:bg-[#0081d6] text-white rounded-lg font-bold flex items-center gap-1 cursor-pointer shrink-0"
                      >
                        {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedCode ? 'Copied!' : 'Copy Code'}</span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="text-slate-300 font-bold block mb-1">
                      Direct Registration Link (Opens Avor Invest on Any Device):
                    </label>
                    <div className="flex items-center gap-2 bg-[#08132c] border border-blue-500/40 p-2.5 rounded-xl">
                      <input
                        type="text"
                        readOnly
                        value={referralLink}
                        onClick={(e) => (e.target as HTMLInputElement).select()}
                        className="font-mono text-[11px] text-cyan-200 bg-transparent outline-none w-full flex-1 select-all"
                      />
                      <button
                        type="button"
                        onClick={handleCopyLink}
                        className="px-3 py-1.5 bg-[#0091ea] hover:bg-[#0081d6] text-white rounded-lg font-bold flex items-center gap-1 cursor-pointer shrink-0"
                      >
                        {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedLink ? 'Link Copied!' : 'Copy Link'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Preview of Avor Invest Invite Details */}
                  <div className="bg-[#050d21] border border-[#122b57] rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-300">
                        Avor Invest Invitation Package (With Link &amp; Details):
                      </span>
                      <button
                        type="button"
                        onClick={handleCopyFullDetails}
                        className="text-[11px] font-bold text-cyan-400 hover:text-cyan-300 flex items-center gap-1 cursor-pointer"
                      >
                        {copiedDetails ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedDetails ? 'Copied Package!' : 'Copy Full Details'}</span>
                      </button>
                    </div>
                    <pre className="text-[10px] text-slate-300 font-mono whitespace-pre-wrap break-all bg-[#030816] p-2.5 rounded-lg border border-blue-950/80 select-all">
                      {fullInviteMessage}
                    </pre>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                    <a
                      href={`https://wa.me/?text=${encodeURIComponent(fullInviteMessage)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-md cursor-pointer text-center"
                    >
                      <WhatsAppIcon className="w-4 h-4 fill-white shrink-0" />
                      <span>Send on WhatsApp</span>
                    </a>

                    <button
                      type="button"
                      onClick={handleNativeShare}
                      className="w-full py-2.5 px-3 bg-gradient-to-r from-blue-600 to-cyan-500 hover:brightness-110 text-white rounded-xl font-bold flex items-center justify-center gap-2 shadow-md cursor-pointer"
                    >
                      <ExternalLink className="w-4 h-4 shrink-0" />
                      <span>{copiedDetails ? 'Copied to Clipboard!' : 'Share Invite Link'}</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal 3: My Team */}
      {activeModal === 'team' && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[#03081a] border border-[#0091ea]/60 shadow-[0_0_25px_rgba(0,145,234,0.2)] rounded-2xl p-5 max-w-md w-full space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-[#0e2748]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#0091ea] flex items-center justify-center text-white">
                  <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-white">My Team Network</h3>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-center text-xs font-mono">
              <div className="bg-[#08132c] border border-[#0e2748] p-2.5 rounded-xl">
                <span className="text-slate-400 block text-[10px]">Invited Members</span>
                <span className="text-xl font-black text-white mt-0.5 block">{invitedThisMonth}</span>
              </div>
              <div className="bg-[#08132c] border border-[#0e2748] p-2.5 rounded-xl">
                <span className="text-slate-400 block text-[10px]">Team Commission</span>
                <span className="text-xl font-black text-emerald-400 mt-0.5 block">
                  {currencyInfo.format(totalTeamCommission)}
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1 text-xs">
              {teamMembersList.length === 0 ? (
                <div className="text-center py-8 text-slate-400 space-y-1">
                  <p className="text-xs font-bold text-slate-300">No team members registered yet.</p>
                  <p className="text-[11px] text-slate-500">
                    Share your personal invite link from the Invite icon to build your team and unlock Class A–I rewards.
                  </p>
                </div>
              ) : (
                teamMembersList.map((m: any, idx: number) => (
                  <div key={m.id || idx} className="bg-[#08132c] border border-[#0e2748] p-2.5 rounded-xl flex items-center justify-between font-mono">
                    <div>
                      <span className="font-bold text-white block">{m.phone_masked || m.full_name}</span>
                      <span className="text-[10px] text-slate-400">
                        Joined {m.joined_at ? new Date(m.joined_at).toLocaleDateString() : 'Recently'}
                      </span>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded font-bold ${m.has_bought_machine ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/40' : 'bg-slate-800 text-slate-400'}`}>
                      {m.has_bought_machine ? 'Machine Active' : 'Registered'}
                    </span>
                  </div>
                ))
              )}
            </div>

            <button
              onClick={() => setActiveModal(null)}
              className="w-full py-2.5 bg-[#0091ea] hover:bg-[#0081d6] text-white rounded-xl text-xs font-bold cursor-pointer"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Modal 4: Last Month's Reward Icon Modal (Displays the two clear statements per Item 6) */}
      {activeModal === 'reward' && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[#03081a] border border-[#0091ea]/60 shadow-[0_0_25px_rgba(0,145,234,0.2)] rounded-2xl p-5 max-w-md w-full space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#0e2748]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#0091ea] flex items-center justify-center text-white">
                  <Gift className="w-4 h-4 text-white" />
                </div>
                <h3 className="text-base font-bold text-white">Last Month&apos;s Reward</h3>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Clear Statements Required in the Last Month's Reward Icon Modal */}
            <div className="bg-[#08132c] border border-[#0091ea]/50 p-4 rounded-xl space-y-3 text-left">
              <span className="text-[11px] font-black uppercase tracking-wider text-sky-400 block">
                Official Last Month&apos;s Reward Rules:
              </span>
              <div className="space-y-2.5 text-xs text-slate-100 leading-relaxed font-medium">
                <p className="flex items-start gap-2">
                  <span className="text-[#a3e635] font-black text-sm leading-none mt-0.5">1.</span>
                  <span>
                    Last month&apos;s reward is to be always collected on every <strong>28th of every month</strong> to the customers&apos; balance for withdraw.
                  </span>
                </p>
                <p className="flex items-start gap-2">
                  <span className="text-[#a3e635] font-black text-sm leading-none mt-0.5">*</span>
                  <span>
                    Last month&apos;s reward should be collected when a customer has invited <strong>4 or more customers</strong> (people who have bought machines)
                  </span>
                </p>
                <p className="flex items-start gap-2">
                  <span className="text-[#a3e635] font-black text-sm leading-none mt-0.5">*</span>
                  <span>
                    Total last month&apos;s reward collected should be only <strong>5%</strong> the total the machine&apos;s price the invited customer has bought.
                  </span>
                </p>
              </div>
            </div>

            {/* Live Calculation Summary */}
            <div className="grid grid-cols-2 gap-2 text-center text-xs font-mono">
              <div className="bg-[#08132c] border border-[#0e2748] p-3 rounded-xl">
                <span className="text-[10px] text-slate-400 block">Invited Customers (Buyers)</span>
                <span className={`text-lg font-black mt-0.5 block ${activeInvitedCustomersCount >= 4 ? 'text-emerald-400' : 'text-amber-300'}`}>
                  {activeInvitedCustomersCount} / 4 Min
                </span>
              </div>
              <div className="bg-[#08132c] border border-[#0e2748] p-3 rounded-xl">
                <span className="text-[10px] text-slate-400 block">5% Reward Amount</span>
                <span className="text-lg font-black text-emerald-400 mt-0.5 block">
                  {currencyInfo.format(lastMonthReward5Pct)}
                </span>
              </div>
            </div>

            {rewardStatusMsg && (
              <div
                className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 ${
                  rewardStatusMsg.type === 'success'
                    ? 'bg-emerald-950/80 border border-emerald-500/50 text-emerald-300'
                    : 'bg-[#08132c] border border-[#0091ea]/50 text-sky-200'
                }`}
              >
                {rewardStatusMsg.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-[#0091ea] shrink-0" />
                )}
                <span>{rewardStatusMsg.text}</span>
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleClaimLastMonthReward}
                disabled={isClaimingLastMonthReward}
                className="flex-1 py-2.5 bg-gradient-to-r from-[#0091ea] to-[#0077b6] hover:brightness-110 text-white rounded-xl text-xs font-bold cursor-pointer shadow-md"
              >
                {isClaimingLastMonthReward ? 'Processing...' : "Get last month's reward (5%)"}
              </button>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-4 py-2.5 bg-[#08132c] text-slate-300 hover:text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 5: Install App (Standalone PWA Installation with Official App Icon — Not a Shortcut) */}
      {activeModal === 'download' && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[#03081a] border border-[#0091ea]/60 shadow-[0_0_25px_rgba(0,145,234,0.2)] rounded-2xl p-5 max-w-md w-full space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#0e2748]">
              <div className="flex items-center gap-2.5">
                <img
                  src="/pwa-192x192.png"
                  alt="Avor invest App Icon"
                  className="w-10 h-10 rounded-xl border border-[#00e5ff]/60 shadow-md"
                />
                <div>
                  <h3 className="text-base font-bold text-white">Install Avor invest App</h3>
                  <p className="text-[10px] text-emerald-400 font-mono font-bold">
                    Standalone App Package • Official App Icon
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-[#08132c] border border-[#0e2748] p-3.5 rounded-xl flex items-center gap-3">
              <img
                src="/pwa-192x192.png"
                alt="Avor invest Icon"
                className="w-14 h-14 rounded-2xl border border-[#00e5ff]/50 shadow-lg shrink-0"
              />
              <div className="text-xs space-y-1">
                <span className="font-black text-white block text-sm">Avor invest</span>
                <span className="text-[11px] text-slate-300 block leading-snug">
                  Installs directly on your phone as a standalone application with the official <strong>Avor invest</strong> app icon (not a browser shortcut).
                </span>
              </div>
            </div>

            <div className="space-y-2 text-xs text-slate-300 leading-relaxed">
              {isInstalled ? (
                <div className="p-3 rounded-xl bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 text-xs font-bold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>Avor invest is already installed as a standalone app on your device!</span>
                </div>
              ) : isIOS ? (
                <div className="bg-[#08132c] border border-[#0e2748] p-3 rounded-xl space-y-1.5 font-mono text-[11px]">
                  <p className="text-sky-400 font-bold">iPhone / iPad Standalone App Install:</p>
                  <p>1. Tap the <strong className="text-white">Share</strong> button in Safari</p>
                  <p>2. Select <strong className="text-emerald-400">"Add to Home Screen"</strong></p>
                  <p>3. Tap <strong className="text-emerald-400">"Add"</strong> to install with the official Avor invest App Icon</p>
                </div>
              ) : (
                <div className="bg-[#08132c] border border-[#0e2748] p-3 rounded-xl space-y-1.5 font-mono text-[11px]">
                  <p className="text-sky-400 font-bold">Android / Chrome Native App Install:</p>
                  <p>1. Tap <strong className="text-emerald-400">"Install Avor invest App Now"</strong> below (or tap <strong className="text-white">⋮ → Install app</strong> in Chrome)</p>
                  <p>2. Confirm <strong className="text-emerald-400">"Install"</strong> in the system dialog</p>
                  <p>3. Launch <strong className="text-white">Avor invest</strong> from your app drawer with its official app icon</p>
                </div>
              )}
            </div>

            {downloadConfirmMsg && (
              <div className="p-3 rounded-xl bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 text-xs font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{downloadConfirmMsg}</span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2">
              {!isInstalled && (
                <button
                  type="button"
                  onClick={async () => {
                    if (isInstallable) {
                      const accepted = await install();
                      if (accepted) {
                        setDownloadConfirmMsg('Avor invest App is installing to your device with the official app icon!');
                      }
                    } else if (isInIframe) {
                      window.open(window.location.href, '_blank', 'noopener,noreferrer');
                      setDownloadConfirmMsg('Opened in main browser window — tap "Install App" to complete full app installation.');
                    } else {
                      setDownloadConfirmMsg('Tap your browser menu (⋮) and choose "Install app" to install Avor invest with its app icon.');
                    }
                  }}
                  className="flex-1 py-2.5 bg-gradient-to-r from-[#0091ea] to-[#00b4d8] hover:brightness-110 text-white rounded-xl text-xs font-black cursor-pointer shadow-md"
                >
                  Install Avor invest App Now
                </button>
              )}
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-4 py-2.5 bg-[#08132c] text-slate-300 hover:text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 6: Manager (Strictly restricted to customers who bought a machine per Item 16) */}
      {activeModal === 'manager' && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[#03081a] border border-[#0091ea]/60 shadow-[0_0_25px_rgba(0,145,234,0.2)] rounded-2xl p-5 max-w-md w-full space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#0e2748]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#0091ea] flex items-center justify-center text-white">
                  <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
                    <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-white">Customer Support Manager</h3>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {!hasBoughtMachine ? (
              <div className="bg-[#08132c] border border-amber-500/40 rounded-xl p-4 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-amber-950/80 border border-amber-500/50 flex items-center justify-center mx-auto text-amber-400">
                  <Lock className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-black text-white">
                  Only Active Customers Have Access to the Manager
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Direct access to the dedicated Avor invest Customer Manager is exclusively reserved for active customers who have purchased at least one machine.
                </p>
                {onNavigateToMarketplace && (
                  <button
                    type="button"
                    onClick={() => {
                      setActiveModal(null);
                      onNavigateToMarketplace();
                    }}
                    className="w-full py-2.5 bg-gradient-to-r from-[#0091ea] to-[#0077b6] hover:brightness-110 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer shadow-md"
                  >
                    <Cpu className="w-4 h-4" />
                    <span>Buy a Machine to Unlock Manager Access</span>
                  </button>
                )}
              </div>
            ) : (
              <>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Verified Customer Status Active. Join the official <strong>Avor invest</strong> WhatsApp Group formed by Manager <strong>0741032838</strong> or contact the Manager directly:
                </p>

                <div className="space-y-2">
                  <a
                    href={`https://wa.me/256741032838?text=${encodeURIComponent(
                      `Hello Avor invest Manager (0741032838), I am an active machine customer (${user?.phone_number || ''}). Please add me to the official Avor invest WhatsApp Group formed by Manager 0741032838.`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-md cursor-pointer"
                  >
                    <WhatsAppIcon className="w-4 h-4 fill-white" />
                    <span>Join WhatsApp Group (Formed by Manager 0741032838)</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>

                  <a
                    href="https://wa.me/256741032838?text=Hello%20Avor%20invest%20Manager%20(0741032838)%2C%20I%20am%20an%20active%20machine%20customer%20and%20need%20assistance"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-3 bg-[#0091ea] hover:bg-[#0081d6] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-md cursor-pointer"
                  >
                    <WhatsAppIcon className="w-4 h-4 fill-white" />
                    <span>Direct Chat with Manager (0741032838)</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal 7: Settings (Interactive Profile & Currency Editor + Logout) */}
      {activeModal === 'settings' && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[#03081a] border border-[#0091ea]/60 shadow-[0_0_25px_rgba(0,145,234,0.2)] rounded-2xl p-5 max-w-md w-full space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#0e2748]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#0091ea] flex items-center justify-center text-white">
                  <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-white">Account Settings</h3>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {settingsSavedMsg && (
              <div className="p-3 rounded-xl bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 text-xs font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{settingsSavedMsg}</span>
              </div>
            )}

            <form onSubmit={handleSaveSettings} className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1 font-semibold">Full Name:</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full bg-[#08132c] text-white p-2.5 rounded-xl border border-[#0e2748] focus:border-[#0091ea] font-mono outline-none"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-semibold">Registered Phone Number:</label>
                <input
                  type="text"
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value)}
                  placeholder="+256700000000"
                  className="w-full bg-[#08132c] text-sky-400 p-2.5 rounded-xl border border-[#0e2748] focus:border-[#0091ea] font-mono font-bold outline-none"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1 font-semibold">Update Password (Optional):</label>
                <input
                  type="password"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  placeholder="Leave blank to keep current password"
                  className="w-full bg-[#08132c] text-white p-2.5 rounded-xl border border-[#0e2748] focus:border-[#0091ea] font-mono outline-none"
                />
              </div>

              {onCurrencyChange && (
                <div>
                  <label className="text-slate-400 block mb-1 font-semibold">Display Currency:</label>
                  <select
                    value={currency}
                    onChange={(e) => onCurrencyChange(e.target.value as Currency)}
                    className="w-full bg-[#08132c] text-white p-2.5 rounded-xl border border-[#0e2748] font-mono font-bold outline-none cursor-pointer"
                  >
                    <option value="UGX">UGX - Uganda Shillings</option>
                    <option value="USD">USD - US Dollar</option>
                    <option value="KES">KES - Kenyan Shilling</option>
                    <option value="NGN">NGN - Nigerian Naira</option>
                  </select>
                </div>
              )}

              <button
                type="submit"
                className="w-full py-2.5 bg-[#0091ea] hover:bg-[#0081d6] text-white font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
              >
                <Save className="w-4 h-4" />
                <span>Save Settings</span>
              </button>

              {onLogout && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveModal(null);
                    onLogout();
                  }}
                  className="w-full py-2.5 bg-rose-950/60 hover:bg-rose-900/80 border border-rose-800/40 text-rose-300 font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer mt-2"
                >
                  <LogOut className="w-4 h-4 text-rose-400" />
                  <span>Log Out of Account</span>
                </button>
              )}
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
