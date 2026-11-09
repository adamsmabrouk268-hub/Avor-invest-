import React, { useState, useEffect } from 'react';
import { User, Currency } from '../types';
import {
  Smartphone,
  KeyRound,
  Share2,
  Copy,
  Check,
  Eye,
  EyeOff,
  AlertCircle,
  Sparkles,
  ArrowRight,
  Lock,
} from 'lucide-react';

export interface CountryOption {
  code: string;
  name: string;
  dialCode: string;
  flag: string;
  defaultCurrency: Currency;
  phonePlaceholder: string;
}

export const SUPPORTED_COUNTRIES: CountryOption[] = [
  { code: 'UG', name: 'Uganda', dialCode: '+256', flag: '🇺🇬', defaultCurrency: 'UGX', phonePlaceholder: '700123456' },
  { code: 'KE', name: 'Kenya', dialCode: '+254', flag: '🇰🇪', defaultCurrency: 'KES', phonePlaceholder: '712345678' },
  { code: 'TZ', name: 'Tanzania', dialCode: '+255', flag: '🇹🇿', defaultCurrency: 'USD', phonePlaceholder: '713456789' },
  { code: 'RW', name: 'Rwanda', dialCode: '+250', flag: '🇷🇼', defaultCurrency: 'USD', phonePlaceholder: '788123456' },
  { code: 'NG', name: 'Nigeria', dialCode: '+234', flag: '🇳🇬', defaultCurrency: 'NGN', phonePlaceholder: '8023456789' },
  { code: 'ZA', name: 'South Africa', dialCode: '+27', flag: '🇿🇦', defaultCurrency: 'USD', phonePlaceholder: '712345678' },
  { code: 'GH', name: 'Ghana', dialCode: '+233', flag: '🇬🇭', defaultCurrency: 'USD', phonePlaceholder: '241234567' },
  { code: 'GB', name: 'United Kingdom', dialCode: '+44', flag: '🇬🇧', defaultCurrency: 'USD', phonePlaceholder: '7911123456' },
  { code: 'US', name: 'United States', dialCode: '+1', flag: '🇺🇸', defaultCurrency: 'USD', phonePlaceholder: '2025550199' },
  { code: 'AE', name: 'United Arab Emirates', dialCode: '+971', flag: '🇦🇪', defaultCurrency: 'USD', phonePlaceholder: '501234567' },
  { code: 'ZM', name: 'Zambia', dialCode: '+260', flag: '🇿🇲', defaultCurrency: 'USD', phonePlaceholder: '971234567' },
  { code: 'CM', name: 'Cameroon', dialCode: '+237', flag: '🇨🇲', defaultCurrency: 'USD', phonePlaceholder: '670123456' },
];

interface GatewayRegistrationProps {
  initialReferralCode?: string;
  onSuccess: (user: User, mode?: 'register' | 'login') => void;
  onPreviewMachines?: () => void;
  onCurrencyChange?: (c: Currency) => void;
  isModal?: boolean;
  onClose?: () => void;
}

