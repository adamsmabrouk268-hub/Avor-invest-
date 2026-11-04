import React from 'react';
import { User, Currency } from '../types';
import { LogOut, PlusCircle, ArrowUpRight, Zap, User as UserIcon, Cpu, Home, TrendingUp } from 'lucide-react';
import { WhatsAppIcon } from './WhatsAppIcon';

interface NavbarProps {
  user: User | null;
  currency: Currency;
  onCurrencyChange: (c: Currency) => void;
  activeTab: 'home' | 'marketplace' | 'profile' | 'account' | 'admin' | string;
  onTabChange: (tab: 'home' | 'marketplace' | 'profile' | 'admin') => void;
  onOpenAuth: () => void;
  onLogout: () => void;
  onOpenWallet: (type: 'deposit' | 'withdraw') => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  user,
  currency,
  onCurrencyChange,
  activeTab,
  onTabChange,
  onOpenAuth,
  onLogout,
  onOpenWallet,
}) => {
  return (
    <nav className="bg-[#030714]/85 border-b border-blue-900/40 px-4 sm:px-8 py-3.5 sticky top-0 z-40 text-slate-100 backdrop-blur-xl shadow-2xl shadow-black/80">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
        {/* Brand Logo & Name */}
        <div
          className="logo-container flex items-center gap-3 cursor-pointer group"
          onClick={() => onTabChange('home')}
        >
          <div className="w-10 h-10 bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 group-hover:from-blue-500 group-hover:to-blue-700 flex items-center justify-center rounded-xl shadow-lg shadow-blue-500/30 border border-blue-400/40 transition-all shrink-0 text-white font-black">
            <Zap className="w-5 h-5 fill-white text-white" />
          </div>
          <div className="flex flex-col">
            <span className="brand-name text-xl font-black tracking-wider text-white leading-none">
              Avor invest
            </span>
            <span className="text-[10px] font-bold text-sky-400 uppercase tracking-wider mt-0.5 font-mono">
              Official Platform
            </span>
          </div>
        </div>

        {/* Center Navigation Links (Desktop) */}
        <div className="hidden md:flex items-center gap-1.5 bg-[#08122a]/80 p-1 rounded-xl border border-blue-900/50">
          <button
            onClick={() => onTabChange('home')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'home'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/40'
                : 'text-slate-300 hover:text-white hover:bg-blue-950/60'
            }`}
          >
            <Home className="w-3.5 h-3.5" />
            <span>Home</span>
          </button>

          <button
            onClick={() => onTabChange('marketplace')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'marketplace'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/40'
                : 'text-slate-300 hover:text-white hover:bg-blue-950/60'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Machine Plane</span>
          </button>

          <button
            onClick={() => {
              if (!user) onOpenAuth();
              else onTabChange('income' as any);
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'income'
                ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-md shadow-blue-600/40'
                : 'text-slate-300 hover:text-white hover:bg-blue-950/60'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5 text-blue-400" />
            <span>Income Plane</span>
          </button>

          <button
            onClick={() => onTabChange('profile' as any)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'profile' || activeTab === 'account'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/40'
                : 'text-slate-300 hover:text-white hover:bg-blue-950/60'
            }`}
          >
            <UserIcon className="w-3.5 h-3.5" />
            <span>Profile</span>
          </button>
        </div>

        {/* Right Section: WhatsApp Link, Currency & User Controls */}
        <div className="flex items-center gap-2">
          {/* Floating / Top WhatsApp Support Icon */}
          <a
            href="https://wa.me/256741032838?text=Hello%20Avor%20Invest%20Support"
            target="_blank"
            rel="noopener noreferrer"
            className="whatsapp-btn"
            title="Contact Support (0741032838)"
          >
            <i className="fa-brands fa-whatsapp text-white text-xl"></i>
          </a>

          {/* Currency Dropdown */}
          <select
            value={currency}
            onChange={(e) => onCurrencyChange(e.target.value as Currency)}
            className="bg-[#091533] text-slate-100 font-mono text-xs font-bold py-1.5 px-2.5 border border-blue-900/60 rounded-lg outline-none cursor-pointer focus:border-blue-400 shadow-md"
          >
            <option value="UGX">UGX (Shilling)</option>
            <option value="USD">USD ($)</option>
            <option value="KES">KES (KSh)</option>
            <option value="NGN">NGN (₦)</option>
          </select>

          {/* User Controls */}
          {user ? (
            <div className="flex items-center gap-2 bg-[#08122a]/90 px-2 py-1.5 rounded-xl border border-blue-900/50 shadow-md">
              {/* Deposit Quick Action */}
              <button
                onClick={() => onOpenWallet('deposit')}
                className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1 cursor-pointer shadow-xs border border-blue-400/30"
                title="Deposit Funds"
              >
                <PlusCircle className="w-3.5 h-3.5 text-white" />
                <span className="hidden sm:inline">Deposit</span>
              </button>

              {/* Withdraw Quick Action */}
              <button
                onClick={() => onOpenWallet('withdraw')}
                className="px-2.5 py-1 bg-[#091533] hover:bg-[#102354] text-slate-200 border border-blue-900/60 text-xs font-bold rounded-lg transition-all flex items-center gap-1 cursor-pointer shadow-xs"
                title="Cashout Funds (Min 3k)"
              >
                <ArrowUpRight className="w-3.5 h-3.5 text-blue-600" />
                <span className="hidden sm:inline">Cashout</span>
              </button>

              {/* Route to Profile */}
              <button
                onClick={() => onTabChange('profile' as any)}
                className="px-2.5 py-1 text-xs font-bold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                title="View Profile, Balance & Invites"
              >
                <UserIcon className="w-3.5 h-3.5 text-blue-600" />
                <span className="hidden md:inline">Profile</span>
              </button>

              <button
                onClick={onLogout}
                title="Log out"
                className="p-1 text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 rounded transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              onClick={onOpenAuth}
              className="px-3 py-1.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 text-white text-xs font-bold rounded-xl shadow-md cursor-pointer border border-blue-400/30"
            >
              Gateway Login
            </button>
          )}
        </div>
      </div>
    </nav>
  );
};
