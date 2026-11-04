import React, { useState } from 'react';
import { ExternalLink, Lock } from 'lucide-react';

interface FooterProps {
  hasBoughtMachine?: boolean;
  onNavigateToMarketplace?: () => void;
}

export const Footer: React.FC<FooterProps> = ({
  hasBoughtMachine = false,
  onNavigateToMarketplace,
}) => {
  const [lockedNotice, setLockedNotice] = useState(false);

  return (
    <footer className="bg-[#020e18]/95 border-t border-[#00d2c4]/25 py-6 px-4 sm:px-8 mt-12 text-[#7ba3b0] text-xs shadow-inner">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 bg-gradient-to-r from-[#0091ea] to-[#0077b6] flex items-center justify-center rounded-lg text-white font-black text-xs shadow-md border border-[#00e5ff]/50">
            AI
          </div>
          <span className="font-semibold text-white">
            Avor invest
          </span>
          <span className="hidden sm:inline text-slate-700">•</span>
          <span className="flex items-center gap-1.5 text-[#80deea] font-mono text-[11px]">
            <span className="w-2 h-2 rounded-full bg-[#a3e635] animate-pulse shadow-xs shadow-[#a3e635]" />
            Machine Plane Active · Series AV1, AV2 & AV Classes A–I
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-[11px]">
          {hasBoughtMachine ? (
            <>
              <a
                href="https://wa.me/256741032838?text=Hello%20Avor%20invest%20Manager%20(0741032838)%2C%20I%20am%20an%20active%20machine%20customer.%20Please%20add%20me%20to%20the%20official%20Avor%20invest%20WhatsApp%20Group%20formed%20by%20Manager%200741032838."
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#a3e635] hover:text-[#bef264] hover:underline flex items-center gap-1 font-bold"
              >
                <span>Join WhatsApp Group (Manager: 0741032838)</span>
                <ExternalLink className="w-3 h-3 text-[#7ba3b0]" />
              </a>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setLockedNotice(!lockedNotice)}
              className="text-amber-300 hover:text-amber-200 flex items-center gap-1 font-bold cursor-pointer"
            >
              <Lock className="w-3 h-3 text-amber-400" />
              <span>Avor invest WhatsApp (Customers Only)</span>
            </button>
          )}

          <span className="text-slate-400">Security Audit</span>
          <span className="text-slate-400 font-mono">
            © 2023 Avor invest
          </span>
        </div>
      </div>

      {lockedNotice && !hasBoughtMachine && (
        <div className="max-w-xl mx-auto mt-3 p-3 rounded-xl bg-amber-950/40 border border-amber-500/40 text-amber-200 text-xs flex flex-col sm:flex-row items-center justify-between gap-2 animate-fade-in">
          <span>
            Company WhatsApp is reserved for active customers who have already bought a machine.
          </span>
          {onNavigateToMarketplace && (
            <button
              type="button"
              onClick={() => {
                setLockedNotice(false);
                onNavigateToMarketplace();
              }}
              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-lg text-[11px] shrink-0 cursor-pointer"
            >
              View Machines
            </button>
          )}
        </div>
      )}
    </footer>
  );
};