export const GatewayRegistration: React.FC<GatewayRegistrationProps> = ({
  initialReferralCode = '',
  onSuccess,
  onPreviewMachines,
  onCurrencyChange,
  isModal = false,
  onClose: _onClose,
}) => {
  // Detect if the user already has an account on this device so the Gateway opens directly on "Sign In"
  const getSavedAccountInfo = (): { hasAccount: boolean; savedPhone: string; savedCountry?: CountryOption } => {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      const hasReferralInUrl = Boolean(
        searchParams.get('ref') ||
          searchParams.get('code') ||
          searchParams.get('AvorInvest') ||
          searchParams.get('MachineInvest') ||
          searchParams.get('CreativeAssembly') ||
          window.location.pathname.startsWith('/reg')
      );

      const savedUserStr = localStorage.getItem('avor_invest_user');
      const savedRegStr = localStorage.getItem('avor_invest_registration_data');
      const hasAccountFlag = localStorage.getItem('avor_invest_has_account') === 'true';
      const lastPhone = localStorage.getItem('avor_invest_last_phone') || '';

      let rawPhone = lastPhone;
      let countryName = '';

      if (savedUserStr) {
        const parsed = JSON.parse(savedUserStr);
        if (parsed && (parsed.phone_number || parsed.phoneNumber || parsed.id)) {
          rawPhone = parsed.phone_number || parsed.phoneNumber || rawPhone;
          countryName = parsed.country || '';
        }
      } else if (savedRegStr) {
        const parsedReg = JSON.parse(savedRegStr);
        if (parsedReg && (parsedReg.phoneNumber || parsedReg.phone_number)) {
          rawPhone = parsedReg.phoneNumber || parsedReg.phone_number || rawPhone;
          countryName = parsedReg.country || '';
        }
      }

      const matchedCountry =
        SUPPORTED_COUNTRIES.find((c) => countryName && c.name.toLowerCase() === countryName.toLowerCase()) ||
        SUPPORTED_COUNTRIES.find((c) => rawPhone.startsWith(c.dialCode)) ||
        SUPPORTED_COUNTRIES[0];

      let localPhone = rawPhone;
      if (localPhone.startsWith(matchedCountry.dialCode)) {
        localPhone = localPhone.slice(matchedCountry.dialCode.length);
      }

      const hasExistingAccount = Boolean(savedUserStr || savedRegStr || hasAccountFlag || rawPhone);
      return {
        hasAccount: hasExistingAccount && !hasReferralInUrl,
        savedPhone: localPhone,
        savedCountry: matchedCountry,
      };
    } catch {
      return { hasAccount: false, savedPhone: '' };
    }
  };

  const initialAccountInfo = getSavedAccountInfo();

  const [activeTab, setActiveTab] = useState<'register' | 'login'>(
    initialAccountInfo.hasAccount ? 'login' : 'register'
  );

  // Simplified Gateway Form Fields with Password Confirmation
  const [selectedCountry, setSelectedCountry] = useState<CountryOption>(
    initialAccountInfo.savedCountry || SUPPORTED_COUNTRIES[0]
  );
  const [phone, setPhone] = useState<string>(initialAccountInfo.savedPhone || '');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [referralCode, setReferralCode] = useState<string>(initialReferralCode || '2B1D9846');

  // UI state
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [hasInviteFromUrl, setHasInviteFromUrl] = useState<boolean>(Boolean(initialReferralCode));

  // Check URL query parameters for referral code
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const codeFromUrl =
      searchParams.get('ref') ||
      searchParams.get('code') ||
      searchParams.get('AvorInvest') ||
      searchParams.get('MachineInvest') ||
      searchParams.get('CreativeAssembly') ||
      initialReferralCode;
    if (codeFromUrl) {
      setReferralCode(codeFromUrl);
      setHasInviteFromUrl(true);
      setActiveTab('register');
    }
  }, [initialReferralCode]);

  const handleCopyCode = () => {
    if (!referralCode) return;
    try {
      navigator.clipboard.writeText(referralCode);
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    } catch (e) {
      // fallback
    }
  };

  const handleCountryChange = (countryCode: string) => {
    const found = SUPPORTED_COUNTRIES.find((c) => c.code === countryCode);
    if (found) {
      setSelectedCountry(found);
      if (onCurrencyChange) {
        onCurrencyChange(found.defaultCurrency);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // 1. Phone validation & cross-device normalization
    const cleanDigits = phone.replace(/\D/g, '');
    if (!cleanDigits || cleanDigits.length < 6) {
      setError('Please enter a valid mobile phone number.');
      return;
    }

    const dialDigits = selectedCountry.dialCode.replace(/\D/g, '');
    let normalizedLocal = cleanDigits;
    if (normalizedLocal.startsWith(dialDigits) && normalizedLocal.length > 9) {
      normalizedLocal = normalizedLocal.slice(dialDigits.length);
    }
    if (normalizedLocal.startsWith('0') && normalizedLocal.length >= 10) {
      normalizedLocal = normalizedLocal.slice(1);
    }

    const fullPhoneNumber = `${selectedCountry.dialCode}${normalizedLocal}`;

    // 2. Password & Confirmation validation
    if (activeTab === 'register') {
      if (password.length < 4) {
        setError('Password must be at least 4 characters long.');
        return;
      }
      if (!confirmPassword) {
        setError('Please confirm your password.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Passwords do not match. Please check your password confirmation.');
        return;
      }
    } else {
      if (!password) {
        setError('Please enter your password.');
        return;
      }
    }

    setIsLoading(true);

    try {
      if (activeTab === 'register') {
        const res = await fetch('/api/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phoneNumber: fullPhoneNumber,
            phone_number: fullPhoneNumber,
            password,
            age: 21,
            country: selectedCountry.name,
            country_code: selectedCountry.code,
            referral_code: referralCode.trim() || undefined,
            name: `Investor ${cleanDigits.slice(-4)}`,
            email: `${cleanDigits}@avorinvest.com`,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Gateway registration failed.');
        }

        if (onCurrencyChange) {
          onCurrencyChange(selectedCountry.defaultCurrency);
        }

        const userObj = data.user || data;
        try {
          localStorage.setItem('avor_invest_user', JSON.stringify(userObj));
          localStorage.setItem('avor_invest_has_account', 'true');
          localStorage.setItem('avor_invest_last_phone', userObj.phone_number || fullPhoneNumber);
          if (data.saved_registration_data || data.registration_data) {
            localStorage.setItem(
              'avor_invest_registration_data',
              JSON.stringify(data.saved_registration_data || data.registration_data)
            );
          }
        } catch (e) {}

        onSuccess(userObj, 'register');
      } else {
        const res = await fetch('/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone_number: fullPhoneNumber,
            phoneNumber: fullPhoneNumber,
            password,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Invalid phone number or password.');
        }

        if (data.country) {
          const matchCountry = SUPPORTED_COUNTRIES.find((c) => c.name === data.country);
          if (matchCountry && onCurrencyChange) {
            onCurrencyChange(matchCountry.defaultCurrency);
          }
        }

        const userObj = data.user || data;
        try {
          localStorage.setItem('avor_invest_user', JSON.stringify(userObj));
          localStorage.setItem('avor_invest_has_account', 'true');
          localStorage.setItem('avor_invest_last_phone', userObj.phone_number || fullPhoneNumber);
        } catch (e) {}

        onSuccess(userObj, 'login');
      }
    } catch (err: any) {
      setError(err.message || 'Connection failed. Please check network connectivity.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`w-full ${isModal ? 'max-w-md mx-auto' : 'max-w-md sm:max-w-lg mx-auto my-3 sm:my-6 px-3 sm:px-4'}`}>
      {/* Outer Luxury Deep Blue Glass Card */}
      <div className="relative rounded-3xl bg-gradient-to-b from-[#05112e] via-[#030a1c] to-[#01040f] border border-blue-900/60 shadow-[0_25px_80px_rgba(2,8,28,0.95),0_0_40px_rgba(37,99,235,0.18)] overflow-hidden text-white pt-8 pb-7 px-6 sm:px-8 select-none backdrop-blur-2xl">
        {/* Subtle Curved Electric Blue & Cyan Particle Arc at bottom */}
        <div className="absolute inset-x-0 bottom-0 h-56 pointer-events-none overflow-hidden z-0 opacity-85">
          <svg
            className="w-full h-full object-cover"
            viewBox="0 0 500 280"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <radialGradient id="blueRadialGlow" cx="50%" cy="100%" r="70%">
                <stop offset="0%" stopColor="#00f0ff" stopOpacity="0.45" />
                <stop offset="45%" stopColor="#1d4ed8" stopOpacity="0.22" />
                <stop offset="85%" stopColor="#01040f" stopOpacity="0" />
              </radialGradient>
            </defs>

            <rect x="0" y="0" width="500" height="280" fill="url(#blueRadialGlow)" />

            {[
              { yOffset: 140, count: 32, r: 2.2, op: 0.85, color: '#00f0ff' },
              { yOffset: 170, count: 36, r: 2.5, op: 0.7, color: '#38bdf8' },
              { yOffset: 200, count: 40, r: 2.8, op: 0.55, color: '#3b82f6' },
              { yOffset: 230, count: 42, r: 3.0, op: 0.4, color: '#1d4ed8' },
            ].map((row, rowIdx) => {
              const dots = [];
              for (let i = 0; i < row.count; i++) {
                const frac = i / (row.count - 1);
                const x = 500 * frac;
                const curveHeight = 65 - rowIdx * 8;
                const curve = Math.sin(frac * Math.PI) * curveHeight;
                const y = row.yOffset + 45 - curve;
                dots.push(
                  <circle
                    key={`${rowIdx}-${i}`}
                    cx={x}
                    cy={y}
                    r={row.r * (0.8 + 0.4 * Math.sin(i * 0.7))}
                    fill={row.color}
                    opacity={row.op * (0.6 + 0.4 * Math.sin(frac * Math.PI))}
                  />
                );
              }
              return <g key={rowIdx}>{dots}</g>;
            })}
          </svg>
        </div>

        {/* Foreground Form Content */}
        <div className="relative z-10 flex flex-col items-center">
          {/* 1. Header: AVOR Brand & Simplified Gateway Title */}
          <div className="text-center mb-4 sm:mb-5">
            <h2 className="text-xs sm:text-sm font-serif font-bold tracking-[0.4em] text-cyan-400 uppercase mb-1 drop-shadow-[0_0_12px_rgba(0,240,255,0.45)]">
              AVOR INVEST
            </h2>
            <span className="text-[11px] font-mono text-sky-300/90 font-semibold block mb-1">
              Quick Gateway • avorinvest.com
            </span>
            <h1 className="text-3xl sm:text-4xl font-serif font-bold text-white tracking-tight leading-tight">
              {activeTab === 'register' ? 'Create Account' : 'Welcome Back'}
            </h1>
            <p className="text-xs text-slate-300 mt-1">
              {activeTab === 'register'
                ? 'Enter your phone number and password to start (3,000 UGX eligible for customers)'
                : 'Enter your phone number and password to access your account'}
            </p>
          </div>

          {/* Official Invitation Banner when accessed via Shared Invite Link */}
          {hasInviteFromUrl && (
            <div className="w-full mb-4 bg-gradient-to-r from-blue-950/90 via-[#071a3e] to-cyan-950/80 border border-cyan-400/50 rounded-2xl p-3 text-left space-y-1 shadow-lg">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-black uppercase tracking-wider text-cyan-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Official Invite Access</span>
                </span>
                <span className="px-2 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-[10px] font-mono font-bold">
                  Code: {referralCode}
                </span>
              </div>
              <p className="text-[11px] text-slate-200 leading-snug">
                Register below with your phone number &amp; password (<strong className="text-emerald-400">3,000 UGX</strong> eligible for customers).
              </p>
            </div>
          )}

          {/* Quick Tab Switcher: Register / Sign In */}
          <div className="flex items-center gap-2 mb-5 w-full bg-[#040b1e]/90 p-1 rounded-2xl border border-blue-900/70 text-xs">
            <button
              type="button"
              onClick={() => {
                setActiveTab('register');
                setError(null);
              }}
              className={`flex-1 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer ${
                activeTab === 'register'
                  ? 'bg-[#0091ea] text-white shadow-md shadow-[#0091ea]/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Register
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('login');
                setError(null);
              }}
              className={`flex-1 py-2.5 rounded-xl font-bold text-xs sm:text-sm transition-all cursor-pointer ${
                activeTab === 'login'
                  ? 'bg-[#0091ea] text-white shadow-md shadow-[#0091ea]/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Sign In
            </button>
          </div>

          {/* Error Notice */}
          {error && (
            <div className="w-full mb-4 bg-rose-950/85 border border-rose-500/60 text-rose-300 text-xs px-3.5 py-2.5 rounded-xl flex items-center gap-2 animate-shake">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Simplified Registration / Login Form (Phone + Password + Optional Invite Code) */}
          <form onSubmit={handleSubmit} className="w-full space-y-3.5">
            {/* Field 1: Phone Number */}
            <div className="w-full">
              <label className="text-[11px] font-bold text-slate-300 block mb-1 pl-1">
                Mobile Phone Number
              </label>
              <div className="relative flex items-center bg-[#030919] border border-blue-900/80 hover:border-blue-500/80 focus-within:border-cyan-400 focus-within:ring-1 focus-within:ring-cyan-400/40 rounded-2xl px-4 py-3 sm:py-3.5 transition-all shadow-inner">
                <Smartphone className="w-5 h-5 text-cyan-400 shrink-0 mr-2.5 stroke-[1.6]" />

                <select
                  value={selectedCountry.code}
                  onChange={(e) => handleCountryChange(e.target.value)}
                  className="bg-transparent text-cyan-200 text-xs font-mono font-bold pr-2 mr-2 border-r border-blue-900 outline-none cursor-pointer"
                  title="Select Country Dial Code"
                >
                  {SUPPORTED_COUNTRIES.map((c) => (
                    <option key={c.code} value={c.code} className="bg-[#040d24] text-white">
                      {c.flag} {c.dialCode}
                    </option>
                  ))}
                </select>

                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder={selectedCountry.phonePlaceholder || '700123456'}
                  className="w-full bg-transparent text-white placeholder-slate-500 text-sm sm:text-base outline-none font-mono"
                  required
                />
              </div>
            </div>

            {/* Field 2: Password */}
            <div className="w-full">
              <label className="text-[11px] font-bold text-slate-300 block mb-1 pl-1">
                {activeTab === 'register' ? 'Password (4+ characters)' : 'Password'}
              </label>
              <div className="relative flex items-center bg-[#030919] border border-blue-900/80 hover:border-blue-500/80 focus-within:border-cyan-400 focus-within:ring-1 focus-within:ring-cyan-400/40 rounded-2xl px-4 py-3 sm:py-3.5 transition-all shadow-inner">
                <KeyRound className="w-5 h-5 text-cyan-400 shrink-0 mr-3 stroke-[1.6]" />

                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={activeTab === 'register' ? 'Create your password' : 'Enter your password'}
                  className="w-full bg-transparent text-white placeholder-slate-500 text-sm sm:text-base outline-none font-sans pr-8"
                  required
                />

                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 text-slate-400 hover:text-white cursor-pointer"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Field 2b: Confirm Password (Only in Register mode) */}
            {activeTab === 'register' && (
              <div className="w-full animate-fade-in">
                <div className="flex items-center justify-between mb-1 pl-1 pr-1">
                  <label className="text-[11px] font-bold text-slate-300">
                    Confirm Password
                  </label>
                  {confirmPassword.length > 0 && (
                    <span
                      className={`text-[10px] font-mono font-bold flex items-center gap-1 ${
                        password === confirmPassword ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      {password === confirmPassword ? (
                        <>
                          <Check className="w-3 h-3" />
                          <span>Confirmed</span>
                        </>
                      ) : (
                        <span>Passwords do not match</span>
                      )}
                    </span>
                  )}
                </div>
                <div
                  className={`relative flex items-center bg-[#030919] border ${
                    confirmPassword.length > 0
                      ? password === confirmPassword
                        ? 'border-emerald-500/70 focus-within:border-emerald-400'
                        : 'border-rose-500/70 focus-within:border-rose-400'
                      : 'border-blue-900/80 hover:border-blue-500/80 focus-within:border-cyan-400'
                  } focus-within:ring-1 focus-within:ring-cyan-400/40 rounded-2xl px-4 py-3 sm:py-3.5 transition-all shadow-inner`}
                >
                  <KeyRound className="w-5 h-5 text-cyan-400 shrink-0 mr-3 stroke-[1.6]" />

                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm your password"
                    className="w-full bg-transparent text-white placeholder-slate-500 text-sm sm:text-base outline-none font-sans pr-8"
                    required
                  />

                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-4 text-slate-400 hover:text-white cursor-pointer"
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {/* Field 3: Optional Referral / Invite Code (Only in Register mode) */}
            {activeTab === 'register' && (
              <div className="w-full animate-fade-in">
                <label className="text-[11px] font-bold text-slate-300 block mb-1 pl-1">
                  Invite / Referral Code <span className="text-slate-500 font-normal">(Optional)</span>
                </label>
                <div className="relative flex items-center justify-between bg-[#030919] border border-blue-900/80 hover:border-blue-500/80 focus-within:border-cyan-400 focus-within:ring-1 focus-within:ring-cyan-400/40 rounded-2xl px-4 py-2.5 sm:py-3 transition-all shadow-inner">
                  <Share2 className="w-4 h-4 text-cyan-400 shrink-0 mr-3 stroke-[1.6]" />

                  <input
                    type="text"
                    value={referralCode}
                    onChange={(e) => setReferralCode(e.target.value)}
                    placeholder="Referral Code (Optional)"
                    className="w-full bg-transparent text-white placeholder-slate-500 text-sm outline-none font-mono"
                  />

                  <button
                    type="button"
                    onClick={handleCopyCode}
                    title="Copy Referral Code"
                    className="bg-[#081533] hover:bg-[#0c1f4a] text-cyan-300 border border-blue-800/80 px-2 py-1 rounded-lg text-xs font-mono font-bold flex items-center gap-1 cursor-pointer transition-all shrink-0"
                  >
                    {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-cyan-400" />}
                    <span className="text-[10px] hidden sm:inline">{copiedCode ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3.5 sm:py-4 bg-gradient-to-r from-[#0091ea] to-[#00b4d8] hover:brightness-110 text-white font-bold text-base sm:text-lg tracking-wide rounded-2xl shadow-[0_0_25px_rgba(0,145,234,0.4)] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 active:scale-[0.99]"
              >
                {isLoading ? (
                  <div className="flex items-center gap-2 text-base font-sans text-white">
                    <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>Connecting...</span>
                  </div>
                ) : activeTab === 'register' ? (
                  <span>Register &amp; Enter Avor Invest</span>
                ) : (
                  <span>Sign In to Avor Invest</span>
                )}
              </button>
            </div>
          </form>

          {/* Platform Security Note */}
          <div className="mt-5 text-center text-xs text-slate-300 font-sans flex items-center justify-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>
              Official <strong className="text-cyan-300 font-semibold">Avor invest</strong> Compute Leasing Gateway
            </span>
          </div>

          {/* Preview Machines without logging in */}
          {onPreviewMachines && (
            <div className="mt-4 pt-4 border-t border-blue-950/80 w-full text-center">
              <button
                type="button"
                onClick={onPreviewMachines}
                className="text-xs text-slate-400 hover:text-cyan-300 transition-all inline-flex items-center gap-1.5 cursor-pointer"
              >
                <span>Preview Computing Machines First</span>
                <ArrowRight className="w-3.5 h-3.5 text-cyan-400" />
              </button>
            </div>
          )}

          {/* Secure System Notice */}
          <div className="mt-4 pt-3 border-t border-blue-950/60 w-full flex items-center justify-center gap-1.5 text-[11px] text-slate-500 font-mono">
            <Lock className="w-3 h-3 text-slate-500" />
            <span>© 2023 Avor invest • Encrypted Member Portal</span>
          </div>
        </div>
      </div>
    </div>
  );
};
