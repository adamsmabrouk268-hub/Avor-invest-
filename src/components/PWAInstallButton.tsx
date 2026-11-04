import React, { useState } from 'react';
import { Download, X, CheckCircle2, Smartphone, ExternalLink } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'compact' | 'full';
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ variant = 'compact' }) => {
  const { isInstallable, isInstalled, isIOS, isInIframe, install } = usePWAInstall();
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [installedJustNow, setInstalledJustNow] = useState(false);

  // If already running as an installed standalone PWA, hide the install button
  if (isInstalled && !installedJustNow) {
    return null;
  }

  const handleInstallClick = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (accepted) {
        setInstalledJustNow(true);
      }
      return;
    }
    setShowGuideModal(true);
  };

  return (
    <>
      <button
        type="button"
        onClick={handleInstallClick}
        className={
          variant === 'full'
            ? 'w-full py-3 bg-gradient-to-r from-[#0091ea] to-[#00b4d8] hover:brightness-110 active:scale-95 text-white rounded-xl text-xs font-black flex items-center justify-center gap-2 shadow-lg shadow-blue-900/40 border border-[#00e5ff]/60 cursor-pointer transition-all'
            : 'flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-gradient-to-r from-[#0091ea] to-[#0077b6] hover:brightness-110 border border-[#a3e635]/60 text-white text-xs font-bold transition-all cursor-pointer shadow-sm active:scale-95'
        }
        title="Install Official Avor invest Standalone App with App Icon"
      >
        <Download className="w-3.5 h-3.5 text-[#a3e635]" />
        <span>{installedJustNow ? 'App Installed' : 'Install App'}</span>
      </button>

      {showGuideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in">
          <div className="w-full max-w-sm rounded-2xl bg-[#030b1c] border border-[#00d2c4]/60 p-5 shadow-2xl space-y-4 text-white">
            <div className="flex items-center justify-between border-b border-[#0c3a47] pb-3">
              <div className="flex items-center gap-2.5">
                <img
                  src="/pwa-192x192.png"
                  alt="Avor invest App Icon"
                  className="w-10 h-10 rounded-xl border border-[#00e5ff]/60 shadow-md"
                />
                <div>
                  <h3 className="text-sm font-black text-white">Install Avor invest App</h3>
                  <p className="text-[10px] text-[#a3e635] font-mono font-bold">
                    Standalone App • Official App Icon
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuideModal(false)}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-[#06162d] border border-[#0091ea]/40 rounded-xl p-3.5 flex items-center gap-3">
              <img
                src="/pwa-192x192.png"
                alt="Avor invest"
                className="w-12 h-12 rounded-2xl border border-[#a3e635]/50 shrink-0 shadow-lg"
              />
              <div className="text-xs space-y-0.5">
                <span className="font-black text-white block">Avor invest (Full App)</span>
                <span className="text-[11px] text-slate-300 block">
                  Installs as a standalone native-style application with the official Avor invest launcher icon (not a browser shortcut).
                </span>
              </div>
            </div>

            {isIOS ? (
              <div className="bg-[#051326] border border-[#0e2748] rounded-xl p-3.5 space-y-2 text-xs text-slate-200">
                <p className="font-bold text-[#00e5ff] flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4" />
                  <span>Install on iPhone / iPad:</span>
                </p>
                <ol className="list-decimal list-inside space-y-1.5 text-[11px] text-slate-300">
                  <li>
                    Tap the <strong>Share</strong> icon in your Safari toolbar.
                  </li>
                  <li>
                    Scroll down and tap <strong>Add to Home Screen</strong>.
                  </li>
                  <li>
                    Tap <strong>Add</strong> — the <strong>Avor invest</strong> app icon will be installed on your device in full standalone mode.
                  </li>
                </ol>
              </div>
            ) : (
              <div className="bg-[#051326] border border-[#0e2748] rounded-xl p-3.5 space-y-2 text-xs text-slate-200">
                <p className="font-bold text-[#00e5ff] flex items-center gap-1.5">
                  <Smartphone className="w-4 h-4" />
                  <span>Install on Android / Desktop:</span>
                </p>
                <ol className="list-decimal list-inside space-y-1.5 text-[11px] text-slate-300">
                  <li>
                    Tap your browser menu (<strong>⋮</strong> in Chrome) and select <strong>Install app</strong> (not Add shortcut).
                  </li>
                  <li>
                    Confirm <strong>Install</strong> in the prompt to install the full standalone <strong>Avor invest</strong> package with the official app icon.
                  </li>
                </ol>
                {isInIframe && (
                  <a
                    href={window.location.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 w-full py-2 bg-[#0091ea]/20 hover:bg-[#0091ea]/30 border border-[#00e5ff]/50 rounded-lg text-[11px] font-bold text-[#00e5ff] flex items-center justify-center gap-1.5"
                  >
                    <span>Open Direct App Window to Trigger 1-Tap Install</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => setShowGuideModal(false)}
              className="w-full rounded-xl bg-gradient-to-r from-[#0091ea] to-[#0077b6] py-2.5 text-xs font-bold text-white hover:brightness-110 cursor-pointer flex items-center justify-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Got It</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
};
