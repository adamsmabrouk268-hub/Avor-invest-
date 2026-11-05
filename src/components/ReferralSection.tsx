import React, { useState } from 'react';
import { User, Currency } from '../types';
import { Copy, Check, Gift, Sparkles, ArrowRight } from 'lucide-react';
import { WhatsAppIcon } from './WhatsAppIcon';
import { getShareableInviteLink, getShareableInviteMessage } from '../utils/inviteLink';

interface ReferralSectionProps {
  user: User | null;
  currency: Currency;
  onOpenAuth: () => void;
  hasBoughtMachine?: boolean;
  onNavigateToMarketplace?: () => void;
}

export const ReferralSection: React.FC<ReferralSectionProps> = ({
  user,
  currency: _currency,
  onOpenAuth,
  hasBoughtMachine: _hasBoughtMachine = false,
}) => {
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState<boolean>(false);

  const referralCode = user?.referral_code || 'AVOR-7789';
  const referralLink = getShareableInviteLink(referralCode);
  const fullInviteMessage = getShareableInviteMessage(referralCode);

  const handleCopyLink = () => {
    navigator.clipboard.writeText(referralLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(referralCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  const whatsappShareUrl = `https://wa.me/?text=${encodeURIComponent(fullInviteMessage)}`;

  return (
    <div className="shining-card rounded-2xl p-6 sm:p-8 space-y-8 animate-fade-in max-w-5xl mx-auto text-white shadow-2xl border border-blue-950/80">
      {/* Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-blue-950/80">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-900 text-white flex items-center justify-center font-black shadow-lg border border-blue-400/40">
            <Gift className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-black tracking-tight text-white">
              Avor Invest (avorinvest.com) Invite Program
            </h2>
            <p className="text-xs text-slate-300">
              Share your official Avor Invest link and earn 8% team machine commission + UGX 3,000 welcome rewards.
            </p>
          </div>
        </div>

        <a
          href={whatsappShareUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center gap-2 cursor-pointer shadow-md transition-all shrink-0"
        >
          <WhatsAppIcon className="w-4 h-4 fill-white text-white" />
          <span>Share on WhatsApp</span>
        </a>
      </div>

      {/* Rewards Highlight Banner */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Registration Reward Box */}
        <div className="bg-[#050a18] border border-blue-950/80 p-5 rounded-xl space-y-2 relative overflow-hidden shadow-inner">
          <div className="inline-flex items-center gap-1.5 bg-blue-950/70 border border-blue-600/40 text-blue-300 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full font-mono uppercase">
            <Sparkles className="w-3 h-3 text-blue-400" />
            <span>Automatic Welcome Bonus</span>
          </div>
          <h3 className="text-2xl font-black text-white font-mono">
            UGX 3,000 <span className="text-xs font-normal text-blue-400">Free Bonus</span>
          </h3>
          <p className="text-xs text-slate-300 leading-relaxed">
            Every new member invited via your Avor Invest link receives an automatic UGX 3,000 registration reward credited straight to their account upon registration.
          </p>
        </div>

        {/* Invite Gift Reward Box */}
        <div className="bg-[#050a18] border border-blue-950/80 p-5 rounded-xl space-y-2 relative overflow-hidden shadow-inner">
          <div className="inline-flex items-center gap-1.5 bg-sky-950/70 border border-sky-600/40 text-sky-300 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full font-mono uppercase">
            <Gift className="w-3 h-3 text-sky-400" />
            <span>Invitation Bonus & Team Income</span>
          </div>
          <h3 className="text-2xl font-black text-sky-400 font-mono">
            8% <span className="text-xs font-normal text-slate-400">Same-Machine Bonus</span>
          </h3>
          <p className="text-xs text-slate-300 leading-relaxed">
            Earn an 8% invitation bonus / team income when an invited customer buys the same machine as you, credited to your balance when their machine cycle ends.
          </p>
        </div>
      </div>

      {/* Share Links & Invite Code Box */}
      <div className="bg-[#060c1d] border border-blue-950/80 p-6 rounded-xl space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <span className="text-[10px] text-blue-400 font-bold uppercase tracking-wider block">
              Your Avor Invest Invitation Code
            </span>
            <div className="flex items-center gap-3 mt-1.5">
              <code className="text-2xl font-black font-mono text-white bg-[#03060f] px-4 py-1.5 rounded-xl border border-blue-950/80 select-all">
                {referralCode}
              </code>
              <button
                type="button"
                onClick={handleCopyCode}
                className="px-3 py-2 bg-[#09132e] hover:bg-[#0f2150] text-blue-300 text-xs font-bold rounded-xl border border-blue-900/50 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                {copiedCode ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4 text-blue-400" />}
                <span>{copiedCode ? 'Copied Code' : 'Copy Code'}</span>
              </button>
            </div>
          </div>

          <div className="flex-1 max-w-lg">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
              Direct Avor Invest Access Link (avorinvest.com)
            </span>
            <div className="flex items-center gap-2 mt-1.5">
              <input
                type="text"
                readOnly
                value={referralLink}
                onClick={(e) => (e.target as HTMLInputElement).select()}
                className="w-full px-3 py-2 bg-[#03060f] border border-blue-950/80 rounded-xl text-xs text-white font-mono outline-none truncate select-all"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                className="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-black text-xs rounded-xl shadow-md transition-all shrink-0 flex items-center gap-1.5 cursor-pointer border border-blue-400/40"
              >
                {copiedLink ? <Check className="w-4 h-4 text-white" /> : <Copy className="w-4 h-4 text-white" />}
                <span>{copiedLink ? 'Copied Link' : 'Copy Link'}</span>
              </button>
            </div>
          </div>
        </div>

        {!user && (
          <div className="pt-3 border-t border-blue-950/80 flex items-center justify-between">
            <span className="text-xs text-slate-400">
              Register or sign in through the gateway to track your direct invites and team earnings.
            </span>
            <button
              onClick={onOpenAuth}
              className="text-xs font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1 cursor-pointer"
            >
              <span>Gateway Access</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

