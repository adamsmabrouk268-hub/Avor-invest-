import React, { useState } from 'react';
import { WhatsAppIcon } from './WhatsAppIcon';
import { Lock, X, Cpu, ArrowRight, ShieldCheck } from 'lucide-react';

interface WhatsAppWidgetProps {
  phoneNumber?: string;
  hasBoughtMachine?: boolean;
  onExploreMachines?: () => void;
}

export const WhatsAppWidget: React.FC<WhatsAppWidgetProps> = ({
  phoneNumber = '256741032838',
  hasBoughtMachine = false,
  onExploreMachines,
}) => {
  const [showLockedModal, setShowLockedModal] = useState(false);

  const directChatUrl = `https://wa.me/${phoneNumber}?text=${encodeURIComponent(
    'Hello Avor invest Manager (0741032838), I am an active machine owner. Please add me to the official Avor invest WhatsApp Group formed by Manager 0741032838.'
  )}`;

  return (
    <>
      <div className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-40">
        {hasBoughtMachine ? (
          <a
            href={directChatUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="relative group p-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-full shadow-[0_0_24px_rgba(16,185,129,0.55)] flex items-center gap-2 transition-all cursor-pointer hover:scale-105 active:scale-95 border border-[#a3e635]/60"
            title="Join Avor invest WhatsApp Group (Manager 0741032838)"
            aria-label="Join Avor invest WhatsApp Group (Manager 0741032838)"
          >
            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-[#a3e635] rounded-full border-2 border-[#020e18] animate-ping" />
            <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-[#a3e635] rounded-full border-2 border-[#020e18]" />
            <WhatsAppIcon className="w-6 h-6 fill-white text-white drop-shadow-md" />
            <span className="hidden sm:inline font-mono font-bold text-xs pr-1 tracking-tight text-white">
              WhatsApp Group (0741032838)
            </span>
          </a>
        ) : (
          <button
            type="button"
            onClick={() => setShowLockedModal(true)}
            className="relative group p-3.5 bg-gradient-to-r from-slate-800 to-slate-900 hover:from-slate-700 hover:to-slate-800 text-amber-300 rounded-full shadow-[0_0_20px_rgba(245,158,11,0.3)] flex items-center gap-2 transition-all cursor-pointer hover:scale-105 active:scale-95 border border-amber-500/50"
            title="Company WhatsApp (Customers Only)"
            aria-label="Company WhatsApp Customers Only"
          >
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-500 text-slate-950 rounded-full border border-[#020e18] flex items-center justify-center">
              <Lock className="w-2.5 h-2.5" />
            </span>
            <WhatsAppIcon className="w-6 h-6 fill-emerald-400 text-emerald-400 drop-shadow-md" />
            <span className="hidden sm:inline font-mono font-bold text-xs pr-1 tracking-tight text-amber-200">
              Customers WhatsApp
            </span>
          </button>
        )}
      </div>

      {/* Customer-Only WhatsApp Gate Modal */}
      {showLockedModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setShowLockedModal(false)}
        >
          <div
            className="bg-[#071226] border border-amber-500/40 rounded-3xl max-w-md w-full p-6 space-y-4 text-white shadow-2xl relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-300">
                  <Lock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-white">Avor invest Official WhatsApp</h3>
                  <span className="text-[11px] font-mono text-amber-300">Verified Machine Customers Only</span>
                </div>
              </div>
              <button
                onClick={() => setShowLockedModal(false)}
                className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-500/30 space-y-2 text-xs text-slate-200 leading-relaxed">
              <p className="font-bold text-amber-300 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>Customer Access Requirement</span>
              </p>
              <p>
                Company WhatsApp support and the official <strong>Avor invest</strong> investors community can only be accessed by active customers who have already bought a machine.
              </p>
            </div>

            <div className="flex items-center gap-2.5 pt-1">
              {onExploreMachines && (
                <button
                  type="button"
                  onClick={() => {
                    setShowLockedModal(false);
                    onExploreMachines();
                  }}
                  className="flex-1 py-3 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer shadow-lg"
                >
                  <Cpu className="w-4 h-4" />
                  <span>Go to Machine Plane</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowLockedModal(false)}
                className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
