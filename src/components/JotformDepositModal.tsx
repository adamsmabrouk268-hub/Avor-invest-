import React, { useState, useEffect } from 'react';
import { User, Machine } from '../types';
import { DEFAULT_MACHINES } from '../data/defaultMachines';
import {
  CheckCircle2,
  Send,
  X,
  FileText,
  Smartphone,
  Cpu,
  Coins,
  User as UserIcon,
  MessageSquare,
  ShieldCheck,
  AlertCircle,
} from 'lucide-react';

interface JotformDepositModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: User | null;
  machines?: Machine[];
  initialMachine?: Machine | null;
  initialAmount?: number;
  initialPhone?: string;
  initialPaymentMethod?: string;
  receiverPhone?: string;
  receiverName?: string;
  onSubmittedSuccess?: (data: any) => void;
}

export const JotformDepositModal: React.FC<JotformDepositModalProps> = ({
  isOpen,
  onClose,
  user,
  machines = DEFAULT_MACHINES,
  initialMachine = null,
  initialAmount,
  initialPhone,
  initialPaymentMethod,
  receiverPhone = '0741032838',
  receiverName = 'SULAINH NAKASEETA',
  onSubmittedSuccess,
}) => {
  const catalog = machines && machines.length > 0 ? machines : DEFAULT_MACHINES;

  const [customerName, setCustomerName] = useState<string>(user?.full_name || user?.name || '');
  const [senderPhone, setSenderPhone] = useState<string>(initialPhone || user?.phone_number || '');
  const [selectedMachineId, setSelectedMachineId] = useState<string>(
    initialMachine?.id || catalog[0]?.id || 'mach-av1-01'
  );
  const [depositAmount, setDepositAmount] = useState<string>(
    String(initialAmount || initialMachine?.total_cost || catalog[0]?.total_cost || 35000)
  );
  const [paymentMethod, setPaymentMethod] = useState<string>(
    initialPaymentMethod || 'MTN Mobile Money'
  );
  const [targetReceiverPhone, setTargetReceiverPhone] = useState<string>(receiverPhone);
  const [targetReceiverName, setTargetReceiverName] = useState<string>(receiverName);
  const [transactionReference, setTransactionReference] = useState<string>('');
  const [customerMessage, setCustomerMessage] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submittedRecord, setSubmittedRecord] = useState<any | null>(null);

  useEffect(() => {
    if (user?.full_name || user?.name) {
      setCustomerName(user.full_name || user.name || '');
    }
    if (initialPhone || user?.phone_number) {
      setSenderPhone(initialPhone || user?.phone_number || '');
    }
  }, [user, initialPhone]);

  useEffect(() => {
    if (initialMachine) {
      setSelectedMachineId(initialMachine.id);
      setDepositAmount(String(initialAmount || initialMachine.total_cost || 35000));
    } else if (initialAmount && initialAmount > 0) {
      setDepositAmount(String(initialAmount));
      const matched = catalog.find((m) => m.total_cost === initialAmount);
      if (matched) setSelectedMachineId(matched.id);
    }
  }, [initialMachine, initialAmount]);

  useEffect(() => {
    if (!isOpen) return;
    fetch('/api/wallet/active-receiver')
      .then((r) => (r.ok && (r.headers.get('content-type') || '').includes('application/json') ? r.json() : null))
      .then((data) => {
        const rec = data?.receiver || data;
        if (rec && rec.phone_number) {
          setTargetReceiverPhone(rec.phone_number);
          setTargetReceiverName(rec.account_name || receiverName);
        }
      })
      .catch(() => {});
  }, [isOpen]);

  if (!isOpen) return null;

  const selectedMachineObj =
    catalog.find((m) => m.id === selectedMachineId) || initialMachine || catalog[0];

  const handleMachineChange = (newId: string) => {
    setSelectedMachineId(newId);
    const found = catalog.find((m) => m.id === newId);
    if (found && found.total_cost) {
      setDepositAmount(String(found.total_cost));
    }
  };

  const handleSubmitJotform = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanPhone = senderPhone.trim();
    const numAmount = Number(depositAmount.replace(/[^0-9]/g, ''));

    if (!cleanPhone || cleanPhone.length < 7) {
      setErrorMsg('Please enter the phone number used to send the deposit.');
      return;
    }
    if (!numAmount || numAmount < 5000) {
      setErrorMsg('Please enter a valid deposit amount (minimum 5,000 UGX).');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/jotform/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user?.id || `usr-jotform-${cleanPhone.replace(/\D/g, '').slice(-9)}`,
          customer_name: customerName.trim() || user?.full_name || 'Avor Investor',
          customer_phone: cleanPhone,
          machine_id: selectedMachineObj?.id || selectedMachineId,
          machine_title: selectedMachineObj?.title || 'AV1 - Machine 1',
          amount: numAmount,
          payment_method: paymentMethod,
          receiver_phone: targetReceiverPhone,
          receiver_name: targetReceiverName,
          payment_reference:
            transactionReference.trim() ||
            `JOTFORM-${cleanPhone.replace(/\D/g, '').slice(-4)}-${Date.now().toString().slice(-5)}`,
          customer_message:
            customerMessage.trim() ||
            `I have deposited UGX ${numAmount.toLocaleString()} for ${selectedMachineObj?.title || 'Machine'} from ${cleanPhone} to ${targetReceiverPhone} (${targetReceiverName}).`,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit Jotform deposit message.');
      }

      setSubmittedRecord(data.submission || data);
      if (onSubmittedSuccess) {
        onSubmittedSuccess(data);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Unable to send Jotform message to Admin. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-slate-950/90 backdrop-blur-md animate-fade-in text-white select-none">
      <div className="w-full max-w-lg bg-[#050d21] border-2 border-blue-500/60 rounded-3xl overflow-hidden shadow-[0_0_50px_rgba(0,145,234,0.4)] relative my-auto max-h-[94vh] flex flex-col">
        {/* Jotform Branded Top Accent */}
        <div className="h-2 bg-gradient-to-r from-[#ff6100] via-amber-500 to-blue-500 shrink-0" />

        {/* Jotform Header */}
        <div className="bg-[#081533] p-4 sm:p-5 flex items-center justify-between border-b border-blue-800/70 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-[#ff6100] to-amber-600 border border-amber-300/60 flex items-center justify-center shadow-lg shrink-0">
              <FileText className="w-6 h-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-[#ff6100] text-white font-black text-[10px] uppercase tracking-wider">
                  JOTFORM
                </span>
                <h3 className="text-sm sm:text-base font-black text-white uppercase tracking-wide">
                  Deposit &amp; Machine Form
                </h3>
              </div>
              <p className="text-[11px] text-sky-300 font-semibold mt-0.5">
                Fill after buying a machine or depositing • Delivers instant message to Admin Plane
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-blue-900/50 transition-all cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4">
          {submittedRecord ? (
            <div className="p-5 rounded-2xl bg-[#081738] border border-emerald-500/50 text-center space-y-4 animate-fade-in">
              <div className="w-16 h-16 rounded-full bg-emerald-950 border-2 border-emerald-400 text-emerald-400 flex items-center justify-center mx-auto shadow-lg">
                <CheckCircle2 className="w-9 h-9" />
              </div>

              <div className="space-y-1.5">
                <span className="inline-block px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-[10px] font-mono font-black uppercase">
                  JOTFORM DELIVERED TO ADMIN PLANE
                </span>
                <h4 className="text-lg font-black text-white">
                  Deposit Message Sent to Admin!
                </h4>
                <p className="text-xs text-slate-200 leading-relaxed">
                  Your Jotform deposit &amp; machine verification for{' '}
                  <strong className="text-sky-400">
                    UGX {Number(depositAmount || 0).toLocaleString()}
                  </strong>{' '}
                  ({selectedMachineObj?.title}) from <strong className="text-white">{senderPhone}</strong> has been delivered to the{' '}
                  <strong className="text-emerald-300">Admin Plane</strong>, reflected on your Wallet, and your machine is running!
                </p>
              </div>

              <div className="p-3.5 rounded-xl bg-[#050e24] border border-blue-900/80 text-left text-xs font-mono space-y-1 text-slate-300">
                <div className="flex justify-between">
                  <span className="text-slate-400">Customer:</span>
                  <span className="text-white font-bold">{customerName || 'Investor'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Sender Phone:</span>
                  <span className="text-cyan-300 font-bold">{senderPhone}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Machine:</span>
                  <span className="text-emerald-300 font-bold">{selectedMachineObj?.title}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Amount Sent:</span>
                  <span className="text-sky-300 font-bold">UGX {Number(depositAmount || 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Receiver Line:</span>
                  <span className="text-white font-bold">{targetReceiverPhone} ({targetReceiverName})</span>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setSubmittedRecord(null);
                    onClose();
                  }}
                  className="flex-1 py-3.5 px-5 rounded-2xl bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 hover:brightness-110 text-white font-black text-xs uppercase tracking-wider shadow-lg cursor-pointer"
                >
                  Done &amp; Continue
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSubmittedRecord(null);
                    setTransactionReference('');
                    setCustomerMessage('');
                  }}
                  className="py-3.5 px-4 rounded-2xl bg-[#0b1b3d] hover:bg-[#12295a] border border-blue-700/60 text-sky-300 font-bold text-xs uppercase cursor-pointer"
                >
                  Submit Another Form
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmitJotform} className="space-y-3.5">
              {errorMsg && (
                <div className="p-3 rounded-xl bg-rose-950/80 border border-rose-500/60 text-rose-200 text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="p-3 rounded-xl bg-blue-950/50 border border-blue-700/50 text-[11px] text-sky-200 leading-relaxed flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                <span>
                  Fill out this Jotform after depositing or buying a machine. Your deposit details and message are sent directly to the <strong>Admin Plane</strong> across all devices.
                </span>
              </div>

              {/* 1. Customer Name */}
              <div className="space-y-1">
                <label className="block text-[11px] font-extrabold text-slate-200 uppercase tracking-wider">
                  1. Your Name *
                </label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-sky-400 absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Enter your full name"
                    className="w-full pl-10 pr-4 py-3 bg-[#08132c] border border-blue-800/80 focus:border-sky-400 rounded-xl text-xs sm:text-sm font-bold text-white outline-none"
                    required
                  />
                </div>
              </div>

              {/* 2. Sender Phone Number */}
              <div className="space-y-1">
                <label className="block text-[11px] font-extrabold text-slate-200 uppercase tracking-wider">
                  2. Phone Number Used to Deposit (MTN / Airtel) *
                </label>
                <div className="relative">
                  <Smartphone className="w-4 h-4 text-sky-400 absolute left-3.5 top-3.5" />
                  <input
                    type="tel"
                    value={senderPhone}
                    onChange={(e) => setSenderPhone(e.target.value)}
                    placeholder="e.g. 077XXXXXXX or 075XXXXXXX"
                    className="w-full pl-10 pr-4 py-3 bg-[#08132c] border border-blue-800/80 focus:border-sky-400 rounded-xl text-xs sm:text-sm font-mono font-bold text-white outline-none"
                    required
                  />
                </div>
              </div>

              {/* 3. Machine Bought */}
              <div className="space-y-1">
                <label className="block text-[11px] font-extrabold text-slate-200 uppercase tracking-wider">
                  3. Machine Bought / Selected *
                </label>
                <div className="relative">
                  <Cpu className="w-4 h-4 text-sky-400 absolute left-3.5 top-3.5 pointer-events-none" />
                  <select
                    value={selectedMachineId}
                    onChange={(e) => handleMachineChange(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-[#08132c] border border-blue-800/80 focus:border-sky-400 rounded-xl text-xs sm:text-sm font-bold text-white outline-none cursor-pointer"
                  >
                    {catalog.map((m) => (
                      <option key={m.id} value={m.id} className="bg-[#061024] text-white">
                        {m.title} — UGX {(m.total_cost || m.price || 0).toLocaleString()} ({m.duration_days} Days)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 4. Deposit Amount & Payment Network */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-[11px] font-extrabold text-slate-200 uppercase tracking-wider">
                    4. Deposit Amount (UGX) *
                  </label>
                  <div className="relative">
                    <Coins className="w-4 h-4 text-sky-400 absolute left-3.5 top-3.5" />
                    <input
                      type="text"
                      inputMode="numeric"
                      value={depositAmount}
                      onChange={(e) => setDepositAmount(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="e.g. 35000"
                      className="w-full pl-10 pr-3 py-3 bg-[#08132c] border border-blue-800/80 focus:border-sky-400 rounded-xl text-xs sm:text-sm font-mono font-bold text-white outline-none"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-[11px] font-extrabold text-slate-200 uppercase tracking-wider">
                    5. Mobile Money Network *
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-full px-3.5 py-3 bg-[#08132c] border border-blue-800/80 focus:border-sky-400 rounded-xl text-xs sm:text-sm font-bold text-white outline-none cursor-pointer"
                  >
                    <option value="MTN Mobile Money" className="bg-[#061024]">MTN Mobile Money</option>
                    <option value="Airtel Money" className="bg-[#061024]">Airtel Money</option>
                  </select>
                </div>
              </div>

              {/* 6. Company Receiver Number Sent To */}
              <div className="p-3 rounded-xl bg-[#071128] border border-blue-900/70 flex items-center justify-between text-xs">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase block">
                    Sent to Company Receiver Line:
                  </span>
                  <span className="font-mono font-black text-sky-300 text-xs sm:text-sm">
                    {targetReceiverPhone} ({targetReceiverName})
                  </span>
                </div>
                <span className="px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 text-[10px] font-mono font-bold">
                  Active Line
                </span>
              </div>

              {/* 7. Transaction ID / SMS Reference */}
              <div className="space-y-1">
                <label className="block text-[11px] font-extrabold text-slate-200 uppercase tracking-wider">
                  6. Transaction ID / SMS Reference (Optional)
                </label>
                <input
                  type="text"
                  value={transactionReference}
                  onChange={(e) => setTransactionReference(e.target.value)}
                  placeholder="Paste Mobile Money Transaction ID or Reference"
                  className="w-full px-4 py-3 bg-[#08132c] border border-blue-800/80 focus:border-sky-400 rounded-xl text-xs font-mono font-bold text-white outline-none"
                />
              </div>

              {/* 8. Deposit Message to Admin */}
              <div className="space-y-1">
                <label className="block text-[11px] font-extrabold text-slate-200 uppercase tracking-wider">
                  7. Message to Admin / Paste Confirmation SMS
                </label>
                <div className="relative">
                  <MessageSquare className="w-4 h-4 text-sky-400 absolute left-3.5 top-3.5" />
                  <textarea
                    rows={2}
                    value={customerMessage}
                    onChange={(e) => setCustomerMessage(e.target.value)}
                    placeholder="Paste your Mobile Money confirmation SMS or write a message to Admin about your deposit..."
                    className="w-full pl-10 pr-4 py-2.5 bg-[#08132c] border border-blue-800/80 focus:border-sky-400 rounded-xl text-xs text-white outline-none resize-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-[#ff6100] via-amber-500 to-blue-600 hover:brightness-110 active:scale-98 text-white font-black text-xs sm:text-sm uppercase tracking-wider shadow-lg border border-amber-300/50 transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Send className="w-4 h-4 text-white" />
                <span>
                  {isSubmitting
                    ? 'SENDING JOTFORM MESSAGE TO ADMIN PLANE...'
                    : 'SUBMIT JOTFORM TO ADMIN PLANE'}
                </span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
