import React, { useState, useEffect } from 'react';
import { Machine, Currency, User, DepositReceiverNumber, Investment } from '../types';
import { CURRENCY_MAP } from '../data/defaultMachines';
import {
  X,
  Wallet,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Clock,
  Zap,
  Smartphone,
  CreditCard,
  Copy,
  Check,
  RefreshCw,
  RotateCcw,
  Cpu,
} from 'lucide-react';
import { WhatsAppIcon } from './WhatsAppIcon';

interface InvestModalProps {
  machine: Machine | null;
  currency: Currency;
  user: User | null;
  userInvestments?: Investment[];
  onClose: () => void;
  onSuccess: () => void;
  onDepositSubmitted?: () => void;
  onOpenAuth: () => void;
  onOpenDeposit?: () => void;
  onNotify?: (message: string, type?: 'success' | 'info' | 'error') => void;
}

export const InvestModal: React.FC<InvestModalProps> = ({
  machine,
  currency,
  user,
  userInvestments,
  onClose,
  onSuccess,
  onDepositSubmitted,
  onOpenAuth,
  onNotify,
}) => {
  if (!machine) return null;

  const currencyInfo = CURRENCY_MAP[currency];
  const [units, setUnits] = useState<number>(1);

  const isAvClass =
    machine.is_av_class ||
    machine.category?.startsWith('AV_CLASS') ||
    ['A class', 'B class', 'C class', 'D class', 'E class', 'F class', 'G class', 'H class', 'I class'].includes(
      machine.series_tag || ''
    );
  const isAV1 =
    machine.category === 'AV1' ||
    machine.series_tag === 'AV1' ||
    machine.series === 'AV1' ||
    !!machine.only_one_unit ||
    machine.max_units_per_user === 1;

  const isAV2 =
    machine.category === 'AV2' ||
    machine.series_tag === 'AV2' ||
    machine.series === 'AV2' ||
    machine.max_units_per_user === 2;

  const getInvUnits = (inv: Investment): number => {
    if (typeof inv.units === 'number' && inv.units > 0) return inv.units;
    const match = inv.machine_title?.match(/\((\d+)\s+Units?\)/i);
    if (match) return Math.max(1, parseInt(match[1], 10));
    return 1;
  };

  // Count active/pending units specifically for THIS machine
  const activeMachineUnits =
    userInvestments
      ?.filter(
        (inv) =>
          (inv.machine_id === machine.id ||
            (inv.machine_title && machine.title && inv.machine_title.toLowerCase().includes(machine.title.toLowerCase()))) &&
          (inv.status === 'ACTIVE' || inv.status === 'PENDING')
      )
      .reduce((sum, inv) => sum + getInvUnits(inv), 0) || 0;

  // In AV1 series, each machine has a limit of purchase of 1
  const hasActiveAV1 = isAV1 && activeMachineUnits >= 1;

  // In AV2 series, each machine has a limit of purchase of 2
  const hasMaxAV2 = isAV2 && activeMachineUnits >= 2;
  const remainingAV2Allowed = isAV2 ? Math.max(0, 2 - activeMachineUnits) : isAV1 ? Math.max(0, 1 - activeMachineUnits) : 10;

  useEffect(() => {
    if (isAV1) {
      setUnits(1);
    } else if (isAV2) {
      setUnits((u) => Math.min(Math.max(1, u), Math.max(1, remainingAV2Allowed)));
    }
  }, [isAV1, isAV2, remainingAV2Allowed, machine.id]);

  const totalCost = (machine.total_cost || machine.price || 15000) * units;
  const [liveBalance, setLiveBalance] = useState<number>(user?.balance ?? 0);
  const [pendingDepositAmount, setPendingDepositAmount] = useState<number>(0);

  // Payment channel selection: 'Wallet Balance' | 'MTN Mobile Money' | 'Airtel Money' | 'Card Billing'
  // Default to MTN Mobile Money so investor immediately gets the number to deposit on like in the second screenshot
  const [selectedChannel, setSelectedChannel] = useState<'Wallet Balance' | 'MTN Mobile Money' | 'Airtel Money' | 'Card Billing'>('MTN Mobile Money');
  const [phoneNumber, setPhoneNumber] = useState<string>(user?.phone_number || '+256741032838');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isCheckingBalance, setIsCheckingBalance] = useState<boolean>(false);
  const [isLoadingReceiver, setIsLoadingReceiver] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [depositSuccessMessage, setDepositSuccessMessage] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<{ message: string; status?: string } | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const RECEIVER_PHONE = '0741032838';
  const RECEIVER_NAME = 'SULAINH NAKASEETA';

  const [activeReceiver, setActiveReceiver] = useState<DepositReceiverNumber>({
    id: 'rec-default',
    phone_number: RECEIVER_PHONE,
    account_name: RECEIVER_NAME,
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
  });

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const rotateReceiver = async () => {
    setIsLoadingReceiver(true);
    try {
      const res = await fetch('/api/wallet/active-receiver?rotate=true');
      if (res.ok && (res.headers.get('content-type') || '').includes('application/json')) {
        const data = await res.json();
        const rec = data?.receiver || data;
        if (rec && rec.phone_number) {
          setActiveReceiver(rec);
        }
      }
    } catch {}
    finally {
      setIsLoadingReceiver(false);
    }
  };

  const refreshWalletStatus = async (showSpinner = false) => {
    if (!user?.id) return;
    if (showSpinner) setIsCheckingBalance(true);
    try {
      const [userRes, summaryRes] = await Promise.all([
        fetch(`/api/user/${encodeURIComponent(user.id)}`),
        fetch(`/api/user/dashboard-summary/${encodeURIComponent(user.id)}`),
      ]);
      if (userRes.ok && (userRes.headers.get('content-type') || '').includes('application/json')) {
        const uData = await userRes.json();
        if (uData && typeof uData.balance === 'number') {
          setLiveBalance(uData.balance);
        }
      }
      if (summaryRes.ok && (summaryRes.headers.get('content-type') || '').includes('application/json')) {
        const sData = await summaryRes.json();
        if (sData) {
          if (typeof sData.balance === 'number') {
            setLiveBalance(sData.balance);
          }
          setPendingDepositAmount(Number(sData?.deposit_details?.pending_deposits || 0));
        }
      }
    } catch {
      // Ignore
    } finally {
      if (showSpinner) setIsCheckingBalance(false);
    }
  };

  useEffect(() => {
    fetch('/api/wallet/active-receiver')
      .then((res) => (res.ok && (res.headers.get('content-type') || '').includes('application/json') ? res.json() : null))
      .then((data) => {
        const rec = data?.receiver || data;
        if (rec && rec.phone_number) {
          setActiveReceiver(rec);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setLiveBalance(user?.balance ?? 0);
    refreshWalletStatus(false);
    // Auto-poll wallet balance every 4 seconds so when admin approves deposit, it detects it immediately
    const interval = setInterval(() => {
      refreshWalletStatus(false);
    }, 4000);
    return () => clearInterval(interval);
  }, [user?.id, user?.balance, totalCost]);

  const userHasEnoughBalance = liveBalance >= totalCost;
  const isMobileMoney = selectedChannel === 'MTN Mobile Money' || selectedChannel === 'Airtel Money';

  // Step 2: Handle submitting deposit to Admin via Mobile Money (Reflects across all deposit planes once Admin confirms)
  const handleDepositToWallet = async () => {
    if (!user) {
      onOpenAuth();
      return;
    }
    if (!phoneNumber.trim()) {
      setErrorMessage(`Please enter your ${selectedChannel} phone number.`);
      return;
    }
    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/wallet/deposit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          user_phone: user.phone_number,
          user_name: user.full_name,
          amount: totalCost,
          payment_method: selectedChannel,
          phone_number: phoneNumber.trim(),
          receiver_phone: activeReceiver.phone_number || RECEIVER_PHONE,
          receiver_name: activeReceiver.account_name || RECEIVER_NAME,
          machine_id: machine.id,
          machine_title: `${machine.title} (${units} Unit${units > 1 ? 's' : ''})`,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit wallet deposit.');
      }
      if (typeof data.new_balance === 'number') {
        setLiveBalance(data.new_balance);
      }
      setPendingDepositAmount((prev) => prev + totalCost);
      setSelectedChannel('Wallet Balance');
      if (onDepositSubmitted) {
        onDepositSubmitted();
      }
      const msg =
        data.message ||
        `Deposit of ${currencyInfo.format(totalCost)} submitted to Admin for confirmation! Once Admin confirms your deposit, it will automatically reflect across all deposit planes and your Wallet Balance.`;
      setDepositSuccessMessage(msg);
      if (onNotify) {
        onNotify(msg, 'info');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Unable to submit deposit.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Step 3: Handle buying machine using Wallet Balance
  const handleBuyWithWallet = async () => {
    if (!user) {
      onOpenAuth();
      return;
    }
    if (!userHasEnoughBalance) {
      setErrorMessage(
        `Wallet balance is not enough (${currencyInfo.format(liveBalance)} available • ${currencyInfo.format(totalCost)} required). Please deposit money on your wallet using MTN Mobile Money or Airtel Money first.`
      );
      setSelectedChannel('Airtel Money');
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/invest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          user_phone: user.phone_number,
          user_name: user.full_name,
          machine_id: machine.id,
          units,
          payment_method: 'Wallet Balance',
          phone_number: user.phone_number || phoneNumber,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to purchase machine.');
      }
      if (typeof data.user_balance === 'number') {
        setLiveBalance(data.user_balance);
      }
      setSuccessData({
        message:
          data.message ||
          `Machine order for ${machine.title} placed using your wallet! Confirmation message has reached Admin.`,
        status: data.status || 'PENDING',
      });
      onSuccess();
    } catch (err: any) {
      setErrorMessage(err.message || 'Error occurred while purchasing machine.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleActionClick = () => {
    if (selectedChannel === 'Wallet Balance') {
      if (!userHasEnoughBalance) {
        setSelectedChannel('MTN Mobile Money');
        setErrorMessage(
          `Wallet balance (${currencyInfo.format(liveBalance)}) is less than ${currencyInfo.format(totalCost)}. Please deposit on your wallet first using MTN Mobile Money or Airtel Money below.`
        );
        return;
      }
      handleBuyWithWallet();
    } else {
      handleDepositToWallet();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md animate-fade-in text-white select-none">
      <div className="w-full max-w-md bg-[#030914] border border-[#00d2c4]/30 rounded-3xl overflow-hidden shadow-[0_10px_40px_rgba(0,145,234,0.3)] relative my-auto max-h-[94vh] flex flex-col">
        {/* Top Glow Cyan-Blue Accent Bar */}
        <div className="h-1.5 bg-gradient-to-r from-blue-600 via-cyan-400 to-indigo-600 shrink-0" />

        {/* Modal Header Matching Exact Screenshot */}
        <div className="p-4 sm:p-5 flex items-center justify-between border-b border-blue-950/80 bg-[#040c1d] shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-800 border border-blue-400/50 flex items-center justify-center shadow-lg shadow-blue-500/30 shrink-0">
              <Cpu className="w-6 h-6 text-cyan-300" />
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-black text-white leading-tight">
                {machine.title}
              </h3>
              <p className="text-xs font-mono font-bold text-sky-400 mt-0.5">
                Series: {machine.series_tag || machine.series || 'AV1'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-slate-800/60 transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-5 space-y-4 overflow-y-auto">
          {successData ? (
            <div className="p-4 space-y-4 text-center animate-fade-in">
              <div className="w-16 h-16 rounded-full bg-emerald-950/80 border border-emerald-500 text-emerald-400 flex items-center justify-center mx-auto shadow-xl shadow-emerald-950/50">
                <CheckCircle2 className="w-9 h-9" />
              </div>

              <div className="space-y-1">
                <span
                  className={`inline-block px-3 py-1 rounded-full text-[10px] font-mono font-black uppercase border ${
                    successData.status === 'PENDING'
                      ? 'bg-amber-950/90 border-amber-500/50 text-amber-300'
                      : 'bg-emerald-950/90 border-emerald-500/50 text-emerald-300'
                  }`}
                >
                  {successData.status === 'PENDING'
                    ? `CONFIRMATION SENT TO ADMIN • ${machine.duration_days} Days Cycle`
                    : `ACTIVE • Day 1 of ${machine.duration_days} Days`}
                </span>
                <h3 className="text-xl font-black text-white">
                  {successData.status === 'PENDING' ? 'Machine Order Sent to Admin!' : 'Machine Activated!'}
                </h3>
                <p className="text-xs text-slate-300">{successData.message}</p>
              </div>

              <button
                type="button"
                onClick={onClose}
                className="w-full py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-bold text-xs rounded-xl shadow-lg cursor-pointer"
              >
                View in Income Plane
              </button>
            </div>
          ) : (
            <>
              {/* Error Message Alert */}
              {errorMessage && (
                <div className="p-3 bg-rose-950/80 border border-rose-500/60 rounded-xl text-rose-200 text-xs flex items-start gap-2.5 animate-fade-in">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{errorMessage}</span>
                </div>
              )}

              {/* Deposit Submitted to Admin / Wallet Status Notification Banner */}
              {(depositSuccessMessage || pendingDepositAmount > 0) && (
                <div
                  className={`p-3.5 rounded-xl text-xs space-y-2 animate-fade-in border ${
                    userHasEnoughBalance
                      ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-200'
                      : 'bg-amber-950/80 border-amber-500/60 text-amber-200'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <CheckCircle2
                      className={`w-4 h-4 shrink-0 mt-0.5 ${
                        userHasEnoughBalance ? 'text-emerald-400' : 'text-amber-400'
                      }`}
                    />
                    <div className="flex-1">
                      <span
                        className={`font-black block ${
                          userHasEnoughBalance ? 'text-emerald-300' : 'text-amber-300'
                        }`}
                      >
                        {userHasEnoughBalance
                          ? `Deposit Confirmed & Reflected on Wallet (${currencyInfo.format(liveBalance)})`
                          : `Deposit Submitted to Admin for Confirmation (${currencyInfo.format(pendingDepositAmount || totalCost)})`}
                      </span>
                      <p className="text-[11px] opacity-90 mt-0.5 leading-relaxed">
                        {userHasEnoughBalance
                          ? `Admin has confirmed your deposit and it is now reflected across all deposit planes! Click Buy Unit below to complete your machine purchase.`
                          : depositSuccessMessage ||
                            `Your deposit of ${currencyInfo.format(pendingDepositAmount)} has reached Admin and is awaiting confirmation. Once Admin confirms, it will automatically reflect here and on all deposit planes.`}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Per-Machine Purchase Limit Indicator & Selector */}
              {isAV1 && (
                <div className="flex items-center justify-between p-2.5 bg-[#050c1c] border border-amber-500/30 rounded-xl text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                    <span className="font-bold text-amber-200">AV1 Machine Limit</span>
                  </div>
                  <span className="font-mono font-bold text-[11px] text-amber-300 bg-amber-950/80 px-2 py-0.5 rounded border border-amber-500/40">
                    Limit: 1 Unit per machine ({activeMachineUnits}/1 bought)
                  </span>
                </div>
              )}

              {isAV2 && (
                <div className="flex items-center justify-between p-2.5 bg-[#050c1c] border border-blue-500/30 rounded-xl text-xs">
                  <div>
                    <span className="font-bold text-blue-200 block">AV2 Machine Limit</span>
                    <span className="text-[10px] text-slate-400">
                      Limit: 2 Units per machine ({activeMachineUnits}/2 active)
                    </span>
                  </div>
                  {remainingAV2Allowed > 1 ? (
                    <div className="flex items-center gap-1.5 bg-[#09152e] p-1 rounded-xl border border-blue-900/80">
                      {[1, 2].map((num) => (
                        <button
                          key={num}
                          type="button"
                          onClick={() => setUnits(num)}
                          className={`px-2.5 py-1 text-xs font-mono font-bold rounded-lg transition-all cursor-pointer ${
                            units === num
                              ? 'bg-blue-600 text-white shadow-md'
                              : 'text-slate-300 hover:text-white'
                          }`}
                        >
                          {num} Unit{num > 1 ? 's' : ''}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <span className="font-mono font-bold text-[11px] text-blue-300 bg-blue-950/80 px-2 py-0.5 rounded border border-blue-500/40">
                      {remainingAV2Allowed === 1 ? '1 Unit Remaining' : 'Limit Reached (2/2)'}
                    </span>
                  )}
                </div>
              )}

              {/* SECTION: PAYMENT CHANNEL (Exact 2x2 arrangement matching screenshot) */}
              <div className="space-y-2.5">
                <h4 className="text-xs font-bold text-slate-300 tracking-wider uppercase">
                  PAYMENT CHANNEL
                </h4>

                <div className="grid grid-cols-2 gap-3">
                  {/* Card 1: Wallet Balance */}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedChannel('Wallet Balance');
                      setErrorMessage(null);
                    }}
                    className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer relative flex flex-col justify-between min-h-[78px] ${
                      selectedChannel === 'Wallet Balance'
                        ? 'border-blue-500 ring-2 ring-blue-500/80 bg-[#08152e] shadow-[0_0_15px_rgba(0,145,234,0.3)]'
                        : 'border-blue-950/80 bg-[#050c1c] hover:bg-[#071329]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Wallet className="w-4 h-4 text-sky-400 shrink-0" />
                      <span className="text-xs font-bold text-white truncate">Wallet Balance</span>
                    </div>
                    <span className="text-[11px] text-sky-300 font-mono font-bold mt-1 block">
                      {currencyInfo.format(liveBalance)} Available
                    </span>
                  </button>

                  {/* Card 2: MTN Mobile Money */}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedChannel('MTN Mobile Money');
                      setErrorMessage(null);
                    }}
                    className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer relative flex flex-col justify-between min-h-[78px] ${
                      selectedChannel === 'MTN Mobile Money'
                        ? 'border-blue-500 ring-2 ring-blue-500/80 bg-[#08152e] shadow-[0_0_15px_rgba(0,145,234,0.3)]'
                        : 'border-blue-950/80 bg-[#050c1c] hover:bg-[#071329]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Smartphone className="w-4 h-4 text-amber-400 shrink-0" />
                      <span className="text-xs font-bold text-white truncate">MTN Mobile Money</span>
                    </div>
                    <span className="text-[11px] text-slate-400 mt-1 block">
                      Uganda / Africa (+256)
                    </span>
                  </button>

                  {/* Card 3: Airtel Money */}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedChannel('Airtel Money');
                      setErrorMessage(null);
                    }}
                    className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer relative flex flex-col justify-between min-h-[78px] ${
                      selectedChannel === 'Airtel Money'
                        ? 'border-blue-500 ring-2 ring-blue-500/80 bg-[#08152e] shadow-[0_0_15px_rgba(0,145,234,0.3)]'
                        : 'border-blue-950/80 bg-[#050c1c] hover:bg-[#071329]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Smartphone className="w-4 h-4 text-rose-500 shrink-0" />
                      <span className="text-xs font-bold text-white truncate">Airtel Money</span>
                    </div>
                    <span className="text-[11px] text-slate-400 mt-1 block">
                      Uganda / Africa (+256)
                    </span>
                  </button>

                  {/* Card 4: Card Billing */}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedChannel('Card Billing');
                      setErrorMessage(null);
                    }}
                    className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer relative flex flex-col justify-between min-h-[78px] ${
                      selectedChannel === 'Card Billing'
                        ? 'border-blue-500 ring-2 ring-blue-500/80 bg-[#08152e] shadow-[0_0_15px_rgba(0,145,234,0.3)]'
                        : 'border-blue-950/80 bg-[#050c1c] hover:bg-[#071329]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-cyan-400 shrink-0" />
                      <span className="text-xs font-bold text-white truncate">Card Billing</span>
                    </div>
                    <span className="text-[11px] text-slate-400 mt-1 block">
                      Visa / MasterCard
                    </span>
                  </button>
                </div>
              </div>

              {/* ACTIVE VERIFIED RECEIVER BOX (Matching Screenshot 2) */}
              <div className="bg-[#050c1c] border border-blue-900/80 rounded-2xl p-4 space-y-3 animate-fade-in shadow-inner">
                <div className="flex items-center justify-between border-b border-blue-950/80 pb-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="bg-blue-950/80 border border-blue-500/40 text-blue-300 font-black px-2 py-0.5 rounded text-[10px] uppercase flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-blue-400" />
                      <span>Active Verified Receiver</span>
                    </span>
                    <span
                      className={`text-[10px] font-black px-2 py-0.5 rounded uppercase ${
                        selectedChannel === 'Airtel Money'
                          ? 'bg-rose-600 text-white'
                          : 'bg-[#ffcc00] text-slate-950'
                      }`}
                    >
                      {selectedChannel === 'Airtel Money' ? 'Airtel Money' : 'MTN MoMo'}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={rotateReceiver}
                    disabled={isLoadingReceiver}
                    title="Request Next Alternate Receiver in Rotation Pool"
                    className="text-[11px] font-bold text-blue-300 hover:text-white flex items-center gap-1 bg-[#091329] hover:bg-[#0f1f42] px-2 py-1 rounded-lg transition-all cursor-pointer border border-blue-900/60"
                  >
                    <RotateCcw className={`w-3 h-3 ${isLoadingReceiver ? 'animate-spin' : ''}`} />
                    <span>Alternate Line</span>
                  </button>
                </div>

                <div className="space-y-2 bg-[#050a18] p-3 rounded-lg border border-blue-950/80 shadow-inner">
                  {/* Phone Number Field with Copy */}
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-400 font-bold text-xs">Deposit Phone Number:</span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-base font-black text-blue-400 tracking-wider">
                        {activeReceiver.phone_number || RECEIVER_PHONE}
                      </span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(activeReceiver.phone_number || RECEIVER_PHONE, 'phone')}
                        className="px-2 py-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-black text-[11px] rounded flex items-center gap-1 cursor-pointer transition-all shadow-xs border border-blue-400/40"
                      >
                        {copiedField === 'phone' ? <Check className="w-3 h-3 text-white" /> : <Copy className="w-3 h-3" />}
                        <span>{copiedField === 'phone' ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Receiver Name Field with Copy */}
                  <div className="flex items-center justify-between gap-2 pt-2 border-t border-blue-950/80">
                    <span className="text-slate-400 font-bold text-xs">Registered Account Name:</span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-extrabold text-white text-xs uppercase bg-[#091329] px-2 py-0.5 rounded border border-blue-900/60">
                        {activeReceiver.account_name || RECEIVER_NAME}
                      </span>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(activeReceiver.account_name || RECEIVER_NAME, 'name')}
                        className="px-2 py-1 bg-[#091329] hover:bg-[#0f1f42] text-slate-200 font-bold text-[11px] rounded flex items-center gap-1 cursor-pointer transition-all border border-blue-900/60"
                      >
                        {copiedField === 'name' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-slate-400" />}
                        <span>{copiedField === 'name' ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-start gap-1.5 text-[11px] text-slate-300 leading-tight">
                  <Clock className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
                  <p>
                    📌 <strong>Anti-Tracking Active Channel:</strong> Send money to{' '}
                    <strong>{activeReceiver.phone_number || RECEIVER_PHONE} ({activeReceiver.account_name || RECEIVER_NAME})</strong>{' '}
                    via Mobile Money. Deposit numbers cycle automatically to protect transactions and stay within limits.
                  </p>
                </div>
              </div>

              {/* SENDER PHONE NUMBER INPUT (Matching Screenshot 2) */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                  SENDER PHONE NUMBER
                </label>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+256741032838"
                  className="w-full px-4 py-3 bg-[#060e22] border border-blue-900/70 rounded-xl text-sm text-white font-mono focus:outline-none focus:border-blue-500 shadow-inner"
                />
              </div>

              {/* When Wallet Balance is selected but insufficient */}
              {selectedChannel === 'Wallet Balance' && !userHasEnoughBalance && (
                <div className="p-3.5 bg-amber-950/70 border border-amber-500/50 rounded-2xl space-y-2 text-xs text-amber-200">
                  <div className="flex items-center gap-2 text-amber-300 font-bold">
                    <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Wallet Balance is Less Than Required</span>
                  </div>
                  <p className="text-[11px] text-amber-100/90 leading-relaxed">
                    Available: <strong>{currencyInfo.format(liveBalance)}</strong> • Required: <strong>{currencyInfo.format(totalCost)}</strong>.
                    Please select <strong>Airtel Money</strong> or <strong>MTN Mobile Money</strong> above to top up your wallet first.
                  </p>
                </div>
              )}

              {/* When Wallet Balance is selected and sufficient */}
              {selectedChannel === 'Wallet Balance' && userHasEnoughBalance && (
                <div className="p-3 bg-emerald-950/70 border border-emerald-500/50 rounded-2xl flex items-center gap-2.5 text-xs text-emerald-200">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    <strong>Wallet Funded!</strong> Money on your wallet is ready to buy this unit and start running. (Money on balance is for withdrawal only after the total cycle duration of days).
                  </span>
                </div>
              )}

              {/* WHATSAPP INFO BOX (Matching exact screenshot) */}
              <div className="bg-[#050d1e] p-3 rounded-2xl border border-blue-950/80 flex items-center gap-3 text-xs text-slate-300">
                <div className="w-7 h-7 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center shrink-0">
                  <WhatsAppIcon className="w-4 h-4 fill-emerald-400 text-emerald-400 shrink-0" />
                </div>
                <span className="text-[11px] text-slate-300 leading-snug">
                  Buying this machine unlocks instant access to our official Investors WhatsApp Group.
                </span>
              </div>

              {/* BOTTOM ACTION BUTTON (Matching exact screenshot) */}
              <div className="pt-1">
                {hasActiveAV1 ? (
                  <button
                    type="button"
                    disabled
                    className="w-full py-4 px-6 bg-amber-950/60 text-amber-300 font-black text-xs rounded-2xl border border-amber-500/40 opacity-70 cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <AlertCircle className="w-4 h-4 text-amber-400" />
                    <span>Machine Limit Reached: {machine.title} (Max 1 Unit)</span>
                  </button>
                ) : hasMaxAV2 ? (
                  <button
                    type="button"
                    disabled
                    className="w-full py-4 px-6 bg-blue-950/60 text-blue-300 font-black text-xs rounded-2xl border border-blue-400/40 opacity-70 cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    <AlertCircle className="w-4 h-4 text-blue-400" />
                    <span>Machine Limit Reached: {machine.title} (Max 2 Units)</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={handleActionClick}
                    className="w-full py-4 px-6 bg-gradient-to-r from-[#0066ff] via-[#2979ff] to-[#651fff] hover:brightness-110 active:scale-98 text-white font-black text-sm rounded-2xl shadow-xl shadow-blue-600/40 border border-[#00e5ff]/40 transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <Zap className="w-4 h-4 text-white" />
                    <span>
                      {isSubmitting
                        ? 'Processing...'
                        : selectedChannel === 'Wallet Balance' && userHasEnoughBalance
                        ? `Buy Unit (${currencyInfo.format(totalCost)})`
                        : `Submit Deposit (${currencyInfo.format(totalCost)}) for Admin Confirmation`}
                    </span>
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
