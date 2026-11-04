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
} from 'lucide-react';

interface WalletModalProps {
  user: User | null;
  currency: Currency;
  initialMode?: 'deposit' | 'withdraw';
  hasBoughtMachine?: boolean;
  userInvestments?: Investment[];
  onClose: () => void;
  onRefreshUser: () => void;
}

export const WalletModal: React.FC<WalletModalProps> = ({
  user,
  currency,
  initialMode = 'deposit',
  hasBoughtMachine = false,
  userInvestments = [],
  onClose,
  onRefreshUser,
}) => {
  const currencyInfo = CURRENCY_MAP[currency];
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw' | 'history'>(initialMode);

  useEffect(() => {
    setActiveTab(initialMode);
  }, [initialMode]);

  // Deposit Form State
  const [depositAmt, setDepositAmt] = useState<number>(15000);
  const [depositMethod, setDepositMethod] = useState<string>('MTN Mobile Money');
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
  const [copiedField, setCopiedField] = useState<'phone' | 'name' | null>(null);

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

  // Fast countdown timer for receiver rotation UI
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeRemainingSeconds((prev) => (prev > 0 ? prev - 1 : 0));
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

  const copyToClipboard = (text: string, field: 'phone' | 'name') => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2500);
  };

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

      setMessage({ type: 'success', text: data.message || `Deposit request of ${depositAmt.toLocaleString()} UGX submitted!` });
      setDepositRefInput('');
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

  const timeFormatted = formatSeconds(timeRemainingSeconds);
  const displayReceiverPhone = activeReceiver?.phone_number || '0741032838';
  const displayReceiverName = activeReceiver?.account_name || 'SULAINH NAKASEETA';
  const displayCarrier = activeReceiver?.carrier || 'MTN';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in text-white">
      <div className="shining-card-glow rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl border-blue-900/60 relative my-auto max-h-[92vh] flex flex-col">
        {/* Top Blue-Cyan Accent Bar */}
        <div className="h-1.5 bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-400" />

        {/* Header */}
        <div className="bg-[#070e1f] p-5 flex items-center justify-between border-b border-blue-950/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-900 text-white flex items-center justify-center font-bold shrink-0 shadow-md shadow-blue-900/40 border border-blue-400/40">
              <Wallet className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">
                Avor Invest Vault
              </h3>
              <p className="text-xs text-blue-400 font-mono font-bold">
                Balance: {currencyInfo.format(liveUserBalance)} • Confirmed Deposits: {currencyInfo.format(confirmedDepositsTotal)}
              </p>
              {pendingDepositsTotal > 0 && (
                <p className="text-[10px] text-amber-400 font-mono font-bold mt-0.5">
                  ⏳ Pending Admin Confirmation: {currencyInfo.format(pendingDepositsTotal)}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-blue-950/80 bg-[#050a18] p-1.5">
          <button
            onClick={() => { setActiveTab('deposit'); setMessage(null); }}
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
            <span>Withdraw Request</span>
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
        <div className="p-6 space-y-4 bg-[#040814]/98 overflow-y-auto">
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
            <form onSubmit={handleDeposit} className="space-y-4">
              {/* Deposit Plane Reflection Status Strip */}
              <div className="grid grid-cols-2 gap-2.5 bg-[#070e1f] border border-blue-950/80 p-3 rounded-xl text-xs">
                <div className="bg-[#050a18] border border-emerald-500/30 rounded-lg p-2.5">
                  <span className="text-[10px] font-bold text-emerald-400 uppercase block">
                    Confirmed Deposits
                  </span>
                  <span className="font-mono font-black text-sm text-white block mt-0.5">
                    {currencyInfo.format(confirmedDepositsTotal)}
                  </span>
                  <span className="text-[9px] text-emerald-300/80 block mt-0.5">
                    Reflected on All Planes
                  </span>
                </div>
                <div className="bg-[#050a18] border border-amber-500/30 rounded-lg p-2.5">
                  <span className="text-[10px] font-bold text-amber-400 uppercase block">
                    Pending Confirmation
                  </span>
                  <span className="font-mono font-black text-sm text-amber-300 block mt-0.5">
                    {currencyInfo.format(pendingDepositsTotal)}
                  </span>
                  <span className="text-[9px] text-amber-300/80 block mt-0.5">
                    Reflects After Admin Confirms
                  </span>
                </div>
              </div>

              {/* Dynamic Rotating Receiver Info Box */}
              <div className="bg-[#070e1f] border border-blue-950/80 p-4 rounded-xl space-y-3 text-xs shadow-inner">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="bg-blue-950/80 border border-blue-500/40 text-blue-300 font-black px-2 py-0.5 rounded text-[10px] uppercase flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-blue-400" />
                      <span>Active Verified Receiver</span>
                    </span>
                    <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded ${
                      displayCarrier === 'MTN'
                        ? 'bg-yellow-400 text-slate-950'
                        : displayCarrier === 'AIRTEL'
                        ? 'bg-rose-500 text-white'
                        : 'bg-emerald-500 text-white'
                    }`}>
                      {displayCarrier} MoMo
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => fetchActiveReceiver(true)}
                    disabled={isLoadingReceiver}
                    title="Request Next Alternate Receiver in Rotation Pool"
                    className="text-[11px] font-bold text-blue-300 hover:text-white flex items-center gap-1 bg-[#091329] hover:bg-[#0f1f42] px-2 py-1 rounded-lg transition-all cursor-pointer border border-blue-900/60"
                  >
                    <RotateCcw className={`w-3 h-3 ${isLoadingReceiver ? 'animate-spin' : ''}`} />
                    <span>Alternate Line</span>
                  </button>
                </div>

                {displayReceiverPhone ? (
                  <>
                    <div className="space-y-2 bg-[#050a18] p-3 rounded-lg border border-blue-950/80 shadow-inner">
                      {/* Phone Number Field with Copy */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-slate-400 font-bold">Deposit Phone Number:</span>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-base font-black text-blue-400 tracking-wider">
                            {displayReceiverPhone}
                          </span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(displayReceiverPhone, 'phone')}
                            className="px-2 py-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-black text-[11px] rounded flex items-center gap-1 cursor-pointer transition-all shadow-xs border border-blue-400/40"
                          >
                            {copiedField === 'phone' ? (
                              <>
                                <Check className="w-3 h-3 text-white" />
                                <span>Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Receiver Name Field with Copy */}
                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-blue-950/80">
                        <span className="text-slate-400 font-bold">Registered Account Name:</span>
                        <div className="flex items-center gap-1.5">
                          <span className="font-extrabold text-white text-xs uppercase bg-[#091329] px-2 py-0.5 rounded border border-blue-900/60">
                            {displayReceiverName}
                          </span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(displayReceiverName, 'name')}
                            className="px-2 py-1 bg-[#091329] hover:bg-[#0f1f42] text-slate-200 font-bold text-[11px] rounded flex items-center gap-1 cursor-pointer transition-all border border-blue-900/60"
                          >
                            {copiedField === 'name' ? (
                              <>
                                <Check className="w-3 h-3 text-blue-400" />
                                <span>Copied</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3 text-slate-400" />
                                <span>Copy</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-start gap-1.5 text-[11px] text-slate-300 leading-tight">
                      <Clock className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                      <p>
                        📌 <strong>Anti-Tracking Active Channel:</strong> Send money to <strong>{displayReceiverPhone} ({displayReceiverName})</strong> via Mobile Money. Deposit numbers cycle automatically ({rotationMode === 'ROUND_ROBIN' ? 'per user deposit' : `swapping in ${timeFormatted}`}) to protect transactions and stay within limits.
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="p-3.5 bg-amber-950/40 border border-amber-600/40 rounded-lg text-amber-200 text-xs space-y-1">
                    <p className="font-bold flex items-center gap-1.5">
                      <span>⚠️ Deposit Receiver Line Updating</span>
                    </p>
                    <p className="text-[11px] text-slate-300">
                      The deposit rotation pool numbers are currently being replaced by the Admin. You can still submit your Mobile Money reference transaction below once sent, or check back in a few minutes.
                    </p>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1 uppercase tracking-wider">
                  Deposit Amount (UGX)
                </label>
                <input
                  type="number"
                  min="5000"
                  step="1000"
                  value={depositAmt}
                  onChange={(e) => setDepositAmt(Number(e.target.value))}
                  className="w-full px-3.5 py-3 bg-[#070e1f] border border-blue-950/80 rounded-lg text-sm font-bold text-white outline-none focus:border-blue-500 font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1 uppercase tracking-wider">
                  Deposit Channel Method
                </label>
                <select
                  value={depositMethod}
                  onChange={(e) => setDepositMethod(e.target.value)}
                  className="w-full px-3.5 py-3 bg-[#070e1f] border border-blue-950/80 rounded-lg text-xs font-bold text-white outline-none focus:border-blue-500"
                >
                  <option value="MTN Mobile Money">MTN Mobile Money (To {displayReceiverPhone} {displayReceiverName})</option>
                  <option value="Airtel Money">Airtel Money (To {displayReceiverPhone} {displayReceiverName})</option>
                  <option value="Credit / Debit Card">Credit / Debit Card (Visa/Mastercard)</option>
                  <option value="Bank Payment">Bank Payment / Wire Transfer</option>
                  <option value="USDT Crypto TRC20">USDT Crypto (TRC20 / ERC20)</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1 uppercase tracking-wider">
                    Sender Phone Number
                  </label>
                  <input
                    type="text"
                    placeholder="+256700000000"
                    value={depositPhone}
                    onChange={(e) => setDepositPhone(e.target.value)}
                    className="w-full px-3.5 py-3 bg-[#070e1f] border border-blue-950/80 rounded-lg text-xs font-bold text-white outline-none focus:border-blue-500 font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1 uppercase tracking-wider">
                    Transaction Ref / ID (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 2381948291"
                    value={depositRefInput}
                    onChange={(e) => setDepositRefInput(e.target.value)}
                    className="w-full px-3.5 py-3 bg-[#070e1f] border border-blue-950/80 rounded-lg text-xs font-bold text-white outline-none focus:border-blue-500 font-mono"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-black text-xs py-3.5 px-4 rounded-xl shadow-lg shadow-blue-900/40 transition-all cursor-pointer disabled:opacity-50 border border-blue-400/40"
              >
                {isLoading ? 'Submitting Deposit Request...' : `Submit Deposit (${depositAmt.toLocaleString()} UGX) for Admin Confirmation`}
              </button>
            </form>
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
