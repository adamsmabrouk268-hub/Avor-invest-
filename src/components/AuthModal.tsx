import React from 'react';
import { User, Currency } from '../types';
import { GatewayRegistration } from './GatewayRegistration';
import { X } from 'lucide-react';

interface AuthModalProps {
  initialReferralCode?: string;
  onClose: () => void;
  onLoginSuccess: (user: User) => void;
  onCurrencyChange?: (c: Currency) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  initialReferralCode = '',
  onClose,
  onLoginSuccess,
  onCurrencyChange,
}) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-lg my-auto py-2">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 sm:top-6 sm:right-6 z-30 p-2 text-slate-400 hover:text-white bg-[#03091e]/90 hover:bg-[#07133d] border border-blue-900/80 hover:border-cyan-400/60 rounded-full transition-all cursor-pointer shadow-xl"
          title="Close Gateway"
        >
          <X className="w-4 h-4 text-cyan-400" />
        </button>
        <GatewayRegistration
          initialReferralCode={initialReferralCode}
          onSuccess={onLoginSuccess}
          onCurrencyChange={onCurrencyChange}
          isModal={true}
          onClose={onClose}
        />
      </div>
    </div>
  );
};
