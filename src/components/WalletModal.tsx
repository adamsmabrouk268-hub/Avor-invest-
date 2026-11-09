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
import { sendMessageToAdmin } from '../firebase';

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

  // Deposit Form State — starts empty so users can freely type/edit any custom amount (e.g. 35000, 140000) or tap a preset
  const [depositAmt, setDepositAmt] = useState<number>(0);
  const [depositAmtInput, setDepositAmtInput] = useState<string>('');
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
  const [withdrawAmtInput, setWithdrawAmtInput] = useState<string>('3000');
  const [withdrawMethod, setWithdrawMethod] = useState<string>('MTN Mobile Money');
  const [withdrawPhone, setWithdrawPhone] = useState<string>(user?.phone_number || '');
  const [accountName, setAccountName] = useState<string>(user?.full_name || '');
  const [summaryHasMachine, setSummaryHasMachine] = useState<boolean>(hasBoughtMachine);
  const [summaryCompletedCycle, setSummaryCompletedCycle] = useState<boolean>(false);
  const [confirmedDepositsTotal, setConfirmedDepositsTotal] = useState<number>(0);
  const [pendingDepositsTotal, setPendingDepositsTotal] = useState<number>(0);
  const [liveUserBalance, setLiveUserBalance] = useState<number>(user?.balance ?? 0);

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
        .then((d) => {
          if (d) {
            if (typeof d.balance === 'number') {
              setLiveUserBalance(d.balance);
            }
            if (d.deposit_details) {
              setConfirmedDepositsTotal(Number(d.available_wallet ?? d.wallet_balance ?? d.deposit_details.total_deposited ?? 0));
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
    const interval = setInterval(syncVault, 3000);
    return () => clearInterval(interval);
  }, [user?.id, user?.phone_number]);

  // Fast countdown timer for receiver rotation UI & Step 4 Payment Information timer
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeRemainingSeconds((prev) => (prev > 0 ? prev - 1 : 0));
      setPaymentCountdown((prev) => (prev > 0 ? prev - 1 : 1795));
    }, 1000);

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
            onRefreshUser();
            fetchTransactions();
          }
        } catch {}
      };
    } catch {}

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('avor_realtime_wallet_sync');
      bc.onmessage = () => {
        onRefreshUser();
        fetchTransactions();
      };
    } catch {}

    return () => {
      clearInterval(timer);
      try {
        es?.close();
      } catch {}
      try {
        bc?.close();
      } catch {}
    };
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
      const res = await fetch(`/api/transactions/${encodeURIComponent(user.id)}${phoneParam}`);
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

  // Step 3 -> Step 4 handler: Validates any custom amount (>= 25,000 UGX) & sender phone, then reveals Company Payment Information
  const handleProceedToPaymentInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    const cleanDigits = String(depositAmtInput || depositAmt || '').replace(/[^0-9]/g, '');
    const numAmt = Number(cleanDigits);
    if (!cleanDigits || isNaN(numAmt) || numAmt < 25000) {
      setMessage({ type: 'error', text: 'MINIMUM DEPOSIT: UGX 25,000. Please enter an amount of 25,000 UGX or more (e.g. 25,000, 35,000, or 140,000).' });
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
    setDepositAmtInput(String(numAmt));
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

      try {
        const savedRefs: string[] = JSON.parse(localStorage.getItem('avor_my_deposit_refs') || '[]');
        const nextRefs = Array.from(
          new Set(
            [
              ...savedRefs,
              data.transaction?.id,
              data.transaction?.payment_reference,
              depositRefInput,
              depositPhone?.trim(),
            ].filter(Boolean)
          )
        );
        localStorage.setItem('avor_my_deposit_refs', JSON.stringify(nextRefs));
      } catch {}

      setMessage({
        type: 'success',
        text:
          data.message ||
          `Deposit of ${depositAmt.toLocaleString()} UGX has automatically reflected on your Wallet! Once Admin confirms your payment, you can buy your machine and start the machine cycle.`,
      });
      await sendMessageToAdmin(
        user.full_name || depositPhone || user.phone_number || 'Avor Investor',
        `Deposited UGX ${depositAmt.toLocaleString()} via ${depositMethod} from ${depositPhone} to ${targetPhone} (${targetName}) (Pending Admin Confirmation)`,
        {
          userId: user.id,
          transactionId: data.transaction?.id,
          senderPhone: depositPhone || user.phone_number,
          receiverPhone: targetPhone,
          receiverName: targetName,
          amount: depositAmt,
          machineTitle: 'Wallet Deposit Order (Pending Admin Confirmation)',
          paymentMethod: depositMethod,
          paymentReference: depositRefInput || data.transaction?.payment_reference || `DEP-${Date.now()}`,
          status: 'PENDING',
        }
      );
      setDepositRefInput('');
      setDepositStep('SUBMITTED');
      try {
        const bc = new BroadcastChannel('avor_realtime_wallet_sync');
        bc.postMessage({ type: 'ORDER_OR_DEPOSIT_PLACED', amount: depositAmt });
        bc.close();
      } catch {}
      onRefreshUser();
      fetchTransactions();
      fetchActiveReceiver();
    } catch (err: any) {
      if (err instanceof TypeError && err.message.includes('fetch')) {
        const fallbackRef = depositRefInput || `DEP-${Date.now()}`;
        const fallbackTx: Transaction = {
          id: `tx-dep-${Date.now()}`,
          user_id: user.id,
          amount: depositAmt,
          type: 'DEPOSIT',
          status: 'PENDING',
          payment_method: `${depositMethod} (Receiver: ${targetPhone} ${targetName})`,
          payment_reference: fallbackRef,
          created_at: new Date().toISOString(),
        };
        await sendMessageToAdmin(
          user.full_name || depositPhone || user.phone_number || 'Avor Investor',
          `Deposited UGX ${depositAmt.toLocaleString()} via ${depositMethod} from ${depositPhone} to ${targetPhone} (${targetName})`,
          {
            senderPhone: depositPhone || user.phone_number,
            receiverPhone: targetPhone,
            receiverName: targetName,
            amount: depositAmt,
            machineTitle: 'Wallet Deposit Order (Pending Admin Confirmation)',
            paymentMethod: depositMethod,
            paymentReference: fallbackRef,
            status: 'PENDING',
          }
        );
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

    // Rule 3: Minimum withdraw is 3k and Maximum withdraw is 5M (3,000 registration bonus and commission can be withdrawn directly without end-of-cycle wait)
    if (withdrawAmt < 3000) {
      setMessage({ type: 'error', text: 'Withdraw Rule 3: Minimum withdraw is 3,000 UGX (3k).' });
      return;
    }

    if (withdrawAmt > 5000000) {
      setMessage({ type: 'error', text: 'Withdraw Rule 3: Maximum withdraw is 5,000,000 UGX (5M).' });
      return;
    }

    const effectiveWithdrawableBalance = Math.max(liveUserBalance, user.balance || 0);

    if (effectiveWithdrawableBalance < 3000) {
      setMessage({
        type: 'error',
        text: `You must have at least 3,000 UGX to withdraw. Current balance: ${effectiveWithdrawableBalance.toLocaleString()} UGX.`,
      });
      return;
    }

    if (effectiveWithdrawableBalance < withdrawAmt) {
      setMessage({
        type: 'error',
        text: `Insufficient balance. Available withdrawable balance: ${effectiveWithdrawableBalance.toLocaleString()} UGX.`,
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

                  {/* Enter the Amount You Wish to Deposit (UGX) — Freely Editable for Any Custom Amount */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className="block text-xs font-extrabold text-slate-200 uppercase tracking-wider">
                        ENTER THE AMOUNT YOU WISH TO DEPOSIT (UGX)
                      </label>
                      {Number(depositAmtInput) > 0 && (
                        <span className="text-[11px] font-mono font-black text-sky-400">
                          UGX {Number(depositAmtInput).toLocaleString()}
                        </span>
                      )}
                    </div>
                    <div className="relative">
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="Enter amount (min 25,000 UGX, e.g. 25000, 35000)"
                        value={depositAmtInput}
                        onChange={(e) => {
                          const rawDigits = e.target.value.replace(/[^0-9]/g, '');
                          setDepositAmtInput(rawDigits);
                          setDepositAmt(rawDigits ? Number(rawDigits) : 0);
                        }}
                        className="w-full pl-4 pr-20 py-3.5 bg-[#070e1f] border border-blue-700/80 focus:border-sky-400 focus:ring-1 focus:ring-sky-400/40 rounded-2xl text-sm sm:text-base font-bold text-white outline-none font-mono placeholder:text-slate-400"
                        required
                      />
                      {depositAmtInput && (
                        <button
                          type="button"
                          onClick={() => {
                            setDepositAmtInput('');
                            setDepositAmt(0);
                          }}
                          className="absolute right-3 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-lg bg-[#0b1d42] hover:bg-blue-700 text-sky-300 hover:text-white text-[10px] font-black uppercase tracking-wider border border-blue-500/40 transition-all cursor-pointer"
                        >
                          CLEAR
                        </button>
                      )}
                    </div>

                    {/* Quick Amount Buttons (Users can also type/edit any custom amount above like 25,000, 35,000, or 140,000) */}
                    <div className="grid grid-cols-5 gap-2 pt-1">
                      {[25000, 50000, 100000, 250000, 500000].map((preset) => {
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

                    <div className="flex flex-wrap items-center justify-between gap-1 pt-0.5">
                      <p className="text-[11px] font-extrabold text-sky-300 uppercase tracking-wider">
                        MINIMUM DEPOSIT: UGX 25,000
                      </p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                        TYPE OR EDIT ANY AMOUNT ABOVE (E.G. 25,000 • 35,000 • 140,000)
                      </p>
                    </div>
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
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setDepositStep('ENTER_DETAILS')}
                        className="px-3 py-2 rounded-xl bg-[#0b1936] hover:bg-[#10244d] border border-blue-500/40 text-sky-300 font-bold text-xs uppercase cursor-pointer transition-all"
                      >
                        EDIT
                      </button>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(String(depositAmt), 'amount')}
                        className="px-3.5 py-2 rounded-xl bg-[#0b1936] hover:bg-[#10244d] border border-blue-500/40 text-white font-bold text-xs uppercase flex items-center gap-1.5 cursor-pointer transition-all"
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

                  {/* PLACE ORDER Button */}
                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 hover:brightness-110 active:scale-98 text-white font-black text-sm uppercase tracking-wider shadow-lg shadow-blue-900/50 border border-blue-400/40 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isLoading ? 'PLACING ORDER...' : 'PLACE ORDER'}
                  </button>
                </form>
              )}

              {/* =================================================================
                  POST-CONFIRMATION: DEPOSIT AUTOMATICALLY CREDITED & MACHINE RUNNING
                 ================================================================= */}
              {depositStep === 'SUBMITTED' && (
                <div className="p-4 rounded-2xl bg-[#070e1f] border border-blue-500/40 space-y-4 text-center animate-fade-in">
                  <div
                    className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto border ${
                      pendingDepositsTotal === 0 && confirmedDepositsTotal > 0
                        ? 'bg-emerald-950/80 border-emerald-400/50 text-emerald-400'
                        : 'bg-blue-950/80 border-sky-400/50 text-sky-400'
                    }`}
                  >
                    {pendingDepositsTotal === 0 && confirmedDepositsTotal > 0 ? (
                      <CheckCircle2 className="w-8 h-8" />
                    ) : (
                      <Clock className="w-8 h-8" />
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <h4 className="text-base font-black text-white uppercase">
                      {pendingDepositsTotal === 0 && confirmedDepositsTotal > 0
                        ? `✅ Deposit Confirmed — Wallet Balance: ${confirmedDepositsTotal.toLocaleString()} UGX`
                        : 'Deposit Submitted — Pending Admin Confirmation'}
                    </h4>
                    <p className="text-xs text-slate-300 leading-relaxed">
                      {pendingDepositsTotal === 0 && confirmedDepositsTotal > 0 ? (
                        <>
                          Admin has confirmed your deposit! <strong className="text-emerald-400">{confirmedDepositsTotal.toLocaleString()} UGX</strong> is now available on your Wallet to buy machines.
                        </>
                      ) : (
                        <>
                          Your deposit of <strong className="text-sky-400">{depositAmt.toLocaleString()} UGX</strong> from{' '}
                          <strong className="text-white">{depositPhone}</strong> to{' '}
                          <strong className="text-white">{displayReceiverPhone} ({displayReceiverName})</strong> has been sent to Admin for confirmation.
                        </>
                      )}
                    </p>
                    <p className="text-[11px] text-sky-300 font-semibold">
                      {pendingDepositsTotal === 0 && confirmedDepositsTotal > 0
                        ? 'Click below to access your Wallet balance and buy a machine now!'
                        : 'Once Admin confirms your deposit, it will reflect on your Wallet so you can buy a machine!'}
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
                      <span>
                        {pendingDepositsTotal === 0 && confirmedDepositsTotal > 0
                          ? `ACCESS WALLET (${confirmedDepositsTotal.toLocaleString()} UGX) & BUY MACHINE`
                          : 'VIEW RUNNING MACHINES & OPEN PLANES'}
                      </span>
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
                    <strong className="text-cyan-300">3,000 UGX</strong> registration bonus and <strong className="text-emerald-300">commission</strong> are eligible for withdrawal.
                  </li>
                </ol>
                <p className="text-[11px] text-amber-300 font-bold pt-1">
                  * Withdraws take 24-96 hours to process.
                </p>

                <div
                  className={`mt-1 pt-2 border-t border-blue-950/80 flex items-center justify-between text-[11px] font-mono ${
                    Math.max(liveUserBalance, user?.balance || 0) >= 3000
                      ? 'text-emerald-300'
                      : 'text-amber-300'
                  }`}
                >
                  <span>
                    Status:{' '}
                    <strong>
                      {Math.max(liveUserBalance, user?.balance || 0) >= 3000
                        ? 'Withdrawal Ready (Bonus & Commission Eligible)'
                        : 'Minimum 3,000 UGX Required'}
                    </strong>
                  </span>
                  <span>
                    Balance: <strong>{Math.max(liveUserBalance, user?.balance || 0).toLocaleString()} UGX</strong>
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1 uppercase tracking-wider flex justify-between">
                  <span>Withdrawal Amount (UGX)</span>
                  <span className="text-blue-400 font-mono text-[11px]">Min: 3k • Max: 5M UGX</span>
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="Enter withdrawal amount (e.g. 35000, 140000)"
                  value={withdrawAmtInput}
                  onChange={(e) => {
                    const rawDigits = e.target.value.replace(/[^0-9]/g, '');
                    setWithdrawAmtInput(rawDigits);
                    setWithdrawAmt(rawDigits ? Number(rawDigits) : 0);
                  }}
                  className="w-full px-3.5 py-3 bg-[#070e1f] border border-blue-950/80 rounded-lg text-sm font-bold text-white outline-none focus:border-blue-500 font-mono placeholder:text-slate-400"
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
                      onClick={() => {
                        setWithdrawAmt(amt);
                        setWithdrawAmtInput(String(amt));
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-mono font-bold transition-all cursor-pointer ${
                        Number(withdrawAmtInput) === amt
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
                  Math.max(liveUserBalance, user?.balance || 0) < 3000 ||
                  withdrawAmt < 3000 ||
                  withdrawAmt > 5000000 ||
                  Math.max(liveUserBalance, user?.balance || 0) < withdrawAmt
                }
                className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-black text-xs py-3.5 px-4 rounded-xl shadow-lg shadow-blue-900/40 transition-all cursor-pointer disabled:opacity-50 border border-blue-400/40"
              >
                {isLoading
                  ? 'Submitting Request to Admin...'
                  : !isWeekdayMonToFri
                  ? 'Withdrawals Run Monday – Friday Only'
                  : Math.max(liveUserBalance, user?.balance || 0) < 3000
                  ? 'Withdrawable Balance Must Be 3,000 UGX (3k) or Above'
                  : `Submit Cashout (${withdrawAmt.toLocaleString()} UGX • Net ${withdrawNetAmt.toLocaleString()} UGX)`}
              </button>
            </form>
          )}

          {activeTab === 'history' && (
            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              {transactions.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-8 font-bold">No payments yet.</p>
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
                        {tx.status === 'SUCCESS' || tx.status === 'CONFIRMED' ? 'SUCCESSFUL' : tx.status}
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
