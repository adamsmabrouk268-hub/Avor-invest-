import React from 'react';
import { Home, Cpu, User as UserIcon, TrendingUp, Lock } from 'lucide-react';
import { User } from '../types';

interface BottomNavProps {
  activeTab: 'home' | 'marketplace' | 'income' | 'profile' | 'admin' | string;
  onTabChange: (tab: 'home' | 'marketplace' | 'income' | 'profile' | 'admin') => void;
  user: User | null;
  hasBoughtMachine?: boolean;
  onOpenAuth: () => void;
  onOpenWallet?: (type: 'deposit' | 'withdraw') => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onTabChange,
  user,
  hasBoughtMachine = false,
  onOpenAuth,
}) => {
  const isProfileActive = activeTab === 'profile' || activeTab === 'account' || activeTab === 'referrals';

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#020e18]/95 backdrop-blur-xl border-t border-[#00d2c4]/30 px-3 py-2 text-[#7ba3b0] shadow-2xl">
      <div className="max-w-md mx-auto flex items-center justify-between gap-2">
        {/* 1. Home Tab */}
        <button
          onClick={() => onTabChange('home')}
          className={`flex-1 flex flex-col items-center justify-center py-2 px-1 rounded-xl transition-all cursor-pointer ${
            activeTab === 'home'
              ? 'text-white font-black bg-gradient-to-r from-[#0091ea] to-[#0077b6] shadow-[0_0_18px_rgba(0,145,234,0.65),0_0_10px_rgba(163,230,53,0.3)] border border-[#a3e635]'
              : 'text-[#7ba3b0] hover:text-[#e0f7fa]'
          }`}
        >
          <Home className={`w-5 h-5 ${activeTab === 'home' ? 'text-white stroke-[2.5]' : ''}`} />
          <span className="text-[11px] mt-0.5 tracking-tight font-semibold flex items-center gap-1">
            <span>Home</span>
            {activeTab === 'home' && <span className="w-1.5 h-1.5 rounded-full bg-[#a3e635] shadow-[0_0_6px_#a3e635]" />}
          </span>
        </button>

        {/* 2. Machine Plane Tab */}
        <button
          onClick={() => onTabChange('marketplace')}
          className={`flex-1 flex flex-col items-center justify-center py-2 px-1 rounded-xl transition-all cursor-pointer ${
            activeTab === 'marketplace'
              ? 'text-white font-black bg-gradient-to-r from-[#0091ea] to-[#0077b6] shadow-[0_0_18px_rgba(0,145,234,0.65),0_0_10px_rgba(163,230,53,0.3)] border border-[#a3e635]'
              : 'text-[#7ba3b0] hover:text-[#e0f7fa]'
          }`}
        >
          <Cpu className={`w-5 h-5 ${activeTab === 'marketplace' ? 'text-white stroke-[2.5]' : ''}`} />
          <span className="text-[11px] mt-0.5 tracking-tight font-semibold flex items-center gap-1">
            <span>Machine Plane</span>
            {activeTab === 'marketplace' && <span className="w-1.5 h-1.5 rounded-full bg-[#a3e635] shadow-[0_0_6px_#a3e635]" />}
          </span>
        </button>

        {/* 3. Income Plane Tab */}
        <button
          onClick={() => {
            if (!user) {
              onOpenAuth();
            } else {
              onTabChange('income' as any);
            }
          }}
          className={`flex-1 flex flex-col items-center justify-center py-2 px-1 rounded-xl transition-all cursor-pointer relative ${
            activeTab === 'income'
              ? 'text-white font-black bg-gradient-to-r from-[#0091ea] to-[#0077b6] shadow-[0_0_18px_rgba(0,145,234,0.65),0_0_10px_rgba(163,230,53,0.3)] border border-[#a3e635]'
              : 'text-[#7ba3b0] hover:text-[#e0f7fa]'
          }`}
        >
          <TrendingUp className={`w-5 h-5 ${activeTab === 'income' ? 'text-white stroke-[2.5]' : 'text-[#00d2c4]'}`} />
          <span className="text-[11px] mt-0.5 tracking-tight font-semibold flex items-center gap-1">
            <span>Income Plane</span>
            {!hasBoughtMachine && <Lock className="w-3 h-3 text-amber-400" />}
            {activeTab === 'income' && <span className="w-1.5 h-1.5 rounded-full bg-[#a3e635] shadow-[0_0_6px_#a3e635]" />}
          </span>
        </button>

        {/* 4. User Profile / Account Tab */}
        <button
          onClick={() => onTabChange('profile')}
          className={`flex-1 flex flex-col items-center justify-center py-2 px-1 rounded-xl transition-all cursor-pointer ${
            isProfileActive
              ? 'text-white font-black bg-gradient-to-r from-[#0091ea] to-[#0077b6] shadow-[0_0_18px_rgba(0,145,234,0.65),0_0_10px_rgba(163,230,53,0.3)] border border-[#a3e635]'
              : 'text-[#7ba3b0] hover:text-[#e0f7fa]'
          }`}
        >
          <UserIcon className={`w-5 h-5 ${isProfileActive ? 'text-white stroke-[2.5]' : ''}`} />
          <span className="text-[11px] mt-0.5 tracking-tight font-semibold flex items-center gap-1">
            <span>Profile</span>
            {isProfileActive && <span className="w-1.5 h-1.5 rounded-full bg-[#a3e635] shadow-[0_0_6px_#a3e635]" />}
          </span>
        </button>
      </div>
    </div>
  );
};
