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
import { sendMessageToAdmin, createOrderInFirestore } from '../firebase';

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
  onOpenDeposit,
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

  const pendingMachineOrder = userInvestments?.find(
    (inv) =>
      (inv.machine_id === machine.id ||
        (inv.machine_title && machine.title && inv.machine_title.toLowerCase().includes(machine.title.toLowerCase()))) &&
      inv.status === 'PENDING'
  );

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
  const [liveBalance, setLiveBalance] = useState<number>(user?.available_wallet ?? user?.wallet_balance ?? 0);
  const [confirmedWallet, setConfirmedWallet] = useState<number>(user?.available_wallet ?? user?.wallet_balance ?? 0);
  const [pendingDepositAmount, setPendingDepositAmount] = useState<number>(0);

  // Payment channel selection: 'Wallet Balance' | 'MTN Mobile Money' | 'Airtel Money' | 'Card Billing'
  // Default to 'Wallet Balance' because user buys machine using money on wallet after depositing
  const [selectedChannel, setSelectedChannel] = useState<'Wallet Balance' | 'MTN Mobile Money' | 'Airtel Money' | 'Card Billing'>('Wallet Balance');
  const [phoneNumber, setPhoneNumber] = useState<string>(user?.phone_number || '');
  const [hasRevealedReceiver, setHasRevealedReceiver] = useState<boolean>(false);
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
      const [userRes, summaryRes] = await Promise.all([
        fetch(`/api/user/${encodeURIComponent(user.id)}${phoneParam}`),
        fetch(`/api/user/dashboard-summary/${encodeURIComponent(user.id)}${phoneParam}`),
      ]);
      if (userRes.ok && (userRes.headers.get('content-type') || '').includes('application/json')) {
        const uData = await userRes.json();
        if (uData && typeof uData.available_wallet === 'number') {
          setLiveBalance(uData.available_wallet);
        } else if (uData && typeof uData.wallet_balance === 'number') {
          setLiveBalance(uData.wallet_balance);
        }
      }
      if (summaryRes.ok && (summaryRes.headers.get('content-type') || '').includes('application/json')) {
        const sData = await summaryRes.json();
        if (sData) {
          const newPending = Number(sData?.deposit_details?.pending_deposits || 0);
          const newConfirmed = Number(
            sData?.confirmed_wallet ??
              sData?.deposit_details?.confirmed_wallet ??
              sData?.deposit_details?.total_deposited ??
              0
          );
          const rawWallet = Number(
            sData?.available_wallet ?? sData?.wallet_balance ?? newConfirmed + newPending
          );
          // Ensure reflected wallet balance includes pending deposits if not yet deducted
          const effectiveWallet = Math.max(rawWallet, newPending > 0 && rawWallet === 0 ? newPending : rawWallet);
          setLiveBalance(effectiveWallet);
          setConfirmedWallet(newConfirmed);
          setPendingDepositAmount(newPending);
          if (newPending === 0) {
            setDepositSuccessMessage(null);
          }
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
    setLiveBalance(user?.available_wallet ?? user?.wallet_balance ?? 0);
    refreshWalletStatus(false);
    const interval = setInterval(() => {
      refreshWalletStatus(false);
    }, 2500);

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
            if (parsed.type === 'WALLET_DENIED_SYNC') {
              setDepositSuccessMessage(null);
            }
            refreshWalletStatus(false);
            if (onDepositSubmitted) onDepositSubmitted();
          }
        } catch {}
      };
    } catch {}

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('avor_realtime_wallet_sync');
      bc.onmessage = () => {
        refreshWalletStatus(false);
        if (onDepositSubmitted) onDepositSubmitted();
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
  }, [user?.id, user?.wallet_balance, user?.available_wallet, totalCost]);

  const displayWalletBalance = Math.max(liveBalance, pendingDepositAmount);
  const isPaymentConfirmedByAdmin = confirmedWallet >= totalCost || (displayWalletBalance >= totalCost && pendingDepositAmount === 0);
  const userHasEnoughBalance = displayWalletBalance >= totalCost;
  const isMobileMoney = selectedChannel === 'MTN Mobile Money' || selectedChannel === 'Airtel Money';

  // Step 2: Handle submitting deposit via Mobile Money (Shows Pending in Admin + Wallet Empty until Admin presses Confirm)
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
      try {
        const savedRefs: string[] = JSON.parse(localStorage.getItem('avor_my_deposit_refs') || '[]');
        const nextRefs = Array.from(
          new Set(
            [
              ...savedRefs,
              data.transaction?.id,
              data.transaction?.payment_reference,
              phoneNumber.trim(),
            ].filter(Boolean)
          )
        );
        localStorage.setItem('avor_my_deposit_refs', JSON.stringify(nextRefs));
      } catch {}
      if (typeof data.wallet_balance === 'number' && data.wallet_balance > 0) {
        setLiveBalance(data.wallet_balance);
      } else {
        setLiveBalance((prev) => Math.max(prev, totalCost));
      }
      setPendingDepositAmount((prev) => Math.max(prev, totalCost));
      setSelectedChannel('Wallet Balance');
      try {
        const bc = new BroadcastChannel('avor_realtime_wallet_sync');
        bc.postMessage({ type: 'ORDER_OR_DEPOSIT_PLACED', amount: totalCost });
        bc.close();
      } catch {}
      if (onDepositSubmitted) {
        onDepositSubmitted();
      }
      const msg =
        data.message ||
        `Order & Deposit of ${currencyInfo.format(totalCost)} has automatically reflected on your Wallet and Deposit Details on Homepage!`;
      setDepositSuccessMessage(msg);
      await sendMessageToAdmin(
        user.full_name || phoneNumber.trim() || user.phone_number || 'Avor Investor',
        `Deposited UGX ${totalCost.toLocaleString()} via ${selectedChannel} from ${phoneNumber.trim()} to ${activeReceiver.phone_number || RECEIVER_PHONE} (${activeReceiver.account_name || RECEIVER_NAME}) (Pending Admin Confirmation)`,
        {
          userId: user.id,
          transactionId: data.transaction?.id,
          senderPhone: phoneNumber.trim() || user.phone_number,
          receiverPhone: activeReceiver.phone_number || RECEIVER_PHONE,
          receiverName: activeReceiver.account_name || RECEIVER_NAME,
          amount: totalCost,
          machineTitle: `Wallet Deposit (${machine.title})`,
          paymentMethod: selectedChannel,
          paymentReference: data.transaction?.payment_reference || `DEP-${Date.now()}`,
          status: 'PENDING',
        }
      );
    } catch (err: any) {
      setErrorMessage(err.message || 'Unable to submit deposit.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Step 3: Handle buying / placing machine order (after placing order, money reflects automatically on Wallet & Deposit Details on Homepage)
  const handleBuyWithWallet = async () => {
    if (!user) {
      onOpenAuth();
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);
    try {
      let depositRefs = '';
      try {
        const savedRefs: string[] = JSON.parse(localStorage.getItem('avor_my_deposit_refs') || '[]');
        if (Array.isArray(savedRefs) && savedRefs.length > 0) {
          depositRefs = savedRefs.join(',');
        }
      } catch {}
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
          deposit_refs: depositRefs,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.awaiting_admin_confirmation) {
          await refreshWalletStatus(false);
        }
        throw new Error(data.error || 'Failed to purchase machine.');
      }
      if (typeof data.available_wallet === 'number' && data.available_wallet > 0) {
        setLiveBalance(data.available_wallet);
      } else if (typeof data.wallet_balance === 'number' && data.wallet_balance > 0) {
        setLiveBalance(data.wallet_balance);
      } else {
        setLiveBalance((prev) => Math.max(prev, totalCost));
      }
      setConfirmedWallet((prev) => Math.max(prev, totalCost));
      try {
        const bc = new BroadcastChannel('avor_realtime_wallet_sync');
        bc.postMessage({ type: 'ORDER_OR_DEPOSIT_PLACED', amount: totalCost });
        bc.close();
      } catch {}
      setSuccessData({
        message:
          data.message ||
          `Order placed for ${machine.title}! ${currencyInfo.format(totalCost)} has automatically reflected on your Wallet and Deposit Details on Homepage.`,
        status: data.status || 'PENDING',
      });
      const orderId = data.investment?.id || `inv-${Date.now()}`;
      const machineOrderName = `${machine.title} (${units} Unit${units > 1 ? 's' : ''})`;
      const customerNameStr = user.full_name || user.phone_number || 'Avor Investor';
      const dailyYieldVal = (machine.daily_yield || machine.daily_return || Math.round(totalCost * 0.07 / units)) * units;
      const durationVal = machine.duration_days || 32;

      // Save order to real Firebase Firestore 'orders' collection with customername, name, status = "pending"
      await createOrderInFirestore({
        id: orderId,
        customername: customerNameStr,
        name: machineOrderName,
        status: 'pending',
        user_id: user.id,
        customer_name: customerNameStr,
        customer_phone: user.phone_number || phoneNumber,
        machine_id: String(machine.id),
        machine_title: machineOrderName,
        amount_invested: totalCost,
        amount: totalCost,
        daily_return: dailyYieldVal,
        duration_days: durationVal,
        total_return: (machine.total_return || dailyYieldVal * durationVal) * units,
        days_elapsed: 0,
        days_left: durationVal,
        units,
        start_date: data.investment?.start_date || new Date().toISOString(),
        end_date:
          data.investment?.end_date ||
          new Date(Date.now() + durationVal * 86400000).toISOString(),
        payment_method: 'Wallet Balance',
        payment_reference: orderId,
      });

      await sendMessageToAdmin(
        customerNameStr,
        `New Pending Machine Order: Bought ${machineOrderName} for UGX ${totalCost.toLocaleString()} using Wallet Balance (${user.phone_number || phoneNumber}) — Wait for admin confirmation in Pending Orders`,
        {
          senderPhone: user.phone_number || phoneNumber,
          receiverPhone: activeReceiver.phone_number || RECEIVER_PHONE,
          receiverName: activeReceiver.account_name || RECEIVER_NAME,
          amount: totalCost,
          machineTitle: machineOrderName,
          paymentMethod: 'Wallet Balance',
          paymentReference: orderId,
          status: 'PENDING',
        }
      );
      if (onDepositSubmitted) {
        onDepositSubmitted();
      }
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
        if (onOpenDeposit) {
          onOpenDeposit();
          return;
        }
        setSelectedChannel('MTN Mobile Money');
        setHasRevealedReceiver(false);
        setErrorMessage(
          `Wallet balance (${currencyInfo.format(liveBalance)}) is less than ${currencyInfo.format(totalCost)}. Please deposit on your wallet first.`
        );
        return;
      }
      handleBuyWithWallet();
    } else {
      if (!hasRevealedReceiver) {
        if (!phoneNumber.trim() || phoneNumber.replace(/\D/g, '').length < 7) {
          setErrorMessage('Please enter the phone number you are going to use to deposit first.');
          return;
        }
        setErrorMessage(null);
        setHasRevealedReceiver(true);
        return;
      }
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

              {/* Pending Machine Order / Deposit Reflected / Admin Confirmation Status Banner */}
              {pendingMachineOrder ? (
                <div className="p-3.5 rounded-xl text-xs space-y-2 animate-fade-in border bg-amber-950/80 border-amber-500/60 text-amber-200">
                  <div className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                    <div className="flex-1">
                      <span className="font-black block text-amber-300">
                        Wait for Admin Confirmation • Order Sent to Admin Pending Orders
                      </span>
                      <p className="text-[11px] opacity-90 mt-0.5 leading-relaxed">
                        Your order for <span className="font-bold text-white">{pendingMachineOrder.machine_title}</span> (
                        {currencyInfo.format(Number(pendingMachineOrder.amount_invested || totalCost))}) has been placed using your Wallet. As soon as Admin presses{' '}
                        <span className="font-bold text-emerald-300">Confirm Order / Approve / Deliver</span> in the Admin Orders section, your machine cycle will start immediately!
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                (depositSuccessMessage || pendingDepositAmount > 0 || isPaymentConfirmedByAdmin) && (
                  <div
                    className={`p-3.5 rounded-xl text-xs space-y-2 animate-fade-in border ${
                      isPaymentConfirmedByAdmin
                        ? 'bg-emerald-950/80 border-emerald-500/60 text-emerald-200'
                        : 'bg-cyan-950/80 border-cyan-500/60 text-cyan-200'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <CheckCircle2
                        className={`w-4 h-4 shrink-0 mt-0.5 ${
                          isPaymentConfirmedByAdmin ? 'text-emerald-400' : 'text-cyan-400'
                        }`}
                      />
                      <div className="flex-1">
                        <span
                          className={`font-black block ${
                            isPaymentConfirmedByAdmin ? 'text-emerald-300' : 'text-cyan-300'
                          }`}
                        >
                          {isPaymentConfirmedByAdmin
                            ? `Payment Confirmed by Admin • Wallet Ready (${currencyInfo.format(displayWalletBalance)})`
                            : `Deposit Reflected on Wallet (${currencyInfo.format(displayWalletBalance)}) • Machine Cycle Starts After Admin Confirmation`}
                        </span>
                        <p className="text-[11px] opacity-90 mt-0.5 leading-relaxed">
                          {isPaymentConfirmedByAdmin
                            ? `Admin has confirmed your payment! Click "Buy Machine Using Wallet" below to place your machine order.`
                            : depositSuccessMessage ||
                              `Your deposit of ${currencyInfo.format(pendingDepositAmount || displayWalletBalance)} is reflected on your Wallet. Once Admin confirms your payment, click Buy Machine below to order your machine.`}
                        </p>
                      </div>
                    </div>
                  </div>
                )
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
                      {currencyInfo.format(displayWalletBalance)} Available
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

              {/* STEP 3 & 4 INSIDE INVEST MODAL WHEN MOBILE MONEY IS SELECTED */}
              {selectedChannel !== 'Wallet Balance' && (
                <div className="space-y-3 animate-fade-in">
                  {/* Step 3: Enter Sender Phone Number & Amount before receiving deposit number */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                      AMOUNT TO DEPOSIT ON WALLET (UGX)
                    </label>
                    <div className="w-full px-4 py-3 bg-[#060e22] border border-blue-900/70 rounded-xl text-sm font-black text-amber-300 font-mono">
                      {currencyInfo.format(totalCost)}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                      YOUR PHONE NUMBER (NUMBER YOU WILL USE TO DEPOSIT)
                    </label>
                    <input
                      type="tel"
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="07XXXXXXXX"
                      className="w-full px-4 py-3 bg-[#060e22] border border-blue-900/70 rounded-xl text-sm text-white font-mono focus:outline-none focus:border-blue-500 shadow-inner"
                    />
                  </div>

                  {!hasRevealedReceiver ? (
                    <div className="p-3.5 rounded-xl bg-[#050c1c] border border-blue-900/80 text-[11px] font-bold text-slate-300 uppercase leading-relaxed">
                      Enter the same MTN or Airtel phone number that you will use to make the payment, then click below to receive the company&apos;s deposit number and registered name.
                    </div>
                  ) : (
                    /* Step 4: Reveals the Number to Deposit Money On & Registered Name */
                    <div className="bg-[#050c1c] border border-amber-500/40 rounded-2xl p-4 space-y-3 animate-fade-in shadow-inner">
                      <div className="flex items-center justify-between border-b border-blue-950/80 pb-2.5">
                        <div className="flex items-center gap-1.5">
                          <span className="bg-amber-950/80 border border-amber-500/40 text-amber-300 font-black px-2 py-0.5 rounded text-[10px] uppercase flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3 text-amber-400" />
                            <span>Payment Information</span>
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
                        {/* Account Number Field with Copy */}
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-slate-400 font-bold text-xs uppercase">Account Number:</span>
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-base font-black text-amber-400 tracking-wider">
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

                        {/* Account Name Field with Copy */}
                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-blue-950/80">
                          <span className="text-slate-400 font-bold text-xs uppercase">Account Name:</span>
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
                    </div>
                  )}
                </div>
              )}

              {/* When Wallet Balance is selected */}
              {selectedChannel === 'Wallet Balance' && (
                <div className="p-3.5 bg-[#050c1c] border border-blue-900/80 rounded-2xl space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 font-bold uppercase">Machine Cost:</span>
                    <span className="font-mono font-black text-white text-sm">{currencyInfo.format(totalCost)}</span>
                  </div>
                  <div className="flex items-center justify-between border-t border-blue-950/80 pt-2">
                    <span className="text-slate-400 font-bold uppercase">Your Wallet Balance:</span>
                    <span className={`font-mono font-black text-sm ${userHasEnoughBalance ? 'text-emerald-400' : 'text-amber-400'}`}>
                      {currencyInfo.format(displayWalletBalance)}
                    </span>
                  </div>
                </div>
              )}

              {/* When Wallet Balance is selected but insufficient */}
              {selectedChannel === 'Wallet Balance' && !userHasEnoughBalance && (
                <div className="p-3.5 bg-amber-950/70 border border-amber-500/50 rounded-2xl space-y-2 text-xs text-amber-200">
                  <div className="flex items-center gap-2 text-amber-300 font-bold">
                    <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Deposit on Wallet First to Buy Machine</span>
                  </div>
                  <p className="text-[11px] text-amber-100/90 leading-relaxed">
                    Available on Wallet: <strong>{currencyInfo.format(displayWalletBalance)}</strong> • Required: <strong>{currencyInfo.format(totalCost)}</strong>.
                    Click below to deposit money onto your wallet first, then return here to buy <strong>{machine.title}</strong> using the money on your wallet.
                  </p>
                </div>
              )}

              {/* When Wallet Balance is selected and sufficient */}
              {selectedChannel === 'Wallet Balance' && userHasEnoughBalance && (
                <div className="p-3 bg-emerald-950/70 border border-emerald-500/50 rounded-2xl flex items-center gap-2.5 text-xs text-emerald-200">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    <strong>Wallet Funded!</strong> Click below to buy <strong>{machine.title}</strong> using the money on your wallet.
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

              {/* BOTTOM ACTION BUTTON */}
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
                        : selectedChannel === 'Wallet Balance'
                          ? userHasEnoughBalance
                            ? `Buy Machine Using Wallet (${currencyInfo.format(totalCost)})`
                            : `Deposit on Wallet First (${currencyInfo.format(totalCost)})`
                          : !hasRevealedReceiver
                            ? 'Continue to Receive Deposit Number & Name'
                            : `Place Order (${currencyInfo.format(totalCost)})`}
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
