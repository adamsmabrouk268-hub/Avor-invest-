import React, { useState, useEffect } from 'react';
import { DepositReceiverNumber, DepositRotationConfig } from '../types';
import {
  ShieldCheck,
  RefreshCw,
  Clock,
  Shuffle,
  PlusCircle,
  Phone,
  UserCheck,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Edit3,
  Copy,
  Check,
  Play,
  Settings,
  Zap,
  TrendingUp,
  History,
  Smartphone,
  CheckCheck,
  AlertTriangle,
  RotateCcw,
  Gauge,
  Info,
} from 'lucide-react';

interface DepositNumbersManagerProps {
  onRefreshAdmin?: () => void;
}

export const DepositNumbersManager: React.FC<DepositNumbersManagerProps> = ({ onRefreshAdmin }) => {
  const [numbers, setNumbers] = useState<DepositReceiverNumber[]>([]);
  const [rotationConfig, setRotationConfig] = useState<DepositRotationConfig | null>(null);
  const [activeNumber, setActiveNumber] = useState<DepositReceiverNumber | null>(null);
  const [timeRemainingSeconds, setTimeRemainingSeconds] = useState<number>(5 * 60);
  const [rotationHistory, setRotationHistory] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Form State for Adding / Editing Number
  const [editingId, setEditingId] = useState<string | null>(null);
  const [phoneInput, setPhoneInput] = useState<string>('');
  const [nameInput, setNameInput] = useState<string>('');
  const [carrierInput, setCarrierInput] = useState<'MTN' | 'AIRTEL' | 'BOTH'>('MTN');
  const [durationMinutesInput, setDurationMinutesInput] = useState<number>(5);
  const [dailyLimitInput, setDailyLimitInput] = useState<number>(5000000);
  const [notesInput, setNotesInput] = useState<string>('');
  const [isSubmittingNumber, setIsSubmittingNumber] = useState<boolean>(false);

  // Strategy Config Form State
  const [strategyMode, setStrategyMode] = useState<'TIME_BASED' | 'ROUND_ROBIN' | 'ADMIN_MANUAL'>('TIME_BASED');
  const [strategyMinutes, setStrategyMinutes] = useState<number>(5);
  const [autoRotateEnabled, setAutoRotateEnabled] = useState<boolean>(true);
  const [isSavingStrategy, setIsSavingStrategy] = useState<boolean>(false);

  // Copy Feedback State
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Custom Activation Minutes selector state for items
  const [customMinutesMap, setCustomMinutesMap] = useState<{ [key: string]: number }>({});

  useEffect(() => {
    fetchNumbersData();
    const timer = setInterval(() => {
      setTimeRemainingSeconds((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const fetchNumbersData = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/admin/deposit-numbers');
      if (res.ok) {
        const data = await res.json();
        setNumbers(data.numbers || []);
        if (data.config) {
          setRotationConfig(data.config);
          setStrategyMode(data.config.mode || 'TIME_BASED');
          setStrategyMinutes(data.config.time_interval_minutes || 5);
          setAutoRotateEnabled(data.config.auto_rotate_enabled ?? true);
        }
        if (data.active) {
          setActiveNumber(data.active);
        }
        if (data.timeRemainingSeconds !== undefined) {
          setTimeRemainingSeconds(data.timeRemainingSeconds);
        }
        if (data.rotation_history) {
          setRotationHistory(data.rotation_history);
        }
      }
    } catch (err) {
      console.error('Failed to fetch deposit numbers:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRotateNow = async () => {
    setIsLoading(true);
    setActionMessage(null);
    try {
      const res = await fetch('/api/admin/deposit-numbers/rotate', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to rotate deposit number.');

      setActionMessage({ type: 'success', text: `Swapped active line to: ${data.active?.phone_number} (${data.active?.account_name})` });
      fetchNumbersData();
      if (onRefreshAdmin) onRefreshAdmin();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleActivateSpecificNumber = async (numId: string, durationMins: number = 5) => {
    setIsLoading(true);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/admin/deposit-numbers/${numId}/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ duration_minutes: durationMins }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to set active number.');

      setActionMessage({ type: 'success', text: `Active line locked to ${data.active?.phone_number} for ${durationMins} minutes.` });
      fetchNumbersData();
      if (onRefreshAdmin) onRefreshAdmin();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleNumberActive = async (num: DepositReceiverNumber) => {
    setActionMessage(null);
    try {
      const res = await fetch(`/api/admin/deposit-numbers/${num.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !num.is_active }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update line status.');

      setActionMessage({ type: 'success', text: `${num.phone_number} ${!num.is_active ? 'enabled in' : 'paused from'} rotation pool.` });
      fetchNumbersData();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message });
    }
  };

  const handleSaveStrategy = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingStrategy(true);
    setActionMessage(null);
    try {
      const res = await fetch('/api/admin/deposit-numbers/strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: strategyMode,
          time_interval_minutes: Number(strategyMinutes) || 5,
          auto_rotate_enabled: autoRotateEnabled,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save strategy.');

      setActionMessage({ type: 'success', text: '5-Minute rotation strategy saved and updated in daemon!' });
      fetchNumbersData();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message });
    } finally {
      setIsSavingStrategy(false);
    }
  };

  const handleSaveNumber = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phoneInput || !nameInput) {
      setActionMessage({ type: 'error', text: 'Phone number and Account Name are required.' });
      return;
    }

    setIsSubmittingNumber(true);
    setActionMessage(null);
    try {
      const endpoint = editingId ? `/api/admin/deposit-numbers/${editingId}` : '/api/admin/deposit-numbers';
      const method = editingId ? 'PUT' : 'POST';

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone_number: phoneInput,
          account_name: nameInput,
          carrier: carrierInput,
          rotation_duration_minutes: Number(durationMinutesInput) || 5,
          daily_receiving_limit: Number(dailyLimitInput) || 5000000,
          daily_limit_ugx: Number(dailyLimitInput) || 5000000,
          notes: notesInput,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save deposit number.');

      setActionMessage({ type: 'success', text: data.message });
      resetNumberForm();
      fetchNumbersData();
      if (onRefreshAdmin) onRefreshAdmin();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message });
    } finally {
      setIsSubmittingNumber(false);
    }
  };

  const handleEditSelect = (num: DepositReceiverNumber) => {
    setEditingId(num.id);
    setPhoneInput(num.phone_number);
    setNameInput(num.account_name);
    setCarrierInput(num.carrier);
    setDurationMinutesInput(num.rotation_duration_minutes || (num.rotation_duration_hours ? num.rotation_duration_hours * 60 : 5));
    setDailyLimitInput(num.daily_receiving_limit || num.daily_limit_ugx || 5000000);
    setNotesInput(num.notes || '');

    const formEl = document.getElementById('deposit-number-form');
    if (formEl) formEl.scrollIntoView({ behavior: 'smooth' });
  };

  const handleDeleteNumber = async (numId: string, phone: string) => {
    if (!confirm(`Are you sure you want to remove ${phone} from the rotation pool?`)) return;
    setActionMessage(null);
    try {
      const res = await fetch(`/api/admin/deposit-numbers/${numId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete number.');

      setActionMessage({ type: 'success', text: `Removed ${phone} from pool.` });
      fetchNumbersData();
      if (onRefreshAdmin) onRefreshAdmin();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message });
    }
  };

  const handleClearAllNumbers = async () => {
    if (!confirm('Are you sure you want to remove ALL deposit numbers from the rotation pool? The pool will be empty until you add replacement numbers.')) return;
    setIsLoading(true);
    setActionMessage(null);
    try {
      const res = await fetch('/api/admin/deposit-numbers/clear-all', {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to clear numbers pool.');
      setActionMessage({ type: 'success', text: 'All deposit numbers removed from the pool. You can now add replacement numbers below.' });
      fetchNumbersData();
      if (onRefreshAdmin) onRefreshAdmin();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetDailyLimits = async () => {
    if (!confirm('Reset daily receiving counters to 0 UGX for all deposit lines? (Usually done at midnight)')) return;
    try {
      const res = await fetch('/api/admin/deposit-numbers/reset-daily', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reset daily counters.');
      setActionMessage({ type: 'success', text: 'All daily inflow limits reset to 0 UGX.' });
      fetchNumbersData();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message });
    }
  };

  const resetNumberForm = () => {
    setEditingId(null);
    setPhoneInput('');
    setNameInput('');
    setCarrierInput('MTN');
    setDurationMinutesInput(5);
    setDailyLimitInput(5000000);
    setNotesInput('');
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatCountdown = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const formattedCountdown = formatCountdown(timeRemainingSeconds);

  return (
    <div className="space-y-6 text-white animate-fade-in">
      {/* Action Notification Banner */}
      {actionMessage && (
        <div
          className={`p-4 rounded-xl text-xs font-bold flex items-center justify-between shadow-md ${
            actionMessage.type === 'success'
              ? 'bg-emerald-950/70 border border-emerald-500/40 text-emerald-300'
              : 'bg-rose-950/70 border border-rose-500/40 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{actionMessage.text}</span>
          </div>
          <button onClick={() => setActionMessage(null)} className="text-slate-400 hover:text-white">
            ✕
          </button>
        </div>
      )}

      {/* SECTION 1: LIVE ACTIVE NUMBER & ROTATION MONITOR */}
      <div className="shining-card rounded-2xl p-6 sm:p-8 border border-blue-950/80 shadow-2xl relative overflow-hidden text-white">
        {/* Decorative Top Accent Bar */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-600 via-blue-500 to-indigo-800" />

        <div className="relative z-10 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-blue-950/80 pb-5">
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="bg-blue-950/70 border border-blue-600/40 text-blue-300 text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full font-mono flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping inline-block" />
                  Live Active Deposit Line
                </span>
                <span className="bg-sky-950/70 text-sky-300 text-[10px] font-bold px-2 py-0.5 rounded border border-sky-600/40 font-mono">
                  {strategyMode === 'TIME_BASED'
                    ? `⏱️ ${strategyMinutes}-Minute Fast Cycle`
                    : strategyMode === 'ROUND_ROBIN'
                    ? '🔀 Per-Depositor Round-Robin'
                    : '🔒 Admin Manual Lock'}
                </span>
              </div>
              <h3 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
                <span>Active Receiver Number:</span>
                <span className="text-blue-400 font-mono tracking-wider">{activeNumber?.phone_number || 'None (Pool Empty)'}</span>
              </h3>
              <p className="text-xs text-slate-300">
                {activeNumber ? (
                  <>Registered To: <strong className="text-white uppercase">{activeNumber.account_name}</strong> ({activeNumber.carrier} Network)</>
                ) : (
                  <span className="text-amber-300 font-semibold">⚠️ All numbers removed. Pool is empty — add replacement Mobile Money numbers below.</span>
                )}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleRotateNow}
                disabled={isLoading || !activeNumber}
                className={`px-4 py-2.5 font-black text-xs rounded-xl shadow-md transition-all flex items-center gap-2 border ${
                  activeNumber
                    ? 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white border-blue-400/40 cursor-pointer'
                    : 'bg-slate-800 text-slate-500 border-slate-700 cursor-not-allowed opacity-60'
                }`}
              >
                <Shuffle className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                <span>⚡ Rotate Line Now</span>
              </button>

              <button
                onClick={handleResetDailyLimits}
                disabled={isLoading || numbers.length === 0}
                className="px-3.5 py-2.5 bg-[#09132e] hover:bg-[#0f2150] text-rose-300 hover:text-rose-200 text-xs font-bold rounded-xl border border-rose-900/40 transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                title="Reset daily receiving sums to 0 for midnight rollover"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Inflows</span>
              </button>

              <button
                onClick={() => fetchNumbersData()}
                disabled={isLoading}
                className="px-3.5 py-2.5 bg-[#070d1e] hover:bg-[#0c1736] text-slate-200 text-xs font-bold rounded-xl border border-blue-950/80 transition-all cursor-pointer flex items-center gap-1.5"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                <span>Sync</span>
              </button>
            </div>
          </div>

          {/* Key Metrics Grid for Active Receiver */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Countdown Box */}
            <div className="bg-[#050a18] border border-blue-500/40 rounded-xl p-4 space-y-1 shadow-inner">
              <div className="flex items-center justify-between text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                <span>Next Auto-Rotation in</span>
                <Clock className="w-3.5 h-3.5 text-blue-400" />
              </div>
              <div className="text-2xl sm:text-3xl font-black font-mono text-blue-400">
                {activeNumber ? formattedCountdown : 'PAUSED'}
              </div>
              <p className="text-[10px] text-slate-400">
                {activeNumber ? `Every ${strategyMinutes} minutes or on daily limit` : 'Add numbers to activate timer'}
              </p>
            </div>

            {/* Daily Inflow Limit Progress */}
            <div className="bg-[#050a18] border border-blue-950/80 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                <span>Daily Inflow Cap</span>
                <Gauge className="w-3.5 h-3.5 text-blue-400" />
              </div>
              <div className="text-base font-black font-mono text-white flex items-center justify-between">
                <span className="text-blue-400">UGX {(activeNumber?.amount_received_today || 0).toLocaleString()}</span>
                <span className="text-xs text-slate-400 font-normal">/ {(activeNumber?.daily_receiving_limit || activeNumber?.daily_limit_ugx || 0).toLocaleString()}</span>
              </div>
              {/* Progress Bar */}
              <div className="w-full bg-[#0a142e] rounded-full h-2 overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    ((activeNumber?.amount_received_today || 0) / (activeNumber?.daily_receiving_limit || 5000000)) >= 0.9
                      ? 'bg-rose-500'
                      : ((activeNumber?.amount_received_today || 0) / (activeNumber?.daily_receiving_limit || 5000000)) >= 0.6
                      ? 'bg-blue-500'
                      : 'bg-emerald-500'
                  }`}
                  style={{
                    width: activeNumber
                      ? `${Math.min(100, Math.round(((activeNumber?.amount_received_today || 0) / (activeNumber?.daily_receiving_limit || 5000000)) * 100))}%`
                      : '0%',
                  }}
                />
              </div>
            </div>

            {/* Total Volume Collected Today */}
            <div className="bg-[#050a18] border border-blue-950/80 rounded-xl p-4 space-y-1">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                Total Line Deposits
              </span>
              <div className="text-2xl font-black font-mono text-white">
                {activeNumber?.total_transactions_count || 0} Tx
              </div>
              <p className="text-[10px] text-slate-400 font-mono">
                Lifetime: UGX {(activeNumber?.total_received_ugx || 0).toLocaleString()}
              </p>
            </div>

            {/* Carrier Status */}
            <div className="bg-[#050a18] border border-blue-950/80 rounded-xl p-4 space-y-1">
              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                Carrier & Security Status
              </span>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-base font-black text-white">{activeNumber ? `${activeNumber.carrier} MoMo` : 'None Active'}</span>
                <span className={`${activeNumber ? 'bg-emerald-950/70 border-emerald-500/40 text-emerald-300' : 'bg-amber-950/70 border-amber-500/40 text-amber-300'} border text-[10px] font-bold px-2 py-0.5 rounded`}>
                  {activeNumber ? 'VERIFIED' : 'AWAITING REPLACEMENT'}
                </span>
              </div>
              <p className="text-[10px] text-slate-400">
                {activeNumber ? (activeNumber?.notes || 'Automated Rotation Line Active') : 'Rotation cycle paused until admin adds numbers'}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2 & 3: STRATEGY CONFIGURATION & ADD/EDIT NUMBER POOL */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Anti-Tracking Strategy Engine Configuration (5 cols) */}
        <div className="lg:col-span-5 shining-card border border-blue-950/80 rounded-2xl p-6 space-y-5 shadow-xl text-white">
          <div className="flex items-center gap-2.5 pb-3 border-b border-blue-950/80">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-900 text-white flex items-center justify-center font-bold border border-blue-400/40">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-sm font-extrabold text-white">5-Minute Rotation Strategy Engine</h4>
              <p className="text-[11px] text-slate-300">Anti-tracking daemon timing & daily limits</p>
            </div>
          </div>

          <form onSubmit={handleSaveStrategy} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                Rotation Strategy Mode
              </label>
              <div className="space-y-2">
                <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  strategyMode === 'TIME_BASED'
                    ? 'border-blue-500 bg-blue-950/60 text-white ring-1 ring-blue-400/50'
                    : 'border-blue-950/80 hover:bg-[#070e20] text-slate-300'
                }`}>
                  <input
                    type="radio"
                    name="strategyMode"
                    value="TIME_BASED"
                    checked={strategyMode === 'TIME_BASED'}
                    onChange={() => setStrategyMode('TIME_BASED')}
                    className="mt-1 accent-blue-600"
                  />
                  <div>
                    <span className="text-xs font-black block">⏱️ Fast 5-Minute Auto-Rotation (Recommended)</span>
                    <span className="text-[11px] text-slate-400 leading-tight block mt-0.5">
                      Rotates automatically every 5 minutes (or immediately if daily limit is reached) to distribute cash inflows across SIMs.
                    </span>
                  </div>
                </label>

                <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  strategyMode === 'ROUND_ROBIN'
                    ? 'border-blue-500 bg-blue-950/60 text-white ring-1 ring-blue-400/50'
                    : 'border-blue-950/80 hover:bg-[#070e20] text-slate-300'
                }`}>
                  <input
                    type="radio"
                    name="strategyMode"
                    value="ROUND_ROBIN"
                    checked={strategyMode === 'ROUND_ROBIN'}
                    onChange={() => setStrategyMode('ROUND_ROBIN')}
                    className="mt-1 accent-blue-600"
                  />
                  <div>
                    <span className="text-xs font-bold block">🔀 Per-Depositor Round-Robin</span>
                    <span className="text-[11px] text-slate-400 leading-tight block mt-0.5">
                      Swaps to the next available number in the pool for each new user initiating a deposit transaction.
                    </span>
                  </div>
                </label>

                <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  strategyMode === 'ADMIN_MANUAL'
                    ? 'border-blue-500 bg-blue-950/60 text-white ring-1 ring-blue-400/50'
                    : 'border-blue-950/80 hover:bg-[#070e20] text-slate-300'
                }`}>
                  <input
                    type="radio"
                    name="strategyMode"
                    value="ADMIN_MANUAL"
                    checked={strategyMode === 'ADMIN_MANUAL'}
                    onChange={() => setStrategyMode('ADMIN_MANUAL')}
                    className="mt-1 accent-blue-600"
                  />
                  <div>
                    <span className="text-xs font-bold block">🔒 Admin Manual Lock</span>
                    <span className="text-[11px] text-slate-400 leading-tight block mt-0.5">
                      Keeps the chosen number active until an admin explicitly triggers a manual swap.
                    </span>
                  </div>
                </label>
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Rotation Interval (Minutes)
                </label>
                <span className="text-xs font-black text-blue-400 font-mono bg-blue-950/70 border border-blue-600/40 px-2 py-0.5 rounded">
                  {strategyMinutes} Minutes
                </span>
              </div>

              {/* Quick Interval Preset Buttons */}
              <div className="grid grid-cols-4 gap-1.5 mb-2">
                {[5, 10, 15, 30].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => setStrategyMinutes(mins)}
                    className={`py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer font-mono ${
                      strategyMinutes === mins
                        ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white border-blue-400 shadow-xs font-black'
                        : 'bg-[#050a18] text-slate-300 border-blue-950/80 hover:bg-[#09132e]'
                    }`}
                  >
                    {mins}m
                  </button>
                ))}
              </div>

              <input
                type="range"
                min="1"
                max="60"
                step="1"
                value={strategyMinutes}
                onChange={(e) => setStrategyMinutes(Number(e.target.value))}
                className="w-full accent-blue-600 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-400 font-mono mt-1">
                <span>1 min</span>
                <span className="font-bold text-blue-400">5 min (Fast Cycle)</span>
                <span>60 min</span>
              </div>
            </div>

            <div className="pt-2 border-t border-blue-950/80 flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-slate-200 block">Automatic Rotation Daemon</span>
                <span className="text-[10px] text-slate-400">Cycle through eligible lines automatically</span>
              </div>
              <button
                type="button"
                onClick={() => setAutoRotateEnabled(!autoRotateEnabled)}
                className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
                  autoRotateEnabled ? 'bg-blue-600' : 'bg-slate-700'
                }`}
              >
                <div
                  className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-transform ${
                    autoRotateEnabled ? 'left-7' : 'left-1'
                  }`}
                />
              </button>
            </div>

            <button
              type="submit"
              disabled={isSavingStrategy}
              className="w-full py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-bold text-xs rounded-xl transition-all shadow-md cursor-pointer flex items-center justify-center gap-2 border border-blue-400/40"
            >
              {isSavingStrategy ? (
                <span>Saving Strategy Settings...</span>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Save {strategyMinutes}-Minute Rotation Strategy</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Add / Edit Deposit Line to Pool (7 cols) */}
        <div id="deposit-number-form" className="lg:col-span-7 shining-card border border-blue-950/80 rounded-2xl p-6 space-y-5 shadow-xl text-white">
          <div className="flex items-center justify-between pb-3 border-b border-blue-950/80">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-900 text-white flex items-center justify-center font-bold border border-blue-400/40">
                <PlusCircle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-extrabold text-white">
                  {editingId ? 'Edit Deposit Line' : 'Add New Deposit Line to Pool'}
                </h4>
                <p className="text-[11px] text-slate-300">
                  {editingId ? 'Update receiver info or daily receiving limits' : 'Add an extra Mobile Money number for 5-minute rotation'}
                </p>
              </div>
            </div>

            {editingId && (
              <button
                type="button"
                onClick={resetNumberForm}
                className="px-2.5 py-1 text-xs font-bold text-slate-400 hover:text-white hover:bg-blue-950/50 rounded-lg cursor-pointer transition-all"
              >
                Cancel Edit
              </button>
            )}
          </div>

          <form onSubmit={handleSaveNumber} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Receiver Phone Number
                </label>
                <input
                  type="text"
                  placeholder="e.g. 07XXXXXXXX (MTN / Airtel)"
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#050a18] border border-blue-950/80 rounded-xl text-xs font-bold text-white focus:border-blue-500 focus:outline-none font-mono"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Registered Account Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. FULL REGISTERED NAME"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#050a18] border border-blue-950/80 rounded-xl text-xs font-bold text-white focus:border-blue-500 focus:outline-none uppercase"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Carrier Network
                </label>
                <select
                  value={carrierInput}
                  onChange={(e) => setCarrierInput(e.target.value as any)}
                  className="w-full px-3.5 py-2.5 bg-[#050a18] border border-blue-950/80 rounded-xl text-xs font-bold text-white focus:border-blue-500 focus:outline-none"
                >
                  <option value="MTN">MTN MoMo</option>
                  <option value="AIRTEL">Airtel Money</option>
                  <option value="BOTH">Both / Universal</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Duration (Minutes)
                </label>
                <input
                  type="number"
                  min="1"
                  max="1440"
                  value={durationMinutesInput}
                  onChange={(e) => setDurationMinutesInput(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 bg-[#050a18] border border-blue-950/80 rounded-xl text-xs font-bold text-white focus:border-blue-500 focus:outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                  Daily Limit (UGX)
                </label>
                <input
                  type="number"
                  step="500000"
                  value={dailyLimitInput}
                  onChange={(e) => setDailyLimitInput(Number(e.target.value))}
                  className="w-full px-3.5 py-2.5 bg-[#050a18] border border-blue-950/80 rounded-xl text-xs font-bold text-white focus:border-blue-500 focus:outline-none font-mono"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">
                Internal Agent Notes / Location (Optional)
              </label>
              <input
                type="text"
                placeholder="e.g. Primary Kampala MTN SIM Line 1"
                value={notesInput}
                onChange={(e) => setNotesInput(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-[#050a18] border border-blue-950/80 rounded-xl text-xs text-white focus:border-blue-500 focus:outline-none"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmittingNumber}
              className="w-full py-3 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-black text-xs rounded-xl transition-all shadow-md cursor-pointer flex items-center justify-center gap-2 border border-blue-400/40"
            >
              {isSubmittingNumber ? (
                <span>Saving Line to Pool...</span>
              ) : (
                <>
                  <PlusCircle className="w-4 h-4" />
                  <span>{editingId ? 'Update Deposit Line Details' : 'Add Deposit Line to Active Rotation Pool'}</span>
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      {/* SECTION 4: DEPOSIT RECEIVER NUMBER POOL TABLE & MANAGEMENT */}
      <div className="shining-card border border-blue-950/80 rounded-2xl p-6 space-y-4 shadow-xl text-white">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-blue-950/80">
          <div>
            <h4 className="text-base font-extrabold text-white">
              Active Deposit Number Pool ({numbers.length} Lines)
            </h4>
            <p className="text-xs text-slate-300">
              Manage numbers participating in the 5-minute automated anti-tracking rotation cycle.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-blue-300 font-mono font-bold bg-[#050a18] px-3 py-1.5 rounded-lg border border-blue-950/80">
              {numbers.filter((n) => n.is_active).length} of {numbers.length} Lines Enabled
            </span>
            {numbers.length > 0 && (
              <button
                type="button"
                onClick={handleClearAllNumbers}
                disabled={isLoading}
                className="px-3 py-1.5 bg-rose-950/70 hover:bg-rose-900 border border-rose-700/60 text-rose-300 hover:text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
                title="Remove all numbers from rotation pool"
              >
                <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                <span>Remove All Numbers</span>
              </button>
            )}
          </div>
        </div>

        {numbers.length === 0 ? (
          <div className="p-8 sm:p-12 text-center rounded-2xl border border-dashed border-blue-900/60 bg-[#050c1f]/60 space-y-4">
            <div className="w-14 h-14 rounded-2xl bg-blue-950/80 border border-blue-500/40 flex items-center justify-center mx-auto text-blue-400">
              <Smartphone className="w-7 h-7" />
            </div>
            <div className="space-y-1">
              <h5 className="text-base font-bold text-white">Deposit Rotation Pool is Empty</h5>
              <p className="text-xs text-slate-300 max-w-md mx-auto leading-relaxed">
                All previous deposit numbers have been removed from the rotation pool. Use the form above to add your replacement Mobile Money receiving lines (MTN / Airtel) to restore automatic rotation and customer deposit routing.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                const formEl = document.getElementById('deposit-number-form');
                if (formEl) formEl.scrollIntoView({ behavior: 'smooth' });
              }}
              className="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 text-white rounded-xl text-xs font-bold transition-all inline-flex items-center gap-1.5 shadow-md border border-blue-400/40 cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Add Replacement Line Now</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {numbers.map((num) => {
              const isActiveReceiver = activeNumber?.id === num.id;
              const customMins = customMinutesMap[num.id] || num.rotation_duration_minutes || 5;
              const dailyCap = num.daily_receiving_limit || num.daily_limit_ugx || 5000000;
              const receivedToday = num.amount_received_today || 0;
              const capPercentage = Math.min(100, Math.round((receivedToday / dailyCap) * 100));

              return (
                <div
                  key={num.id}
                  className={`p-4 rounded-xl border transition-all relative flex flex-col justify-between ${
                    isActiveReceiver
                      ? 'border-blue-500 bg-[#09132e] shadow-lg ring-2 ring-blue-400/50'
                      : num.is_active
                      ? 'border-blue-950/80 bg-[#050a18] hover:border-blue-500/40'
                      : 'border-slate-800 bg-[#03060f]/70 opacity-60'
                  }`}
                >
                  {/* Status Badge Tag */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      {isActiveReceiver ? (
                        <span className="bg-blue-600 text-white font-black text-[10px] uppercase px-2 py-0.5 rounded-full flex items-center gap-1 shadow-md">
                          <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                          ACTIVE NOW ({num.rotation_duration_minutes || 5}M)
                        </span>
                      ) : num.is_active ? (
                        <span className="bg-emerald-950/70 text-emerald-300 border border-emerald-500/40 font-bold text-[10px] uppercase px-2 py-0.5 rounded-full">
                          Standby in Pool
                        </span>
                      ) : (
                        <span className="bg-[#09132e] text-slate-400 font-bold text-[10px] uppercase px-2 py-0.5 rounded-full">
                          Paused / Disabled
                        </span>
                      )}

                      <span
                        className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded ${
                          num.carrier === 'MTN'
                            ? 'bg-yellow-400 text-slate-950'
                            : num.carrier === 'AIRTEL'
                            ? 'bg-rose-500 text-white'
                            : 'bg-emerald-600 text-white'
                        }`}
                      >
                        {num.carrier}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleEditSelect(num)}
                        title="Edit Details"
                        className="p-1 text-slate-400 hover:text-white hover:bg-blue-950/50 rounded cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteNumber(num.id, num.phone_number)}
                        title="Remove Number from Pool"
                        className="p-1 text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 rounded cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Phone & Name Info */}
                  <div className="space-y-1 my-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-base font-black text-blue-400 tracking-wide">
                        {num.phone_number}
                      </span>
                      <button
                        onClick={() => copyToClipboard(num.phone_number, num.id)}
                        className="text-[10px] text-slate-300 hover:text-white px-1.5 py-0.5 bg-[#09132e] rounded border border-blue-950/80 flex items-center gap-1 cursor-pointer"
                      >
                        {copiedId === num.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-blue-400" />}
                        <span>{copiedId === num.id ? 'Copied' : 'Copy'}</span>
                      </button>
                    </div>

                    <p className="text-xs font-bold text-white uppercase truncate">
                      {num.account_name}
                    </p>

                    {num.notes && (
                      <p className="text-[10px] text-slate-400 italic truncate">
                        📌 {num.notes}
                      </p>
                    )}
                  </div>

                  {/* Daily Inflow & Capacity Gauge */}
                  <div className="pt-2 border-t border-blue-950/80 space-y-1.5 mb-2">
                    <div className="flex justify-between text-[11px]">
                      <span className="text-slate-400">Today's Inflow:</span>
                      <span className="font-bold font-mono text-white">
                        UGX {receivedToday.toLocaleString()} / {dailyCap.toLocaleString()}
                      </span>
                    </div>

                    <div className="w-full bg-[#0a142e] rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-full ${
                          capPercentage >= 90 ? 'bg-rose-500' : capPercentage >= 60 ? 'bg-blue-500' : 'bg-emerald-500'
                        }`}
                        style={{ width: `${capPercentage}%` }}
                      />
                    </div>
                  </div>

                  {/* Financial Metrics */}
                  <div className="pt-1 text-[10px] text-slate-400 space-y-0.5 mb-3">
                    <div className="flex justify-between">
                      <span>Total Volume Collected:</span>
                      <span className="font-bold text-blue-400 font-mono">
                        UGX {(num.total_received_ugx || 0).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Transaction Count:</span>
                      <span className="font-mono font-bold text-slate-300">{num.total_transactions_count || 0} deposits</span>
                    </div>
                  </div>

                  {/* Action Controls */}
                  <div className="space-y-2 pt-2 border-t border-blue-950/80">
                    {!isActiveReceiver ? (
                      <div className="flex items-center gap-1.5">
                        <select
                          value={customMins}
                          onChange={(e) =>
                            setCustomMinutesMap({ ...customMinutesMap, [num.id]: Number(e.target.value) })
                          }
                          className="px-2 py-1.5 text-xs bg-[#050a18] border border-blue-950/80 rounded-lg font-mono font-bold text-white"
                        >
                          <option value="5">5 Mins</option>
                          <option value="10">10 Mins</option>
                          <option value="15">15 Mins</option>
                          <option value="30">30 Mins</option>
                          <option value="60">1 Hour</option>
                        </select>

                        <button
                          onClick={() => handleActivateSpecificNumber(num.id, customMins)}
                          className="flex-1 py-1.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-black text-xs rounded-lg shadow-xs transition-all flex items-center justify-center gap-1 cursor-pointer border border-blue-400/40"
                        >
                          <Zap className="w-3.5 h-3.5" />
                          <span>Make Active Now</span>
                        </button>
                      </div>
                    ) : (
                      <div className="py-1.5 px-2 bg-blue-950/70 border border-blue-600/40 text-blue-300 text-center font-bold text-xs rounded-lg">
                        ⚡ Currently Active Receiver Line
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-1">
                      <button
                        onClick={() => handleToggleNumberActive(num)}
                        className={`text-[10px] font-bold px-2 py-1 rounded transition-all cursor-pointer ${
                          num.is_active
                            ? 'text-slate-400 hover:text-white hover:bg-blue-950/50'
                            : 'text-emerald-300 bg-emerald-950/70 border border-emerald-500/40 hover:bg-emerald-900/50'
                        }`}
                      >
                        {num.is_active ? '⏸️ Pause Line' : '▶️ Enable Line'}
                      </button>

                      <span className="text-[10px] text-slate-400 font-mono">
                        Cycle: {num.rotation_duration_minutes || 5}m
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SECTION 5: ROTATION AUDIT & HISTORY LOG */}
      <div className="shining-card border border-blue-950/80 rounded-2xl p-6 space-y-4 shadow-xl text-white">
        <div className="flex items-center justify-between pb-3 border-b border-blue-950/80">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-blue-400" />
            <h4 className="text-sm font-extrabold text-white">5-Minute Anti-Tracking Rotation Event History</h4>
          </div>
          <span className="text-[10px] text-slate-400 font-mono">Real-time daemon logs</span>
        </div>

        {rotationHistory.length === 0 ? (
          <div className="text-center py-6 text-slate-400 text-xs">
            No rotation events recorded yet in this session.
          </div>
        ) : (
          <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
            {rotationHistory.slice(0, 15).map((log, idx) => (
              <div
                key={log.id || idx}
                className="p-3 bg-[#050a18] rounded-xl border border-blue-950/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0 shadow-xs shadow-blue-400" />
                  <span className="font-mono font-bold text-white">{log.phone_number || 'Pool'}</span>
                  <span className="text-slate-300 font-medium uppercase truncate">({log.account_name})</span>
                </div>

                <div className="flex items-center gap-3">
                  <span className="bg-blue-950/70 border border-blue-600/40 text-blue-300 font-bold px-2 py-0.5 rounded text-[10px]">
                    {log.reason || 'Automated 5-Minute Rotation Cycle'}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
