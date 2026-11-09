import React, { useState, useEffect } from 'react';
import { Currency, User, Transaction, MachineCategory, Investment, Machine } from '../types';
import { CURRENCY_MAP, DEFAULT_MACHINES } from '../data/defaultMachines';
import {
  ArrowRight,
  ArrowUpRight,
  X,
  TrendingUp,
  Wallet,
  Users,
  Coins,
  ShieldCheck,
  Sparkles,
  FileText,
  Download,
  Lock,
  Cpu,
  Compass,
  ChevronLeft,
  ChevronRight,
  Clock,
} from 'lucide-react';
import {
  TopThreeDotMenu,
  checkAndSyncOwnerDevice,
  authorizeOwnerDeviceWithKey,
} from './TopThreeDotMenu';

interface DashboardSummaryData {
  user_id: string;
  balance: number;
  deposit_details: {
    total_deposited: number;
    pending_deposits: number;
    deposits_count: number;
    confirmed_deposits_count?: number;
    pending_deposits_count?: number;
    recent_deposits: Transaction[];
  };
  withdraw_details: {
    total_withdrawn: number;
    pending_withdrawals: number;
    withdrawals_count: number;
    withdrawable_balance: number;
    can_withdraw: boolean;
    min_withdrawal: number;
    recent_withdrawals: Transaction[];
  };
  ai_income?: number;
  today_earnings?: number;
  total_returns?: number;
  team_size_details: {
    team_size: number;
    total_joined: number;
    total_commissions_earned: number;
    pending_team_income?: number;
    total_invited_machines_price?: number;
    last_month_reward_5pct?: number;
    team_members: Array<{
      id: string;
      phone_masked: string;
      full_name: string;
      joined_at: string;
      has_bought_machine: boolean;
      same_machine_as_inviter?: boolean;
      cycle_completed?: boolean;
      machines_count: number;
      latest_machine: string;
      total_invested: number;
      commission_generated: number;
      pending_commission?: number;
      status: string;
    }>;
    referral_code: string;
    referral_link: string;
  };
  has_bought_machine: boolean;
}

interface HomepageProps {
  user: User | null;
  machines?: Machine[];
  investments?: Investment[];
  currency: Currency;
  onCurrencyChange?: (c: Currency) => void;
  onSelectMachine?: (machine: Machine) => void;
  onNavigateToMarketplace: (cat?: MachineCategory | 'ALL') => void;
  onNavigateToAccount: () => void;
  onNavigateToIncome?: () => void;
  onNavigateToAdmin?: () => void;
  onOpenAuth: () => void;
  onOpenWallet: (type: 'deposit' | 'withdraw') => void;
}

type DetailModalType =
  | 'deposit_details'
  | 'withdraw_details'
  | 'ai_income'
  | 'today_earnings'
  | 'invite_count'
  | 'team_count'
  | 'team_income'
  | 'company_pdf'
  | 'whatsapp_gate'
  | null;

