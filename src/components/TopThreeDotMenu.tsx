import React, { useState, useRef, useEffect } from 'react';
import {
  MoreVertical,
  Lock,
  Cpu,
  TrendingUp,
  User as UserIcon,
  Home,
  X,
  ExternalLink,
  ArrowLeft,
  Headphones,
  ShieldCheck,
  Download,
} from 'lucide-react';
import { User } from '../types';

export const OWNER_DEVICE_STORAGE_KEY = 'avor_invest_owner_device_token_v1';
export const OWNER_DEVICE_REVOKED_KEY = 'avor_invest_owner_device_revoked_v1';
export const OWNER_DEVICE_TOKEN_VALUE = 'AVOR_OWNER_DEVICE_2838_AUTHORIZED';

/**
 * Checks whether the current browser/device belongs exclusively to the platform owner.
 * - Automatically authorizes the owner's private AI Studio dev environment (`ais-dev-*` / `localhost`)
 * - Automatically authorizes the device when the owner's phone (`0741032838`) or admin account is logged in
 * - Supports `?owner_device=0741032838` URL parameter for one-time mobile browser pairing
 * - Returns `false` for all other visitors/devices so the 3-dot menu & Admin Panel do not exist for them.
 */
export function checkAndSyncOwnerDevice(user?: User | null): boolean {
  if (typeof window === 'undefined') return false;

  try {
    // 1. Check URL query parameter for one-time owner device pairing (?owner_device=0741032838)
    const params = new URLSearchParams(window.location.search);
    const ownerParam = params.get('owner_device') || params.get('owner_key');
    if (ownerParam && ownerParam.replace(/\D/g, '').endsWith('741032838')) {
      localStorage.setItem(OWNER_DEVICE_STORAGE_KEY, OWNER_DEVICE_TOKEN_VALUE);
      localStorage.removeItem(OWNER_DEVICE_REVOKED_KEY);
      // Clean the secret parameter from the address bar
      params.delete('owner_device');
      params.delete('owner_key');
      const newSearch = params.toString();
      const cleanUrl = window.location.pathname + (newSearch ? `?${newSearch}` : '') + window.location.hash;
      window.history.replaceState({}, '', cleanUrl);
      return true;
    }

    // 2. Check if the logged-in user is the platform owner (0741032838 / adamsmabrouk268@gmail.com / admin role)
    const digits = (user?.phone_number || '').replace(/\D/g, '');
    const isOwnerAccount =
      (digits.length >= 9 && digits.endsWith('741032838')) ||
      String(user?.role || '').toUpperCase() === 'ADMIN' ||
      (user?.email && user.email.toLowerCase() === 'adamsmabrouk268@gmail.com');

    if (isOwnerAccount) {
      localStorage.setItem(OWNER_DEVICE_STORAGE_KEY, OWNER_DEVICE_TOKEN_VALUE);
      localStorage.removeItem(OWNER_DEVICE_REVOKED_KEY);
      return true;
    }

    // 3. Check if already authorized on this specific physical device via localStorage
    const existingToken = localStorage.getItem(OWNER_DEVICE_STORAGE_KEY);
    if (existingToken === OWNER_DEVICE_TOKEN_VALUE) {
      return true;
    }

    // 4. Auto-authorize the owner's private AI Studio workspace preview (`ais-dev-*` or `localhost`)
    // Note: Shared/published links use `ais-pre-*` or custom domains, so other users never match `ais-dev-*`.
    const hostname = window.location.hostname || '';
    const isOwnerWorkspaceHost =
      hostname.startsWith('ais-dev-') ||
      hostname === 'localhost' ||
      hostname === '127.0.0.1';

    const wasExplicitlyRevoked = localStorage.getItem(OWNER_DEVICE_REVOKED_KEY) === 'true';

    if (isOwnerWorkspaceHost && !wasExplicitlyRevoked) {
      localStorage.setItem(OWNER_DEVICE_STORAGE_KEY, OWNER_DEVICE_TOKEN_VALUE);
      return true;
    }
  } catch {
    // Ignore storage security errors
  }

  return false;
}

export function authorizeOwnerDeviceWithKey(secretPinOrPhone: string): boolean {
  const raw = secretPinOrPhone.trim();
  const cleaned = raw.replace(/\D/g, '');
  if (
    raw === 'adams@268#' ||
    cleaned.endsWith('741032838') ||
    raw.toLowerCase() === 'adamsmabrouk268@gmail.com'
  ) {
    try {
      localStorage.setItem(OWNER_DEVICE_STORAGE_KEY, OWNER_DEVICE_TOKEN_VALUE);
      localStorage.removeItem(OWNER_DEVICE_REVOKED_KEY);
    } catch {
      // Ignore storage errors
    }
    return true;
  }
  return false;
}

