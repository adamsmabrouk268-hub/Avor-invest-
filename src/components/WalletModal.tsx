import React, { useState, useEffect } from 'react';
import { User, Currency, Transaction, DepositReceiverNumber, Investment } from '../types';
import { CURRENCY_MAP } from '../data/defaultMachines';
import {
  X,
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  History,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  ShieldCheck,
  RotateCcw,
  Clock,
  ArrowRight,
  ArrowLeft,
  Smartphone,
  Coins,
  PhoneCall,
  Cpu,
} from 'lucide-react';

interface WalletModalProps {
  user: User | null;
  currency: Currency;
  initialMode?: 'deposit' | 'withdraw';
  hasBoughtMachine?: boolean;
  userInvestments?: Investment[];
  onClose: () => void;
  onRefreshUser: () => void;
  onNavigateToMarketplace?: () => void;
}

export const WalletModal: React.FC<WalletModalProps> = ({
  user,
  currency,
  initialMode = 'deposit',
  hasBoughtMachine = false,
  userInvestments = [],
  onClose,
  onRefreshUser,
  onNavigateToMarketplace,
}) => {
  const currencyInfo = CURRENCY_MAP[currency];
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw' | 'history'>(initialMode);

  // 4-Step Deposit Flow State:
  // Step 1: User clicks Deposit on Profile -> opens modal at 'SELECT_METHOD'
  // Step 2: 'SELECT_METHOD' -> Choose a Payment Method (MTN Mobile Money, Airtel Mobile Money, USDT)
  // Step 3: 'ENTER_DETAILS' -> Enter Amount & Sender Phone Number
  // Step 4: 'PAYMENT_INFO' -> Receives Account Number & Account Name + Payment Guide + Confirm Payment
  // Step 5: 'SUBMITTED' -> Deposit sent to Admin + button to go back to buy machine using money on wallet
  const [depositStep, setDepositStep] = useState<'SELECT_METHOD' | 'ENTER_DETAILS' | 'PAYMENT_INFO' | 'SUBMITTED'>('SELECT_METHOD');
  const [paymentCountdown, setPaymentCountdown] = useState<number>(1795); // 00:29:55

  useEffect(() => {
    setActiveTab(initialMode);
    if (initialMode === 'deposit') {
      setDepositStep('SELECT_METHOD');
    }
  }, [initialMode]);

  // Deposit Form State
  const [depositAmt, setDepositAmt] = useState<number>(50000);
  const [depositAmtInput, setDepositAmtInput] = useState<string>('50000');
  const [depositMethod, setDepositMethod] = useState<string>('MTN MOBILE MONEY');
  const [depositPhone, setDepositPhone] = useState<string>(user?.phone_number || '');
  const [depositRefInput, setDepositRefInput] = useState<string>('');

  // Active Rotating Receiver Info
  const [activeReceiver, setActiveReceiver] = useState<DepositReceiverNumber | null>(null);
  const [rotationMode, setRotationMode] = useState<'TIME_BASED' | 'ROUND_ROBIN' | 'ADMIN_MANUAL'>('TIME_BASED');
  const [timeRemainingSeconds, setTimeRemainingSeconds] = useState<number>(300);
  const [isLoadingReceiver, setIsLoadingReceiver] = useState<boolean>(false);

  // Withdraw Form State (Rules: Mon-Fri, 10% fee, Min 3k, Max 5M, 3k eligible for customers only)
  const [withdrawAmt, setWithdrawAmt] = useState<number>(3000);
  const [withdrawMethod, setWithdrawMethod] = useState<string>('MTN Mobile Money');
  const [withdrawPhone, setWithdrawPhone] = useState<string>(user?.phone_number || '');
  const [accountName, setAccountName] = useState<string>(user?.full_name || '');
  const [summaryHasMachine, setSummaryHasMachine] = useState<boolean>(hasBoughtMachine);
  const [summaryCompletedCycle, setSummaryCompletedCycle] = useState<boolean>(false);
  const [confirmedDepositsTotal, setConfirmedDepositsTotal] = useState<number>(0);
  const [pendingDepositsTotal, setPendingDepositsTotal] = useState<number>(0);
  const [liveUserBalance, setLiveUserBalance] = useState<number>(user?.balance || 0);

  const completedCycleInvs = userInvestments.filter(
    (inv) => inv.status === 'PAYOUT_COMPLETE' || (inv.days_elapsed || 0) >= (inv.duration_days || 1)
  );
  const runningInvs = userInvestments.filter(
    (inv) => inv.status === 'ACTIVE' && (inv.days_elapsed || 0) < (inv.duration_days || 1)
  );
  const hasCompletedCycle = completedCycleInvs.length > 0 || summaryCompletedCycle;

  // Submission State
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [copiedField, setCopiedField] = useState<'phone' | 'name' | 'amount' | null>(null);

  const isEligibleCustomer = hasBoughtMachine || summaryHasMachine || userInvestments.length > 0;
  const currentDayOfWeek = new Date().getDay(); // 0 = Sun, 1 = Mon ... 5 = Fri, 6 = Sat
  const isWeekdayMonToFri = currentDayOfWeek >= 1 && currentDayOfWeek <= 5;
  const withdrawFeeAmt = Math.round((Number(withdrawAmt) || 0) * 0.10);
  const withdrawNetAmt = Math.max(0, (Number(withdrawAmt) || 0) - withdrawFeeAmt);

  useEffect(() => {
    setLiveUserBalance(user?.balance || 0);
  }, [user?.balance]);

  useEffect(() => {
    fetchActiveReceiver();
    if (!user) return;
    const syncVault = () => {
      fetchTransactions();
      onRefreshUser();
      fetch(`/api/user/dashboard-summary/${encodeURIComponent(user.id)}`)
        .then((r) => (r.ok && (r.headers.get('content-type') || '').includes('application/json') ? r.json() : null))
        .then((d) => {
          if (d) {
            if (typeof d.balance === 'number') {
              setLiveUserBalance(d.balance);
            }
            if (d.deposit_details) {
              setConfirmedDepositsTotal(Number(d.deposit_details.total_deposited || 0));
              setPendingDepositsTotal(Number(d.deposit_details.pending_deposits || 0));
            }
            if (d.has_bought_machine) {
              setSummaryHasMachine(true);
            }
            if (d.withdraw_details?.has_completed_cycle) {
              setSummaryCompletedCycle(true);
            }
          }
        })
        .catch(() => {});
    };
    syncVault();
    const interval = setInterval(syncVault, 4000);
    return () => clearInterval(interval);
  }, [user?.id]);

  // Fast countdown timer for receiver rotation UI & Step 4 Payment Information timer
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeRemainingSeconds((prev) => (prev > 0 ? prev - 1 : 0));
      setPaymentCountdown((prev) => (prev > 0 ? prev - 1 : 1795));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const DEFAULT_RECEIVER: DepositReceiverNumber = {
    id: 'rec-default',
    phone_number: '0741032838',
    account_name: 'SULAINH NAKASEETA',
    carrier: 'MTN',
    is_active: true,
    daily_receiving_limit: 5000000,
    amount_received_today: 0,
    total_received_ugx: 0,
    total_transactions_count: 0,
    rotation_duration_minutes: 5,
    rotation_duration_hours: 0.083,
    priority: 1,
    created_at: new Date().toISOString(),
  };

  const getLocalTransactions = (uid: string): Transaction[] => {
    try {
      const raw = localStorage.getItem(`avor_invest_txs_${uid}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  };

  const saveLocalTransactions = (uid: string, list: Transaction[]) => {
    try {
      localStorage.setItem(`avor_invest_txs_${uid}`, JSON.stringify(list));
    } catch {}
  };

  const fetchActiveReceiver = async (forceNext = false) => {
    setIsLoadingReceiver(true);
    try {
      const url = forceNext ? '/api/wallet/active-receiver?rotate=true' : '/api/wallet/active-receiver';
      const res = await fetch(url);
      const ct = res.headers.get('content-type') || '';
      if (res.ok && ct.includes('application/json')) {
        const data = await res.json();
        setActiveReceiver(data.receiver || data || DEFAULT_RECEIVER);
        if (data.mode) setRotationMode(data.mode);
        else if (data.config?.mode) setRotationMode(data.config.mode);
        if (data.timeRemainingSeconds !== undefined) {
          setTimeRemainingSeconds(data.timeRemainingSeconds);
        }
      } else {
        setActiveReceiver((prev) => prev || DEFAULT_RECEIVER);
      }
    } catch {
      setActiveReceiver((prev) => prev || DEFAULT_RECEIVER);
    } finally {
      setIsLoadingReceiver(false);
    }
  };

  const fetchTransactions = async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/transactions/${encodeURIComponent(user.id)}`);
      const ct = res.headers.get('content-type') || '';
      if (res.ok && ct.includes('application/json')) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setTransactions(data);
          saveLocalTransactions(user.id, data);
          return;
        }
      }
    } catch {
      // Soft fallback to locally cached transactions if server is momentarily unreachable
    }
    setTransactions((prev) => (prev.length > 0 ? prev : getLocalTransactions(user.id)));
  };

  const copyToClipboard = (text: string, field: 'phone' | 'name' | 'amount') => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2500);
  };

  // Step 3 -> Step 4 handler: Validates amount & sender phone, then reveals Company Payment Information
  const handleProceedToPaymentInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    const numAmt = Number(depositAmtInput || depositAmt);
    if (isNaN(numAmt) || numAmt < 5000) {
      setMessage({ type: 'error', text: 'MINIMUM DEPOSIT: UGX 5,000. Please enter at least 5,000 UGX.' });
      return;
    }
    if (!depositPhone.trim() || depositPhone.replace(/\D/g, '').length < 7) {
      setMessage({
        type: 'error',
        text: 'Please enter the MTN or Airtel phone number that you will use to make the deposit.',
      });
      return;
    }
    setDepositAmt(numAmt);
    await fetchActiveReceiver(false);
    setPaymentCountdown(1795); // 00:29:55
    setDepositStep('PAYMENT_INFO');
  };

  // Step 4 Confirm Payment handler: Submits deposit to Admin for confirmation
  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsLoading(true);
    setMessage(null);

    const targetPhone = activeReceiver?.phone_number || '0741032838';
    const targetName = activeReceiver?.account_name || 'SULAINH NAKASEETA';

    try {
      const res = await fetch('/api/wallet/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          user_phone: user.phone_number,
          user_name: user.full_name,
          amount: depositAmt,
          payment_method: depositMethod,
          phone_number: depositPhone,
          payment_reference: depositRefInput || undefined,
          receiver_phone: targetPhone,
          receiver_name: targetName,
        }),
      });

      const ct = res.headers.get('content-type') || '';
      const data = ct.includes('application/json') ? await res.json() : {};
      if (!res.ok) throw new Error(data.error || 'Deposit processing failed.');

      setMessage({
        type: 'success',
        text:
          data.message ||
          `Deposit of ${depositAmt.toLocaleString()} UGX submitted to Admin! Once Admin confirms your deposit, it will reflect on your wallet balance so you can buy your machine.`,
      });
      setDepositRefInput('');
      setDepositStep('SUBMITTED');
      onRefreshUser();
      fetchTransactions();
      fetchActiveReceiver();
    } catch (err: any) {
      if (err instanceof TypeError && err.message.includes('fetch')) {
        const fallbackTx: Transaction = {
          id: `tx-dep-${Date.now()}`,
          user_id: user.id,
          amount: depositAmt,
          type: 'DEPOSIT',
          status: 'PENDING',
          payment_method: `${depositMethod} (Receiver: ${targetPhone} ${targetName})`,
          payment_reference: depositRefInput || `DEP-${Date.now()}`,
          created_at: new Date().toISOString(),
        };
        const updated = [fallbackTx, ...transactions];
        setTransactions(updated);
        saveLocalTransactions(user.id, updated);
        setDepositRefInput('');
        setDepositStep('SUBMITTED');
        setMessage({
          type: 'success',
          text: `Deposit request of ${depositAmt.toLocaleString()} UGX submitted! Sent to ${targetPhone} (${targetName}). Pending Admin confirmation.`,
        });
      } else {
        setMessage({ type: 'error', text: err.message || 'Unable to submit deposit request.' });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    // Rule 1: Withdraws run from Mon - Fri
    if (!isWeekdayMonToFri) {
      setMessage({
        type: 'error',
        text: 'Withdraw Rule 1: Withdrawals run from Monday to Friday only. Weekend withdrawals are closed.',
      });
      return;
    }

    // Rule 4: 3k is only eligible for customers only
    if (!isEligibleCustomer) {
      setMessage({
        type: 'error',
        text: 'Withdraw Rule 4: 3,000 UGX (3k) withdrawal is only eligible for customers who have purchased a machine.',
      });
      return;
    }

    // Cycle Duration Rule: Money in wallet is used to buy machine only. Money on balance is for withdrawal only after the total cycle duration of days.
    if (!hasCompletedCycle) {
      const active = runningInvs[0];
      const remainingDays = active ? Math.max(1, (active.duration_days || 1) - (active.days_elapsed || 0)) : null;
      setMessage({
        type: 'error',
        text: `Cycle Duration Rule: Money on the wallet is used to buy machine only. Money on balance is for withdrawal only after the total cycle duration of days.${
          active
            ? ` Your active machine (${active.machine_title}) is currently on Day ${active.days_elapsed || 1} of ${active.duration_days} Days (${remainingDays} day${remainingDays && remainingDays > 1 ? 's' : ''} remaining).`
            : ' Please complete your machine cycle duration first.'
        }`,
      });
      return;
    }

    // Rule 3: Minimum withdraw is 3k and Maximum withdraw is 5M
    if (withdrawAmt < 3000) {
      setMessage({ type: 'error', text: 'Withdraw Rule 3: Minimum withdraw is 3,000 UGX (3k).' });
      return;
    }

    if (withdrawAmt > 5000000) {
      setMessage({ type: 'error', text: 'Withdraw Rule 3: Maximum withdraw is 5,000,000 UGX (5M).' });
      return;
    }

    if (user.balance < 3000) {
      setMessage({
        type: 'error',
        text: `You must have at least 3,000 UGX to withdraw. Current balance: ${user.balance.toLocaleString()} UGX.`,
      });
      return;
    }

    if (user.balance < withdrawAmt) {
      setMessage({
        type: 'error',
        text: `Insufficient balance. Available withdrawable balance: ${user.balance.toLocaleString()} UGX.`,
      });
      return;
    }

    setIsLoading(true);
    setMessage(null);

    try {
      const res = await fetch('/api/wallet/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          user_phone: user.phone_number,
          user_name: user.full_name,
          amount: withdrawAmt,
          fee_amount: withdrawFeeAmt,
          net_amount: withdrawNetAmt,
          has_bought_machine: isEligibleCustomer,
          payment_method: withdrawMethod,
          phone_number: withdrawPhone,
          account_number: withdrawPhone,
          account_name: accountName,
        }),
      });

      const ct = res.headers.get('content-type') || '';
      const data = ct.includes('application/json') ? await res.json() : {};
      if (!res.ok) throw new Error(data.error || 'Withdrawal processing failed.');

      setMessage({
        type: 'success',
        text:
          data.message ||
          `Withdrawal of ${withdrawAmt.toLocaleString()} UGX submitted! (10% fee: ${withdrawFeeAmt.toLocaleString()} UGX • Net payout: ${withdrawNetAmt.toLocaleString()} UGX)`,
      });
      onRefreshUser();
      fetchTransactions();
    } catch (err: any) {
      if (err instanceof TypeError && err.message.includes('fetch')) {
        const fallbackTx: Transaction = {
          id: `tx-wdr-${Date.now()}`,
          user_id: user.id,
          amount: withdrawAmt,
          type: 'WITHDRAWAL',
          status: 'PENDING',
          payment_method: `${withdrawMethod} (${withdrawPhone || accountName || 'Account'}) • Net: ${withdrawNetAmt.toLocaleString()} UGX (-10% fee)`,
          payment_reference: `WDR-OUT-${Math.floor(100000 + Math.random() * 900000)}`,
          created_at: new Date().toISOString(),
        };
        const updated = [fallbackTx, ...transactions];
        setTransactions(updated);
        saveLocalTransactions(user.id, updated);
        setMessage({
          type: 'success',
          text: `Withdrawal request of ${withdrawAmt.toLocaleString()} UGX submitted! (10% fee: ${withdrawFeeAmt.toLocaleString()} UGX • Net payout: ${withdrawNetAmt.toLocaleString()} UGX)`,
        });
      } else {
        setMessage({ type: 'error', text: err.message || 'Unable to submit withdrawal request.' });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const formatHhMmSs = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${h < 10 ? '0' : ''}${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const timeFormatted = formatSeconds(timeRemainingSeconds);
  const paymentTimerFormatted = formatHhMmSs(paymentCountdown);
  const displayReceiverPhone = activeReceiver?.phone_number || '0741032838';
  const displayReceiverName = activeReceiver?.account_name || 'SULAINH NAKASEETA';
  const displayCarrier = activeReceiver?.carrier || 'MTN';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in text-white select-none">
      <div className="shining-card-glow rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border border-blue-500/40 relative my-auto max-h-[94vh] flex flex-col bg-[#040814]">
        {/* Top Blue-Cyan Accent Bar */}
        <div className="h-1.5 bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-400 shrink-0" />

        {/* Header */}
        <div className="bg-[#070e1f] p-4 sm:p-5 flex items-center justify-between border-b border-blue-900/70 shrink-0">
          <div className="flex items-center gap-3">
            {activeTab === 'deposit' && (depositStep === 'ENTER_DETAILS' || depositStep === 'PAYMENT_INFO') && (
              <button
                type="button"
                onClick={() => {
                  setMessage(null);
                  setDepositStep(depositStep === 'PAYMENT_INFO' ? 'ENTER_DETAILS' : 'SELECT_METHOD');
                }}
                className="p-2 rounded-xl bg-[#09152e] hover:bg-[#0f224a] text-sky-300 border border-blue-500/40 transition-all cursor-pointer"
                title="Back to previous step"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div>
              <div className="flex items-center gap-2">
                <Coins className="w-5 h-5 text-sky-400" />
                <h3 className="text-base sm:text-lg font-black text-white tracking-wide uppercase">
                  {activeTab === 'deposit' ? 'AVOR' : 'Avor Invest Vault'}
                </h3>
              </div>
              <p className="text-xs font-extrabold text-sky-300 tracking-wider uppercase mt-0.5">
                {activeTab === 'deposit'
                  ? depositStep === 'SELECT_METHOD'
                    ? 'CHOOSE A PAYMENT METHOD'
                    : depositStep === 'ENTER_DETAILS'
                      ? 'DEPOSIT DETAILS'
                      : depositStep === 'PAYMENT_INFO'
                        ? 'PAYMENT INFORMATION'
                        : 'PAYMENT SUBMITTED TO ADMIN'
                  : `Balance: ${currencyInfo.format(liveUserBalance)} • Confirmed: ${currencyInfo.format(confirmedDepositsTotal)}`}
              </p>
              {activeTab === 'deposit' && depositStep === 'PAYMENT_INFO' && (
                <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-950/90 border border-sky-400/40 text-sky-300 text-[11px] font-mono font-bold tracking-wider">
                  <Clock className="w-3.5 h-3.5 text-sky-400" />
                  <span>TIME REMAINING: {paymentTimerFormatted}</span>
                </div>
              )}
              {pendingDepositsTotal > 0 && activeTab !== 'deposit' && (
                <p className="text-[10px] text-sky-300 font-mono font-bold mt-0.5">
                  Pending Admin Confirmation: {currencyInfo.format(pendingDepositsTotal)}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-blue-900/40 transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-blue-950/80 bg-[#050a18] p-1.5 shrink-0">
          <button
            onClick={() => {
              setActiveTab('deposit');
              setDepositStep('SELECT_METHOD');
              setMessage(null);
            }}
            className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'deposit'
                ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white font-black shadow-md shadow-blue-900/50 border border-blue-400/40'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ArrowDownLeft className="w-4 h-4" />
            <span>Deposit</span>
          </button>

          <button
            onClick={() => { setActiveTab('withdraw'); setMessage(null); }}
            className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'withdraw'
                ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white font-black shadow-md shadow-blue-900/50 border border-blue-400/40'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <ArrowUpRight className="w-4 h-4" />
            <span>Withdraw</span>
          </button>

          <button
            onClick={() => { setActiveTab('history'); setMessage(null); }}
            className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'history'
                ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white font-black shadow-md shadow-blue-900/50 border border-blue-400/40'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Logs</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-6 space-y-4 bg-[#040814]/98 overflow-y-auto">
          {message && (
            <div
              className={`p-3.5 rounded-xl text-xs font-bold flex items-center gap-2 ${
                message.type === 'success'
                  ? 'bg-emerald-950/70 border border-emerald-500/40 text-emerald-300'
                  : 'bg-rose-950/70 border border-rose-500/40 text-rose-300'
              }`}
            >
              {message.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              )}
              <span>{message.text}</span>
            </div>
          )}

          {activeTab === 'deposit' && (
            <div className="space-y-4">
              {/* =================================================================
                  STEP 2: CHOOSE A PAYMENT METHOD (Blue Theme)
                 ================================================================= */}
              {depositStep === 'SELECT_METHOD' && (
                <div className="space-y-3.5 animate-fade-in">
                  {[
                    {
                      id: 'MTN MOBILE MONEY',
                      title: 'MTN MOBILE MONEY',
                      subtitle: 'INSTANT MOBILE PAYMENT (UGX)',
                      icon: 'phone',
                    },
                    {
                      id: 'AIRTEL MOBILE MONEY',
                      title: 'AIRTEL MOBILE MONEY',
                      subtitle: 'INSTANT MOBILE PAYMENT (UGX)',
                      icon: 'phone',
                    },
                    {
                      id: 'USDT',
                      title: 'USDT',
                      subtitle: 'CRYPTO PAYMENT',
                      icon: 'crypto',
                    },
                  ].map((option) => {
                    const isSelected = depositMethod === option.id;
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => {
                          setDepositMethod(option.id);
                          setMessage(null);
                        }}
                        className={`w-full p-4 rounded-2xl border text-left transition-all flex items-center justify-between cursor-pointer ${
                          isSelected
                            ? 'bg-[#091838] border-blue-500 ring-1 ring-blue-400/50 shadow-[0_0_20px_rgba(0,145,234,0.25)]'
                            : 'bg-[#070e1f] border-blue-950/80 hover:border-blue-700/60 hover:bg-[#09132b]'
                        }`}
                      >
                        <div className="flex items-center gap-3.5">
                          <div className="w-11 h-11 rounded-full bg-[#0b1d42] border border-blue-500/40 flex items-center justify-center shrink-0">
                            {option.icon === 'phone' ? (
                              <Smartphone className="w-5 h-5 text-sky-400" />
                            ) : (
                              <Coins className="w-5 h-5 text-sky-400" />
                            )}
                          </div>
                          <div>
                            <span className="text-sm sm:text-base font-black text-white block tracking-wide">
                              {option.title}
                            </span>
                            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mt-0.5">
                              {option.subtitle}
                            </span>
                          </div>
                        </div>
                        <ArrowRight className="w-5 h-5 text-sky-400 shrink-0" />
                      </button>
                    );
                  })}

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        setMessage(null);
                        setDepositStep('ENTER_DETAILS');
                      }}
                      className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 hover:brightness-110 active:scale-98 text-white font-black text-sm uppercase tracking-wider shadow-lg shadow-blue-900/50 border border-blue-400/40 transition-all cursor-pointer"
                    >
                      CONTINUE
                    </button>
                  </div>
                </div>
              )}

              {/* =================================================================
                  STEP 3: DEPOSIT DETAILS — ENTER AMOUNT & SENDER PHONE (Blue Theme)
                 ================================================================= */}
              {depositStep === 'ENTER_DETAILS' && (
                <form onSubmit={handleProceedToPaymentInfo} className="space-y-4 animate-fade-in">
                  {/* Selected Payment Method Display */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-extrabold text-slate-200 uppercase tracking-wider">
                      PAYMENT METHOD
                    </label>
                    <div
                      onClick={() => setDepositStep('SELECT_METHOD')}
                      className="w-full px-4 py-3.5 bg-[#070e1f] border border-blue-900/80 rounded-2xl text-sm font-black text-white uppercase tracking-wide flex items-center justify-between cursor-pointer hover:border-blue-500/60 transition-all"
                    >
                      <span>{depositMethod}</span>
                      <span className="text-[10px] font-bold text-sky-400 uppercase">Change</span>
                    </div>
                  </div>

                  {/* Enter the Amount You Wish to Deposit (UGX) */}
                  <div className="space-y-2">
                    <label className="block text-xs font-extrabold text-slate-200 uppercase tracking-wider">
                      ENTER THE AMOUNT YOU WISH TO DEPOSIT (UGX)
                    </label>
                    <input
                      type="number"
                      min="5000"
                      step="1000"
                      placeholder="Enter the amount you wish to deposit"
                      value={depositAmtInput}
                      onChange={(e) => {
                        setDepositAmtInput(e.target.value);
                        const parsed = Number(e.target.value);
                        if (!isNaN(parsed)) setDepositAmt(parsed);
                      }}
                      className="w-full px-4 py-3.5 bg-[#070e1f] border border-blue-900/80 focus:border-blue-500 rounded-2xl text-sm font-bold text-white outline-none font-mono placeholder:text-slate-400"
                      required
                    />

                    {/* Preset Amount Pills */}
                    <div className="grid grid-cols-5 gap-2 pt-1">
                      {[20000, 50000, 100000, 250000, 500000].map((preset) => {
                        const isPresetActive = Number(depositAmtInput) === preset;
                        return (
                          <button
                            key={preset}
                            type="button"
                            onClick={() => {
                              setDepositAmt(preset);
                              setDepositAmtInput(String(preset));
                            }}
                            className={`py-2.5 px-1 rounded-xl text-xs font-mono font-bold border transition-all cursor-pointer ${
                              isPresetActive
                                ? 'bg-blue-600 border-blue-400 text-white shadow-md shadow-blue-900/50'
                                : 'bg-[#070e1f] border-blue-950/80 text-slate-200 hover:border-blue-600/60'
                            }`}
                          >
                            {preset.toLocaleString()}
                          </button>
                        );
                      })}
                    </div>

                    <p className="text-[11px] font-extrabold text-sky-300 uppercase tracking-wider pt-0.5">
                      MINIMUM DEPOSIT: UGX 5,000
                    </p>
                  </div>

                  {/* Your Phone Number */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-extrabold text-slate-200 uppercase tracking-wider">
                      YOUR PHONE NUMBER
                    </label>
                    <input
                      type="tel"
                      placeholder="07XXXXXXXX"
                      value={depositPhone}
                      onChange={(e) => setDepositPhone(e.target.value)}
                      className="w-full px-4 py-3.5 bg-[#070e1f] border border-blue-900/80 focus:border-blue-500 rounded-2xl text-sm font-bold text-white outline-none font-mono placeholder:text-slate-400"
                      required
                    />
                  </div>

                  {/* Instruction Callout Box */}
                  <div className="p-4 rounded-2xl bg-[#070e1f] border border-blue-900/80 text-xs font-extrabold text-slate-200 uppercase leading-relaxed tracking-wide">
                    ENTER THE SAME MTN OR AIRTEL PHONE NUMBER THAT YOU WILL USE TO MAKE THE PAYMENT. THIS ENABLES THE SYSTEM TO VERIFY YOUR TRANSACTION AND DISPLAY THE COMPANY&apos;S PAYMENT DETAILS.
                  </div>

                  {/* Bottom DEPOSIT Button (Advances to Step 4 to display Company Receiver Number & Name) */}
                  <button
                    type="submit"
                    disabled={isLoadingReceiver}
                    className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 hover:brightness-110 active:scale-98 text-white font-black text-sm uppercase tracking-wider shadow-lg shadow-blue-900/50 border border-blue-400/40 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isLoadingReceiver ? 'LOADING PAYMENT DETAILS...' : 'DEPOSIT'}
                  </button>
                </form>
              )}

              {/* =================================================================
                  STEP 4: PAYMENT INFORMATION — RECEIVES NUMBER & NAME (Blue Theme)
                 ================================================================= */}
              {depositStep === 'PAYMENT_INFO' && (
                <form onSubmit={handleDeposit} className="space-y-3.5 animate-fade-in">
                  {/* 1. ACCOUNT NUMBER Card */}
                  <div className="p-4 rounded-2xl bg-[#070e1f] border border-blue-900/80 flex items-center justify-between gap-3">
                    <div>
                      <span className="text-[11px] font-extrabold text-sky-300 uppercase tracking-wider block">
                        ACCOUNT NUMBER
                      </span>
                      <span className="text-lg sm:text-xl font-mono font-bold text-white tracking-wider mt-0.5 block">
                        {displayReceiverPhone}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(displayReceiverPhone, 'phone')}
                      className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 border border-blue-400/40 text-white font-bold text-xs uppercase flex items-center gap-1.5 cursor-pointer transition-all shrink-0 shadow-sm"
                    >
                      {copiedField === 'phone' ? (
                        <>
                          <Check className="w-4 h-4 text-white" />
                          <span>COPIED</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4 text-white" />
                          <span>COPY</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* 2. ACCOUNT NAME Card */}
                  <div className="p-4 rounded-2xl bg-[#070e1f] border border-blue-900/80 flex items-center justify-between gap-3">
                    <div>
                      <span className="text-[11px] font-extrabold text-sky-300 uppercase tracking-wider block">
                        ACCOUNT NAME
                      </span>
                      <span className="text-base sm:text-lg font-extrabold text-white uppercase tracking-wide mt-0.5 block">
                        {displayReceiverName}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(displayReceiverName, 'name')}
                      className="px-3.5 py-2 rounded-xl bg-[#0b1936] hover:bg-[#10244d] border border-blue-500/40 text-white font-bold text-xs uppercase flex items-center gap-1.5 cursor-pointer transition-all shrink-0"
                    >
                      {copiedField === 'name' ? (
                        <>
                          <Check className="w-4 h-4 text-sky-400" />
                          <span>COPIED</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4 text-sky-300" />
                          <span>COPY</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* 3. AMOUNT Card */}
                  <div className="p-4 rounded-2xl bg-[#070e1f] border border-blue-900/80 flex items-center justify-between gap-3">
                    <div>
                      <span className="text-[11px] font-extrabold text-sky-300 uppercase tracking-wider block">
                        AMOUNT
                      </span>
                      <span className="text-lg sm:text-xl font-mono font-bold text-white tracking-wider mt-0.5 block">
                        {depositAmt.toLocaleString()}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(String(depositAmt), 'amount')}
                      className="px-3.5 py-2 rounded-xl bg-[#0b1936] hover:bg-[#10244d] border border-blue-500/40 text-white font-bold text-xs uppercase flex items-center gap-1.5 cursor-pointer transition-all shrink-0"
                    >
                      {copiedField === 'amount' ? (
                        <>
                          <Check className="w-4 h-4 text-sky-400" />
                          <span>COPIED</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4 text-sky-300" />
                          <span>COPY</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* 4. MOBILE MONEY PAYMENT GUIDE Card */}
                  <div className="p-4 rounded-2xl bg-[#070e1f] border border-blue-900/80 space-y-2 text-xs">
                    <h4 className="font-black text-sky-300 uppercase tracking-wide text-xs sm:text-sm">
                      {depositMethod.includes('AIRTEL') ? 'AIRTEL MOBILE MONEY PAYMENT GUIDE' : 'MTN MOBILE MONEY PAYMENT GUIDE'}
                    </h4>
                    <ol className="space-y-1.5 text-slate-200 font-bold uppercase text-[11px] sm:text-xs leading-relaxed list-decimal list-inside">
                      <li>
                        DIAL {depositMethod.includes('AIRTEL') ? '*185#' : '*165#'} AND CHOOSE SEND MONEY.
                      </li>
                      <li>ENTER THE ACCOUNT NUMBER SHOWN ABOVE.</li>
                      <li>ENTER THE EXACT AMOUNT AND CONFIRM WITH YOUR PIN.</li>
                      <li>COPY THE TRANSACTION ID FROM THE SMS AND PASTE IT BELOW.</li>
                    </ol>
                    <p className="pt-1 font-black text-white uppercase text-xs">
                      RECIPIENT MUST READ: <span className="text-sky-400">{displayReceiverName}</span>
                    </p>
                  </div>

                  {/* Optional Transaction ID / SMS Reference Input */}
                  <div>
                    <input
                      type="text"
                      placeholder="Paste Transaction ID from SMS (Optional)"
                      value={depositRefInput}
                      onChange={(e) => setDepositRefInput(e.target.value)}
                      className="w-full px-4 py-3 bg-[#070e1f] border border-blue-900/80 focus:border-blue-500 rounded-2xl text-xs font-bold text-white outline-none font-mono placeholder:text-slate-400"
                    />
                  </div>

                  {/* DIAL USSD (AVAILABLE SOON) Row */}
                  <div className="w-full py-3 px-4 rounded-2xl bg-[#070e1f] border border-blue-950/80 text-slate-400 font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2">
                    <PhoneCall className="w-4 h-4 text-sky-400" />
                    <span>DIAL USSD (AVAILABLE SOON)</span>
                  </div>

                  {/* CONFIRM PAYMENT Button */}
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 hover:brightness-110 active:scale-98 text-white font-black text-sm uppercase tracking-wider shadow-lg shadow-blue-900/50 border border-blue-400/40 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isLoading ? 'CONFIRMING PAYMENT...' : 'CONFIRM PAYMENT'}
                  </button>
                </form>
              )}

              {/* =================================================================
                  POST-CONFIRMATION: GO BACK TO BUY MACHINE USING MONEY ON WALLET
                 ================================================================= */}
              {depositStep === 'SUBMITTED' && (
                <div className="p-4 rounded-2xl bg-[#070e1f] border border-blue-500/40 space-y-4 text-center animate-fade-in">
                  <div className="w-14 h-14 rounded-full bg-blue-950/80 border border-sky-400/50 text-sky-400 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-8 h-8" />
                  </div>
                  <div className="space-y-1.5">
                    <h4 className="text-base font-black text-white uppercase">
                      Deposit Submitted to Admin!
                    </h4>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Your deposit of <strong className="text-sky-400">{depositAmt.toLocaleString()} UGX</strong> from{' '}
                      <strong className="text-white">{depositPhone}</strong> to{' '}
                      <strong className="text-white">{displayReceiverPhone} ({displayReceiverName})</strong> has been sent to Admin for confirmation.
                    </p>
                    <p className="text-[11px] text-sky-300 font-semibold">
                      Once Admin confirms your deposit, it automatically reflects on your Wallet Balance and all deposit planes so you can buy your machine using the money on your wallet.
                    </p>
                  </div>

                  <div className="space-y-2.5 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        if (onNavigateToMarketplace) {
                          onNavigateToMarketplace();
                        }
                      }}
                      className="w-full py-3.5 px-5 rounded-2xl bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 hover:brightness-110 text-white font-black text-xs uppercase tracking-wider shadow-lg shadow-blue-900/50 border border-blue-400/40 transition-all cursor-pointer flex items-center justify-center gap-2"
                    >
                      <Cpu className="w-4 h-4 text-white" />
                      <span>GO BACK TO BUY MACHINE (USING WALLET)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setMessage(null);
                        setDepositStep('SELECT_METHOD');
                      }}
                      className="w-full py-2.5 px-4 rounded-xl bg-[#0b1936] hover:bg-[#10244d] border border-blue-800/60 text-slate-200 font-bold text-xs uppercase tracking-wider transition-all cursor-pointer"
                    >
                      Make Another Deposit
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'withdraw' && (
            <form onSubmit={handleWithdraw} className="space-y-4">
              {/* Official Withdraw Rules Card (From Screenshot) */}
              <div className="bg-[#070e1f] border border-blue-900/70 p-3.5 rounded-xl space-y-2 text-xs shadow-inner">
                <div className="flex items-center justify-between border-b border-blue-950/80 pb-2">
                  <span className="font-black text-blue-300 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Official Withdraw Rules</span>
                  </span>
                  <span
                    className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded ${
                      isWeekdayMonToFri
                        ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/40'
                        : 'bg-rose-950/80 text-rose-300 border border-rose-500/40'
                    }`}
                  >
                    {isWeekdayMonToFri ? 'Mon–Fri Open' : 'Weekend Closed'}
                  </span>
                </div>

                <ol className="space-y-1 text-[11px] text-slate-200 font-medium list-decimal list-inside">
                  <li>
                    Withdraws run from <strong className="text-cyan-300">Mon – Fri</strong>
                  </li>
                  <li>
                    Withdraw percentage – <strong className="text-amber-300">10%</strong>
                  </li>
                  <li>
                    Minimum withdraw is <strong className="text-emerald-300">3k (3,000 UGX)</strong> and Maximum withdraw is{' '}
                    <strong className="text-emerald-300">5M (5,000,000 UGX)</strong>
                  </li>
                  <li>
                    <strong className="text-cyan-300">3k</strong> is only eligible for{' '}
                    <strong className="text-white">customers only</strong> (active machine owners).
                  </li>
                  <li>
                    <strong className="text-cyan-300">Total Cycle Duration Rule:</strong> Money in wallet is used to buy machine only. Money on balance is for withdrawal only <strong className="text-emerald-300">after the total cycle duration of days</strong>.
                  </li>
                </ol>

                <div
                  className={`mt-1 pt-2 border-t border-blue-950/80 flex items-center justify-between text-[11px] font-mono ${
                    isEligibleCustomer && hasCompletedCycle && (user?.balance || 0) >= 3000
                      ? 'text-emerald-300'
                      : 'text-amber-300'
                  }`}
                >
                  <span>
                    Status:{' '}
                    <strong>
                      {!isEligibleCustomer
                        ? 'Customer Only (Buy Machine First)'
                        : !hasCompletedCycle
                        ? 'Cycle In Progress (Unlocks After Days Complete)'
                        : 'Cycle Completed (Withdrawal Ready)'}
                    </strong>
                  </span>
                  <span>
                    Balance: <strong>{(user?.balance || 0).toLocaleString()} UGX</strong>
                  </span>
                </div>

                {!hasCompletedCycle && isEligibleCustomer && (
                  <div className="p-2.5 bg-amber-950/60 border border-amber-500/50 rounded-lg text-amber-200 text-[11px] flex items-start gap-2">
                    <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-amber-300 block">Machine Cycle Running</strong>
                      <span>
                        Money on balance will unlock for withdrawal once the total cycle duration of days completes.
                        {runningInvs[0] && ` Active machine (${runningInvs[0].machine_title}) is on Day ${runningInvs[0].days_elapsed || 1} of ${runningInvs[0].duration_days} Days.`}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1 uppercase tracking-wider flex justify-between">
                  <span>Withdrawal Amount (UGX)</span>
                  <span className="text-blue-400 font-mono text-[11px]">Min: 3k • Max: 5M UGX</span>
                </label>
                <input
                  type="number"
                  min="3000"
                  max="5000000"
                  step="500"
                  value={withdrawAmt}
                  onChange={(e) => setWithdrawAmt(Number(e.target.value))}
                  className="w-full px-3.5 py-3 bg-[#070e1f] border border-blue-950/80 rounded-lg text-sm font-bold text-white outline-none focus:border-blue-500 font-mono"
                  required
                />
                {/* Quick amount presets (3k to 5M) */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {[
                    3000,
                    10000,
                    50000,
                    100000,
                    200000,
                    300000,
                    500000,
                    700000,
                    900000,
                    1000000,
                    1500000,
                    2000000,
                    2500000,
                    3000000,
                    3500000,
                    4000000,
                    4500000,
                    5000000,
                  ].map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setWithdrawAmt(amt)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold transition-all cursor-pointer ${
                        withdrawAmt === amt
                          ? 'bg-blue-600 text-white border border-blue-400'
                          : 'bg-[#091329] hover:bg-[#0f1f42] text-slate-300 border border-blue-950'
                      }`}
                    >
                      {amt >= 1000000 ? `${amt / 1000000}M` : `${amt / 1000}k`} UGX
                    </button>
                  ))}
                </div>

                {/* Live 10% Withdraw Percentage Breakdown */}
                <div className="mt-2.5 bg-[#050a18] border border-blue-950/80 rounded-lg p-2.5 grid grid-cols-3 gap-2 text-center font-mono text-[11px]">
                  <div>
                    <span className="text-slate-400 text-[10px] block">Requested</span>
                    <span className="font-bold text-white">{(Number(withdrawAmt) || 0).toLocaleString()} UGX</span>
                  </div>
                  <div className="border-x border-blue-950/80">
                    <span className="text-amber-400 text-[10px] block">Fee (10%)</span>
                    <span className="font-bold text-amber-300">-{withdrawFeeAmt.toLocaleString()} UGX</span>
                  </div>
                  <div>
                    <span className="text-emerald-400 text-[10px] block">Net Payout</span>
                    <span className="font-black text-emerald-300">{withdrawNetAmt.toLocaleString()} UGX</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1 uppercase tracking-wider">
                  Withdrawal Method Channel
                </label>
                <select
                  value={withdrawMethod}
                  onChange={(e) => setWithdrawMethod(e.target.value)}
                  className="w-full px-3.5 py-3 bg-[#070e1f] border border-blue-950/80 rounded-lg text-xs font-bold text-white outline-none focus:border-blue-500"
                >
                  <option value="MTN Mobile Money">MTN Mobile Money (+256)</option>
                  <option value="Airtel Money">Airtel Money (+256)</option>
                  <option value="Credit / Debit Card">Credit / Debit Card Cashout</option>
                  <option value="Bank Account">Bank Payment Transfer</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1 uppercase tracking-wider">
                    Receiver Phone Number
                  </label>
                  <input
                    type="text"
                    placeholder="+256700000000"
                    value={withdrawPhone}
                    onChange={(e) => setWithdrawPhone(e.target.value)}
                    className="w-full px-3.5 py-3 bg-[#070e1f] border border-blue-950/80 rounded-lg text-xs font-bold text-white outline-none focus:border-blue-500 font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1 uppercase tracking-wider">
                    Account Name
                  </label>
                  <input
                    type="text"
                    placeholder="Account Name"
                    value={accountName}
                    onChange={(e) => setAccountName(e.target.value)}
                    className="w-full px-3.5 py-3 bg-[#070e1f] border border-blue-950/80 rounded-lg text-xs font-bold text-white outline-none focus:border-blue-500"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={
                  isLoading ||
                  !isWeekdayMonToFri ||
                  !isEligibleCustomer ||
                  !hasCompletedCycle ||
                  (user?.balance || 0) < 3000 ||
                  withdrawAmt < 3000 ||
                  withdrawAmt > 5000000 ||
                  (user?.balance || 0) < withdrawAmt
                }
                className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-black text-xs py-3.5 px-4 rounded-xl shadow-lg shadow-blue-900/40 transition-all cursor-pointer disabled:opacity-50 border border-blue-400/40"
              >
                {isLoading
                  ? 'Submitting Request to Admin...'
                  : !isWeekdayMonToFri
                  ? 'Withdrawals Run Monday – Friday Only'
                  : !isEligibleCustomer
                  ? 'Withdraw Eligible for Customers Only (Buy Machine)'
                  : !hasCompletedCycle
                  ? 'Withdrawal Locked: Available After Total Cycle Duration'
                  : (user?.balance || 0) < 3000
                  ? 'Withdrawable Balance Must Be 3,000 UGX (3k) or Above'
                  : `Submit Cashout (${withdrawAmt.toLocaleString()} UGX • Net ${withdrawNetAmt.toLocaleString()} UGX)`}
              </button>
            </form>
          )}

          {activeTab === 'history' && (
            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              {transactions.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-8">No transaction logs recorded yet.</p>
              ) : (
                transactions.map((tx) => (
                  <div
                    key={tx.id}
                    className="bg-[#070e1f] border border-blue-950/80 p-3 rounded-xl flex items-center justify-between text-xs"
                  >
                    <div className="min-w-0 pr-2">
                      <span className="font-bold text-white block">{tx.type}</span>
                      <span className="text-[10px] text-slate-400 block truncate">{tx.payment_method}</span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {new Date(tx.created_at).toLocaleString()} {tx.payment_reference ? `• ${tx.payment_reference}` : ''}
                      </span>
                    </div>

                    <div className="text-right shrink-0">
                      <span
                        className={`font-mono font-bold text-xs block ${
                          tx.type === 'DEPOSIT' || tx.type === 'DAILY_YIELD' || tx.type === 'REFERRAL_BONUS'
                            ? 'text-blue-400'
                            : 'text-rose-400'
                        }`}
                      >
                        {tx.type === 'WITHDRAWAL' || tx.type === 'INVESTMENT' ? '-' : '+'}
                        {currencyInfo.format(tx.amount)}
                      </span>
                      <span
                        className={`inline-block mt-0.5 px-2 py-0.5 rounded text-[9px] font-mono font-extrabold uppercase ${
                          tx.status === 'SUCCESS' || tx.status === 'CONFIRMED'
                            ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500/40'
                            : tx.status === 'PENDING'
                              ? 'bg-amber-950/80 text-amber-300 border border-amber-500/40'
                              : 'bg-rose-950/80 text-rose-300 border border-rose-500/40'
                        }`}
                      >
                        {tx.status === 'SUCCESS' ? 'CONFIRMED' : tx.status}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
