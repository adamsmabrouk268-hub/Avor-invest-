import React, { useState, useEffect } from 'react';
import { User, Currency, Machine, Investment, MachineCategory } from './types';
import { Homepage } from './components/Homepage';
import { CategoryTabs } from './components/CategoryTabs';
import { MachineCard } from './components/MachineCard';
import { MachineTableView } from './components/MachineTableView';
import { InvestModal } from './components/InvestModal';
import { AccountView } from './components/AccountView';
import { AuthModal } from './components/AuthModal';
import { WalletModal } from './components/WalletModal';
import { AdminPanel } from './components/AdminPanel';
import { WhatsAppWidget } from './components/WhatsAppWidget';
import { BottomNav } from './components/BottomNav';
import { Footer } from './components/Footer';
import { GatewayRegistration } from './components/GatewayRegistration';
import { LiveWallpaper } from './components/LiveWallpaper';
import { IncomePlaneView } from './components/IncomePlaneView';
import { checkAndSyncOwnerDevice } from './components/TopThreeDotMenu';
import { DEFAULT_MACHINES } from './data/defaultMachines';
import {
  subscribeToFirestoreOrders,
  loadOrdersFromFirestore,
  loadMachinesFromFirestore,
  subscribeToFirestoreMachines,
  loadUserFromFirestore,
  saveUserToFirestore,
  FirestoreOrderRecord,
  applyLocalZeroReset,
  confirmOrderInFirestore,
} from './firebase';
import { CheckCircle2, ArrowRight, Cpu, AlertCircle } from 'lucide-react';