export function revokeOwnerDeviceAccess(): void {
  try {
    localStorage.removeItem(OWNER_DEVICE_STORAGE_KEY);
    localStorage.setItem(OWNER_DEVICE_REVOKED_KEY, 'true');
  } catch {
    // Ignore storage errors
  }
}

interface TopThreeDotMenuProps {
  activeTab: string;
  onNavigateToTab: (tab: 'home' | 'marketplace' | 'income' | 'profile' | 'admin') => void;
  onExitAdmin?: () => void;
  hasBoughtMachine?: boolean;
  user?: User | null;
  forceOwnerAuthorized?: boolean;
  onRevokeDevice?: () => void;
}

export const TopThreeDotMenu: React.FC<TopThreeDotMenuProps> = ({
  activeTab,
  onNavigateToTab,
  onExitAdmin,
  hasBoughtMachine = false,
  user = null,
  forceOwnerAuthorized = false,
  onRevokeDevice,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [showLockedSupportNotice, setShowLockedSupportNotice] = useState(false);
  const [isOwnerAuthorized, setIsOwnerAuthorized] = useState<boolean>(() =>
    forceOwnerAuthorized || checkAndSyncOwnerDevice(user)
  );
  const [pendingOrdersCount, setPendingOrdersCount] = useState<number>(0);
  const [latestOrderMessage, setLatestOrderMessage] = useState<any>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsOwnerAuthorized(forceOwnerAuthorized || checkAndSyncOwnerDevice(user));
  }, [user, forceOwnerAuthorized]);

  // Poll incoming placed deposit & machine order messages for the Owner/Admin device
  useEffect(() => {
    if (!isOwnerAuthorized) return;
    const fetchOwnerOrderMessages = async () => {
      try {
        const res = await fetch('/api/admin/overview');
        if (res.ok && (res.headers.get('content-type') || '').includes('application/json')) {
          const data = await res.json();
          const pendingDeps = Number(data.pending_deposits_count || 0);
          setPendingOrdersCount(pendingDeps);
          const notifs = Array.isArray(data.admin_notifications) ? data.admin_notifications : [];
          const pendingMsg = notifs.find((n: any) => n.order_status === 'PENDING') || notifs[0] || null;
          setLatestOrderMessage(pendingMsg);
        }
      } catch {
        // Ignore transient network errors
      }
    };
    fetchOwnerOrderMessages();
    const interval = setInterval(fetchOwnerOrderMessages, 4000);
    return () => clearInterval(interval);
  }, [isOwnerAuthorized]);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setShowLockedSupportNotice(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // STRICT OWNER-DEVICE-ONLY GUARD:
  // If this device is not the owner's authorized device, render nothing at all.
  if (!isOwnerAuthorized) {
    return null;
  }

  const handleSelect = (tab: 'home' | 'marketplace' | 'income' | 'profile' | 'admin') => {
    setIsOpen(false);
    setShowLockedSupportNotice(false);
    onNavigateToTab(tab);
  };

  return (
    <div className="relative inline-block text-left" ref={menuRef}>
      {/* 3-Dot Navigation Trigger Button (Visible ONLY on Owner's Device) */}
      <button
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          setShowLockedSupportNotice(false);
        }}
        className="relative p-2 sm:px-2.5 sm:py-2 rounded-xl bg-[#062232]/90 hover:bg-[#0a354c] border border-[#00d2c4]/40 text-[#80deea] hover:text-white transition-all cursor-pointer shadow-sm active:scale-95 flex items-center justify-center gap-1 group"
        title="Owner Navigation & Admin Console (This Device Only)"
        aria-label="Owner Three-Dot Navigation"
      >
        <MoreVertical className="w-4 h-4 text-[#00e5ff] group-hover:scale-110 transition-transform" />
        {pendingOrdersCount > 0 && (
          <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-amber-500 text-slate-950 font-mono font-black text-[10px] flex items-center justify-center shadow-md border border-amber-300 animate-pulse">
            {pendingOrdersCount}
          </span>
        )}
      </button>

      {/* Floating Three-Dot Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 sm:w-80 rounded-2xl bg-[#020e18]/98 border border-[#00d2c4]/50 shadow-[0_12px_45px_rgba(0,10,20,0.95),0_0_25px_rgba(0,210,200,0.25)] backdrop-blur-2xl z-50 overflow-hidden animate-fade-in text-white p-2.5 space-y-1">
          {/* Menu Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-[#00d2c4]/20 mb-1">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#a3e635] shadow-[0_0_8px_#a3e635] animate-pulse" />
              <span className="text-xs font-black uppercase tracking-wider text-[#e0f7fa]">
                Owner Device Navigation
              </span>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-[#7ba3b0] hover:text-white p-1 rounded-lg hover:bg-[#062232]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Owner Device Exclusive Badge */}
          <div className="px-3 py-1.5 bg-[#031926] rounded-xl text-[11px] text-[#7ba3b0] flex items-center justify-between border border-[#a3e635]/30 mb-2">
            <span className="flex items-center gap-1.5 text-[#e0f7fa] font-semibold">
              <ShieldCheck className="w-3.5 h-3.5 text-[#a3e635]" />
              <span>Owner Device Bound</span>
            </span>
            <span className="text-[#a3e635] font-mono font-bold text-[10px] bg-[#a3e635]/10 px-1.5 py-0.5 rounded border border-[#a3e635]/30">
              Private Only
            </span>
          </div>

          {/* HIDDEN ADMIN ACCESS (SECURELY PLACED IN OWNER-ONLY 3-DOT MENU) */}
          <button
            type="button"
            onClick={() => handleSelect('admin')}
            className={`w-full text-left p-2.5 rounded-xl transition-all cursor-pointer flex items-start gap-3 group border ${
              activeTab === 'admin'
                ? 'bg-gradient-to-r from-[#0091ea]/30 to-[#0077b6]/30 border-[#a3e635]'
                : 'hover:bg-[#062232]/80 border-transparent hover:border-[#00d2c4]/40'
            }`}
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#0091ea] to-[#0077b6] text-white flex items-center justify-center shrink-0 shadow-md border border-[#a3e635]/80 group-hover:scale-105 transition-transform">
              <Lock className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white group-hover:text-[#00e5ff] transition-colors">
                  Admin Console
                </span>
                {pendingOrdersCount > 0 ? (
                  <span className="text-[10px] font-mono font-black px-1.5 py-0.5 rounded-md bg-amber-500 text-slate-950 border border-amber-300 animate-pulse">
                    {pendingOrdersCount} New Order{pendingOrdersCount > 1 ? 's' : ''}
                  </span>
                ) : (
                  <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    Owner Only
                  </span>
                )}
              </div>
              <p className="text-[10px] text-[#7ba3b0] mt-0.5 leading-snug">
                Authorized owner controls, deposit verification & node specs
              </p>
              {latestOrderMessage && (
                <div className="mt-1.5 p-2 rounded-lg bg-[#041529] border border-blue-500/40 text-[10px] text-sky-200 leading-snug">
                  <div className="font-bold text-amber-300 truncate">{latestOrderMessage.title}</div>
                  <div className="text-slate-300 line-clamp-2 mt-0.5">{latestOrderMessage.message}</div>
                </div>
              )}
            </div>
          </button>

          {/* DOWNLOAD FULL SOURCE CODE (.ZIP) */}
          <a
            href="/api/download-source-zip"
            download="avor-invest-source-code.zip"
            onClick={() => setIsOpen(false)}
            className="w-full text-left p-2.5 rounded-xl bg-gradient-to-r from-emerald-950/80 to-teal-950/80 hover:from-emerald-900/90 hover:to-teal-900/90 border border-emerald-500/50 transition-all cursor-pointer flex items-center gap-3 group shadow-sm"
          >
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 text-slate-950 flex items-center justify-center shrink-0 shadow-md group-hover:scale-105 transition-transform">
              <Download className="w-4 h-4 text-slate-950 stroke-[2.5]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-emerald-300 group-hover:text-white transition-colors">
                  Download Source Code (.ZIP)
                </span>
                <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  Full Code
                </span>
              </div>
              <p className="text-[10px] text-emerald-100/80 mt-0.5 leading-snug">
                One-click download of the complete Avor Invest project ZIP
              </p>
            </div>
          </a>

          {/* Exit Admin Mode (Only if currently in admin view) */}
          {activeTab === 'admin' && onExitAdmin && (
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onExitAdmin();
              }}
              className="w-full text-left p-2 rounded-xl bg-[#052538] hover:bg-[#08354f] border border-[#a3e635]/50 transition-all cursor-pointer flex items-center gap-2 text-xs font-bold text-[#a3e635]"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Exit Admin & Return to Dashboard</span>
            </button>
          )}

          {/* Standard Navigation Items */}
          <div className="pt-1 space-y-0.5 border-t border-[#00d2c4]/15">
            {/* 1. Home Dashboard */}
            <button
              type="button"
              onClick={() => handleSelect('home')}
              className={`w-full text-left p-2 rounded-xl transition-all cursor-pointer flex items-center gap-2.5 ${
                activeTab === 'home'
                  ? 'bg-[#062232] text-[#00e5ff] font-bold'
                  : 'text-[#7ba3b0] hover:text-white hover:bg-[#062232]/50'
              }`}
            >
              <Home className="w-4 h-4" />
              <span className="text-xs">Home Dashboard</span>
            </button>

            {/* 2. Machine Plane */}
            <button
              type="button"
              onClick={() => handleSelect('marketplace')}
              className={`w-full text-left p-2 rounded-xl transition-all cursor-pointer flex items-center gap-2.5 ${
                activeTab === 'marketplace'
                  ? 'bg-[#062232] text-[#00e5ff] font-bold'
                  : 'text-[#7ba3b0] hover:text-white hover:bg-[#062232]/50'
              }`}
            >
              <Cpu className="w-4 h-4" />
              <span className="text-xs">Machine Plane (AV1, AV2, AV Classes)</span>
            </button>

            {/* 3. Income Plane */}
            <button
              type="button"
              onClick={() => handleSelect('income')}
              className={`w-full text-left p-2 rounded-xl transition-all cursor-pointer flex items-center gap-2.5 ${
                activeTab === 'income'
                  ? 'bg-[#062232] text-[#00e5ff] font-bold'
                  : 'text-[#7ba3b0] hover:text-white hover:bg-[#062232]/50'
              }`}
            >
              <TrendingUp className="w-4 h-4" />
              <span className="text-xs">Income Plane (Daily Earnings)</span>
            </button>

            {/* 4. Profile */}
            <button
              type="button"
              onClick={() => handleSelect('profile')}
              className={`w-full text-left p-2 rounded-xl transition-all cursor-pointer flex items-center gap-2.5 ${
                activeTab === 'profile'
                  ? 'bg-[#062232] text-[#00e5ff] font-bold'
                  : 'text-[#7ba3b0] hover:text-white hover:bg-[#062232]/50'
              }`}
            >
              <UserIcon className="w-4 h-4" />
              <span className="text-xs">Profile & Invite Rewards (3,000 UGX)</span>
            </button>
          </div>

          {/* Support Line (Customer-gated) */}
          <div className="pt-1.5 border-t border-[#00d2c4]/20 space-y-1.5">
            {hasBoughtMachine ? (
              <a
                href="https://wa.me/256741032838?text=Hello%20Avor%20invest%20Customer%20Support%20(0741032838)"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full p-2 rounded-xl bg-[#031522] hover:bg-[#052136] text-[#a3e635] text-xs font-bold flex items-center justify-between border border-[#a3e635]/30 transition-all cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Headphones className="w-3.5 h-3.5 text-[#a3e635]" />
                  <span>Avor invest WhatsApp: 0741032838</span>
                </div>
                <ExternalLink className="w-3 h-3 text-[#7ba3b0]" />
              </a>
            ) : (
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => setShowLockedSupportNotice(!showLockedSupportNotice)}
                  className="w-full p-2 rounded-xl bg-[#031522] hover:bg-[#052136] text-amber-300 text-xs font-bold flex items-center justify-between border border-amber-500/30 transition-all cursor-pointer"
                >
                  <div className="flex items-center gap-2">
                    <Lock className="w-3.5 h-3.5 text-amber-400" />
                    <span>Company WhatsApp (Customers Only)</span>
                  </div>
                  <span className="text-[10px] font-mono bg-amber-950/80 px-1.5 py-0.5 rounded border border-amber-500/30">
                    Locked
                  </span>
                </button>
                {showLockedSupportNotice && (
                  <div className="p-2.5 rounded-xl bg-amber-950/40 border border-amber-500/40 text-[11px] text-amber-200 space-y-2">
                    <p>
                      Company WhatsApp is exclusively accessible to active customers who have bought a machine.
                    </p>
                    <button
                      type="button"
                      onClick={() => handleSelect('marketplace')}
                      className="w-full py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-lg text-[11px] cursor-pointer"
                    >
                      Buy a Machine to Unlock
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Option to hide 3-dot menu on a temporary device */}
            <button
              type="button"
              onClick={() => {
                revokeOwnerDeviceAccess();
                setIsOwnerAuthorized(false);
                setIsOpen(false);
                if (onRevokeDevice) onRevokeDevice();
              }}
              className="w-full p-1.5 rounded-lg bg-rose-950/30 hover:bg-rose-900/50 text-rose-300/90 text-[10px] font-semibold flex items-center justify-center gap-1.5 border border-rose-500/20 transition-all cursor-pointer"
              title="Hide the 3-dot menu on this browser/device"
            >
              <Lock className="w-3 h-3" />
              <span>Hide 3-Dot Menu on This Device</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