export const Homepage: React.FC<HomepageProps> = ({
  user,
  machines = [],
  investments = [],
  currency,
  onCurrencyChange,
  onSelectMachine,
  onNavigateToMarketplace,
  onNavigateToAccount,
  onNavigateToIncome,
  onNavigateToAdmin,
  onOpenAuth: _onOpenAuth,
  onOpenWallet: _onOpenWallet,
}) => {
  const currencyInfo = CURRENCY_MAP[currency];
  const systemMachines = machines && machines.length > 0 ? machines : DEFAULT_MACHINES;
  const [currentSlide, setCurrentSlide] = useState<number>(0);
  const [isBannerPaused, setIsBannerPaused] = useState<boolean>(false);
  const [summary, setSummary] = useState<DashboardSummaryData | null>(null);
  const [activeModal, setActiveModal] = useState<DetailModalType>(null);
  const [ownerDeviceUnlocked, setOwnerDeviceUnlocked] = useState<boolean>(() =>
    checkAndSyncOwnerDevice(user)
  );
  const [ownerTapCount, setOwnerTapCount] = useState<number>(0);
  const [showOwnerPinPrompt, setShowOwnerPinPrompt] = useState<boolean>(false);
  const [ownerPinInput, setOwnerPinInput] = useState<string>('');
  const [ownerPinError, setOwnerPinError] = useState<string | null>(null);

  useEffect(() => {
    setOwnerDeviceUnlocked(checkAndSyncOwnerDevice(user));
  }, [user]);

  useEffect(() => {
    if (systemMachines.length <= 1 || isBannerPaused) return;
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % systemMachines.length);
    }, 3800);
    return () => clearInterval(timer);
  }, [systemMachines.length, isBannerPaused]);

  const handlePrevSlide = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentSlide((prev) => (prev - 1 + systemMachines.length) % systemMachines.length);
  };

  const handleNextSlide = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCurrentSlide((prev) => (prev + 1) % systemMachines.length);
  };

  const activeBannerMachine =
    systemMachines[currentSlide % Math.max(1, systemMachines.length)] || DEFAULT_MACHINES[0];

  useEffect(() => {
    if (!user || !user.id) return;
    const loadSummary = () => {
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
        .then((res) => {
          const ct = res.headers.get('content-type') || '';
          if (res.ok && ct.includes('application/json')) return res.json();
          return null;
        })
        .then((data) => {
          if (data) setSummary(data);
        })
        .catch(() => {});
    };
    loadSummary();
    const interval = setInterval(loadSummary, 2500);

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
              parsed.type === 'DEPOSIT_CREATED_PENDING' ||
              parsed.type === 'WITHDRAWAL_CREATED_PENDING' ||
              parsed.type === 'WITHDRAWAL_APPROVED_SYNC' ||
              parsed.type === 'WITHDRAWAL_REJECTED_SYNC' ||
              parsed.type === 'MACHINE_ORDER_CREATED_PENDING' ||
              parsed.type === 'ORDER_CONFIRMED_ACTIVE')
          ) {
            loadSummary();
          }
        } catch {}
      };
    } catch {}

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('avor_realtime_wallet_sync');
      bc.onmessage = () => {
        loadSummary();
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
  }, [user?.id, user?.phone_number, user?.balance, user?.wallet_balance, user?.available_wallet, investments.length]);

  const hasBoughtMachine =
    investments.some((i) => i.status === 'ACTIVE' || i.status === 'PAYOUT_COMPLETE') ||
    Boolean(summary?.has_bought_machine);

  const activeInvestments = investments.filter((i) => i.status === 'ACTIVE');
  const completedOrActiveInvestments = investments.filter(
    (i) => i.status === 'ACTIVE' || i.status === 'PAYOUT_COMPLETE'
  );
  const placedOrdersTotal = investments
    .filter((i) => i.status === 'PENDING' || i.status === 'ACTIVE' || i.status === 'PAYOUT_COMPLETE')
    .reduce((sum, i) => sum + Number(i.amount_invested || 0), 0);

  const todayDayOfWeek = new Date().getDay();
  const isTodayMonToFri = todayDayOfWeek >= 1 && todayDayOfWeek <= 5;
  const isAv1OrAv2Inv = (inv: Investment) => {
    const tag = String(inv.series_tag || inv.machine?.series_tag || '').toUpperCase();
    const title = String(inv.machine_title || inv.machine?.title || '').toUpperCase();
    if (inv.machine?.is_av_class || tag.includes('CLASS') || title.includes('CLASS')) return false;
    return true;
  };

  const activeDailyYield = activeInvestments.reduce((sum, i) => {
    if (isAv1OrAv2Inv(i) && !isTodayMonToFri) return sum;
    return sum + (Number(i.daily_yield) || 0);
  }, 0);
  const totalDailyYieldsAll = completedOrActiveInvestments.reduce(
    (sum, i) => sum + (Number(i.daily_yield) || 0) * Math.max(1, Number(i.days_elapsed) || 1),
    0
  );

  // When someone deposits money, it immediately appears in Deposit details on the Homepage
  const totalDeposited = Math.max(
    Number(summary?.deposit_details?.total_deposited ?? 0),
    Number(summary?.available_wallet ?? 0),
    Number(summary?.wallet_balance ?? 0),
    Number(user?.available_wallet ?? 0),
    Number(user?.wallet_balance ?? 0)
  );
  const pendingDeposits = summary?.deposit_details?.pending_deposits || 0;
  // When someone makes a withdrawal, the money immediately reflects on withdrawal details
  const totalWithdrawn = Math.max(
    Number(summary?.withdraw_details?.total_withdrawn ?? 0),
    Number(summary?.withdraw_details?.pending_withdrawals ?? 0)
  );
  // Item 6: In the "AI income" icon on the home page, all the total daily yields should be born
  const aiIncome =
    totalDailyYieldsAll > 0
      ? totalDailyYieldsAll
      : activeDailyYield > 0
        ? activeDailyYield
        : summary?.ai_income || 0;
  // Item 5: In the "today's earnings" icon on the home page, the daily yield should be born (Mon-Fri for AV1 & AV2)
  const todayEarnings =
    activeDailyYield > 0 ? activeDailyYield : summary?.today_earnings || 0;
  const inviteCount = summary?.team_size_details?.total_joined ?? 0;
  const teamCount = summary?.team_size_details?.team_size ?? 0;
  const teamIncome = summary?.team_size_details?.total_commissions_earned || 0;

  // Format numbers (0 displays as 0.00 UGX)
  const formatVal = (num: number | undefined | null) => {
    const val = Number(num) || 0;
    if (val === 0) return '0.00 UGX';
    if (currency === 'UGX') {
      return `${Math.round(val).toLocaleString()} UGX`;
    }
    return currencyInfo.format(val);
  };

  const loggedInText = user
    ? `Investor ${user.phone_number?.slice(-4) || user.id.slice(-4) || '2838'}`
    : 'Investor';

  const handleSecretBrandTap = () => {
    const next = ownerTapCount + 1;
    if (next >= 5) {
      setOwnerTapCount(0);
      if (!ownerDeviceUnlocked) {
        setShowOwnerPinPrompt(true);
        setOwnerPinError(null);
      }
    } else {
      setOwnerTapCount(next);
    }
  };

  return (
    <div className="space-y-4 max-w-md sm:max-w-xl mx-auto text-white select-none">
      {/* Discreet Owner Device Authorization Modal (Only appears after 5 secret taps on Avor invest title) */}
      {showOwnerPinPrompt && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-[#020e18] border border-[#00d2c4]/50 rounded-2xl p-5 max-w-xs w-full space-y-3 shadow-2xl">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-[#00e5ff] flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-[#a3e635]" />
                <span>Owner Device Pairing</span>
              </span>
              <button
                type="button"
                onClick={() => setShowOwnerPinPrompt(false)}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[11px] text-[#7ba3b0]">
              Enter your registered owner number to permanently enable the 3-dot Admin navigation on this device only:
            </p>
            <input
              type="password"
              value={ownerPinInput}
              onChange={(e) => {
                setOwnerPinInput(e.target.value);
                setOwnerPinError(null);
              }}
              placeholder="Owner key"
              className="w-full px-3 py-2 rounded-xl bg-[#041524] border border-[#00d2c4]/40 text-xs text-white outline-none focus:border-[#a3e635]"
            />
            {ownerPinError && (
              <p className="text-[11px] text-rose-400 font-semibold">{ownerPinError}</p>
            )}
            <button
              type="button"
              onClick={() => {
                if (authorizeOwnerDeviceWithKey(ownerPinInput)) {
                  setOwnerDeviceUnlocked(true);
                  setShowOwnerPinPrompt(false);
                  setOwnerPinInput('');
                } else {
                  setOwnerPinError('Unauthorized device key.');
                }
              }}
              className="w-full py-2 rounded-xl bg-gradient-to-r from-[#0091ea] to-[#0077b6] text-white text-xs font-black border border-[#a3e635]/60 cursor-pointer"
            >
              Pair My Device
            </button>
          </div>
        </div>
      )}

      {/* =========================================================================
          TOP HEADER SECTION
          - Title: Avor invest [Dashboard Hub]
          - Sub-bar: [Company PDF] | [Company WhatsApp] | UGX ⌵ | [Machine Plane ➔]
          (Invite code removed from Home page per Items 18 & 19)
         ========================================================================= */}
      <div className="space-y-2.5 px-1 pt-1">
        <div className="flex items-center justify-between">
          <div>
            <h1
              onClick={handleSecretBrandTap}
              className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2"
            >
              <span>Avor invest</span>
              <span className="text-xs font-bold text-[#a3e635] bg-[#0c313d]/90 border border-[#a3e635]/60 px-2.5 py-0.5 rounded-full shadow-[0_0_12px_rgba(163,230,53,0.25)]">
                Dashboard Hub
              </span>
            </h1>
            <p className="text-xs text-[#7ba3b0] font-medium mt-0.5">
              Logged in: <span className="text-slate-200">{loggedInText}</span>
            </p>
          </div>

          {/* Top Three-Dot Navigation Menu (Strictly visible ONLY on the owner's authorized device) */}
          <TopThreeDotMenu
            activeTab="home"
            user={user}
            forceOwnerAuthorized={ownerDeviceUnlocked}
            onRevokeDevice={() => setOwnerDeviceUnlocked(false)}
            hasBoughtMachine={hasBoughtMachine}
            onNavigateToTab={(tab) => {
              if (tab === 'marketplace') onNavigateToMarketplace('ALL');
              else if (tab === 'income') onNavigateToIncome ? onNavigateToIncome() : onNavigateToAccount();
              else if (tab === 'profile') onNavigateToAccount();
              else if (tab === 'admin') onNavigateToAdmin ? onNavigateToAdmin() : onNavigateToAccount();
            }}
          />
        </div>

        {/* Sub-bar: WhatsApp 🔐, Company PDF 🔐, Invite 🔐, Manage 🔐 (All locked until user buys a machine, all open up once user buys a machine) */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {/* 1. WhatsApp 🔐 */}
            <button
              type="button"
              onClick={() => {
                if (!hasBoughtMachine) {
                  setActiveModal('whatsapp_gate');
                } else {
                  window.open(
                    'https://wa.me/256741032838?text=Hello%20Avor%20invest%20Support%2C%20I%20am%20an%20active%20machine%20customer',
                    '_blank',
                    'noopener,noreferrer'
                  );
                }
              }}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#062232]/90 hover:bg-[#082f45] border border-[#00d2c4]/40 text-[#80deea] hover:text-white text-[11px] font-bold transition-all cursor-pointer shadow-sm active:scale-95"
              title="WhatsApp (Opens when you buy a machine)"
            >
              <span>{!hasBoughtMachine ? 'WhatsApp 🔐' : 'WhatsApp'}</span>
              {!hasBoughtMachine && <Lock className="w-3 h-3 text-amber-400" />}
            </button>

            {/* 2. Company PDF 🔐 */}
            <button
              type="button"
              onClick={() => setActiveModal('company_pdf')}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#062232]/90 hover:bg-[#082f45] border border-[#00d2c4]/40 text-[#80deea] hover:text-white text-[11px] font-bold transition-all cursor-pointer shadow-sm active:scale-95"
              title="Company PDF (Opens when you buy a machine)"
            >
              <FileText className="w-3.5 h-3.5 text-[#00e5ff]" />
              <span>{!hasBoughtMachine ? 'Company PDF 🔐' : 'Company PDF'}</span>
              {!hasBoughtMachine && <Lock className="w-3 h-3 text-amber-400" />}
            </button>

            {/* 3. Invite 🔐 */}
            <button
              type="button"
              onClick={() => setActiveModal('invite_count')}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#062232]/90 hover:bg-[#082f45] border border-[#00d2c4]/40 text-[#80deea] hover:text-white text-[11px] font-bold transition-all cursor-pointer shadow-sm active:scale-95"
              title="Invite (Opens when you buy a machine)"
            >
              <Users className="w-3.5 h-3.5 text-[#00e5ff]" />
              <span>{!hasBoughtMachine ? 'Invite 🔐' : 'Invite'}</span>
              {!hasBoughtMachine && <Lock className="w-3 h-3 text-amber-400" />}
            </button>

            {/* 4. Manage 🔐 */}
            <button
              type="button"
              onClick={() => {
                if (!hasBoughtMachine) {
                  setActiveModal('whatsapp_gate');
                } else if (onNavigateToIncome) {
                  onNavigateToIncome();
                } else {
                  onNavigateToAccount();
                }
              }}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-[#062232]/90 hover:bg-[#082f45] border border-[#00d2c4]/40 text-[#80deea] hover:text-white text-[11px] font-bold transition-all cursor-pointer shadow-sm active:scale-95"
              title="Manage (Opens when you buy a machine)"
            >
              <span>{!hasBoughtMachine ? 'Manage 🔐' : 'Manage'}</span>
              {!hasBoughtMachine && <Lock className="w-3 h-3 text-amber-400" />}
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* Currency Dropdown Selector */}
            {onCurrencyChange && (
              <div className="relative">
                <select
                  value={currency}
                  onChange={(e) => onCurrencyChange(e.target.value as Currency)}
                  className="appearance-none bg-[#062232]/85 text-[#80deea] font-mono text-xs font-bold py-1.5 pl-2.5 pr-6 border border-[#00d2c4]/35 rounded-xl outline-none cursor-pointer hover:border-[#00e5ff] shadow-sm transition-all"
                  title="Select Currency"
                >
                  <option value="UGX">UGX</option>
                  <option value="USD">USD</option>
                  <option value="KES">KES</option>
                  <option value="NGN">NGN</option>
                </select>
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[#00d2c4]">
                  ⌵
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* =========================================================================
          LIVE SYSTEM MACHINES HERO BANNER CAROUSEL
          - Displays all machines in the system with their prices and number of days
          - Auto-rotates with manual < / > arrows and indicator dots matching reference
         ========================================================================= */}
      <div
        onMouseEnter={() => setIsBannerPaused(true)}
        onMouseLeave={() => setIsBannerPaused(false)}
        onClick={() => {
          if (onSelectMachine) {
            onSelectMachine(activeBannerMachine);
          } else {
            onNavigateToMarketplace('ALL');
          }
        }}
        className="relative w-full h-56 sm:h-68 rounded-3xl overflow-hidden border border-[#00d2c4]/45 shadow-[0_14px_40px_rgba(0,10,20,0.92),0_0_25px_rgba(0,180,216,0.2)] bg-[#020f18] cursor-pointer group"
      >
        {/* Machine Image Background */}
        <img
          key={activeBannerMachine.id}
          src={activeBannerMachine.image_url || activeBannerMachine.imageUrl}
          alt={activeBannerMachine.title}
          className="w-full h-full object-cover object-center transition-transform duration-700 group-hover:scale-105"
        />

        {/* Subtle Dark Gradient Vignette Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/45 to-black/25 pointer-events-none" />

        {/* Top Live Badge & Series Tag */}
        <div className="absolute top-3 inset-x-3.5 flex items-center justify-between z-20 pointer-events-none">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/65 border border-[#00e5ff]/45 backdrop-blur-md text-[10px] font-mono font-bold text-[#80deea]">
            <span className="w-2 h-2 rounded-full bg-[#a3e635] animate-pulse" />
            <span>{activeBannerMachine.series_tag}</span>
            {(activeBannerMachine.category === 'AV1' || activeBannerMachine.series_tag === 'AV1') && (
              <>
                <span className="text-slate-400">•</span>
                <span className="text-amber-300">Max Unit: 1</span>
              </>
            )}
            {(activeBannerMachine.category === 'AV2' || activeBannerMachine.series_tag === 'AV2') && (
              <>
                <span className="text-slate-400">•</span>
                <span className="text-sky-300">Max Unit: 2</span>
              </>
            )}
            <span className="text-slate-400">•</span>
            <span>
              {currentSlide + 1}/{systemMachines.length}
            </span>
          </div>

          <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#0091ea]/85 border border-[#00e5ff]/60 backdrop-blur-md text-[10px] font-bold text-white shadow-md">
            <Clock className="w-3 h-3 text-[#a3e635]" />
            <span>{activeBannerMachine.duration_days} Days</span>
          </div>
        </div>

        {/* Left & Right Circular Navigation Arrows (< and >) */}
        <button
          type="button"
          onClick={handlePrevSlide}
          aria-label="Previous Machine"
          className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-black/55 hover:bg-black/80 border border-white/25 text-white flex items-center justify-center backdrop-blur-xs transition-all cursor-pointer active:scale-95 shadow-lg"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <button
          type="button"
          onClick={handleNextSlide}
          aria-label="Next Machine"
          className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-black/55 hover:bg-black/80 border border-white/25 text-white flex items-center justify-center backdrop-blur-xs transition-all cursor-pointer active:scale-95 shadow-lg"
        >
          <ChevronRight className="w-5 h-5" />
        </button>

        {/* Bottom Machine Info Overlay (Machine Title, Price & Number of Days) */}
        <div className="absolute bottom-7 inset-x-4 sm:inset-x-5 z-20 text-left space-y-1 pointer-events-none">
          <h2 className="text-lg sm:text-xl font-serif font-bold text-[#1ec8ff] tracking-tight drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] truncate">
            {activeBannerMachine.title}
          </h2>
          <p className="text-xs sm:text-sm text-slate-100 font-medium drop-shadow-[0_1px_4px_rgba(0,0,0,0.95)] flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span>
              Price: <strong className="text-white font-mono">{currencyInfo.format(activeBannerMachine.price || activeBannerMachine.total_cost)}</strong>
            </span>
            <span className="text-[#00e5ff]">•</span>
            <span>
              Duration: <strong className="text-[#a3e635] font-mono">{activeBannerMachine.duration_days} Days</strong>
            </span>
            <span className="text-[#00e5ff]">•</span>
            <span>
              Returns: <strong className="text-emerald-300 font-mono">{currencyInfo.format(activeBannerMachine.total_return)}</strong>
            </span>
          </p>
        </div>

        {/* Bottom Pagination Indicator Dots */}
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute bottom-2.5 inset-x-0 z-20 flex items-center justify-center gap-1.5 px-4"
        >
          {systemMachines.map((mach, idx) => {
            const isActive = idx === currentSlide;
            return (
              <button
                key={mach.id}
                type="button"
                onClick={() => setCurrentSlide(idx)}
                aria-label={`Show ${mach.title}`}
                className={`transition-all duration-300 rounded-full cursor-pointer ${
                  isActive
                    ? 'w-6 h-2 bg-[#00b4d8] shadow-[0_0_8px_#00e5ff]'
                    : 'w-2 h-2 bg-white/40 hover:bg-white/75'
                }`}
              />
            );
          })}
        </div>
      </div>

      {/* =========================================================================
          CENTRAL NEO GLASS OCEAN CONTAINER
          - Row 1: Deposit details (Blue), Withdraw details (Lemon Green)
          - Row 2: AI Income (Blue), Today's earnings (Lemon Green)
          - Row 3: Invite Count (Blue), Team Count (Lemon Green), Team income (Combo)
          (Deposit & Withdraw action buttons moved exclusively to Profile page per Item 15)
         ========================================================================= */}
      <div className="dashboard">
        {/* Row 1: 2 Cards (Deposit details & Withdraw details) */}
        <div className="grid-2">
          <div
            onClick={() => setActiveModal('deposit_details')}
            className="card cursor-pointer group relative"
          >
            <div className="value font-mono">{formatVal(totalDeposited)}</div>
            <div className="label label-blue group-hover:brightness-110 transition-all">Deposit details</div>
          </div>

          <div
            onClick={() => setActiveModal('withdraw_details')}
            className="card cursor-pointer group"
          >
            <div className="value font-mono">{formatVal(totalWithdrawn)}</div>
            <div className="label label-lemon group-hover:brightness-110 transition-all">Withdraw details</div>
          </div>
        </div>

        {/* Row 2: 2 Cards (AI Income & Today's earnings) */}
        <div className="grid-2">
          <div
            onClick={() => setActiveModal('ai_income')}
            className="card cursor-pointer group"
          >
            <div className="value font-mono">{formatVal(aiIncome)}</div>
            <div className="label label-blue group-hover:brightness-110 transition-all">AI Income</div>
          </div>

          <div
            onClick={() => setActiveModal('today_earnings')}
            className="card cursor-pointer group"
          >
            <div className="value font-mono">{formatVal(todayEarnings)}</div>
            <div className="label label-lemon group-hover:brightness-110 transition-all">Today's earnings</div>
          </div>
        </div>

        {/* Row 3: 3 Cards (Invite Count, Team Count, Team income) */}
        <div className="grid-3">
          <div
            onClick={() => setActiveModal('invite_count')}
            className="card cursor-pointer group"
          >
            <div className="value font-mono">{inviteCount}</div>
            <div className="label label-blue group-hover:brightness-110 transition-all truncate">Invite Count</div>
          </div>

          <div
            onClick={() => setActiveModal('team_count')}
            className="card cursor-pointer group"
          >
            <div className="value font-mono">{teamCount}</div>
            <div className="label label-lemon group-hover:brightness-110 transition-all truncate">Team Count</div>
          </div>

          <div
            onClick={() => setActiveModal('team_income')}
            className="card cursor-pointer group"
          >
            <div className="value font-mono truncate" title={formatVal(teamIncome)}>
              {formatVal(teamIncome).length > 8 ? `${formatVal(teamIncome).slice(0, 7)}...` : formatVal(teamIncome)}
            </div>
            <div className="label label-combo group-hover:brightness-110 transition-all truncate">Team income</div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          MACHINE PANEL DIRECTIONS & ACCURATE SERIES GUIDE (Items 1, 3 & 12)
          - Corrects AV2 info on home screen (35–60 Days Lock, Max 2 Units, 55k–1M UGX, Wallet Only)
          - Provides clear step-by-step directions and 1-tap navigation to AV1, AV2, and AV Classes
         ========================================================================= */}
      <div className="bg-[#041a29]/90 rounded-2xl border border-[#00d2c4]/35 p-4 space-y-3 backdrop-blur-md shadow-lg">
        <div className="flex items-center justify-between border-b border-[#0c3a47] pb-2.5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#0091ea] to-[#00b4d8] text-white flex items-center justify-center shadow-sm border border-[#00e5ff]/50">
              <Compass className="w-4 h-4 text-white" />
            </div>
            <div>
              <h2 className="text-xs sm:text-sm font-black text-white tracking-tight">
                Machine Panel Directions & Series Guide
              </h2>
              <p className="text-[10px] text-[#7ba3b0]">
                Tap any series below to open its machines directly in the Machine Plane
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onNavigateToMarketplace('ALL')}
            className="text-[11px] font-bold text-[#00e5ff] hover:underline flex items-center gap-1 cursor-pointer"
          >
            <span>All Machines</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        {/* 3 Series Direction Cards with Accurate Specs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
          {/* Direction 1: AV1 Series */}
          <div
            onClick={() => onNavigateToMarketplace('AV1')}
            className="bg-[#031420] hover:bg-[#062235] border border-[#00d2c4]/30 hover:border-[#00e5ff]/70 rounded-xl p-3 cursor-pointer transition-all group space-y-1.5"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono font-black text-sky-300 text-xs">AV1 Series</span>
              <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-blue-950 text-sky-300 border border-sky-500/40">
                Mon – Friday
              </span>
            </div>
            <p className="text-[11px] text-slate-300 leading-snug">
              <strong>35,000 – 140,000 UGX</strong> • <strong>16–18 Days (Mon – Friday)</strong> returning up to <strong>220,000 UGX</strong>.
            </p>
            <div className="flex items-center justify-between pt-1 text-[10px] font-mono text-amber-300">
              <span>Limit: 1 Unit Only</span>
              <span className="text-[#00e5ff] group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5 font-bold">
                Open AV1 <ArrowRight className="w-3 h-3" />
              </span>
            </div>
          </div>

          {/* Direction 2: AV2 Series (Accurate AV2 Info per Item 1 & Item 12) */}
          <div
            onClick={() => onNavigateToMarketplace('AV2')}
            className="bg-[#031420] hover:bg-[#062235] border border-[#00d2c4]/30 hover:border-[#00e5ff]/70 rounded-xl p-3 cursor-pointer transition-all group space-y-1.5"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono font-black text-blue-300 text-xs">AV2 Series</span>
              <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-blue-950 text-sky-300 border border-sky-500/40">
                Mon – Friday
              </span>
            </div>
            <p className="text-[11px] text-slate-300 leading-snug">
              <strong>55,000 – 1,000,000 UGX</strong> • <strong>35–60 Days (Mon – Friday)</strong> returning <strong>200,000 – 2,000,000 UGX</strong>.
            </p>
            <div className="flex items-center justify-between pt-1 text-[10px] font-mono text-blue-300">
              <span>Limit: Max 2 Units</span>
              <span className="text-[#00e5ff] group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5 font-bold">
                Open AV2 <ArrowRight className="w-3 h-3" />
              </span>
            </div>
          </div>

          {/* Direction 3: AV Classes A–I (Item 8: eliminate "Need 4 invites", Item 12: counts throughout the week) */}
          <div
            onClick={() => onNavigateToMarketplace('AVCLASSES')}
            className="bg-[#031420] hover:bg-[#062235] border border-[#00d2c4]/30 hover:border-[#00e5ff]/70 rounded-xl p-3 cursor-pointer transition-all group space-y-1.5"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono font-black text-[#a3e635] text-xs flex items-center gap-1">
                <span>AV Classes A–I</span>
              </span>
              <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-500/40">
                Throughout Week
              </span>
            </div>
            <p className="text-[11px] text-slate-300 leading-snug">
              <strong>30,000 – 9,000,000 UGX</strong> • <strong>21 Days</strong> • Counts throughout the week returning up to <strong>25,000,000 UGX</strong>.
            </p>
            <div className="flex items-center justify-between pt-1 text-[10px] font-mono text-emerald-300">
              <span>Counts Throughout Week</span>
              <span className="text-[#00e5ff] group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5 font-bold">
                Open Classes <ArrowRight className="w-3 h-3" />
              </span>
            </div>
          </div>
        </div>

        {/* Quick Step-by-Step Directions Strip */}
        <div className="bg-[#021019] border border-[#0c3a47] rounded-xl px-3 py-2 text-[11px] text-[#7ba3b0] flex flex-wrap items-center justify-between gap-2">
          <span>
            <strong className="text-white">How to Invest:</strong> 1. Go to <strong className="text-[#00e5ff]">Profile → Deposit</strong> to fund wallet • 2. Open <strong className="text-[#00e5ff]">Machine Plane</strong> & tap <strong className="text-white">Buy</strong> • 3. Collect yields in <strong className="text-[#a3e635]">Income Plane</strong>.
          </span>
        </div>
      </div>

      {/* =========================================================================
          BOTTOM STATUS STRIP (ACCURATE SERIES OVERVIEW)
         ========================================================================= */}
      <div className="flex items-center justify-between gap-3 px-3 py-2 bg-[#041a29]/80 rounded-2xl border border-[#00d2c4]/30 backdrop-blur-md shadow-sm">
        <div className="flex items-center gap-2.5 text-xs">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#0091ea] to-[#00b4d8] text-white flex items-center justify-center font-black text-xs shadow-md shadow-blue-500/40 border border-[#00e5ff]/50">
            AI
          </div>
          <div>
            <span className="font-extrabold text-white text-xs block">© 2023 Avor invest</span>
            <div className="flex items-center gap-1.5 text-[11px] text-[#7ba3b0]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#a3e635] animate-pulse shadow-xs shadow-[#a3e635]/80" />
              <span>AV1 (16–18D) • AV2 (35–60D) • AV Classes A–I (21D)</span>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onNavigateToAccount()}
          className="text-[11px] font-mono font-bold text-[#a3e635] bg-[#84cc16]/15 hover:bg-[#84cc16]/25 border border-[#a3e635]/40 px-2.5 py-1 rounded-lg cursor-pointer transition-all"
        >
          Profile Vault
        </button>
      </div>

      {/* =========================================================================
          INTERACTIVE STAT DETAIL & COMPANY MODALS
         ========================================================================= */}

      {/* Modal 1: Deposit Details */}
      {activeModal === 'deposit_details' && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[#051d24] border border-[#00d2c4]/60 shadow-[0_0_35px_rgba(0,210,200,0.25)] rounded-2xl p-5 max-w-md w-full space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-[#0c3a47]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#00b4d8] flex items-center justify-center text-white">
                  <Wallet className="w-4 h-4 text-white" />
                </div>
                <h3 className="text-base font-bold text-white">Deposit Details</h3>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-[#031420] border border-[#00d2c4]/30 p-4 rounded-xl space-y-2 text-center shrink-0">
              <span className="text-xs text-[#7ba3b0]">Total Amount Reflected on Wallet</span>
              <span className="text-2xl font-black text-white font-mono block">
                {formatVal(totalDeposited)}
              </span>
              <div className="grid grid-cols-2 gap-2 pt-2 text-xs font-mono text-left border-t border-[#0c3a47]">
                <div>
                  <span className="text-[10px] text-[#7ba3b0] block">Wallet Reflected:</span>
                  <span className="font-bold text-emerald-400">
                    {formatVal(totalDeposited)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-[#7ba3b0] block">Total Records:</span>
                  <span className="font-bold text-white">
                    {summary?.deposit_details?.deposits_count || 0} Records
                  </span>
                </div>
              </div>
            </div>

            {/* Recent Submitted & Confirmed Deposits List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#80deea] block">
                Deposit Records
              </span>
              {!summary?.deposit_details?.recent_deposits ||
              summary.deposit_details.recent_deposits.length === 0 ? (
                <div className="text-center py-6 bg-[#031420]/70 border border-[#0c3a47] rounded-xl text-xs text-slate-400 font-semibold">
                  No payments yet.
                </div>
              ) : (
                summary.deposit_details.recent_deposits.map((dep) => {
                  return (
                    <div
                      key={dep.id}
                      className="bg-[#031420] border border-[#0c3a47] p-3 rounded-xl flex items-center justify-between text-xs font-mono"
                    >
                      <div className="min-w-0 pr-2">
                        <span className="font-bold text-white block truncate">
                          {dep.payment_method || 'Mobile Money Deposit'}
                        </span>
                        <span className="text-[10px] text-slate-400 block">
                          {new Date(dep.created_at).toLocaleString()} • {dep.payment_reference || dep.id}
                        </span>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="font-black text-sm text-[#00e5ff] block">
                          +{formatVal(dep.amount)}
                        </span>
                        <span className="inline-block px-2 py-0.5 rounded text-[9px] font-extrabold uppercase bg-emerald-950/90 text-emerald-300 border border-emerald-500/40">
                          REFLECTED
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => {
                  setActiveModal(null);
                  onNavigateToAccount();
                }}
                className="flex-1 py-2.5 bg-gradient-to-r from-[#00b4d8] to-[#0077b6] text-white rounded-xl text-xs font-bold cursor-pointer hover:brightness-110"
              >
                Go to Profile Deposit
              </button>
              <button
                onClick={() => setActiveModal(null)}
                className="px-4 py-2.5 bg-[#062232] text-slate-300 rounded-xl text-xs font-bold cursor-pointer hover:text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Withdraw Details */}
      {activeModal === 'withdraw_details' && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[#051d24] border border-[#00d2c4]/60 shadow-[0_0_35px_rgba(0,210,200,0.25)] rounded-2xl p-5 max-w-sm w-full space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-[#0c3a47] shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#00c853] flex items-center justify-center text-white">
                  <ArrowUpRight className="w-4 h-4 text-white" />
                </div>
                <h3 className="text-base font-bold text-white">Withdraw Details</h3>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-[#031420] border border-[#00d2c4]/30 p-4 rounded-xl space-y-2 text-center shrink-0">
              <span className="text-xs text-[#7ba3b0]">Total Withdrawn Income</span>
              <span className="text-2xl font-black text-white font-mono block">
                {formatVal(totalWithdrawn)}
              </span>
              <div className="grid grid-cols-2 gap-2 pt-2 text-xs font-mono text-left border-t border-[#0c3a47]">
                <div>
                  <span className="text-[10px] text-[#7ba3b0] block">Withdrawable Income:</span>
                  <span className="font-bold text-emerald-400">
                    {formatVal(summary?.withdraw_details?.withdrawable_balance ?? user?.balance ?? 0)}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] text-[#7ba3b0] block">Total Records:</span>
                  <span className="font-bold text-white">
                    {summary?.withdraw_details?.withdrawals_count || 0} Records (3k – 5M)
                  </span>
                </div>
              </div>
            </div>

            {/* Recent Withdrawals List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#80deea] block">
                Withdrawal Records
              </span>
              {!summary?.withdraw_details?.recent_withdrawals ||
              summary.withdraw_details.recent_withdrawals.length === 0 ? (
                <div className="text-center py-4 bg-[#031420]/70 border border-[#0c3a47] rounded-xl text-xs text-slate-400 font-semibold">
                  No withdrawals yet.
                </div>
              ) : (
                summary.withdraw_details.recent_withdrawals.map((wdr) => (
                  <div
                    key={wdr.id}
                    className="bg-[#031420] border border-[#0c3a47] p-3 rounded-xl flex items-center justify-between text-xs font-mono"
                  >
                    <div className="min-w-0 pr-2">
                      <span className="font-bold text-white block truncate">
                        {wdr.payment_method || 'Mobile Money Withdrawal'}
                      </span>
                      <span className="text-[10px] text-slate-400 block">
                        {new Date(wdr.created_at).toLocaleString()} • {wdr.payment_reference || wdr.id}
                      </span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="font-black text-sm text-[#00e676] block">
                        {formatVal(wdr.amount)}
                      </span>
                      <span className="inline-block px-2 py-0.5 rounded text-[9px] font-extrabold uppercase bg-emerald-950/90 text-emerald-300 border border-emerald-500/40">
                        {wdr.status === 'SUCCESS' ? 'APPROVED' : 'REFLECTED'}
                      </span>
                    </div>
                  </div>
                ))
              )}

              <div className="bg-[#031420] border border-[#00d2c4]/30 p-3.5 rounded-xl space-y-1.5 text-left text-xs mt-2">
                <span className="font-black text-[#a3e635] uppercase text-[11px] block">
                  Official Withdraw Rules:
                </span>
                <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-200">
                  <li>Withdraws run from <strong>Mon – Fri</strong></li>
                  <li>Withdraw percentage – <strong>10%</strong></li>
                  <li>Minimum withdraw is <strong>3k</strong> and Maximum withdraw is <strong>5M</strong></li>
                  <li><strong>3000</strong> is eligible for <strong>customers</strong>.</li>
                  <li><strong>* Withdraws take 24-96 hours to process.</strong></li>
                </ol>
              </div>
            </div>

            <div className="flex gap-2 shrink-0">
              <button
                onClick={() => {
                  setActiveModal(null);
                  onNavigateToAccount();
                }}
                className="flex-1 py-2.5 bg-gradient-to-r from-[#00c853] to-[#009624] text-white rounded-xl text-xs font-bold cursor-pointer hover:brightness-110"
              >
                Go to Profile Withdraw
              </button>
              <button
                onClick={() => setActiveModal(null)}
                className="px-4 py-2.5 bg-[#062232] text-slate-300 rounded-xl text-xs font-bold cursor-pointer hover:text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: AI Income (Item 6: eliminate the word "Hub" and show all the total daily yields) */}
      {activeModal === 'ai_income' && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[#051d24] border border-[#00d2c4]/60 shadow-[0_0_35px_rgba(0,210,200,0.25)] rounded-2xl p-5 max-w-sm w-full space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#0c3a47]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#00b4d8] flex items-center justify-center text-white">
                  <TrendingUp className="w-4 h-4 text-white" />
                </div>
                <h3 className="text-base font-bold text-white">AI Income</h3>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-[#031420] border border-[#00d2c4]/30 p-4 rounded-xl space-y-2 text-center">
              <span className="text-xs text-[#7ba3b0]">Total Daily Yields</span>
              <span className="text-2xl font-black text-[#00e5ff] font-mono block">
                {formatVal(aiIncome)}
              </span>
              <p className="text-[11px] text-[#7ba3b0] mt-1 leading-relaxed">
                All total daily yields generated across your active and completed machines.
              </p>
              {completedOrActiveInvestments.length > 0 && (
                <div className="mt-2 pt-2 border-t border-[#0c3a47] space-y-1 text-left text-[11px] font-mono">
                  {completedOrActiveInvestments.map((inv) => {
                    const machineTotalDailyYield =
                      (Number(inv.daily_yield) || 0) * Math.max(1, Number(inv.days_elapsed) || 1);
                    return (
                      <div key={inv.id} className="flex items-center justify-between text-slate-200">
                        <span className="truncate pr-2">{inv.machine_title}</span>
                        <span className="text-[#00e5ff] font-bold shrink-0">
                          {formatVal(machineTotalDailyYield)} ({formatVal(inv.daily_yield)}/day)
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex gap-2">
              {onNavigateToIncome && (
                <button
                  onClick={() => {
                    setActiveModal(null);
                    onNavigateToIncome();
                  }}
                  className="flex-1 py-2.5 bg-gradient-to-r from-[#00b4d8] to-[#0077b6] text-white rounded-xl text-xs font-bold cursor-pointer hover:brightness-110"
                >
                  View Income Plane
                </button>
              )}
              <button
                onClick={() => setActiveModal(null)}
                className="px-4 py-2.5 bg-[#062232] text-slate-300 rounded-xl text-xs font-bold cursor-pointer hover:text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 4: Today's Earnings (Item 5: the daily yield should be shown) */}
      {activeModal === 'today_earnings' && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[#051d24] border border-[#00d2c4]/60 shadow-[0_0_35px_rgba(0,210,200,0.25)] rounded-2xl p-5 max-w-sm w-full space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#0c3a47]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#00b4d8] flex items-center justify-center text-white">
                  <Coins className="w-4 h-4 text-white" />
                </div>
                <h3 className="text-base font-bold text-white">Today's Earnings</h3>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-[#031420] border border-[#00d2c4]/30 p-4 rounded-xl space-y-2 text-center">
              <span className="text-xs text-[#7ba3b0]">Daily Yield</span>
              <span className="text-2xl font-black text-emerald-400 font-mono block">
                {formatVal(todayEarnings)}
              </span>
              <p className="text-[11px] text-[#7ba3b0] mt-1 leading-relaxed">
                Daily yield generated by your active running machines.
              </p>
              {activeInvestments.length > 0 && (
                <div className="mt-2 pt-2 border-t border-[#0c3a47] space-y-1 text-left text-[11px] font-mono">
                  {activeInvestments.map((inv) => (
                    <div key={inv.id} className="flex items-center justify-between text-slate-200">
                      <span className="truncate pr-2">{inv.machine_title}</span>
                      <span className="text-emerald-400 font-bold shrink-0">
                        +{formatVal(inv.daily_yield)} / day
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={() => setActiveModal(null)}
              className="w-full py-2.5 bg-gradient-to-r from-[#00b4d8] to-[#0077b6] text-white rounded-xl text-xs font-bold cursor-pointer hover:brightness-110"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Modal 5: Invite Count (Invitation bonus is 8% per Item 5) */}
      {activeModal === 'invite_count' && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[#051d24] border border-[#00d2c4]/60 shadow-[0_0_35px_rgba(0,210,200,0.25)] rounded-2xl p-5 max-w-sm w-full space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#0c3a47]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#00b4d8] flex items-center justify-center text-white">
                  <Users className="w-4 h-4 text-white" />
                </div>
                <h3 className="text-base font-bold text-white">
                  {!hasBoughtMachine ? 'Invite Locked 🔐' : 'Invite & Referral Access'}
                </h3>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {!hasBoughtMachine ? (
              <div className="bg-[#020f18] border border-amber-500/50 rounded-xl p-4 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-amber-950/80 border border-amber-500/50 flex items-center justify-center mx-auto text-amber-400">
                  <Lock className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-black text-white">
                  Invite is Locked Until You Buy a Machine 🔐
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  <strong>WhatsApp 🔐, Company PDF, Invite, and Manage</strong> all open up automatically once you buy a machine.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveModal(null);
                      onNavigateToMarketplace('ALL');
                    }}
                    className="flex-1 py-2.5 bg-gradient-to-r from-[#0091ea] to-[#0077b6] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Cpu className="w-4 h-4" />
                    <span>Buy a Machine Now</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveModal(null)}
                    className="px-4 py-2.5 bg-[#062232] text-slate-300 rounded-xl text-xs font-bold cursor-pointer hover:text-white"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="bg-[#031420] border border-[#00d2c4]/30 p-4 rounded-xl space-y-2 text-center">
                  <span className="text-xs text-[#7ba3b0]">Your Total Invites</span>
                  <span className="text-3xl font-black text-white font-mono block">{inviteCount}</span>
                  <div className="inline-block bg-[#00b4d8]/20 border border-[#00e5ff]/40 text-[#80deea] text-[11px] font-bold px-3 py-1 rounded-full mt-1">
                    Invitation Bonus: 8%
                  </div>
                  <p className="text-[11px] text-slate-300 mt-2 leading-relaxed">
                    Your invitation bonus is <strong>8%</strong> when an invited customer buys a machine.
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setActiveModal(null);
                      onNavigateToAccount();
                    }}
                    className="flex-1 py-2.5 bg-gradient-to-r from-[#00b4d8] to-[#0077b6] text-white rounded-xl text-xs font-bold cursor-pointer hover:brightness-110"
                  >
                    Open Profile Invite Icon
                  </button>
                  <button
                    onClick={() => setActiveModal(null)}
                    className="px-4 py-2.5 bg-[#062232] text-slate-300 rounded-xl text-xs font-bold cursor-pointer hover:text-white"
                  >
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal 6: Team Count */}
      {activeModal === 'team_count' && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[#051d24] border border-[#00d2c4]/60 shadow-[0_0_35px_rgba(0,210,200,0.25)] rounded-2xl p-5 max-w-sm w-full space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#0c3a47]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#00b4d8] flex items-center justify-center text-white">
                  <ShieldCheck className="w-4 h-4 text-white" />
                </div>
                <h3 className="text-base font-bold text-white">Team Network</h3>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-[#031420] border border-[#00d2c4]/30 p-4 rounded-xl space-y-2 text-center">
              <span className="text-xs text-[#7ba3b0]">Total Active Network Size</span>
              <span className="text-3xl font-black text-white font-mono block">{teamCount}</span>
              <p className="text-[11px] text-[#7ba3b0] mt-1 leading-relaxed">
                Team size reflects registered customers in your network who have bought machines.
              </p>
            </div>

            <button
              onClick={() => setActiveModal(null)}
              className="w-full py-2.5 bg-gradient-to-r from-[#00b4d8] to-[#0077b6] text-white rounded-xl text-xs font-bold cursor-pointer hover:brightness-110"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Modal 7: Team Income (8% rate, same machine as inviter, collected on balance when cycle ends per Item 4) */}
      {activeModal === 'team_income' && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[#051d24] border border-[#00d2c4]/60 shadow-[0_0_35px_rgba(0,210,200,0.25)] rounded-2xl p-5 max-w-sm w-full space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-[#0c3a47]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#00b4d8] flex items-center justify-center text-white">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <h3 className="text-base font-bold text-white">Team Income (8%)</h3>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-[#031420] border border-[#00d2c4]/30 p-4 rounded-xl space-y-2.5 text-center">
              <span className="text-xs text-[#7ba3b0]">Collected Team Commission (8%)</span>
              <span className="text-2xl font-black text-emerald-400 font-mono block">
                {formatVal(teamIncome)}
              </span>
              <div className="text-left bg-[#020f18] border border-[#0c3a47] rounded-lg p-3 space-y-1.5 text-[11px] text-slate-200 leading-relaxed">
                <p>
                  • The <strong>8% commission</strong> is credited directly onto your <strong>balance</strong> when an invited customer activates a machine.
                </p>
                <p>
                  • Users can withdraw the <strong>3,000 UGX registration bonus</strong> and <strong>commission</strong> directly from their balance without waiting for the end of a cycle.
                </p>
              </div>
            </div>

            <button
              onClick={() => setActiveModal(null)}
              className="w-full py-2.5 bg-gradient-to-r from-[#00b4d8] to-[#0077b6] text-white rounded-xl text-xs font-bold cursor-pointer hover:brightness-110"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Modal 8: Company's PDF Viewer & Download (Strictly Customers Only per Item 3) */}
      {activeModal === 'company_pdf' && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[#041622] border border-[#00d2c4]/60 shadow-[0_0_35px_rgba(0,210,200,0.3)] rounded-2xl p-5 max-w-lg w-full space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-[#0c3a47]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#0091ea] flex items-center justify-center text-white">
                  <FileText className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Avor invest — Company&apos;s PDF</h3>
                  <p className="text-[10px] text-[#7ba3b0]">Official Platform Guidelines & Hardware Specifications</p>
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
              <div className="bg-[#020f18] border border-amber-500/50 rounded-xl p-5 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-amber-950/80 border border-amber-500/50 flex items-center justify-center mx-auto text-amber-400">
                  <Lock className="w-6 h-6" />
                </div>
                <h4 className="text-sm sm:text-base font-black text-white">
                  Company&apos;s PDF — Customers Only
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  The official <strong>Avor invest Company&apos;s PDF</strong> is only accessible to active customers (people who have bought at least one machine).
                </p>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveModal(null);
                      onNavigateToMarketplace('ALL');
                    }}
                    className="flex-1 py-2.5 bg-gradient-to-r from-[#0091ea] to-[#0077b6] hover:brightness-110 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shadow-md"
                  >
                    <Cpu className="w-4 h-4" />
                    <span>Buy a Machine to Unlock PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveModal(null)}
                    className="px-4 py-2.5 bg-[#062232] text-slate-300 hover:text-white rounded-xl text-xs font-bold cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto space-y-3 pr-1 text-xs text-slate-200 leading-relaxed font-sans">
                  <div className="bg-[#020f18] border border-rose-500/40 p-3.5 rounded-xl space-y-2 shadow-inner">
                    <h4 className="font-black text-rose-400 uppercase text-xs tracking-wide">
                      THE COMPANY&apos;S RULES AND THEIR RESPECTIVE PUNISHMENTS IF BROKEN BY THE CUSTOMERS
                    </h4>
                    <ol className="list-decimal list-inside text-[11px] text-slate-200 space-y-2 leading-relaxed">
                      <li>
                        <strong>No using multiple accounts in the same device.</strong> If done, the company will either <strong className="text-rose-300">suspend or fire a customer out of the company</strong>.
                      </li>
                      <li>
                        <strong>No lending money to any other person to buy machines.</strong> If done, the company will <strong className="text-rose-300">decrease the team size of the customer(s) by 5 members or suspend or fire a victim</strong>.
                      </li>
                      <li>
                        <strong>No withdrawing money from different accounts using a single sim card.</strong> If done, the victim account will be considered a multiple account and it will face the <strong className="text-rose-300">same repercussions</strong> (suspend or fire a customer out of the company).
                      </li>
                      <li>
                        <strong>No using voice mails and any other local language in the company&apos;s WhatsApp group, but English as an official language.</strong> If done, this will lead to <strong className="text-rose-300">suspension of the victim from the WhatsApp group</strong> (or suspend or fire the customer out of the company).
                      </li>
                      <li>
                        <strong>If any customer spends 2 weeks when his or her account is inactive (no machine running on it),</strong> this person will <strong className="text-rose-300">no longer be considered an eligible customer</strong>. The customer&apos;s account who invited him or her will be <strong className="text-rose-300">deducted by 1 if the number is 1</strong>.
                      </li>
                    </ol>
                  </div>

                  <div className="bg-[#020f18] border border-emerald-500/40 p-3.5 rounded-xl space-y-2 shadow-inner">
                    <h4 className="font-black text-emerald-400 uppercase text-xs tracking-wide">
                      HOW TO EARN MORE IN AVOR INVESTMENTS
                    </h4>
                    <ol className="list-decimal list-inside text-[11px] text-slate-200 space-y-1.5 leading-relaxed">
                      <li>
                        Inviting more people to upgrade to <strong>CLASS levels (A-I)</strong> and get rewards accordingly.
                      </li>
                      <li>
                        Inviting more customers and earn more commission of <strong>8%</strong>.
                      </li>
                      <li>
                        Buying multiple machines to earn more profits accordingly.
                      </li>
                      <li>
                        Inviting <strong>4 or more customers</strong> in a month to earn monthly reward of <strong>5%</strong> the machine cost.
                      </li>
                      <li>
                        Inviting people to buy same machines like that of the inviter to earn <strong>team income</strong> whenever the invited customers&apos; machine cycle elapses.
                      </li>
                    </ol>
                  </div>

                  <div className="bg-[#020f18] border border-[#0c3a47] p-3.5 rounded-xl space-y-1.5">
                    <h4 className="font-black text-[#00e5ff] uppercase text-xs">1. Company Overview & Mission (Est. 2023)</h4>
                    <p className="text-[11px] text-slate-300">
                      <strong>Avor invest (2023)</strong> is a high-efficiency computing hardware and node leasing platform providing automated daily yield payouts into your balance and transparent Mobile Money liquidity across Uganda and East Africa.
                    </p>
                  </div>

                  <div className="bg-[#020f18] border border-[#0c3a47] p-3.5 rounded-xl space-y-1.5">
                    <h4 className="font-black text-[#00e5ff] uppercase text-xs">2. Withdraw Rules & Platform Bonuses</h4>
                    <ul className="list-disc list-inside text-[11px] text-slate-300 space-y-1">
                      <li><strong>Rule 1 (Schedule):</strong> Withdraws run from <strong>Mon – Fri</strong>.</li>
                      <li><strong>Rule 2 (Fee):</strong> Withdraw percentage is <strong>10%</strong>.</li>
                      <li><strong>Rule 3 (Limits):</strong> Minimum withdraw is <strong>3k (3,000 UGX)</strong> and Maximum withdraw is <strong>5M (5,000,000 UGX)</strong>.</li>
                      <li><strong>Rule 4 (Eligibility):</strong> <strong>3000</strong> is eligible for <strong>customers</strong>.</li>
                      <li><strong>Rule 5 (Processing Time):</strong> <strong>* Withdraws take 24-96 hours to process.</strong></li>
                      <li><strong>Team Income & Invitation Bonus (8%):</strong> Team income and invitation bonus is <strong>8%</strong> (collected onto the inviter&apos;s balance when the cycle of the invited customer&apos;s machine has ended).</li>
                      <li><strong>Last Month&apos;s Reward (5%):</strong> Collected when a customer has invited 4 or more customers (people who have bought machines), equal to <strong>5%</strong> of the total machine price the invited customers have bought. Always collected on every <strong>28th of every month</strong> to the customers&apos; balance for withdraw.</li>
                    </ul>
                  </div>

                  <div className="bg-[#020f18] border border-[#0c3a47] p-3.5 rounded-xl space-y-2">
                    <h4 className="font-black text-[#00e5ff] uppercase text-xs">3. Machine Series Specifications</h4>
                    <div className="space-y-1.5 text-[11px] font-mono">
                      <div className="p-2 bg-[#041a29] rounded-lg border border-sky-500/30">
                        <span className="text-sky-300 font-bold block">AV1 Series (Works Mon – Friday • Limit: 1 Unit Only)</span>
                        <span>• AV1 - Machine 1: 35,000 UGX | 18 Days | Returns 50,000 UGX</span><br />
                        <span>• AV1 - Machine 2: 140,000 UGX | 16 Days | Returns 220,000 UGX</span>
                      </div>
                      <div className="p-2 bg-[#041a29] rounded-lg border border-blue-500/30">
                        <span className="text-blue-300 font-bold block">AV2 Series (Works Mon – Friday • Limit: Max 2 Units)</span>
                        <span>• AV2 - Machine 1: 55,000 UGX | 60 Days | Returns 200,000 UGX</span><br />
                        <span>• AV2 - Machine 2: 110,000 UGX | 55 Days | Returns 350,000 UGX</span><br />
                        <span>• AV2 - Machine 3: 200,000 UGX | 50 Days | Returns 550,000 UGX</span><br />
                        <span>• AV2 - Machine 4: 300,000 UGX | 45 Days | Returns 700,000 UGX</span><br />
                        <span>• AV2 - Machine 5: 500,000 UGX | 40 Days | Returns 900,000 UGX</span><br />
                        <span>• AV2 - Machine 6: 1,000,000 UGX | 35 Days | Returns 2,000,000 UGX</span>
                      </div>
                      <div className="p-2 bg-[#041a29] rounded-lg border border-emerald-500/30">
                        <span className="text-emerald-300 font-bold block">AV Classes A–I (21 Days • Counts Throughout the Week)</span>
                        <span>• Class A (4 Customers → 25k Reward): 30,000 UGX → 50,000 UGX</span><br />
                        <span>• Class B (9 Customers → 60k Reward): 75,000 UGX → 135,000 UGX</span><br />
                        <span>• Class C (20 Customers → 110k Reward): 120,000 UGX → 250,000 UGX</span><br />
                        <span>• Class D (35 Customers → 220k Reward): 240,000 UGX → 400,000 UGX</span><br />
                        <span>• Class E (70 Customers → 450k Reward): 470,000 UGX → 850,000 UGX</span><br />
                        <span>• Class F (120 Customers → 850k Reward): 900,000 UGX → 1,900,000 UGX</span><br />
                        <span>• Class G (300 Customers → 1.2M Reward): 1,300,000 UGX → 3,000,000 UGX</span><br />
                        <span>• Class H (5,000 Customers → 3M Reward): 3,100,000 UGX → 7,000,000 UGX</span><br />
                        <span>• Class I (10,000 Customers → 8.5M Reward): 9,000,000 UGX → 25,000,000 UGX</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex gap-2 pt-2 border-t border-[#0c3a47]">
                  <a
                    href={`/company-rules.pdf?user_id=${encodeURIComponent(user?.id || '')}&customer=true`}
                    download="Avor-invest-Company-PDF.pdf"
                    className="flex-1 py-2.5 bg-gradient-to-r from-[#0091ea] to-[#0077b6] hover:brightness-110 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 cursor-pointer shadow-md"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download Company&apos;s PDF</span>
                  </a>
                  <button
                    onClick={() => setActiveModal(null)}
                    className="px-4 py-2.5 bg-[#062232] text-slate-300 hover:text-white rounded-xl text-xs font-bold cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal 9: Company WhatsApp & Manage Customer-Only Gate */}
      {activeModal === 'whatsapp_gate' && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[#041622] border border-amber-500/50 shadow-2xl rounded-2xl p-5 max-w-sm w-full space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-amber-950/80 border border-amber-500/50 flex items-center justify-center mx-auto text-amber-400">
              <Lock className="w-6 h-6" />
            </div>
            <h3 className="text-base font-black text-white">
              Locked Until You Buy a Machine 🔐
            </h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              <strong>WhatsApp 🔐, Company PDF, Invite, and Manage</strong> are locked until you buy a machine. As soon as you buy a machine, all 4 open up automatically!
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setActiveModal(null);
                  onNavigateToMarketplace('ALL');
                }}
                className="flex-1 py-2.5 bg-gradient-to-r from-[#0091ea] to-[#0077b6] text-white rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Cpu className="w-4 h-4" />
                <span>Buy a Machine Now</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="px-4 py-2.5 bg-[#062232] text-slate-300 hover:text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