export default function App() {
  // Active Navigation Tab: 'home' | 'marketplace' | 'income' | 'profile' | 'admin'
  const [activeTab, setActiveTab] = useState<'home' | 'marketplace' | 'income' | 'profile' | 'account' | 'admin'>('home');
  const [currency, setCurrency] = useState<Currency>('UGX');

  const getSavedRegisteredUser = (): User | null => {
    try {
      const savedUserStr = localStorage.getItem('avor_invest_user');
      if (savedUserStr) {
        const parsed = JSON.parse(savedUserStr);
        if (parsed && (parsed.id || parsed.phone_number || parsed.phoneNumber)) {
          return {
            ...parsed,
            id: parsed.id || `user-${String(parsed.phone_number || parsed.phoneNumber).replace(/\D/g, '')}`,
            phone_number: parsed.phone_number || parsed.phoneNumber || '',
            full_name:
              parsed.full_name ||
              parsed.name ||
              `Investor ${String(parsed.phone_number || parsed.phoneNumber || '').slice(-4)}`,
            balance: typeof parsed.balance === 'number' ? parsed.balance : 3000,
          };
        }
      }

      const savedRegStr = localStorage.getItem('avor_invest_registration_data');
      const hasAccountFlag = localStorage.getItem('avor_invest_has_account') === 'true';
      const lastPhone = localStorage.getItem('avor_invest_last_phone') || '';

      if (savedRegStr) {
        const parsedReg = JSON.parse(savedRegStr);
        const regPhone = parsedReg?.phone_number || parsedReg?.phoneNumber || lastPhone;
        if (regPhone) {
          const restored: User = {
            id: parsedReg.id || `user-${String(regPhone).replace(/\D/g, '')}`,
            full_name: parsedReg.name || parsedReg.full_name || `Investor ${String(regPhone).slice(-4)}`,
            email: parsedReg.email || `${String(regPhone).replace(/\D/g, '')}@avorinvest.com`,
            phone_number: regPhone,
            balance: 3000,
            wallet_balance: 0,
            available_wallet: 0,
            referral_code: parsedReg.referral_code || 'AVOR7789',
            role: 'INVESTOR',
            kyc_status: 'VERIFIED',
            created_at: parsedReg.created_at || new Date().toISOString(),
          };
          localStorage.setItem('avor_invest_user', JSON.stringify(restored));
          return restored;
        }
      }

      if (hasAccountFlag && lastPhone) {
        const restored: User = {
          id: `user-${String(lastPhone).replace(/\D/g, '')}`,
          full_name: `Investor ${String(lastPhone).slice(-4)}`,
          email: `${String(lastPhone).replace(/\D/g, '')}@avorinvest.com`,
          phone_number: lastPhone,
          balance: 3000,
          wallet_balance: 0,
          available_wallet: 0,
          referral_code: 'AVOR7789',
          role: 'INVESTOR',
          kyc_status: 'VERIFIED',
          created_at: new Date().toISOString(),
        };
        localStorage.setItem('avor_invest_user', JSON.stringify(restored));
        return restored;
      }
    } catch {}
    return null;
  };

  // User State — Automatically restored from localStorage & Firestore 'users' collection
  const [user, setUser] = useState<User | null>(() => getSavedRegisteredUser());

  // Machine Marketplace Data (Categorized into AV1, AV2, All Machines, and AVclasses)
  const [machines, setMachines] = useState<Machine[]>(DEFAULT_MACHINES);
  const [selectedCategory, setSelectedCategory] = useState<MachineCategory | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [marketplaceViewMode, setMarketplaceViewMode] = useState<'table' | 'grid'>('grid');

  // User Portfolio Investments (Synced in real-time from Firebase Firestore 'orders' + backend)
  const [serverInvestments, setServerInvestments] = useState<Investment[]>([]);
  const [firestoreUserOrders, setFirestoreUserOrders] = useState<FirestoreOrderRecord[]>([]);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [invitedCount, setInvitedCount] = useState<number>(0);

  // Modal States
  const [selectedMachineToInvest, setSelectedMachineToInvest] = useState<Machine | null>(null);
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [showWalletModal, setShowWalletModal] = useState<boolean>(false);
  const [walletMode, setWalletMode] = useState<'deposit' | 'withdraw'>('deposit');
  const [referralCodeFromUrl, setReferralCodeFromUrl] = useState<string>('');

  // Gateway Registration is imparted as the entry screen only before first-time registration
  const [isGuestPreview, setIsGuestPreview] = useState<boolean>(false);

  // Toast Notification State
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  const syncUserToStorage = (u: User | null) => {
    if (u) {
      setUser(u);
      void saveUserToFirestore(u);
      try {
        localStorage.setItem('avor_invest_user', JSON.stringify(u));
        localStorage.setItem('avor_invest_has_account', 'true');
        if (u.phone_number) {
          localStorage.setItem('avor_invest_last_phone', u.phone_number);
        }
      } catch (e) {}
    } else {
      const existingRegistered = getSavedRegisteredUser();
      if (existingRegistered) {
        setUser(existingRegistered);
      } else {
        setUser(null);
      }
    }
  };

  useEffect(() => {
    fetchMachines();

    // Real-time listener on Firebase Firestore 'machines' collection on startup
    const unsubMachines = subscribeToFirestoreMachines((fbMachines) => {
      if (fbMachines.length > 0) {
        setMachines((prev) => {
          const map = new Map<string, Machine>();
          for (const m of prev) map.set(m.id, m);
          for (const fm of fbMachines) {
            map.set(fm.id, { ...(map.get(fm.id) || {}), ...(fm as unknown as Machine) });
          }
          return Array.from(map.values());
        });
      }
    });

    // After the first-time registration, restore the user immediately and sync from Firestore 'users' collection
    const existingUser = getSavedRegisteredUser();
    if (existingUser) {
      setUser(existingUser);
      setIsGuestPreview(false);
      void loadUserFromFirestore(existingUser.id, existingUser.phone_number).then((fbUser) => {
        if (fbUser) {
          const mergedUser: User = {
            ...existingUser,
            ...fbUser,
            has_bought_machine: Boolean(existingUser.has_bought_machine || fbUser.has_bought_machine),
          };
          setUser(mergedUser);
          try {
            localStorage.setItem('avor_invest_user', JSON.stringify(mergedUser));
          } catch {}
        } else {
          void saveUserToFirestore(existingUser);
        }
      });
    } else {
      // Check for referral code in URL only for first-time unregistered visitors
      const searchParams = new URLSearchParams(window.location.search);
      const codeParam =
        searchParams.get('AvorInvest') ||
        searchParams.get('MachineInvest') ||
        searchParams.get('CreativeAssembly') ||
        searchParams.get('code') ||
        searchParams.get('ref');
      const isRegPath = window.location.pathname.startsWith('/reg');

      if (codeParam || isRegPath) {
        const codeToUse = codeParam || 'thkjve';
        setReferralCodeFromUrl(codeToUse);
        setIsGuestPreview(false);
        showNotification(`Invitation code "${codeToUse}" verified! Register below to get started.`, 'info');
      }
    }

    const onSystemZeroReset = () => {
      setInvestments([]);
      setServerInvestments([]);
      setFirestoreUserOrders([]);
      setInvitedCount(0);
      setUser((prev) => {
        if (!prev) return prev;
        const zeroed = {
          ...prev,
          balance: 3000,
          wallet_balance: 0,
          available_wallet: 0,
          has_bought_machine: false,
        };
        try {
          localStorage.setItem('avor_invest_user', JSON.stringify(zeroed));
        } catch {}
        return zeroed;
      });
    };
    window.addEventListener('avor-system-reset-zero', onSystemZeroReset);
    return () => {
      unsubMachines();
      window.removeEventListener('avor-system-reset-zero', onSystemZeroReset);
    };
  }, []);

  useEffect(() => {
    if (!user?.id) return;
    fetchUserData();
    fetchUserPortfolio();
    void loadOrdersFromFirestore().then((allOrders) => {
      const myTail = (user.phone_number || '').replace(/\D/g, '').slice(-9);
      const myOrders = allOrders.filter((ord) => {
        if (ord.user_id && ord.user_id === user.id) return true;
        if (myTail && myTail.length >= 7) {
          const ordTail = (ord.customer_phone || '').replace(/\D/g, '').slice(-9);
          if (ordTail === myTail) return true;
        }
        return false;
      });
      if (myOrders.length > 0) {
        setFirestoreUserOrders(myOrders);
      }
    });
    const interval = setInterval(() => {
      fetchUserData();
      fetchUserPortfolio();
    }, 2500);

    const doesEventMatchCurrentUser = (evData: any): boolean => {
      if (!evData || !user) return false;
      if (evData.user_id === user.id) return true;
      if (Array.isArray(evData.synced_user_ids) && evData.synced_user_ids.includes(user.id)) return true;
      const myTail = (user.phone_number || '').replace(/\D/g, '').slice(-9);
      if (myTail && myTail.length >= 7) {
        const uTail = String(evData.user_phone || '').replace(/\D/g, '').slice(-9);
        const cTail = String(evData.customer_phone || '').replace(/\D/g, '').slice(-9);
        if (uTail === myTail || cTail === myTail) return true;
      }
      try {
        const savedRefs: string[] = JSON.parse(localStorage.getItem('avor_my_deposit_refs') || '[]');
        if (
          (evData.transaction_id && savedRefs.includes(evData.transaction_id)) ||
          (evData.payment_reference && savedRefs.includes(evData.payment_reference))
        ) {
          return true;
        }
      } catch {}
      return false;
    };

    const handleRealtimeConfirm = (evData: any) => {
      if (!evData) return;
      if (evData.order_type === 'SYSTEM_RESET_ZERO') {
        if (evData.reset_epoch_id) {
          applyLocalZeroReset(evData.reset_epoch_id, evData.reset_cutoff_ms);
        }
        setInvestments([]);
        setServerInvestments([]);
        setFirestoreUserOrders([]);
        setInvitedCount(0);
        syncUserToStorage({
          ...user,
          balance: 3000,
          wallet_balance: 0,
          available_wallet: 0,
          has_bought_machine: false,
        });
        return;
      }
      if (
        evData.type === 'WITHDRAWAL_CREATED_PENDING' ||
        evData.type === 'WITHDRAWAL_APPROVED_SYNC' ||
        evData.type === 'WITHDRAWAL_REJECTED_SYNC'
      ) {
        if (doesEventMatchCurrentUser(evData) && typeof evData.balance === 'number') {
          syncUserToStorage({
            ...user,
            balance: evData.balance,
          });
        }
        fetchUserData();
        return;
      }
      if (evData.type === 'DEPOSIT_CREATED_PENDING') {
        if (doesEventMatchCurrentUser(evData)) {
          if (typeof evData.wallet_balance === 'number') {
            syncUserToStorage({
              ...user,
              wallet_balance: evData.wallet_balance,
              available_wallet: evData.wallet_balance,
            });
          }
        }
        fetchUserData();
        return;
      }
      if (evData.type === 'WALLET_DENIED_SYNC') {
        if (doesEventMatchCurrentUser(evData)) {
          try {
            const savedRefs: string[] = JSON.parse(localStorage.getItem('avor_my_deposit_refs') || '[]');
            const filteredRefs = savedRefs.filter(
              (r) =>
                r !== evData.transaction_id &&
                r !== evData.payment_reference &&
                r !== evData.firebase_doc_id
            );
            localStorage.setItem('avor_my_deposit_refs', JSON.stringify(filteredRefs));
          } catch {}
          const nextWallet =
            typeof evData.wallet_balance === 'number'
              ? evData.wallet_balance
              : typeof evData.available_wallet === 'number'
                ? evData.available_wallet
                : Math.max(0, (user.wallet_balance || 0) - Number(evData.amount_removed || 0));
          syncUserToStorage({
            ...user,
            wallet_balance: nextWallet,
            available_wallet: nextWallet,
            balance: typeof evData.balance === 'number' ? evData.balance : user.balance,
          });
          showNotification(
            `❌ Payment Denied by Admin (Fake Order): UGX ${Number(evData.amount_removed || 0).toLocaleString()} has been removed from your Wallet (${Number(nextWallet).toLocaleString()} UGX remaining).`,
            'error'
          );
        }
        fetchUserData();
        fetchUserPortfolio();
        return;
      }
      if (evData.type !== 'WALLET_CONFIRMED_SYNC') return;
      if (doesEventMatchCurrentUser(evData)) {
        const nextWallet =
          typeof evData.wallet_balance === 'number'
            ? evData.wallet_balance
            : typeof evData.available_wallet === 'number'
              ? evData.available_wallet
              : (user.wallet_balance || 0) + Number(evData.amount_added || 0);
        const unlockedNow =
          Boolean(user.has_bought_machine) ||
          Boolean(evData.has_bought_machine) ||
          Boolean(evData.activated_machine) ||
          (Array.isArray(evData.activated_investments) && evData.activated_investments.length > 0);
        if (unlockedNow && user.id) {
          try {
            localStorage.setItem(`avor_unlocked_${user.id}`, 'true');
          } catch {}
        }
        syncUserToStorage({
          ...user,
          wallet_balance: nextWallet,
          available_wallet: nextWallet,
          balance: typeof evData.balance === 'number' ? evData.balance : user.balance,
          has_bought_machine: unlockedNow,
        });
        showNotification(
          evData.activated_machine || (Array.isArray(evData.activated_investments) && evData.activated_investments.length > 0)
            ? `✅ Payment Confirmed! Your machine cycle (${evData.activated_machine?.machine_title || evData.activated_investments?.[0]?.machine_title || 'Machine'}) is now ACTIVE in the Income Plane!`
            : `✅ Payment Confirmed by Admin! Your Wallet balance (${Number(nextWallet).toLocaleString()} UGX) is confirmed — buy your machine now to start its cycle.`,
          'success'
        );
      }
      fetchUserData();
      fetchUserPortfolio();
    };

    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/realtime/wallet-stream');
      es.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          handleRealtimeConfirm(parsed);
        } catch {}
      };
    } catch {}

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('avor_realtime_wallet_sync');
      bc.onmessage = (event) => {
        handleRealtimeConfirm(event.data);
      };
    } catch {}

    // Real-time listener on Firebase Firestore 'orders' collection for this customer
    const unsubFirestoreOrders = subscribeToFirestoreOrders((allOrders) => {
      const myTail = (user.phone_number || '').replace(/\D/g, '').slice(-9);
      const myOrders = allOrders.filter((ord) => {
        if (ord.user_id && ord.user_id === user.id) return true;
        if (myTail && myTail.length >= 7) {
          const ordTail = (ord.customer_phone || '').replace(/\D/g, '').slice(-9);
          if (ordTail === myTail) return true;
        }
        if (
          user.full_name &&
          ord.customername &&
          ord.customername.toLowerCase().trim() === user.full_name.toLowerCase().trim()
        ) {
          return true;
        }
        return false;
      });
      setFirestoreUserOrders(myOrders);
    });

    return () => {
      clearInterval(interval);
      unsubFirestoreOrders();
      try {
        es?.close();
      } catch {}
      try {
        bc?.close();
      } catch {}
    };
  }, [user?.id, user?.phone_number]);

  // Merge Firestore 'orders' with backend portfolio in real-time (never downgrade an ACTIVE machine back to PENDING)
  useEffect(() => {
    const mergedMap = new Map<string, Investment>();
    const activeIdsKey = user?.id ? `avor_active_order_ids_${user.id}` : '';
    let knownActiveIds = new Set<string>();
    if (activeIdsKey) {
      try {
        const rawIds = JSON.parse(localStorage.getItem(activeIdsKey) || '[]');
        if (Array.isArray(rawIds)) {
          knownActiveIds = new Set(rawIds.map(String));
        }
      } catch {}
    }

    for (const srvInv of serverInvestments) {
      const isKnownActive = knownActiveIds.has(srvInv.id);
      const effectiveSrvStatus =
        srvInv.status === 'PAYOUT_COMPLETE'
          ? 'PAYOUT_COMPLETE'
          : srvInv.status === 'ACTIVE' || isKnownActive
            ? 'ACTIVE'
            : srvInv.status;
      if (effectiveSrvStatus === 'ACTIVE' || effectiveSrvStatus === 'PAYOUT_COMPLETE') {
        knownActiveIds.add(srvInv.id);
      }
      mergedMap.set(srvInv.id, {
        ...srvInv,
        status: effectiveSrvStatus,
        days_elapsed:
          effectiveSrvStatus === 'ACTIVE'
            ? Math.max(1, Number(srvInv.days_elapsed || 1))
            : srvInv.days_elapsed,
      });
    }

    for (const fbOrd of firestoreUserOrders) {
      if (fbOrd.status === 'DENIED' || fbOrd.raw_firestore_status === 'denied') {
        mergedMap.delete(fbOrd.id);
        knownActiveIds.delete(fbOrd.id);
        continue;
      }
      const existing = mergedMap.get(fbOrd.id);
      const mappedStatus: 'PENDING' | 'ACTIVE' | 'PAYOUT_COMPLETE' =
        fbOrd.status === 'ACTIVE'
          ? 'ACTIVE'
          : fbOrd.status === 'PAYOUT_COMPLETE'
            ? 'PAYOUT_COMPLETE'
            : 'PENDING';

      // Once an order is ACTIVE (on server, in Firestore, or in knownActiveIds), NEVER downgrade it back to PENDING
      const resolvedStatus: 'PENDING' | 'ACTIVE' | 'PAYOUT_COMPLETE' =
        existing?.status === 'PAYOUT_COMPLETE' || mappedStatus === 'PAYOUT_COMPLETE'
          ? 'PAYOUT_COMPLETE'
          : existing?.status === 'ACTIVE' || mappedStatus === 'ACTIVE' || knownActiveIds.has(fbOrd.id)
            ? 'ACTIVE'
            : 'PENDING';

      if (resolvedStatus === 'ACTIVE' || resolvedStatus === 'PAYOUT_COMPLETE') {
        knownActiveIds.add(fbOrd.id);
      }

      // If server knows the machine is ACTIVE but Firestore still had 'pending', upgrade Firestore automatically
      if (resolvedStatus === 'ACTIVE' && mappedStatus === 'PENDING') {
        void confirmOrderInFirestore(fbOrd.id, {
          days_elapsed: Math.max(1, Number(existing?.days_elapsed || fbOrd.days_elapsed || 1)),
          days_left: Math.max(0, Number(existing?.duration_days || fbOrd.duration_days || 32) - 1),
          start_date: existing?.start_date || fbOrd.start_date,
          end_date: existing?.end_date || fbOrd.end_date,
        });
      }

      // If Firestore knows the machine is ACTIVE but server didn't have it as ACTIVE yet, sync server automatically
      if (resolvedStatus === 'ACTIVE' && (!existing || existing.status === 'PENDING')) {
        void fetch('/api/admin/orders/action', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            investment_id: fbOrd.id,
            action: 'APPROVE',
            user_id: fbOrd.user_id || user?.id,
            customername: fbOrd.customername,
            customer_phone: fbOrd.customer_phone || user?.phone_number,
            machine_id: fbOrd.machine_id,
            machine_title: fbOrd.machine_title || fbOrd.name,
            amount_invested: fbOrd.amount_invested,
            daily_return: fbOrd.daily_return,
            duration_days: fbOrd.duration_days,
            units: fbOrd.units,
          }),
        }).catch(() => {});
      }

      mergedMap.set(fbOrd.id, {
        ...(existing || {}),
        id: fbOrd.id,
        user_id: fbOrd.user_id || user?.id || '',
        machine_id: fbOrd.machine_id || existing?.machine_id || '1',
        machine_title: fbOrd.machine_title || fbOrd.name || existing?.machine_title || 'Machine Order',
        series_tag: existing?.series_tag || 'AV1',
        amount_invested: fbOrd.amount_invested || existing?.amount_invested || 0,
        daily_yield: fbOrd.daily_return || fbOrd.daily_yield || existing?.daily_yield || 0,
        duration_days: fbOrd.duration_days || existing?.duration_days || 32,
        total_return: fbOrd.total_return || existing?.total_return || 0,
        days_elapsed:
          resolvedStatus === 'ACTIVE'
            ? Math.max(1, Number(existing?.days_elapsed ?? fbOrd.days_elapsed ?? 1))
            : fbOrd.days_elapsed ?? existing?.days_elapsed ?? 0,
        last_claim_at: existing?.last_claim_at || fbOrd.updated_at || fbOrd.created_at,
        unclaimed_earnings: existing?.unclaimed_earnings ?? 0,
        total_claimed: existing?.total_claimed ?? 0,
        status: resolvedStatus,
        start_date: existing?.start_date || fbOrd.start_date || fbOrd.created_at,
        end_date: existing?.end_date || fbOrd.end_date || fbOrd.created_at,
        units: fbOrd.units || existing?.units || 1,
      });
    }

    const finalInvestments = Array.from(mergedMap.values());
    if (activeIdsKey && knownActiveIds.size > 0) {
      try {
        localStorage.setItem(activeIdsKey, JSON.stringify(Array.from(knownActiveIds)));
        localStorage.setItem(`avor_unlocked_${user?.id}`, 'true');
      } catch {}
    }
    setInvestments(finalInvestments);
  }, [serverInvestments, firestoreUserOrders, user?.id]);

  const showNotification = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  // Unlock WhatsApp, Company PDF, Invite, and Manage permanently once the user buys a machine
  const isPersistedUnlocked = Boolean(
    user?.id && typeof window !== 'undefined' && localStorage.getItem(`avor_unlocked_${user.id}`) === 'true'
  );
  const hasBoughtMachine =
    investments.some((i) => i.status === 'ACTIVE' || i.status === 'PAYOUT_COMPLETE') ||
    Boolean(user?.has_bought_machine) ||
    isPersistedUnlocked;

  const CLASS_INVITE_REQUIREMENTS: Record<string, number> = {
    'A class': 4,
    'B class': 9,
    'C class': 20,
    'D class': 35,
    'E class': 70,
    'F class': 120,
    'G class': 300,
    'H class': 5000,
    'I class': 10000,
  };

  const handleSelectMachineToBuy = (m: Machine) => {
    if (!user) {
      setIsGuestPreview(false);
      setShowAuthModal(true);
      return;
    }

    const series = m.series_tag || m.series || '';
    const isClosedOrLockedPlane =
      !!m.is_av_class ||
      !!m.category?.startsWith('AV_CLASS') ||
      ['A class', 'B class', 'C class', 'D class', 'E class', 'F class', 'G class', 'H class', 'I class'].includes(series);

    if (isClosedOrLockedPlane) {
      const requiredInvites = Number(
        m.required_referral_buyers || CLASS_INVITE_REQUIREMENTS[series] || 4
      );
      if (!hasBoughtMachine) {
        showNotification(
          `🔒 Class Locked: Buy a machine first and invite ${requiredInvites.toLocaleString()} people to unlock ${series || m.title} (Currently ${invitedCount}/${requiredInvites.toLocaleString()} invited).`,
          'error'
        );
        return;
      }
      if (invitedCount < requiredInvites) {
        const remaining = requiredInvites - invitedCount;
        showNotification(
          `🔒 ${series || m.title} Locked: You must invite ${requiredInvites.toLocaleString()} people to access ${series || m.title} (${invitedCount}/${requiredInvites.toLocaleString()} invited — invite ${remaining.toLocaleString()} more).`,
          'error'
        );
        return;
      }
    }

    setSelectedMachineToInvest(m);
  };

  const fetchMachines = async () => {
    try {
      const fbMachines = await loadMachinesFromFirestore();
      if (fbMachines.length > 0) {
        setMachines((prev) => {
          const map = new Map<string, Machine>();
          for (const m of prev) map.set(m.id, m);
          for (const fm of fbMachines) {
            map.set(fm.id, { ...(map.get(fm.id) || {}), ...(fm as unknown as Machine) });
          }
          return Array.from(map.values());
        });
      }
    } catch {}
    try {
      const res = await fetch('/api/machines');
      const ct = res.headers.get('content-type') || '';
      if (res.ok && ct.includes('application/json')) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setMachines(data);
        }
      }
    } catch {
      // Fallback to DEFAULT_MACHINES if backend is momentarily unreachable
    }
  };

  const fetchUserPortfolio = async () => {
    if (!user) return;
    try {
      const phoneParam = user.phone_number ? `?phone=${encodeURIComponent(user.phone_number)}` : '';
      const res = await fetch(`/api/user/portfolio/${encodeURIComponent(user.id)}${phoneParam}`);
      const ct = res.headers.get('content-type') || '';
      if (res.ok && ct.includes('application/json')) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setServerInvestments(data);
        }
      }
    } catch {
      // Keep existing portfolio state if backend is momentarily unreachable
    }
  };

  const fetchUserData = async () => {
    if (!user) return;
    try {
      let refsParam = '';
      try {
        const savedRefs: string[] = JSON.parse(localStorage.getItem('avor_my_deposit_refs') || '[]');
        if (Array.isArray(savedRefs) && savedRefs.length > 0) {
          refsParam = `&refs=${encodeURIComponent(savedRefs.join(','))}`;
        }
      } catch {}
      const phoneParam = user.phone_number
        ? `?phone=${encodeURIComponent(user.phone_number)}${refsParam}`
        : refsParam
          ? `?${refsParam.slice(1)}`
          : '';
      const [res, sumRes] = await Promise.all([
        fetch(`/api/user/${encodeURIComponent(user.id)}${phoneParam}`),
        fetch(`/api/user/dashboard-summary/${encodeURIComponent(user.id)}${phoneParam}`),
      ]);
      const ct = res.headers.get('content-type') || '';
      let mergedUser: User = { ...user };
      if (res.ok && ct.includes('application/json')) {
        const data = await res.json();
        if (data && data.id) {
          mergedUser = { ...mergedUser, ...data };
        }
      }
      const sumCt = sumRes.headers.get('content-type') || '';
      if (sumRes.ok && sumCt.includes('application/json')) {
        const sumData = await sumRes.json();
        setInvitedCount(Number(sumData.active_buyer_referrals ?? sumData.invited_people_count ?? 0));
        if (typeof sumData.balance === 'number') mergedUser.balance = sumData.balance;
        if (typeof sumData.wallet_balance === 'number') mergedUser.wallet_balance = sumData.wallet_balance;
        if (typeof sumData.available_wallet === 'number') mergedUser.available_wallet = sumData.available_wallet;
        const unlocked =
          Boolean(user.has_bought_machine) ||
          Boolean(mergedUser.has_bought_machine) ||
          Boolean(sumData.has_bought_machine) ||
          (user.id ? localStorage.getItem(`avor_unlocked_${user.id}`) === 'true' : false);
        mergedUser.has_bought_machine = unlocked;
        if (unlocked && user.id) {
          try {
            localStorage.setItem(`avor_unlocked_${user.id}`, 'true');
          } catch {}
        }
        if (
          Number(sumData.wallet_balance || 0) === 0 &&
          Number(sumData.deposit_details?.deposits_count || 0) === 0
        ) {
          try {
            localStorage.removeItem('avor_my_deposit_refs');
          } catch {}
        }
      }
      syncUserToStorage(mergedUser);
    } catch {
      // Keep existing user session if backend is momentarily unreachable
    }
  };

  const handleClaimYield = async (investmentId?: string) => {
    if (!user) {
      setIsGuestPreview(false);
      setShowAuthModal(true);
      return;
    }
    try {
      const res = await fetch('/api/user/claim-yield', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: user.id,
          user_phone: user.phone_number,
          user_name: user.full_name,
          investment_id: investmentId,
        }),
      });
      const ct = res.headers.get('content-type') || '';
      const data = ct.includes('application/json') ? await res.json() : {};

      if (res.ok) {
        syncUserToStorage({ ...user, balance: data.new_balance });
        fetchUserPortfolio();
        showNotification(`Claimed ${Number(data.claimed_amount || 0).toLocaleString()} UGX daily return yield!`);
      } else {
        showNotification(data.error || 'No unclaimed yield ready right now.', 'info');
      }
    } catch {
      showNotification('Yield claim is syncing. Please try again in a moment.', 'info');
    }
  };

  const handleLogout = () => {
    // Keep registered user session active so the Gateway never appears again after first-time registration
    setActiveTab('home');
    setIsGuestPreview(false);
    showNotification('Returned to Homepage.', 'info');
  };

  // Filtered Machines
  const filteredMachines = machines.filter((m) => {
    const categoryMatch =
      selectedCategory === 'ALL'
        ? true
        : selectedCategory === 'AVS'
          ? !m.is_av_class && (m.series_tag === 'AV1' || m.series_tag === 'AV2' || m.category === 'AV1' || m.category === 'AV2')
          : selectedCategory === 'AVCLASSES'
            ? !!m.is_av_class || ['A class', 'B class', 'C class', 'D class', 'E class', 'F class', 'G class', 'H class', 'I class'].includes(m.series_tag) || m.category?.startsWith('AV_CLASS')
            : m.category === selectedCategory ||
              (selectedCategory === 'AV1' && (m.series_tag === 'AV1' || m.series === 'AV1' || m.category === 'AV1')) ||
              (selectedCategory === 'AV2' && (m.series_tag === 'AV2' || m.series === 'AV2' || m.category === 'AV2')) ||
              (selectedCategory === 'AV_CLASS_A' && (m.category === 'AV_CLASS_A' || m.series_tag === 'A class' || m.series?.includes('A class'))) ||
              (selectedCategory === 'AV_CLASS_B' && (m.category === 'AV_CLASS_B' || m.series_tag === 'B class' || m.series?.includes('B class'))) ||
              (selectedCategory === 'AV_CLASS_C' && (m.category === 'AV_CLASS_C' || m.series_tag === 'C class' || m.series?.includes('C class'))) ||
              (selectedCategory === 'AV_CLASS_D' && (m.category === 'AV_CLASS_D' || m.series_tag === 'D class' || m.series?.includes('D class'))) ||
              (selectedCategory === 'AV_CLASS_E' && (m.category === 'AV_CLASS_E' || m.series_tag === 'E class' || m.series?.includes('E class'))) ||
              (selectedCategory === 'AV_CLASS_F' && (m.category === 'AV_CLASS_F' || m.series_tag === 'F class' || m.series?.includes('F class'))) ||
              (selectedCategory === 'AV_CLASS_G' && (m.category === 'AV_CLASS_G' || m.series_tag === 'G class' || m.series?.includes('G class'))) ||
              (selectedCategory === 'AV_CLASS_H' && (m.category === 'AV_CLASS_H' || m.series_tag === 'H class' || m.series?.includes('H class'))) ||
              (selectedCategory === 'AV_CLASS_I' && (m.category === 'AV_CLASS_I' || m.series_tag === 'I class' || m.series?.includes('I class')));

    const searchMatch =
      m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.series_tag.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (m.series || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.description.toLowerCase().includes(searchQuery.toLowerCase());

    return categoryMatch && searchMatch;
  });

  return (
    <div className="min-h-screen bg-transparent text-slate-100 font-sans antialiased flex flex-col justify-between selection:bg-blue-600 selection:text-white relative">
      {/* Live Moving Wallpaper Background */}
      <LiveWallpaper />

      {/* Toast Notification Popup */}
      {toast && (
        <div
          className={`fixed top-20 right-4 left-4 sm:left-auto sm:max-w-md z-[60] shining-card text-white border-l-4 ${
            toast.type === 'error'
              ? 'border-rose-500 bg-rose-950/95 shadow-rose-950/60'
              : 'border-blue-500'
          } p-4 rounded-xl shadow-2xl flex items-center gap-3 text-xs font-semibold animate-fade-in`}
        >
          {toast.type === 'error' ? (
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-blue-400 shrink-0" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      <div>
        {/* Main Content Area */}
        <main className="content max-w-7xl mx-auto w-full p-4 sm:p-8 pt-6 sm:pt-10">
          {/* Unauthenticated Gateway Screen (Imparted as Primary Entrypoint) */}
          {!user ? (
            <GatewayRegistration
              initialReferralCode={referralCodeFromUrl}
              onCurrencyChange={setCurrency}
              onSuccess={(loggedInUser, mode) => {
                syncUserToStorage(loggedInUser);
                setIsGuestPreview(false);
                if (mode === 'login') {
                  showNotification(`Welcome back to Avor invest, ${loggedInUser.full_name}!`);
                } else {
                  showNotification(
                    `Welcome to Avor invest, ${loggedInUser.full_name}! You received 3,000 UGX bonus as a Gateway Reward on your Balance.`
                  );
                }
                setActiveTab('home');
              }}
            />
          ) : (
            <>
              {activeTab === 'home' && (
                <Homepage
                  currency={currency}
                  onCurrencyChange={setCurrency}
                  user={user}
                  machines={machines}
                  investments={investments}
                  onSelectMachine={(m) => handleSelectMachineToBuy(m)}
                  onNavigateToMarketplace={(categoryFilter) => {
                    if (categoryFilter) {
                      setSelectedCategory(categoryFilter);
                    }
                    setActiveTab('marketplace');
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  onNavigateToIncome={() => setActiveTab('income')}
                  onNavigateToAdmin={() => {
                    if (checkAndSyncOwnerDevice(user)) {
                      setActiveTab('admin');
                    }
                  }}
                  onOpenAuth={() => setIsGuestPreview(false)}
                  onNavigateToAccount={() => setActiveTab('profile')}
                  onOpenWallet={(type) => {
                    if (!user) {
                      setIsGuestPreview(false);
                      setShowAuthModal(true);
                    } else {
                      setWalletMode(type);
                      setShowWalletModal(true);
                    }
                  }}
                />
              )}

              {activeTab === 'marketplace' && (
                <div className="space-y-4">
                  <CategoryTabs
                    selectedCategory={selectedCategory}
                    onSelectCategory={setSelectedCategory}
                    searchQuery={searchQuery}
                    onSearchChange={setSearchQuery}
                    viewMode={marketplaceViewMode}
                    onViewModeChange={setMarketplaceViewMode}
                    hasBoughtMachine={hasBoughtMachine}
                    invitedCount={invitedCount}
                    onLockedPlaneNotify={(msg) => showNotification(msg, 'error')}
                  />

                  {marketplaceViewMode === 'table' ? (
                    <MachineTableView
                      machines={filteredMachines}
                      currency={currency}
                      hasBoughtMachine={hasBoughtMachine}
                      invitedCount={invitedCount}
                      onInvestClick={(m) => handleSelectMachineToBuy(m)}
                    />
                  ) : filteredMachines.length === 0 ? (
                    <div className="shining-card rounded-2xl p-12 text-center border border-blue-950/80 space-y-3">
                      <Cpu className="w-10 h-10 text-slate-500 mx-auto" />
                      <h3 className="text-base font-bold text-white">No Equipment Units Found</h3>
                      <p className="text-xs text-slate-400">
                        No machines match your selected category or search filter.
                      </p>
                      <button
                        onClick={() => {
                          setSelectedCategory('ALL');
                          setSearchQuery('');
                        }}
                        className="px-4 py-2 bg-[#070e1f] hover:bg-[#0d1733] border border-blue-900/50 text-blue-400 rounded-xl text-xs font-bold transition-all cursor-pointer"
                      >
                        Reset Search & Filters
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 max-w-5xl mx-auto">
                      {filteredMachines.map((machine) => (
                        <MachineCard
                          key={machine.id}
                          machine={machine}
                          currency={currency}
                          hasBoughtMachine={hasBoughtMachine}
                          invitedCount={invitedCount}
                          onInvestClick={(m) => handleSelectMachineToBuy(m)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'income' && (
                <IncomePlaneView
                  user={user}
                  investments={investments}
                  currency={currency}
                  onClaimYield={handleClaimYield}
                  onNavigateToMarketplace={() => setActiveTab('marketplace')}
                  onOpenAuth={() => {
                    setIsGuestPreview(false);
                    setShowAuthModal(true);
                  }}
                  onRefresh={fetchUserPortfolio}
                />
              )}

              {(activeTab === 'profile' || activeTab === 'account' || (activeTab as string) === 'referrals') && (
                <AccountView
                  user={user}
                  investments={investments}
                  currency={currency}
                  onCurrencyChange={setCurrency}
                  onLogout={handleLogout}
                  initialTab={(activeTab as string) === 'referrals' ? 'invite' : 'profile'}
                  onClaimYield={handleClaimYield}
                  onOpenWalletModal={(mode) => {
                    if (!user) {
                      setIsGuestPreview(false);
                      setShowAuthModal(true);
                    } else {
                      setWalletMode(mode);
                      setShowWalletModal(true);
                    }
                  }}
                  onUpdateUser={(updatedUser) => syncUserToStorage(updatedUser)}
                  onOpenAuth={() => {
                    setIsGuestPreview(false);
                    setShowAuthModal(true);
                  }}
                  onNavigateToMarketplace={() => setActiveTab('marketplace')}
                />
              )}

              {activeTab === 'admin' && checkAndSyncOwnerDevice(user) && (
                <AdminPanel
                  onExitAdmin={() => setActiveTab('home')}
                  onDataChanged={() => {
                    fetchUserData();
                    fetchUserPortfolio();
                    fetchMachines();
                  }}
                  onMachineCreated={() => {
                    fetchMachines();
                    showNotification('New machine added to live marketplace!');
                    setActiveTab('marketplace');
                  }}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* Show WhatsApp Widget, Bottom Navigation Bar, and Footer only when signed in */}
      {user && (
        <>
          <WhatsAppWidget
            hasBoughtMachine={hasBoughtMachine}
            onExploreMachines={() => setActiveTab('marketplace')}
          />

          <BottomNav
            activeTab={activeTab}
            hasBoughtMachine={hasBoughtMachine}
            onTabChange={(tab: any) => {
              const target = tab === 'account' || tab === 'referrals' ? 'profile' : tab;
              if (target === 'admin' && !checkAndSyncOwnerDevice(user)) {
                setActiveTab('home');
                return;
              }
              setActiveTab(target);
            }}
            user={user}
            onOpenAuth={() => setIsGuestPreview(false)}
            onOpenWallet={(mode) => {
              setWalletMode(mode);
              setShowWalletModal(true);
            }}
          />

          <div className="pb-16">
            <Footer
              hasBoughtMachine={hasBoughtMachine}
              onNavigateToMarketplace={() => setActiveTab('marketplace')}
            />
          </div>
        </>
      )}

      {/* Modals */}
      {selectedMachineToInvest && (
        <InvestModal
          machine={selectedMachineToInvest}
          currency={currency}
          user={user}
          userInvestments={investments}
          onClose={() => setSelectedMachineToInvest(null)}
          onDepositSubmitted={() => {
            fetchUserData();
            fetchUserPortfolio();
          }}
          onSuccess={() => {
            fetchUserPortfolio();
            fetchMachines();
            fetchUserData();
            showNotification('Machine bought and activated (Day 1) using your Admin-approved wallet balance!');
            setActiveTab('income');
          }}
          onOpenAuth={() => {
            setSelectedMachineToInvest(null);
            setIsGuestPreview(false);
            setShowAuthModal(true);
          }}
          onOpenDeposit={() => {
            setSelectedMachineToInvest(null);
            setWalletMode('deposit');
            setShowWalletModal(true);
          }}
          onNotify={(msg, type) => showNotification(msg, type || 'error')}
        />
      )}

      {showAuthModal && (
        <AuthModal
          initialReferralCode={referralCodeFromUrl}
          onClose={() => setShowAuthModal(false)}
          onCurrencyChange={setCurrency}
          onLoginSuccess={(loggedInUser) => {
            syncUserToStorage(loggedInUser);
            setIsGuestPreview(false);
            setShowAuthModal(false);
            showNotification(`Welcome to Avor invest, ${loggedInUser.full_name}!`);
            setActiveTab('home');
          }}
        />
      )}

      {showWalletModal && user && (
        <WalletModal
          user={user}
          currency={currency}
          initialMode={walletMode}
          hasBoughtMachine={hasBoughtMachine}
          userInvestments={investments}
          onClose={() => setShowWalletModal(false)}
          onRefreshUser={() => {
            fetchUserData();
            fetchUserPortfolio();
          }}
          onNavigateToMarketplace={() => setActiveTab('marketplace')}
        />
      )}
    </div>
  );
}
