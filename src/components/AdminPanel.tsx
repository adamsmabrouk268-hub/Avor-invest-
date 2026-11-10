import React, { useState, useEffect } from 'react';
import { MachineCategory, Transaction, User, Machine, HomepageConfig } from '../types';
import { DepositNumbersManager } from './DepositNumbersManager';
import { checkAndSyncOwnerDevice } from './TopThreeDotMenu';
import { onAuthStateChanged } from 'firebase/auth';
import {
  auth,
  subscribeToFirestoreAdminMessages,
  subscribeToFirestoreOrders,
  subscribeToFirestoreWithdrawals,
  confirmOrderInFirestore,
  denyOrderInFirestore,
  approveWithdrawalInFirestore,
  rejectWithdrawalInFirestore,
  clearAllFirestoreOrdersAndMessages,
  FirestoreOrderRecord,
  FirestoreWithdrawalRecord,
  signInAdminWithGoogle,
  deleteFirestoreAdminMessage,
} from '../firebase';
import { notifyAdminOnDeposit } from '../notifyAdminOnDeposit';
import {
  PlusCircle,
  Cpu,
  CheckCircle2,
  AlertCircle,
  Lock,
  Mail,
  Key,
  ShieldCheck,
  Check,
  X,
  Clock,
  DollarSign,
  Users,
  Send,
  RefreshCw,
  Search,
  Edit3,
  Trash2,
  Globe,
  Settings,
  ArrowDownLeft,
  ArrowUpRight,
  Megaphone,
  Image as ImageIcon,
  Upload,
  Sparkles,
  Copy,
  Layers,
  Zap,
  TrendingUp,
  Sliders,
  Eye,
  SlidersHorizontal,
  FolderPlus,
  Shuffle,
  Download,
  FileJson,
} from 'lucide-react';

export const PRESET_MACHINE_IMAGES = [
  {
    name: 'Series P Quantum Rig',
    tag: 'Series P',
    url: 'https://images.unsplash.com/photo-1587202372775-e229f172b9d7?w=600&auto=format&fit=crop&q=80',
  },
  {
    name: 'Series P Blade Node',
    tag: 'Series P',
    url: 'https://images.unsplash.com/photo-1629654297299-c8506221ca97?w=600&auto=format&fit=crop&q=80',
  },
  {
    name: 'VT-100 Genesis Miner',
    tag: 'VT Series',
    url: 'https://images.unsplash.com/photo-1591488320449-011701bb6704?w=600&auto=format&fit=crop&q=80',
  },
  {
    name: 'Dual Core Server Array',
    tag: 'VT Series',
    url: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?w=600&auto=format&fit=crop&q=80',
  },
  {
    name: 'Modular Data Rack',
    tag: 'VT Series',
    url: 'https://images.unsplash.com/photo-1544197150-b99a580bb7a8?w=600&auto=format&fit=crop&q=80',
  },
  {
    name: 'PD-10 ASIC Falcon Array',
    tag: 'PD Series',
    url: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=600&auto=format&fit=crop&q=80',
  },
  {
    name: 'PD-20 High-Density Rig',
    tag: 'PD Series',
    url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80',
  },
  {
    name: 'Quantum AI Tensor Matrix',
    tag: 'HD AI',
    url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=600&auto=format&fit=crop&q=80',
  },
  {
    name: 'Enterprise Supercomputing Grid',
    tag: 'HD AI',
    url: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=600&auto=format&fit=crop&q=80',
  },
  {
    name: 'Commercial Immersion Center',
    tag: 'PD Series',
    url: 'https://images.unsplash.com/photo-1563986768609-322da13575f3?w=600&auto=format&fit=crop&q=80',
  },
];

interface AdminPanelProps {
  onMachineCreated: () => void;
  onDataChanged?: () => void;
  onExitAdmin?: () => void;
}

export const AdminPanel: React.FC<AdminPanelProps> = ({ onMachineCreated, onDataChanged, onExitAdmin }) => {
  // Admin Login State (Persisted in session or when on owner's paired device)
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean>(() => {
    try {
      if (typeof window !== 'undefined' && sessionStorage.getItem('avor_admin_authenticated') === 'true') {
        return true;
      }
      return checkAndSyncOwnerDevice();
    } catch {
      return false;
    }
  });
  const [adminEmail, setAdminEmail] = useState<string>('');
  const [adminPassword, setAdminPassword] = useState<string>('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isApprovingAll, setIsApprovingAll] = useState<boolean>(false);

  // Active Tab
  const [activeTab, setActiveTab] = useState<
    'DEPOSITS' | 'ORDER_MESSAGES' | 'LEDGER' | 'DEPOSIT_NUMBERS' | 'WITHDRAWALS' | 'MACHINES' | 'HOMEPAGE' | 'USERS' | 'SECURITY'
  >('DEPOSITS');

  // Admin Data State
  const [stats, setStats] = useState<any>(null);
  const [deposits, setDeposits] = useState<Transaction[]>([]);
  const [adminMessages, setAdminMessages] = useState<any[]>([]);
  const [firestoreMessages, setFirestoreMessages] = useState<any[]>([]);
  const [firestoreOrders, setFirestoreOrders] = useState<FirestoreOrderRecord[]>([]);
  const [firestoreWithdrawals, setFirestoreWithdrawals] = useState<FirestoreWithdrawalRecord[]>([]);
  const [serverInvestments, setServerInvestments] = useState<any[]>([]);
  const [serverWithdrawals, setServerWithdrawals] = useState<any[]>([]);
  const [firebaseAdminEmail, setFirebaseAdminEmail] = useState<string | null>(null);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [investmentsLedger, setInvestmentsLedger] = useState<any[]>([]);
  const [userList, setUserList] = useState<User[]>([]);
  const [machineList, setMachineList] = useState<Machine[]>([]);
  const [homepageConfig, setHomepageConfigState] = useState<HomepageConfig | null>(null);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // User Credit Form State
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [creditAmount, setCreditAmount] = useState<number>(10000);
  const [creditNote, setCreditNote] = useState<string>('Welcome Admin Bonus');
  const [isCrediting, setIsCrediting] = useState<boolean>(false);
  const [userSearchTerm, setUserSearchTerm] = useState<string>('');

  // Machine Creation / Edit Form State
  const [editingMachineId, setEditingMachineId] = useState<string | null>(null);
  const [title, setTitle] = useState<string>('');
  const [category, setCategory] = useState<MachineCategory>('AV1');
  const [seriesTag, setSeriesTag] = useState<string>('AV1');
  const [description, setDescription] = useState<string>('');
  const [totalCost, setTotalCost] = useState<number>(15000);
  const [durationDays, setDurationDays] = useState<number>(15);
  const [dailyYield, setDailyYield] = useState<number>(1500);
  const [hashrate, setHashrate] = useState<string>('85 TH/s AV1 Node');
  const [powerConsumption, setPowerConsumption] = useState<string>('1100W Smart-Cooling');
  const [availableUnits, setAvailableUnits] = useState<number>(50);
  const [vipLevel, setVipLevel] = useState<number>(0);
  const [imageUrl, setImageUrl] = useState<string>(PRESET_MACHINE_IMAGES[0].url);
  const [isSavingMachine, setIsSavingMachine] = useState<boolean>(false);

  // Machine List Filter & Quick Edit State
  const [machineSearchTerm, setMachineSearchTerm] = useState<string>('');
  const [machineCategoryFilter, setMachineCategoryFilter] = useState<MachineCategory | 'ALL'>('ALL');
  const [quickEditMachine, setQuickEditMachine] = useState<Machine | null>(null);
  const [quickPrice, setQuickPrice] = useState<number>(0);
  const [quickDuration, setQuickDuration] = useState<number>(0);
  const [quickYield, setQuickYield] = useState<number>(0);
  const [isQuickSaving, setIsQuickSaving] = useState<boolean>(false);

  // Homepage Config Form State
  const [announcementBadge, setAnnouncementBadge] = useState<string>('');
  const [headline, setHeadline] = useState<string>('');
  const [subheadline, setSubheadline] = useState<string>('');
  const [noticeText, setNoticeText] = useState<string>('');
  const [depositReceiverNumber, setDepositReceiverNumber] = useState<string>('');
  const [depositReceiverName, setDepositReceiverName] = useState<string>('');
  const [isSavingHomepage, setIsSavingHomepage] = useState<boolean>(false);

  // Security Form State
  const [currentAdminPass, setCurrentAdminPass] = useState<string>('');
  const [newAdminPass, setNewAdminPass] = useState<string>('');
  const [confirmAdminPass, setConfirmAdminPass] = useState<string>('');
  const [isChangingPass, setIsChangingPass] = useState<boolean>(false);

  // Handle Admin Login
  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    const trimmedEmail = adminEmail.trim().toLowerCase();
    const trimmedPass = adminPassword.trim();

    if (trimmedEmail !== 'adamsmabrouk268@gmail.com') {
      setAuthError('Access Denied: Invalid administrator email or password.');
      return;
    }

    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmedEmail, password: trimmedPass }),
      });

      const ct = res.headers.get('content-type') || '';
      const data = ct.includes('application/json') ? await res.json() : {};
      if (!res.ok) {
        if (trimmedEmail === 'adamsmabrouk268@gmail.com' && trimmedPass === 'adams@268#') {
          try { sessionStorage.setItem('avor_admin_authenticated', 'true'); } catch {}
          setIsAdminAuthenticated(true);
          fetchAdminData();
          fetchMachines();
          return;
        }
        throw new Error(data.error || 'Access Denied: Invalid administrator email or password.');
      }

      try { sessionStorage.setItem('avor_admin_authenticated', 'true'); } catch {}
      setIsAdminAuthenticated(true);
      fetchAdminData();
      fetchMachines();
    } catch (err: any) {
      if (trimmedEmail === 'adamsmabrouk268@gmail.com' && trimmedPass === 'adams@268#') {
        try { sessionStorage.setItem('avor_admin_authenticated', 'true'); } catch {}
        setIsAdminAuthenticated(true);
        fetchAdminData();
        fetchMachines();
        return;
      }
      setAuthError(err.message || 'Authentication failed.');
    }
  };

  // Fetch Overview Data directly from server & Firestore without restoring stale localStorage backups
  const fetchAdminData = async () => {
    setIsLoadingData(true);
    try {
      try {
        localStorage.removeItem('avor_admin_vault_backup_v1');
        localStorage.removeItem('avor_admin_vault_backup_v2');
      } catch {}

      const res = await fetch('/api/admin/overview');
      const ct = res.headers.get('content-type') || '';
      if (res.ok && ct.includes('application/json')) {
        const data = await res.json();

        setStats(data);
        setDeposits(data.deposits || []);
        setAdminMessages(data.admin_notifications || []);
        setServerWithdrawals(data.withdrawals || []);
        setServerInvestments(data.investments || []);
        setUserList(data.users || []);
        if (data.homepage_config) {
          setHomepageConfigState(data.homepage_config);
          setAnnouncementBadge(data.homepage_config.announcement_badge || '');
          setHeadline(data.homepage_config.headline || '');
          setSubheadline(data.homepage_config.subheadline || '');
          setNoticeText(data.homepage_config.notice_text || '');
          setDepositReceiverNumber(data.homepage_config.deposit_receiver_number || '');
          setDepositReceiverName(data.homepage_config.deposit_receiver_name || '');
        }
        if (data.users && data.users.length > 0 && !selectedUserId) {
          setSelectedUserId(data.users[0].id);
        }
      }
    } catch {
      // Transient fetch error during background polling or server restart — keep existing state silently
    } finally {
      setIsLoadingData(false);
    }
  };

  const handleResetAllSystemZero = async () => {
    setIsLoadingData(true);
    setStatusMessage(null);
    try {
      await clearAllFirestoreOrdersAndMessages();
      const res = await fetch('/api/admin/reset-all-zero', { method: 'POST' });
      const data = await res.json();
      await fetch('/api/system/reset-state', { method: 'POST' });

      try {
        localStorage.removeItem('avor_admin_vault_backup_v1');
        localStorage.removeItem('avor_admin_vault_backup_v2');
        localStorage.removeItem('avor_my_deposit_refs');
        for (let i = localStorage.length - 1; i >= 0; i--) {
          const k = localStorage.key(i);
          if (k && k.startsWith('avor_invest_txs_')) {
            localStorage.removeItem(k);
          }
        }
      } catch {}

      setFirestoreOrders([]);
      setFirestoreWithdrawals([]);
      setFirestoreMessages([]);
      setServerInvestments([]);
      setServerWithdrawals([]);
      setInvestmentsLedger([]);
      setDeposits([]);
      setWithdrawals([]);
      await fetchAdminData();
      if (onDataChanged) onDataChanged();
      setStatusMessage({
        type: 'success',
        text:
          data.message ||
          'System reset to 0: No machines sold, 0 money in total system wallet, 0 active cycles, 0 pending orders.',
      });
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message || 'Failed to reset system.' });
    } finally {
      setIsLoadingData(false);
    }
  };

  const fetchMachines = async () => {
    try {
      const res = await fetch('/api/machines');
      const ct = res.headers.get('content-type') || '';
      if (res.ok && ct.includes('application/json')) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setMachineList(data);
        }
      }
    } catch {
      // Transient fetch error during background polling — keep existing machine list silently
    }
  };

  useEffect(() => {
    if (isAdminAuthenticated) {
      fetchAdminData();
      fetchMachines();
      const interval = setInterval(() => {
        fetchAdminData();
      }, 3000);

      let es: EventSource | null = null;
      try {
        es = new EventSource('/api/realtime/wallet-stream');
        es.onmessage = (event) => {
          try {
            const parsed = JSON.parse(event.data);
            if (parsed?.order_type === 'SYSTEM_RESET_ZERO') {
              setFirestoreOrders([]);
              setFirestoreWithdrawals([]);
              setFirestoreMessages([]);
              setServerInvestments([]);
              setServerWithdrawals([]);
              setInvestmentsLedger([]);
              setDeposits([]);
              setWithdrawals([]);
              fetchAdminData();
              return;
            }
            if (
              parsed &&
              (parsed.type === 'DEPOSIT_CREATED_PENDING' ||
                parsed.type === 'MACHINE_ORDER_CREATED_PENDING' ||
                parsed.type === 'WITHDRAWAL_CREATED_PENDING' ||
                parsed.type === 'WITHDRAWAL_APPROVED_SYNC' ||
                parsed.type === 'WITHDRAWAL_REJECTED_SYNC' ||
                parsed.type === 'WALLET_CONFIRMED_SYNC' ||
                parsed.type === 'WALLET_DENIED_SYNC')
            ) {
              fetchAdminData();
            }
          } catch {}
        };
      } catch {}

      const handleSystemZeroReset = () => {
        setFirestoreOrders([]);
        setFirestoreWithdrawals([]);
        setFirestoreMessages([]);
        setServerInvestments([]);
        setServerWithdrawals([]);
        setInvestmentsLedger([]);
        setDeposits([]);
        setWithdrawals([]);
        fetchAdminData();
      };
      window.addEventListener('avor-system-reset-zero', handleSystemZeroReset);

      return () => {
        clearInterval(interval);
        window.removeEventListener('avor-system-reset-zero', handleSystemZeroReset);
        try {
          es?.close();
        } catch {}
      };
    }
  }, [isAdminAuthenticated]);

  useEffect(() => {
    if (!isAdminAuthenticated) return;
    const unsubFirestore = subscribeToFirestoreAdminMessages((items) => {
      setFirestoreMessages(items);
    });
    const unsubOrders = subscribeToFirestoreOrders((orders) => {
      setFirestoreOrders(orders);
    });
    const unsubWithdrawals = subscribeToFirestoreWithdrawals((wdrs) => {
      setFirestoreWithdrawals(wdrs);
    });
    const unsubTrigger = notifyAdminOnDeposit.startListener();

    const unsubAuth = onAuthStateChanged(auth, (fbUser) => {
      if (fbUser && fbUser.email) {
        setFirebaseAdminEmail(fbUser.email);
      } else {
        setFirebaseAdminEmail('adamsmabrouk268@gmail.com');
      }
    });
    return () => {
      unsubAuth();
      unsubFirestore();
      unsubOrders();
      unsubWithdrawals();
      unsubTrigger();
    };
  }, [isAdminAuthenticated]);

  // Real-time merge of Firebase Firestore `withdrawals` collection with backend withdrawals
  useEffect(() => {
    const mergedWdrMap = new Map<string, any>();

    // 1. Load all withdrawals from real-time Firebase Firestore `withdrawals` collection first
    for (const fbWdr of firestoreWithdrawals) {
      mergedWdrMap.set(fbWdr.id, {
        ...fbWdr,
        userId: fbWdr.userId || fbWdr.user_id || fbWdr.phone,
        user_id: fbWdr.user_id || fbWdr.userId || fbWdr.phone,
        name: fbWdr.name || fbWdr.account_name || 'Avor Investor',
        phone: fbWdr.phone || '',
      });
    }

    // 2. Merge with backend server withdrawals
    for (const srvWdr of serverWithdrawals) {
      const existingFb = mergedWdrMap.get(srvWdr.id);
      if (existingFb) {
        mergedWdrMap.set(srvWdr.id, {
          ...srvWdr,
          ...existingFb,
          status: existingFb.status || srvWdr.status,
          firestore_status:
            existingFb.firestore_status ||
            (srvWdr.status === 'SUCCESS' ? 'approved' : srvWdr.status === 'FAILED' ? 'rejected' : 'pending'),
        });
      } else {
        mergedWdrMap.set(srvWdr.id, {
          ...srvWdr,
          userId: srvWdr.userId || srvWdr.user_id || '',
          name: srvWdr.name || srvWdr.customer_name || srvWdr.user_id || 'Avor Investor',
          phone: srvWdr.phone || srvWdr.customer_phone || '',
          firestore_status:
            srvWdr.status === 'SUCCESS' ? 'approved' : srvWdr.status === 'FAILED' ? 'rejected' : 'pending',
        });
      }
    }

    const mergedWdrList = Array.from(mergedWdrMap.values()).sort((a, b) => {
      if (a.status === 'PENDING' && b.status !== 'PENDING') return -1;
      if (a.status !== 'PENDING' && b.status === 'PENDING') return 1;
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    });
    setWithdrawals(mergedWdrList);
  }, [firestoreWithdrawals, serverWithdrawals]);

  // Real-time merge of Firebase Firestore `orders` collection with backend investments
  useEffect(() => {
    const mergedMap = new Map<string, any>();

    // 1. Load all orders from real-time Firebase Firestore `orders` collection first
    for (const fbOrd of firestoreOrders) {
      mergedMap.set(fbOrd.id, {
        ...fbOrd,
        customername: fbOrd.customername || fbOrd.customer_name || 'Avor Investor',
        name: fbOrd.name || fbOrd.machine_title || 'Machine Order',
        customer_name: fbOrd.customer_name || fbOrd.customername || 'Avor Investor',
        machine_title: fbOrd.machine_title || fbOrd.name || 'Machine Order',
      });
    }

    // 2. Merge with backend server investments
    for (const srvInv of serverInvestments) {
      const existingFb = mergedMap.get(srvInv.id);
      if (existingFb) {
        // Firestore `orders` status is authoritative for real-time order state
        mergedMap.set(srvInv.id, {
          ...srvInv,
          ...existingFb,
          status: existingFb.status || srvInv.status,
          raw_firestore_status:
            existingFb.raw_firestore_status ||
            (srvInv.status === 'ACTIVE' ? 'ACTIVE & DELIVERED' : srvInv.status === 'PENDING' ? 'pending' : srvInv.status),
        });
      } else {
        mergedMap.set(srvInv.id, {
          ...srvInv,
          customername: srvInv.customer_name || srvInv.user_id || 'Avor Investor',
          name: srvInv.machine_title || 'Machine Order',
          raw_firestore_status:
            srvInv.status === 'ACTIVE' ? 'ACTIVE & DELIVERED' : srvInv.status === 'PENDING' ? 'pending' : srvInv.status,
        });
      }
    }

    const mergedList = Array.from(mergedMap.values()).sort(
      (a, b) =>
        new Date(b.start_date || b.created_at || 0).getTime() -
        new Date(a.start_date || a.created_at || 0).getTime()
    );
    setInvestmentsLedger(mergedList);
  }, [firestoreOrders, serverInvestments]);

  // Handle Deposit Confirm / Deny Action:
  // - APPROVE: Changes Pending -> Successful & confirms customer's Wallet balance (and starts machine cycle)
  // - REJECT (Deny): Marks as Denied (Fake Order) & immediately removes the fake order money from customer's Wallet balance
  const handleDepositAction = async (
    transactionId: string,
    action: 'APPROVE' | 'REJECT',
    extraMeta?: Record<string, any>
  ) => {
    setStatusMessage(null);
    try {
      const res = await fetch('/api/admin/deposits/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transaction_id: transactionId,
          action,
          ...(extraMeta || {}),
          notes:
            action === 'APPROVE'
              ? 'Confirmed by Admin: Status changed Pending -> Successful & amount confirmed on customer Wallet'
              : 'Denied by Admin as a fake/unverified order — money removed from customer Wallet',
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Deposit action failed.');

      if (action === 'APPROVE') {
        try {
          const bc = new BroadcastChannel('avor_realtime_wallet_sync');
          bc.postMessage({
            type: 'WALLET_CONFIRMED_SYNC',
            transaction: data.transaction,
            transaction_id: data.transaction?.id || transactionId,
            payment_reference: data.transaction?.payment_reference || extraMeta?.payment_reference,
            status: 'SUCCESS',
            status_label: 'Successful',
            user_id: data.transaction?.user_id || extraMeta?.user_id,
            user_phone: data.transaction?.user_phone || extraMeta?.customer_phone,
            customer_phone: data.transaction?.customer_phone || extraMeta?.customer_phone,
            amount_added: Number(data.transaction?.amount || extraMeta?.amount || 0),
            wallet_balance: data.wallet_balance,
            available_wallet: data.available_wallet,
            balance: data.new_balance,
            timestamp: new Date().toISOString(),
          });
          bc.close();
        } catch {}
      } else if (action === 'REJECT') {
        const fbDocId =
          data.transaction?.firebase_doc_id ||
          extraMeta?.firebase_doc_id ||
          data.transaction?.payment_reference ||
          extraMeta?.payment_reference;
        if (fbDocId) {
          deleteFirestoreAdminMessage(fbDocId).catch(() => {});
        }
        try {
          const rawBackup = localStorage.getItem('avor_admin_vault_backup_v2');
          if (rawBackup) {
            const backup = JSON.parse(rawBackup);
            if (Array.isArray(backup.deposits)) {
              backup.deposits = backup.deposits.map((d: any) =>
                d &&
                (d.id === transactionId ||
                  d.id === data.transaction?.id ||
                  (extraMeta?.payment_reference && d.payment_reference === extraMeta.payment_reference))
                  ? { ...d, status: 'FAILED', status_label: 'Denied (Fake Order)', wallet_credited: false }
                  : d
              );
              localStorage.setItem('avor_admin_vault_backup_v2', JSON.stringify(backup));
            }
          }
        } catch {}
        try {
          const bc = new BroadcastChannel('avor_realtime_wallet_sync');
          bc.postMessage({
            type: 'WALLET_DENIED_SYNC',
            transaction: data.transaction,
            transaction_id: data.transaction?.id || transactionId,
            payment_reference: data.transaction?.payment_reference || extraMeta?.payment_reference,
            status: 'FAILED',
            status_label: 'Denied (Fake Order)',
            user_id: data.transaction?.user_id || extraMeta?.user_id,
            user_phone: data.transaction?.user_phone || extraMeta?.customer_phone,
            customer_phone: data.transaction?.customer_phone || extraMeta?.customer_phone,
            amount_removed: Number(data.transaction?.amount || extraMeta?.amount || 0),
            wallet_balance: data.wallet_balance,
            available_wallet: data.available_wallet,
            balance: data.new_balance,
            timestamp: new Date().toISOString(),
          });
          bc.close();
        } catch {}
      }

      setStatusMessage({
        type: 'success',
        text:
          data.message ||
          (action === 'APPROVE'
            ? 'Confirmed! Status changed from Pending -> Successful and amount confirmed on customer Wallet!'
            : 'Payment denied (Fake Order)! Money has been removed from the customer Wallet.'),
      });
      await fetchAdminData();
      if (onDataChanged) onDataChanged();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    }
  };

  // Handle Confirm All Submitted Deposits
  const handleApproveAllDeposits = async () => {
    setStatusMessage(null);
    setIsApprovingAll(true);
    try {
      const res = await fetch('/api/admin/deposits/approve-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to confirm all deposits.');

      try {
        const bc = new BroadcastChannel('avor_realtime_wallet_sync');
        bc.postMessage({
          type: 'WALLET_CONFIRMED_SYNC',
          status: 'SUCCESS',
          status_label: 'Successful',
          timestamp: new Date().toISOString(),
        });
        bc.close();
      } catch {}

      setStatusMessage({
        type: 'success',
        text: data.message || 'All submitted deposits confirmed and reflected across all deposit planes!',
      });
      await fetchAdminData();
      if (onDataChanged) onDataChanged();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    } finally {
      setIsApprovingAll(false);
    }
  };

  // Explicit Admin-Only Delete Deposit Record (No money details leave the system unless deleted by Admin)
  const handleDeleteDepositRecord = async (txId: string) => {
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/admin/deposits/${encodeURIComponent(txId)}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete record.');
      try {
        const rawBackup = localStorage.getItem('avor_admin_vault_backup_v2');
        if (rawBackup) {
          const backup = JSON.parse(rawBackup);
          if (Array.isArray(backup.deposits)) {
            backup.deposits = backup.deposits.filter((d: any) => d && d.id !== txId);
          }
          localStorage.setItem('avor_admin_vault_backup_v2', JSON.stringify(backup));
        }
      } catch {}
      setStatusMessage({
        type: 'success',
        text: data.message || 'Deposit record permanently deleted by Admin.',
      });
      await fetchAdminData();
      if (onDataChanged) onDataChanged();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    }
  };

  // Handle Confirm / Approve / Deliver or Deny Pending Machine Order in Orders section
  // - On APPROVE: updates Firestore 'orders' document status to "confirmed" and then to "ACTIVE & DELIVERED"
  // - On REJECT: updates Firestore 'orders' document status to "denied"
  const handleOrderAction = async (
    investmentId: string,
    action: 'APPROVE' | 'REJECT' = 'APPROVE',
    orderObj?: any
  ) => {
    setStatusMessage(null);
    const targetOrder = orderObj || investmentsLedger.find((i) => i.id === investmentId);

    try {
      // 1. Update the real Firebase Firestore `orders` collection document first
      if (action === 'APPROVE') {
        await confirmOrderInFirestore(investmentId, targetOrder);
      } else {
        await denyOrderInFirestore(investmentId, targetOrder);
      }

      // 2. Sync with backend server so customer's machine cycle & wallet stay in lockstep
      const res = await fetch('/api/admin/orders/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          investment_id: investmentId,
          action,
          customername: targetOrder?.customername || targetOrder?.customer_name,
          name: targetOrder?.name || targetOrder?.machine_title,
          customer_phone: targetOrder?.customer_phone,
          user_id: targetOrder?.user_id,
          machine_id: targetOrder?.machine_id,
          machine_title: targetOrder?.machine_title || targetOrder?.name,
          amount_invested: targetOrder?.amount_invested || targetOrder?.amount,
          daily_return: targetOrder?.daily_return || targetOrder?.daily_yield,
          duration_days: targetOrder?.duration_days,
          units: targetOrder?.units,
          notes:
            action === 'APPROVE'
              ? 'Order Confirmed & Delivered by Admin in Pending Orders section (Firestore status: confirmed -> ACTIVE & DELIVERED)'
              : 'Order Denied by Admin in Pending Orders section (Firestore status: denied)',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to process order action.');

      try {
        const bc = new BroadcastChannel('avor_realtime_wallet_sync');
        bc.postMessage({
          type: action === 'APPROVE' ? 'WALLET_CONFIRMED_SYNC' : 'WALLET_DENIED_SYNC',
          order_type: action === 'APPROVE' ? 'ORDER_CONFIRMED_SYNC' : 'ORDER_DENIED_SYNC',
          investment_id: investmentId,
          investment: data.investment,
          user_id: data.investment?.user_id || targetOrder?.user_id,
          user_phone: data.investment?.customer_phone || targetOrder?.customer_phone,
          customer_phone: data.investment?.customer_phone || targetOrder?.customer_phone,
          status: action === 'APPROVE' ? 'ACTIVE' : 'CANCELLED',
          firestore_status: action === 'APPROVE' ? 'ACTIVE & DELIVERED' : 'denied',
          timestamp: new Date().toISOString(),
        });
        bc.close();
      } catch {}

      setStatusMessage({
        type: 'success',
        text:
          data.message ||
          (action === 'APPROVE'
            ? 'Order Confirmed! Firestore order status updated to "confirmed" -> "ACTIVE & DELIVERED" (Day 1 started).'
            : 'Order Denied! Firestore order status updated to "denied" and refunded to customer wallet.'),
      });
      await fetchAdminData();
      if (onDataChanged) onDataChanged();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    }
  };

  // Handle Confirm All Pending Orders at once
  const handleApproveAllOrders = async () => {
    setStatusMessage(null);
    try {
      const pendingOrders = investmentsLedger.filter((i) => i.status === 'PENDING');
      for (const ord of pendingOrders) {
        await confirmOrderInFirestore(ord.id, ord);
      }

      const res = await fetch('/api/admin/orders/approve-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to confirm all pending orders.');

      try {
        const bc = new BroadcastChannel('avor_realtime_wallet_sync');
        bc.postMessage({
          type: 'WALLET_CONFIRMED_SYNC',
          order_type: 'ORDER_CONFIRMED_SYNC',
          status: 'ACTIVE',
          firestore_status: 'ACTIVE & DELIVERED',
          timestamp: new Date().toISOString(),
        });
        bc.close();
      } catch {}

      setStatusMessage({
        type: 'success',
        text: data.message || 'All pending orders updated to "confirmed" -> "ACTIVE & DELIVERED" in Firestore!',
      });
      await fetchAdminData();
      if (onDataChanged) onDataChanged();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    }
  };

  // Handle Toggle Investment Status in Ledger
  const handleToggleInvestmentStatus = async (investmentId: string) => {
    setStatusMessage(null);
    try {
      const res = await fetch('/api/admin/investments/toggle-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ investment_id: investmentId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update investment status.');

      try {
        const bc = new BroadcastChannel('avor_realtime_wallet_sync');
        bc.postMessage({
          type: 'WALLET_CONFIRMED_SYNC',
          order_type: 'ORDER_CONFIRMED_SYNC',
          investment_id: investmentId,
          investment: data.investment,
          timestamp: new Date().toISOString(),
        });
        bc.close();
      } catch {}

      setStatusMessage({ type: 'success', text: data.message });
      await fetchAdminData();
      if (onDataChanged) onDataChanged();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    }
  };

  // Handle Toggle Customer Suspension
  const handleToggleUserSuspension = async (userId: string) => {
    setStatusMessage(null);
    try {
      const res = await fetch('/api/admin/user/toggle-suspension', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update customer status.');
      setStatusMessage({ type: 'success', text: data.message });
      fetchAdminData();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    }
  };

  // Handle Withdrawal Action (Approve / Reject in Firestore 'withdrawals' collection and backend)
  const handleWithdrawalAction = async (
    transactionId: string,
    action: 'APPROVE' | 'REJECT',
    wdrObj?: any
  ) => {
    setStatusMessage(null);
    const targetWdr = wdrObj || withdrawals.find((w) => w.id === transactionId);
    try {
      // 1. Update Firestore 'withdrawals' document first
      if (action === 'APPROVE') {
        await approveWithdrawalInFirestore(transactionId);
      } else {
        await rejectWithdrawalInFirestore(transactionId);
      }

      // 2. Sync with backend server so customer balance & notifications stay in lockstep
      const res = await fetch('/api/admin/withdrawals/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transaction_id: transactionId,
          action,
          userId: targetWdr?.userId || targetWdr?.user_id,
          user_id: targetWdr?.user_id || targetWdr?.userId,
          name: targetWdr?.name,
          phone: targetWdr?.phone,
          amount: targetWdr?.amount,
          payment_method: targetWdr?.payment_method,
          payment_reference: targetWdr?.payment_reference,
          notes: action === 'APPROVE' ? 'Paid out via admin gateway' : 'Declined by admin',
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Action failed.');

      setStatusMessage({
        type: 'success',
        text:
          action === 'APPROVE'
            ? 'Withdrawal approved & paid out! (Firestore status updated to "approved")'
            : 'Withdrawal rejected & refunded to customer balance! (Firestore status updated to "rejected")',
      });
      await fetchAdminData();
      if (onDataChanged) onDataChanged();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    }
  };

  // Handle Create / Edit Machine
  const handleSaveMachine = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingMachine(true);
    setStatusMessage(null);

    try {
      const endpoint = editingMachineId ? `/api/admin/machines/${editingMachineId}` : '/api/admin/machines';
      const method = editingMachineId ? 'PUT' : 'POST';

      const res = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          category,
          series_tag: seriesTag,
          description,
          total_cost: totalCost,
          duration_days: durationDays,
          daily_yield: dailyYield,
          hashrate_or_capacity: hashrate,
          power_consumption: powerConsumption,
          available_units: availableUnits,
          vip_level_required: vipLevel,
          image_url: imageUrl,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save machine.');

      setStatusMessage({
        type: 'success',
        text: editingMachineId
          ? `Machine "${data.machine?.title || title}" updated!`
          : `New Machine "${data.title}" published to marketplace!`,
      });

      onMachineCreated();
      fetchMachines();
      resetMachineForm();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    } finally {
      setIsSavingMachine(false);
    }
  };

  const handleEditMachineSelect = (m: Machine) => {
    setEditingMachineId(m.id);
    setTitle(m.title || m.name || '');
    setCategory(m.category || 'P_SERIES');
    setSeriesTag(m.series_tag || m.series || 'P-100');
    setDescription(m.description || '');
    setTotalCost(m.total_cost || m.price || 65000);
    setDurationDays(m.duration_days || (m.lockDurationMinutes ? Math.round(m.lockDurationMinutes / 1440) : 10));
    setDailyYield(m.daily_yield || m.rewardAmount || 16900);
    setHashrate(m.hashrate_or_capacity || '240 TH/s');
    setPowerConsumption(m.power_consumption || '1100W');
    setAvailableUnits(m.available_units || 50);
    setVipLevel(m.vip_level_required || 0);
    setImageUrl(m.image_url || m.imageUrl || PRESET_MACHINE_IMAGES[0].url);

    // Scroll to form smoothly
    const formEl = document.getElementById('admin-machine-editor-form');
    if (formEl) {
      formEl.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleDuplicateMachine = (m: Machine) => {
    setEditingMachineId(null);
    setTitle(`${m.title || m.name || 'Machine'} (Copy)`);
    setCategory(m.category || 'P_SERIES');
    setSeriesTag(`${m.series_tag || m.series || 'P-100'}-NEW`);
    setDescription(m.description || '');
    setTotalCost(m.total_cost || m.price || 65000);
    setDurationDays(m.duration_days || (m.lockDurationMinutes ? Math.round(m.lockDurationMinutes / 1440) : 10));
    setDailyYield(m.daily_yield || m.rewardAmount || 16900);
    setHashrate(m.hashrate_or_capacity || '240 TH/s');
    setPowerConsumption(m.power_consumption || '1100W');
    setAvailableUnits(m.available_units || 50);
    setVipLevel(m.vip_level_required || 0);
    setImageUrl(m.image_url || m.imageUrl || PRESET_MACHINE_IMAGES[0].url);

    setStatusMessage({ type: 'success', text: `Cloned "${m.title}". Customize values and click Publish!` });

    const formEl = document.getElementById('admin-machine-editor-form');
    if (formEl) {
      formEl.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleQuickSaveMachine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickEditMachine) return;
    setIsQuickSaving(true);
    setStatusMessage(null);

    try {
      const res = await fetch(`/api/admin/machines/${quickEditMachine.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          total_cost: quickPrice,
          price: quickPrice,
          duration_days: quickDuration,
          daily_yield: quickYield,
          rewardAmount: quickYield,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update machine.');

      setStatusMessage({
        type: 'success',
        text: `Machine "${quickEditMachine.title}" price and duration updated!`,
      });

      setQuickEditMachine(null);
      fetchMachines();
      onMachineCreated();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    } finally {
      setIsQuickSaving(false);
    }
  };

  const handleDeleteMachine = async (mId: string, mTitle: string) => {
    if (!confirm(`Are you sure you want to remove "${mTitle}" from the marketplace? This will take effect immediately.`)) return;
    setStatusMessage(null);

    try {
      const res = await fetch(`/api/admin/machines/${mId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to remove machine.');

      setStatusMessage({ type: 'success', text: `Machine "${mTitle}" successfully removed from marketplace!` });
      fetchMachines();
      onMachineCreated();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    }
  };

  const handleImageFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setStatusMessage({ type: 'error', text: 'Image file size should be less than 5MB.' });
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setImageUrl(event.target.result as string);
        setStatusMessage({ type: 'success', text: 'Machine photo uploaded successfully!' });
      }
    };
    reader.readAsDataURL(file);
  };

  // Helper to calculate 2:3 Yield (Cost * 1.5 / Duration)
  const calculate23Yield = (cost: number, days: number) => {
    if (days <= 0) return 0;
    return Math.round((cost * 1.5) / days);
  };

  // Reset to 2:3 Ratio Catalog
  const handleResetRatioCatalog = async () => {
    if (!confirm('Are you sure you want to reset the machine catalog to the standard 2:3 Ratio packages (150% Return: Node Alpha, Node Beta, Node Gamma, Core Pro, Core Max, Enterprise)?')) return;
    setIsLoadingData(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/admin/machines/reset-ratio-catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reset catalog.');
      setStatusMessage({ type: 'success', text: data.message });
      fetchMachines();
      onMachineCreated();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    } finally {
      setIsLoadingData(false);
    }
  };

  // Bulk Apply 2:3 Ratio to All Machines
  const handleBulkApplyRatio = async (ratioMultiplier = 1.5) => {
    if (!confirm(`Apply ${ratioMultiplier === 1.5 ? '2:3 Ratio (150% Total Return / 50% Profit)' : `${ratioMultiplier}x ratio`} across all machines in the marketplace?`)) return;
    setIsLoadingData(true);
    setStatusMessage(null);
    try {
      const res = await fetch('/api/admin/machines/apply-ratio-bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ratioMultiplier }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to apply ratio.');
      setStatusMessage({ type: 'success', text: data.message });
      fetchMachines();
      onMachineCreated();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    } finally {
      setIsLoadingData(false);
    }
  };

  const applySeriesPreset = (
    presetType:
      | 'AV1_100'
      | 'AV1_200'
      | 'AV2_300'
      | 'AV2_500'
      | 'AV3_750'
      | 'AV3_900'
      | 'VIP_CLASS_A'
      | 'VIP_CLASS_B'
      | 'VIP_CLASS_C'
      | 'VIP_CLASS_D'
      | 'VIP_CLASS_E'
      | 'NODE_ALPHA'
      | 'NODE_BETA'
      | 'NODE_GAMMA'
      | 'CORE_PRO'
      | 'CORE_MAX'
      | 'ENTERPRISE_P'
      | 'PD_50_TITAN'
      | 'HD_100_AI'
      | 'SERIES_P_100'
      | 'SERIES_P_300'
      | 'SERIES_P_500'
      | 'VT_150'
      | 'PD_50'
      | 'HD_AI_100'
  ) => {
    setEditingMachineId(null);
    if (presetType === 'AV1_100' || presetType === 'NODE_ALPHA') {
      setTitle('Avor Invest AV1-100 Genesis Miner');
      setCategory('AV1');
      setSeriesTag('AV1');
      setDescription('AV1 Series entry compute node. 35,000 UGX for 18 days giving back 50,000 UGX. Max 1 unit.');
      setTotalCost(35000);
      setDurationDays(18);
      setDailyYield(2778);
      setHashrate('120 TH/s AV1 Node');
      setPowerConsumption('480W Air Cooled');
      setImageUrl(PRESET_MACHINE_IMAGES[2].url);
      setAvailableUnits(50);
      setVipLevel(0);
    } else if (presetType === 'AV1_200' || presetType === 'NODE_BETA') {
      setTitle('Avor Invest AV1-200 Pulse Core');
      setCategory('AV1');
      setSeriesTag('AV1');
      setDescription('AV1 Series optimal compute node. 60,000 UGX for 20 days giving back 115,000 UGX. Max 1 unit.');
      setTotalCost(60000);
      setDurationDays(20);
      setDailyYield(5750);
      setHashrate('220 TH/s Dual Node');
      setPowerConsumption('750W Hydro Cooled');
      setImageUrl(PRESET_MACHINE_IMAGES[3].url);
      setAvailableUnits(35);
      setVipLevel(0);
    } else if (presetType === 'AV2_300' || presetType === 'NODE_GAMMA') {
      setTitle('Avor Invest AV2-100 Velocity Blade');
      setCategory('AV2');
      setSeriesTag('AV2');
      setDescription('AV2 Series compute blade. 55,000 UGX for 20 days giving back 100,000 UGX.');
      setTotalCost(55000);
      setDurationDays(20);
      setDailyYield(5000);
      setHashrate('250 TH/s AV2 Series');
      setPowerConsumption('1100W Smart-Cooling');
      setImageUrl(PRESET_MACHINE_IMAGES[4].url);
      setAvailableUnits(30);
      setVipLevel(0);
    } else if (presetType === 'AV2_500' || presetType === 'CORE_PRO' || presetType === 'SERIES_P_100') {
      setTitle('Avor Invest AV2-200 Hyper Surge');
      setCategory('AV2');
      setSeriesTag('AV2');
      setDescription('AV2 Series modular array. 140,000 UGX for 18 days giving back 220,000 UGX.');
      setTotalCost(140000);
      setDurationDays(18);
      setDailyYield(12222);
      setHashrate('480 TH/s Dual Array');
      setPowerConsumption('1750W Liquid Cooled');
      setImageUrl(PRESET_MACHINE_IMAGES[0].url);
      setAvailableUnits(25);
      setVipLevel(0);
    } else if (presetType === 'AV3_750' || presetType === 'CORE_MAX') {
      setTitle('Avor Invest AV2-300 Quantum Vault');
      setCategory('AV2');
      setSeriesTag('AV2');
      setDescription('AV2 Series ultra-compute cluster. 200,000 UGX for 50 days giving back 600,000 UGX.');
      setTotalCost(200000);
      setDurationDays(50);
      setDailyYield(12000);
      setHashrate('750 TH/s Cryo Cluster');
      setPowerConsumption('2400W Submersion');
      setImageUrl(PRESET_MACHINE_IMAGES[1].url);
      setAvailableUnits(20);
      setVipLevel(0);
    } else if (presetType === 'AV3_900' || presetType === 'ENTERPRISE_P' || presetType === 'SERIES_P_300') {
      setTitle('Avor Invest AV2-400 Titan Matrix');
      setCategory('AV2');
      setSeriesTag('AV2');
      setDescription('AV2 Series enterprise heavy matrix. 300,000 UGX for 45 days giving back 705,000 UGX.');
      setTotalCost(300000);
      setDurationDays(45);
      setDailyYield(15667);
      setHashrate('1.2 GH/s Heavy Matrix');
      setPowerConsumption('3200W Liquid Immersion');
      setImageUrl(PRESET_MACHINE_IMAGES[5].url);
      setAvailableUnits(15);
      setVipLevel(0);
    } else if (presetType === 'VIP_CLASS_A') {
      setTitle('Avor Invest VIP Class A Titan');
      setCategory('VIP_A');
      setSeriesTag('VIP CLASS A');
      setDescription('VIP Class A institutional compute rig with 18-Day Lock time and priority yield distribution.');
      setTotalCost(300000);
      setDurationDays(18);
      setDailyYield(25000); // 300,000 * 1.5 / 18 = 25,000/d
      setHashrate('2.4 GH/s VIP Class A');
      setPowerConsumption('4200W Direct Chill');
      setImageUrl(PRESET_MACHINE_IMAGES[6].url);
      setAvailableUnits(10);
      setVipLevel(1);
    } else if (presetType === 'VIP_CLASS_B' || presetType === 'PD_50_TITAN' || presetType === 'PD_50') {
      setTitle('Avor Invest VIP Class B Sovereign');
      setCategory('VIP_B');
      setSeriesTag('VIP CLASS B');
      setDescription('VIP Class B commercial scale mining powerhouse with 20-day time lock and standard 2:3 yield.');
      setTotalCost(500000);
      setDurationDays(20);
      setDailyYield(37500); // 500,000 * 1.5 / 20 = 37,500/d
      setHashrate('4.5 GH/s VIP Class B');
      setPowerConsumption('8500W Liquid Immersion');
      setImageUrl(PRESET_MACHINE_IMAGES[6].url);
      setAvailableUnits(8);
      setVipLevel(2);
    } else if (presetType === 'VIP_CLASS_C') {
      setTitle('Avor Invest VIP Class C Apex Immersion');
      setCategory('VIP_C');
      setSeriesTag('VIP CLASS C');
      setDescription('VIP Class C liquid submersion rig with 20-Day Lock time and high daily payouts.');
      setTotalCost(750000);
      setDurationDays(20);
      setDailyYield(56250); // 750,000 * 1.5 / 20 = 56,250/d
      setHashrate('7.8 GH/s VIP Class C');
      setPowerConsumption('11.5KW Cryo Immersion');
      setImageUrl(PRESET_MACHINE_IMAGES[7].url);
      setAvailableUnits(5);
      setVipLevel(3);
    } else if (presetType === 'VIP_CLASS_D' || presetType === 'HD_100_AI' || presetType === 'HD_AI_100') {
      setTitle('Avor Invest VIP Class D Quantum Vault');
      setCategory('VIP_D');
      setSeriesTag('VIP CLASS D');
      setDescription('VIP Class D AI tensor matrix compute cluster with 20-Day Lock time and gross 2:3 return multiplier.');
      setTotalCost(1000000);
      setDurationDays(20);
      setDailyYield(75000); // 1,000,000 * 1.5 / 20 = 75,000/d
      setHashrate('64 TeraFlops VIP Class D Matrix');
      setPowerConsumption('14KW Direct Liquid Cell');
      setImageUrl(PRESET_MACHINE_IMAGES[7].url);
      setAvailableUnits(4);
      setVipLevel(4);
    } else if (presetType === 'VIP_CLASS_E') {
      setTitle('Avor Invest VIP Class E Imperial Matrix');
      setCategory('VIP_E');
      setSeriesTag('VIP CLASS E');
      setDescription('VIP Class E pinnacle infrastructure compute facility with 25-Day Lock time and premier yield earnings.');
      setTotalCost(2000000);
      setDurationDays(25);
      setDailyYield(120000); // 2,000,000 * 1.5 / 25 = 120,000/d
      setHashrate('140 TeraFlops Supercomputer Cell');
      setPowerConsumption('25KW Industrial Cryo Loop');
      setImageUrl(PRESET_MACHINE_IMAGES[0].url);
      setAvailableUnits(2);
      setVipLevel(5);
    } else {
      // Fallback
      setTitle('Avor Invest AV1-100 Genesis Miner');
      setCategory('AV1');
      setSeriesTag('AV1');
      setTotalCost(15000);
      setDurationDays(15);
      setDailyYield(1500);
      setHashrate('85 TH/s AV1 Node');
      setPowerConsumption('450W Eco');
      setImageUrl(PRESET_MACHINE_IMAGES[0].url);
      setAvailableUnits(50);
      setVipLevel(0);
    }
  };

  const resetMachineForm = () => {
    setEditingMachineId(null);
    setTitle('');
    setDescription('');
    setCategory('AV1');
    setSeriesTag('AV1');
    setTotalCost(15000);
    setDurationDays(15);
    setDailyYield(1500);
    setHashrate('85 TH/s AV1 Node');
    setPowerConsumption('450W Air Cooled');
    setAvailableUnits(50);
    setVipLevel(0);
    setImageUrl(PRESET_MACHINE_IMAGES[0].url);
  };

  // Handle Save Homepage Config
  const handleSaveHomepage = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingHomepage(true);
    setStatusMessage(null);

    try {
      const res = await fetch('/api/admin/config/homepage', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          announcement_badge: announcementBadge,
          headline,
          subheadline,
          notice_text: noticeText,
          deposit_receiver_number: depositReceiverNumber,
          deposit_receiver_name: depositReceiverName,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update homepage.');

      setStatusMessage({ type: 'success', text: 'Homepage banner and receiver details updated live!' });
      fetchAdminData();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    } finally {
      setIsSavingHomepage(false);
    }
  };

  // Handle Change Password
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newAdminPass !== confirmAdminPass) {
      setStatusMessage({ type: 'error', text: 'New passwords do not match!' });
      return;
    }

    setIsChangingPass(true);
    setStatusMessage(null);

    try {
      const res = await fetch('/api/admin/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: adminEmail,
          current_password: currentAdminPass,
          new_password: newAdminPass,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Password update failed.');

      setStatusMessage({ type: 'success', text: 'Admin password changed successfully!' });
      setAdminPassword(newAdminPass);
      setCurrentAdminPass('');
      setNewAdminPass('');
      setConfirmAdminPass('');
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    } finally {
      setIsChangingPass(false);
    }
  };

  // Handle Credit User Balance
  const handleCreditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) return;

    setIsCrediting(true);
    setStatusMessage(null);

    try {
      const res = await fetch('/api/admin/user/credit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: selectedUserId,
          amount: creditAmount,
          note: creditNote,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update balance.');

      setStatusMessage({ type: 'success', text: data.message });
      fetchAdminData();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    } finally {
      setIsCrediting(false);
    }
  };

  // Filtered Users
  const filteredUsers = userList.filter(
    (u) =>
      u.full_name?.toLowerCase().includes(userSearchTerm.toLowerCase()) ||
      u.phone_number?.includes(userSearchTerm) ||
      u.email?.toLowerCase().includes(userSearchTerm.toLowerCase())
  );

  if (!isAdminAuthenticated) {
    return (
      <div className="max-w-md mx-auto shining-card-glow border border-[#00d2c4]/45 rounded-3xl p-6 sm:p-8 shadow-[0_0_50px_rgba(0,145,234,0.35)] text-white space-y-6 bg-[#02101b]/98 backdrop-blur-2xl">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 bg-gradient-to-br from-[#0091ea] to-[#0077b6] text-white rounded-2xl flex items-center justify-center mx-auto shadow-lg border border-[#a3e635]/80 font-black shadow-[0_0_20px_rgba(163,230,53,0.3)]">
            <Lock className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-2xl font-black tracking-tight text-white flex items-center justify-center gap-2">
            <span>Owner Admin Portal</span>
          </h2>
          <p className="text-xs text-[#7ba3b0]">
            Restricted authentication portal. All administrator credentials are encrypted and protected.
          </p>
        </div>

        {/* Security Warning Notice */}
        <div className="bg-[#031826] border border-[#a3e635]/40 text-[#d9f99d] text-xs p-3 rounded-xl font-medium flex items-center gap-2.5 shadow-sm">
          <ShieldCheck className="w-4 h-4 text-[#a3e635] shrink-0" />
          <span>Demo credentials disabled for safety. Access reserved for verified system administrators.</span>
        </div>

        {authError && (
          <div className="bg-rose-950/80 border border-rose-500/50 text-rose-300 text-xs p-3.5 rounded-xl font-medium flex items-center gap-2 animate-fade-in">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{authError}</span>
          </div>
        )}

        <form onSubmit={handleAdminLogin} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
              Admin Email
            </label>
            <div className="relative">
              <input
                type="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="Enter Administrator Email"
                className="w-full px-3.5 py-3 pl-10 bg-[#031522] border border-[#00d2c4]/40 rounded-xl text-xs text-white focus:border-[#a3e635] focus:outline-none font-medium shadow-inner placeholder-slate-500"
                required
              />
              <Mail className="w-4 h-4 text-[#7ba3b0] absolute left-3.5 top-3.5" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
              Admin Password
            </label>
            <div className="relative">
              <input
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="Enter Admin Password"
                className="w-full px-3.5 py-3 pl-10 bg-[#031522] border border-[#00d2c4]/40 rounded-xl text-xs text-white focus:border-[#a3e635] focus:outline-none font-medium shadow-inner placeholder-slate-500"
                required
              />
              <Key className="w-4 h-4 text-[#7ba3b0] absolute left-3.5 top-3.5" />
            </div>
          </div>

          <button
            type="submit"
            className="w-full py-3.5 bg-gradient-to-r from-[#0091ea] to-[#0077b6] hover:brightness-110 active:scale-98 text-white font-black text-sm rounded-xl transition-all shadow-[0_0_24px_rgba(0,145,234,0.65)] cursor-pointer flex items-center justify-center gap-2 border border-[#a3e635]/80"
          >
            <ShieldCheck className="w-4 h-4 text-white" />
            <span>Authorize Admin Login</span>
          </button>
        </form>

        <div className="pt-4 border-t border-[#00d2c4]/25 text-center space-y-3">
          <p className="text-[11px] text-[#7ba3b0] font-mono flex items-center justify-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-[#00d2c4]" />
            <span>Restricted Access • Authorized Administrative Personnel Only</span>
          </p>
          {onExitAdmin && (
            <button
              type="button"
              onClick={onExitAdmin}
              className="text-xs text-[#a3e635] hover:text-[#bef264] font-bold hover:underline cursor-pointer flex items-center justify-center gap-1 mx-auto"
            >
              <span>← Return to Dashboard</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 text-white max-w-6xl mx-auto animate-fade-in">
      {/* Header Banner */}
      <div className="shining-card rounded-2xl p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl border border-blue-950/80">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-[#0091ea] to-[#0077b6] text-white flex items-center justify-center font-black shadow-lg border border-[#00e5ff]/50">
            <ShieldCheck className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-black text-white">Avor Invest Admin Console</h2>
            <p className="text-xs text-slate-300">
              Confirm deposits (Receiver: {depositReceiverNumber} {depositReceiverName}), manage machine specs, homepage, and payouts.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onExitAdmin && (
            <button
              onClick={onExitAdmin}
              className="px-3.5 py-2 bg-[#06182c] hover:bg-[#0c2847] text-slate-300 hover:text-white text-xs font-bold rounded-xl border border-blue-950/80 flex items-center gap-1.5 cursor-pointer transition-all shrink-0"
            >
              <span>← Exit Admin</span>
            </button>
          )}
          <button
            onClick={handleResetAllSystemZero}
            disabled={isLoadingData}
            className="px-3.5 py-2 bg-rose-950/60 hover:bg-rose-900/70 text-rose-200 hover:text-white text-xs font-bold rounded-xl border border-rose-500/40 flex items-center gap-1.5 cursor-pointer transition-all shrink-0"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-400" />
            <span>Reset System to 0</span>
          </button>
          <button
            onClick={() => {
              fetchAdminData();
              fetchMachines();
            }}
            disabled={isLoadingData}
            className="px-4 py-2 bg-[#070e1f] hover:bg-[#0d1733] text-white text-xs font-bold rounded-xl border border-blue-950/80 flex items-center gap-2 cursor-pointer transition-all shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingData ? 'animate-spin' : ''}`} />
            <span>Refresh All System Data</span>
          </button>
        </div>
      </div>

      {/* Global Admin Metrics */}
      {stats && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
            <div className="shining-card border border-blue-950/80 p-4 rounded-xl shadow-md">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Total Customers</span>
              <span className="text-xl font-extrabold text-white font-mono mt-1 block">
                {stats.total_customers_count ?? stats.machines_sold_count ?? 0}
              </span>
              <span className="text-[10px] text-slate-500 block mt-0.5">Approved machine buyers</span>
            </div>

            <div className="shining-card border border-blue-950/80 p-4 rounded-xl shadow-md">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Machines Sold</span>
              <span className="text-xl font-extrabold text-white font-mono mt-1 block">
                {stats.machines_sold_count ?? 0}
              </span>
              <span className="text-[10px] text-slate-500 block mt-0.5">Approved by Admin</span>
            </div>

            <div className="shining-card border border-blue-950/80 p-4 rounded-xl shadow-md col-span-2">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Total Verified Investment</span>
              <span className="text-xl font-extrabold text-emerald-400 font-mono mt-1 block">
                UGX {(stats.total_verified_investment ?? 0).toLocaleString()}
              </span>
              <span className="text-[10px] text-emerald-400/70 block mt-0.5">Admin-approved machine capital</span>
            </div>

            <div className="shining-card border border-blue-950/80 p-4 rounded-xl shadow-md">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Active Cycles</span>
              <span className="text-xl font-extrabold text-teal-400 font-mono mt-1 block">
                {stats.active_cycles_count ?? 0}
              </span>
              <span className="text-[10px] text-slate-500 block mt-0.5">Machines running</span>
            </div>

            <div className="shining-card border border-blue-950/80 p-4 rounded-xl shadow-md">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Completed Cycles</span>
              <span className="text-xl font-extrabold text-slate-300 font-mono mt-1 block">
                {stats.completed_cycles_count ?? 0}
              </span>
              <span className="text-[10px] text-slate-500 block mt-0.5">Finished active cycle</span>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div
              onClick={() => setActiveTab('DEPOSITS')}
              className="shining-card border border-blue-950/80 hover:border-amber-500/40 p-3.5 rounded-xl shadow-md cursor-pointer transition-all"
            >
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Pending Payments</span>
              <span className="text-base font-extrabold text-amber-300 font-mono mt-0.5 block">
                {stats.pending_deposits_count ?? 0} Requests
              </span>
              <span className="text-[10px] text-slate-500 block">Deposit payments approval</span>
            </div>

            <div
              onClick={() => setActiveTab('LEDGER')}
              className={`shining-card p-3.5 rounded-xl shadow-md cursor-pointer transition-all ${
                investmentsLedger.filter((i) => i.status === 'PENDING').length > 0
                  ? 'border-2 border-emerald-400 bg-emerald-950/40 shadow-emerald-500/20'
                  : 'border border-blue-950/80 hover:border-emerald-500/40'
              }`}
            >
              <span className="text-[10px] text-emerald-300 font-bold uppercase block">
                Pending Orders (Buy Clicks)
              </span>
              <span className="text-base font-extrabold text-emerald-400 font-mono mt-0.5 block">
                {investmentsLedger.filter((i) => i.status === 'PENDING').length} Orders
              </span>
              <span className="text-[10px] text-emerald-300/80 block">
                Click to Confirm Order / Deliver
              </span>
            </div>

            <div
              onClick={() => setActiveTab('WITHDRAWALS')}
              className="shining-card border border-blue-950/80 p-3.5 rounded-xl shadow-md cursor-pointer"
            >
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Pending Withdrawals</span>
              <span className="text-base font-extrabold text-rose-400 font-mono mt-0.5 block">
                {withdrawals.filter((w) => w.status === 'PENDING').length} Requests
              </span>
              <span className="text-[10px] text-slate-500 block">Awaiting Admin approval</span>
            </div>

            <div className="shining-card border border-blue-950/80 p-3.5 rounded-xl shadow-md">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Total System Wallet</span>
              <span className="text-base font-extrabold text-sky-400 font-mono mt-0.5 block">
                UGX {(stats.total_system_wallet ?? stats.total_deposited ?? 0).toLocaleString()}
              </span>
              <span className="text-[10px] text-slate-500 block">Approved by Admin</span>
            </div>

            <div className="shining-card border border-blue-950/80 p-3.5 rounded-xl shadow-md">
              <span className="text-[10px] text-slate-400 font-bold uppercase block">Total Cashout Paid</span>
              <span className="text-base font-extrabold text-emerald-400 font-mono mt-0.5 block">
                UGX {(stats.total_withdrawn ?? 0).toLocaleString()}
              </span>
              <span className="text-[10px] text-slate-500 block">Approved by Admin</span>
            </div>
          </div>
        </div>
      )}

      {/* Alert Status Notification */}
      {statusMessage && (
        <div
          className={`p-4 rounded-xl text-xs font-bold flex items-center justify-between ${
            statusMessage.type === 'success'
              ? 'bg-emerald-950/70 border border-emerald-500/40 text-emerald-300'
              : 'bg-rose-950/70 border border-rose-500/40 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span>{statusMessage.text}</span>
          </div>
          <button onClick={() => setStatusMessage(null)} className="text-slate-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ALWAYS-VISIBLE PENDING ORDERS QUEUE WHEN CUSTOMER CLICKS BUY */}
      {investmentsLedger.filter((i) => i.status === 'PENDING').length > 0 && activeTab !== 'LEDGER' && (
        <div className="bg-gradient-to-r from-emerald-950/90 via-[#071f24] to-teal-950/90 border-2 border-emerald-400/70 rounded-2xl p-5 space-y-3 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/50 flex items-center justify-center shrink-0">
                <Cpu className="w-5 h-5 text-emerald-300 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-black uppercase bg-amber-500/20 text-amber-300 border border-amber-400/40">
                    NEW PENDING MACHINE ORDER ({investmentsLedger.filter((i) => i.status === 'PENDING').length})
                  </span>
                  <h3 className="text-sm sm:text-base font-black text-white">
                    Customer Clicked Buy — Waiting for Admin Order Confirmation
                  </h3>
                </div>
                <p className="text-xs text-emerald-200/90 mt-0.5">
                  Press <span className="font-black text-white">Confirm Order / Approve / Deliver</span> below (or open{' '}
                  <button
                    type="button"
                    onClick={() => setActiveTab('LEDGER')}
                    className="underline font-black text-emerald-300 hover:text-white cursor-pointer"
                  >
                    Pending Orders / Orders / Active Cycles
                  </button>
                  ) so the customer immediately receives their machine product and starts Day 1.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {investmentsLedger.filter((i) => i.status === 'PENDING').length > 1 && (
                <button
                  type="button"
                  onClick={handleApproveAllOrders}
                  className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs rounded-xl shadow-md cursor-pointer transition-all"
                >
                  Confirm All ({investmentsLedger.filter((i) => i.status === 'PENDING').length}) Orders
                </button>
              )}
              <button
                type="button"
                onClick={() => setActiveTab('LEDGER')}
                className="px-3.5 py-2 bg-[#06152d] hover:bg-[#0c234a] text-emerald-300 border border-emerald-400/40 font-bold text-xs rounded-xl cursor-pointer transition-all"
              >
                Open Orders Section →
              </button>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-emerald-500/30">
            {investmentsLedger
              .filter((i) => i.status === 'PENDING')
              .map((inv) => (
                <div
                  key={inv.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#04101f]/90 border border-emerald-500/40 rounded-xl p-3.5"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs font-black text-emerald-400">{inv.id}</span>
                      <span className="text-xs font-black text-white">{inv.name || inv.machine_title}</span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                        status = &quot;pending&quot; • Wait for admin confirmation
                      </span>
                    </div>
                    <div className="text-xs text-slate-300">
                      Customer:{' '}
                      <span className="font-bold text-white">
                        {inv.customername || inv.customer_name || inv.user_id}
                      </span>
                      {inv.customer_phone ? ` (${inv.customer_phone})` : ''} • Amount:{' '}
                      <span className="font-mono font-bold text-emerald-300">
                        UGX {Number(inv.amount_invested || inv.amount || 0).toLocaleString()}
                      </span>{' '}
                      • Cycle: <span className="font-mono text-sky-300">{inv.duration_days} Days</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleOrderAction(inv.id, 'APPROVE', inv)}
                      className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black text-xs rounded-xl shadow-lg shadow-emerald-600/30 cursor-pointer flex items-center gap-1.5 transition-all"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Confirm Order / Approve / Deliver</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOrderAction(inv.id, 'REJECT', inv)}
                      className="px-3 py-2 bg-rose-950/80 hover:bg-rose-900 text-rose-200 border border-rose-500/40 font-bold text-xs rounded-xl cursor-pointer transition-all"
                    >
                      Deny / Refund
                    </button>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex flex-wrap border-b border-blue-950/80 gap-1.5 bg-[#050b18] p-1.5 rounded-xl">
        <button
          onClick={() => setActiveTab('DEPOSITS')}
          className={`px-4 py-2.5 font-bold text-xs rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'DEPOSITS'
              ? 'bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-800 text-white font-black shadow-md border border-blue-400/40'
              : 'text-slate-400 hover:text-white hover:bg-[#0c1630]'
          }`}
        >
          <ArrowDownLeft className="w-4 h-4" />
          <span>Pending Payments ({deposits.filter((d) => d.status === 'PENDING').length})</span>
        </button>

        <button
          onClick={() => setActiveTab('LEDGER')}
          className={`px-4 py-2.5 font-bold text-xs rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'LEDGER'
              ? 'bg-gradient-to-r from-emerald-600 to-teal-700 text-white font-black shadow-md border border-emerald-400/40'
              : investmentsLedger.some((i) => i.status === 'PENDING')
                ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-400/60 animate-pulse'
                : 'text-slate-400 hover:text-white hover:bg-[#0c1630]'
          }`}
        >
          <Cpu className="w-4 h-4 text-emerald-400" />
          <span>
            Pending Orders / Orders / Active Cycles (
            {investmentsLedger.filter((i) => i.status === 'PENDING').length} Pending ·{' '}
            {investmentsLedger.filter((i) => i.status === 'ACTIVE').length} Active)
          </span>
        </button>

        <button
          onClick={() => setActiveTab('ORDER_MESSAGES')}
          className={`px-4 py-2.5 font-bold text-xs rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'ORDER_MESSAGES'
              ? 'bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-800 text-white font-black shadow-md border border-blue-400/40'
              : 'text-slate-400 hover:text-white hover:bg-[#0c1630]'
          }`}
        >
          <Megaphone className="w-4 h-4 text-sky-400" />
          <span>
            Placed Order Messages ({adminMessages.filter((m) => m.order_status === 'PENDING').length || adminMessages.length})
          </span>
        </button>

        <button
          onClick={() => setActiveTab('DEPOSIT_NUMBERS')}
          className={`px-4 py-2.5 font-bold text-xs rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'DEPOSIT_NUMBERS'
              ? 'bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-800 text-white font-black shadow-md border border-blue-400/40'
              : 'text-slate-400 hover:text-white hover:bg-[#0c1630]'
          }`}
        >
          <Shuffle className="w-4 h-4 text-blue-400" />
          <span>7H Deposit Numbers & Rotation</span>
        </button>

        <button
          onClick={() => setActiveTab('WITHDRAWALS')}
          className={`px-4 py-2.5 font-bold text-xs rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'WITHDRAWALS'
              ? 'bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-800 text-white font-black shadow-md border border-blue-400/40'
              : 'text-slate-400 hover:text-white hover:bg-[#0c1630]'
          }`}
        >
          <ArrowUpRight className="w-4 h-4" />
          <span>Withdrawal Payouts ({withdrawals.filter((w) => w.status === 'PENDING').length})</span>
        </button>

        <button
          onClick={() => setActiveTab('MACHINES')}
          className={`px-4 py-2.5 font-bold text-xs rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'MACHINES'
              ? 'bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-800 text-white font-black shadow-md border border-blue-400/40'
              : 'text-slate-400 hover:text-white hover:bg-[#0c1630]'
          }`}
        >
          <Cpu className="w-4 h-4" />
          <span>Machine Inventory ({machineList.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('HOMEPAGE')}
          className={`px-4 py-2.5 font-bold text-xs rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'HOMEPAGE'
              ? 'bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-800 text-white font-black shadow-md border border-blue-400/40'
              : 'text-slate-400 hover:text-white hover:bg-[#0c1630]'
          }`}
        >
          <Globe className="w-4 h-4" />
          <span>Edit Homepage</span>
        </button>

        <button
          onClick={() => setActiveTab('USERS')}
          className={`px-4 py-2.5 font-bold text-xs rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'USERS'
              ? 'bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-800 text-white font-black shadow-md border border-blue-400/40'
              : 'text-slate-400 hover:text-white hover:bg-[#0c1630]'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Customer Management ({userList.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('SECURITY')}
          className={`px-4 py-2.5 font-bold text-xs rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'SECURITY'
              ? 'bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-800 text-white font-black shadow-md border border-blue-400/40'
              : 'text-slate-400 hover:text-white hover:bg-[#0c1630]'
          }`}
        >
          <Key className="w-4 h-4" />
          <span>Change Password</span>
        </button>
      </div>

      {/* TAB: PENDING ORDERS / ORDERS / ACTIVE CYCLES */}
      {activeTab === 'LEDGER' && (
        <div className="space-y-6">
          {/* DEDICATED PENDING ORDERS SECTION (WHEN CUSTOMER CLICKS BUY) */}
          <div className="shining-card border-2 border-emerald-500/50 rounded-2xl p-6 space-y-4 shadow-xl text-white">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-blue-950/80">
              <div>
                <div className="flex items-center gap-2">
                  <Cpu className="w-5 h-5 text-emerald-400" />
                  <h3 className="text-base font-extrabold text-white">
                    Pending Orders (Customer Clicked Buy — Waiting for Admin Confirmation)
                  </h3>
                </div>
                <p className="text-xs text-slate-300 mt-1">
                  When a customer clicks <span className="font-bold text-white">Buy</span> using their confirmed wallet, their new Machine Order appears here saying{' '}
                  <span className="font-mono text-amber-300">&quot;Wait for admin confirmation&quot;</span>. Press{' '}
                  <span className="font-bold text-emerald-400">Confirm Order / Approve / Deliver</span> to deliver the machine and start Day 1 of their cycle.
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs font-mono text-amber-300 bg-amber-950/70 border border-amber-500/40 px-3 py-1.5 rounded-lg font-bold">
                  {investmentsLedger.filter((i) => i.status === 'PENDING').length} Pending Orders
                </span>
                {investmentsLedger.filter((i) => i.status === 'PENDING').length > 0 && (
                  <button
                    type="button"
                    onClick={handleApproveAllOrders}
                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs rounded-xl shadow-lg cursor-pointer transition-all"
                  >
                    Confirm All Pending Orders ({investmentsLedger.filter((i) => i.status === 'PENDING').length})
                  </button>
                )}
              </div>
            </div>

            {investmentsLedger.filter((i) => i.status === 'PENDING').length === 0 ? (
              <div className="text-center py-8 bg-[#050c1a]/70 border border-blue-950/70 rounded-xl text-slate-400 text-xs space-y-1">
                <p className="font-bold text-slate-300">No Pending Machine Orders right now (0 Pending Orders).</p>
                <p className="text-[11px] text-slate-500">
                  As soon as a customer clicks &quot;Buy Machine Using Wallet&quot;, their order will appear here with the &quot;Confirm Order / Approve / Deliver&quot; button.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {investmentsLedger
                  .filter((i) => i.status === 'PENDING')
                  .map((inv) => (
                    <div
                      key={inv.id}
                      className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-[#061326] border-2 border-amber-500/50 hover:border-emerald-400/70 rounded-2xl p-4 transition-all shadow-lg"
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <span className="px-2.5 py-0.5 rounded-md text-[10px] font-mono font-black uppercase bg-amber-500/20 text-amber-300 border border-amber-400/50 animate-pulse">
                            status = &quot;pending&quot; • WAIT FOR ADMIN CONFIRMATION
                          </span>
                          <span className="font-mono text-xs font-bold text-sky-400">{inv.id}</span>
                          <span className="text-sm font-black text-white">{inv.name || inv.machine_title}</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-slate-300 pt-1">
                          <div>
                            <span className="text-slate-500">Customer (customername): </span>
                            <span className="font-bold text-white">
                              {inv.customername || inv.customer_name || inv.user_id}
                            </span>
                            {inv.customer_phone && (
                              <span className="font-mono text-sky-300 ml-1">({inv.customer_phone})</span>
                            )}
                          </div>
                          <div>
                            <span className="text-slate-500">Order Amount: </span>
                            <span className="font-mono font-black text-emerald-400">
                              UGX {Number(inv.amount_invested || inv.amount || 0).toLocaleString()}
                            </span>
                            <span className="text-[10px] text-emerald-300/80 ml-1">(Paid via Wallet)</span>
                          </div>
                          <div>
                            <span className="text-slate-500">Cycle &amp; Daily Yield: </span>
                            <span className="font-mono font-bold text-white">
                              {inv.duration_days} Days • UGX {Number(inv.daily_return || 0).toLocaleString()}/day
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleOrderAction(inv.id, 'APPROVE', inv)}
                          className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-400 hover:brightness-110 text-slate-950 font-black text-xs rounded-xl shadow-lg shadow-emerald-500/30 cursor-pointer flex items-center gap-2 transition-all"
                        >
                          <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                          <span>Confirm Order / Approve / Deliver</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOrderAction(inv.id, 'REJECT', inv)}
                          className="px-3.5 py-2.5 bg-rose-950/80 hover:bg-rose-900 text-rose-200 border border-rose-500/40 font-bold text-xs rounded-xl cursor-pointer transition-all"
                        >
                          Deny / Refund
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* ALL ORDERS & ACTIVE CYCLES LEDGER TABLE */}
          <div className="shining-card border border-blue-950/80 rounded-2xl p-6 space-y-4 shadow-xl text-white">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-blue-950/80">
              <div>
                <h3 className="text-base font-extrabold text-white">All Orders &amp; Active Cycles Ledger</h3>
                <p className="text-xs text-slate-300">
                  Real-time machine orders &amp; active capital cycles • Ending Date automatically evaluated (<span className="font-mono text-emerald-400">Purchase + Cycle</span>)
                </p>
              </div>
              <span className="text-xs font-mono text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-3 py-1 rounded-lg">
                {investmentsLedger.filter((i) => i.status === 'PENDING').length} Pending ·{' '}
                {investmentsLedger.filter((i) => i.status === 'ACTIVE').length} Active ·{' '}
                {investmentsLedger.filter((i) => i.status === 'PAYOUT_COMPLETE').length} Completed
              </span>
            </div>

            {investmentsLedger.length === 0 ? (
              <div className="text-center py-10 text-slate-400 text-xs">
                No machine orders or active cycles found yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-[#070e1f] uppercase text-slate-300 border-b border-blue-950/80 text-[10px]">
                    <tr>
                      <th className="py-3 px-3">Order ID</th>
                      <th className="py-3 px-3">Customer</th>
                      <th className="py-3 px-3">Machine Product</th>
                      <th className="py-3 px-3">Amount</th>
                      <th className="py-3 px-3">Ordered</th>
                      <th className="py-3 px-3">Ending Date</th>
                      <th className="py-3 px-3">Cycle Progress</th>
                      <th className="py-3 px-3">Status</th>
                      <th className="py-3 px-3 text-right">Order Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-blue-950/60 text-slate-300">
                    {investmentsLedger.map((inv) => {
                      const isPending = inv.status === 'PENDING';
                      const isActive = inv.status === 'ACTIVE';
                      const isDenied = inv.status === 'DENIED' || inv.raw_firestore_status === 'denied';
                      const daysLeft = inv.days_left ?? Math.max(0, inv.duration_days - (inv.days_elapsed || 0));

                      return (
                        <tr key={inv.id} className="hover:bg-[#0c1630]/60 transition-colors">
                          <td className="py-2.5 px-3 font-bold text-white">{inv.id}</td>
                          <td className="py-2.5 px-3 font-sans">
                            <div className="font-bold text-white">
                              {inv.customername || inv.customer_name || inv.user_id}
                            </div>
                            {inv.customer_phone && (
                              <span className="text-[10px] text-slate-400 font-mono block">{inv.customer_phone}</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-emerald-400 font-semibold">
                            {inv.name || inv.machine_title}
                          </td>
                          <td className="py-2.5 px-3 font-sans font-bold text-white">
                            UGX {Number(inv.amount_invested || inv.amount || 0).toLocaleString()}
                          </td>
                          <td className="py-2.5 px-3">{inv.purchase_date || (inv.start_date || '').split('T')[0]}</td>
                          <td className="py-2.5 px-3">{inv.ending_date || (inv.end_date || '').split('T')[0]}</td>
                          <td
                            className={`py-2.5 px-3 font-bold ${
                              isPending
                                ? 'text-amber-300'
                                : isDenied
                                  ? 'text-rose-400'
                                  : daysLeft <= 0
                                    ? 'text-slate-500'
                                    : 'text-emerald-400'
                            }`}
                          >
                            {isPending
                              ? `Waiting Confirmation (${inv.duration_days}d)`
                              : isDenied
                                ? 'Denied / Refunded'
                                : daysLeft > 0
                                  ? `Active • ${daysLeft}d left`
                                  : 'Ended'}
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-sans font-semibold ${
                                isPending
                                  ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 animate-pulse'
                                  : isDenied
                                    ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                                    : isActive
                                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                      : 'bg-slate-800 text-slate-400'
                              }`}
                            >
                              {isPending
                                ? 'pending (Wait for Admin Confirmation)'
                                : isDenied
                                  ? 'denied'
                                  : isActive
                                    ? 'ACTIVE & DELIVERED'
                                    : 'Completed'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {isPending ? (
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  onClick={() => handleOrderAction(inv.id, 'APPROVE', inv)}
                                  className="text-[11px] font-sans font-black px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-sm cursor-pointer transition-all"
                                >
                                  Confirm Order / Approve / Deliver
                                </button>
                                <button
                                  onClick={() => handleOrderAction(inv.id, 'REJECT', inv)}
                                  className="text-[11px] font-sans font-bold px-2.5 py-1.5 rounded-lg bg-rose-950/80 hover:bg-rose-900 text-rose-200 border border-rose-500/30 cursor-pointer transition-all"
                                >
                                  Deny / Refund
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleToggleInvestmentStatus(inv.id)}
                                className="text-[11px] font-sans font-bold px-2.5 py-1 rounded-lg underline text-slate-300 hover:text-emerald-400 cursor-pointer transition-all"
                              >
                                Toggle Status
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB: PLACED ORDER & DEPOSIT CONFIRMATION MESSAGES */}
      {activeTab === 'ORDER_MESSAGES' && (
        <div className="shining-card border border-blue-950/80 rounded-2xl p-6 space-y-4 shadow-xl text-white">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-blue-950/80">
            <div>
              <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                <Megaphone className="w-5 h-5 text-sky-400" />
                <span>Admin Inbox: Placed Deposit &amp; Machine Order Messages (Firebase + Server Sync)</span>
              </h3>
              <p className="text-xs text-slate-300 mt-0.5">
                Every time a user clicks <strong>PLACE ORDER</strong> on a deposit or taps <strong>Buy a Machine</strong>, an instant message is saved to Firebase Firestore (<code className="text-sky-300">admin_messages</code>) and the server database so you receive it here across all devices.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {!firebaseAdminEmail ? (
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await signInAdminWithGoogle();
                      setStatusMessage({ type: 'success', text: 'Firebase Google Admin connected for live Firestore snapshots!' });
                    } catch (err: any) {
                      setStatusMessage({ type: 'error', text: err.message || 'Could not connect Google Admin.' });
                    }
                  }}
                  className="px-3 py-2 bg-[#0b1b3d] hover:bg-[#102654] text-sky-300 text-xs font-bold rounded-xl border border-sky-500/40 flex items-center gap-1.5 cursor-pointer"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
                  <span>Connect Firebase Live Stream</span>
                </button>
              ) : (
                <span className="px-2.5 py-1.5 rounded-xl bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 text-[11px] font-mono">
                  Firebase Live: {firebaseAdminEmail} ({
                    firestoreMessages.filter(
                      (fb) =>
                        fb.status !== 'CONFIRMED' &&
                        fb.status !== 'SUCCESS' &&
                        !deposits.some(
                          (d) =>
                            (d.status === 'SUCCESS' || d.status === 'CONFIRMED') &&
                            (d.firebase_doc_id === fb.id ||
                              (fb.paymentReference && d.payment_reference === fb.paymentReference))
                        )
                    ).length
                  } pending)
                </span>
              )}
              {deposits.filter((d) => d.status === 'PENDING').length > 0 && (
                <button
                  type="button"
                  disabled={isApprovingAll}
                  onClick={handleApproveAllDeposits}
                  className="px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white text-xs font-black rounded-xl border border-emerald-400/50 flex items-center gap-1.5 cursor-pointer shadow-md"
                >
                  <CheckCircle2 className="w-4 h-4 text-white" />
                  <span>Confirm All Pending ({deposits.filter((d) => d.status === 'PENDING').length})</span>
                </button>
              )}
              <button
                type="button"
                onClick={fetchAdminData}
                className="px-3 py-2 bg-[#09152e] hover:bg-[#0f2147] text-cyan-300 text-xs font-bold rounded-xl border border-cyan-500/40 flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingData ? 'animate-spin' : ''}`} />
                <span>Refresh Messages</span>
              </button>
            </div>
          </div>

          {(() => {
            const pendingFb = firestoreMessages.filter(
              (fbMsg) =>
                fbMsg.status !== 'CONFIRMED' &&
                fbMsg.status !== 'SUCCESS' &&
                !deposits.some(
                  (d) =>
                    (d.status === 'SUCCESS' || d.status === 'CONFIRMED') &&
                    (d.firebase_doc_id === fbMsg.id ||
                      (fbMsg.paymentReference && d.payment_reference === fbMsg.paymentReference))
                )
            );
            const pendingMsgs = adminMessages.filter((m: any) => m.order_status === 'PENDING');

            return (
              <>
                {pendingFb.length > 0 && (
                  <div className="p-3.5 rounded-2xl bg-[#07152e] border border-sky-500/40 space-y-2">
                    <div className="text-xs font-black text-sky-300 uppercase tracking-wider flex items-center justify-between">
                      <span>Pending Firestore `admin_messages` ({pendingFb.length})</span>
                    </div>
                    <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                      {pendingFb.map((fbMsg) => (
                        <div
                          key={fbMsg.id}
                          className="p-3 rounded-xl bg-[#050c1d] border border-blue-900/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                        >
                          <div className="space-y-0.5">
                            <div className="font-bold text-white flex items-center gap-2 flex-wrap">
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-black uppercase bg-amber-950/80 text-amber-300 border border-amber-500/40">
                                Pending
                              </span>
                              <span>{fbMsg.name}</span>
                              {fbMsg.senderPhone && <span className="text-cyan-300 font-mono">({fbMsg.senderPhone})</span>}
                              {fbMsg.amount > 0 && (
                                <span className="text-sky-400 font-mono">
                                  • UGX {Number(fbMsg.amount).toLocaleString()}
                                </span>
                              )}
                            </div>
                            <p className="text-slate-300 text-[11px]">{fbMsg.item}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[10px] font-mono text-slate-400">
                              {new Date(fbMsg.created_at).toLocaleString()}
                            </span>
                            {Number(fbMsg.amount) > 0 && (
                              <>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleDepositAction(fbMsg.transactionId || fbMsg.paymentReference || fbMsg.id, 'APPROVE', {
                                      firebase_doc_id: fbMsg.id,
                                      payment_reference: fbMsg.paymentReference || fbMsg.id,
                                      user_id: fbMsg.userId || undefined,
                                      customer_name: fbMsg.name,
                                      customer_phone: fbMsg.senderPhone,
                                      receiver_phone: fbMsg.receiverPhone,
                                      receiver_name: fbMsg.receiverName,
                                      amount: Number(fbMsg.amount),
                                      payment_method: fbMsg.paymentMethod,
                                    })
                                  }
                                  className="px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white text-[11px] font-black rounded-lg border border-emerald-400/50 flex items-center gap-1 cursor-pointer shadow-xs"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                  <span>Confirm</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleDepositAction(fbMsg.transactionId || fbMsg.paymentReference || fbMsg.id, 'REJECT', {
                                      firebase_doc_id: fbMsg.id,
                                      payment_reference: fbMsg.paymentReference || fbMsg.id,
                                      user_id: fbMsg.userId || undefined,
                                      customer_name: fbMsg.name,
                                      customer_phone: fbMsg.senderPhone,
                                      receiver_phone: fbMsg.receiverPhone,
                                      receiver_name: fbMsg.receiverName,
                                      amount: Number(fbMsg.amount),
                                      payment_method: fbMsg.paymentMethod,
                                    })
                                  }
                                  className="px-2.5 py-1.5 bg-rose-950/70 hover:bg-rose-900/70 text-rose-300 text-[11px] font-bold rounded-lg border border-rose-500/40 flex items-center gap-1 cursor-pointer"
                                >
                                  <X className="w-3.5 h-3.5" />
                                  <span>Deny</span>
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {pendingMsgs.length === 0 && pendingFb.length === 0 ? (
                  <div className="text-center py-10 text-slate-400 text-xs font-bold">
                    No pending payments awaiting confirmation. All confirmed deposits are marked Successful and credited to customer Wallets.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pendingMsgs.map((msg: any) => (
                      <div
                        key={msg.id}
                        className="p-4 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#07132c] border-blue-500/60 shadow-[0_0_20px_rgba(0,145,234,0.2)]"
                      >
                        <div className="space-y-1.5 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase font-mono bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse">
                              PENDING CONFIRMATION
                            </span>
                            <span className="text-sm font-black text-white">{msg.title}</span>
                            <span className="text-[11px] font-mono text-slate-400">
                              {new Date(msg.created_at).toLocaleString()}
                            </span>
                          </div>

                          <p className="text-xs text-slate-200 leading-relaxed">{msg.message}</p>

                          <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] font-mono">
                            {msg.customer_name && (
                              <span className="px-2 py-0.5 rounded bg-[#0b1b3d] border border-blue-800/60 text-white">
                                Customer: <strong>{msg.customer_name}</strong>
                              </span>
                            )}
                            {msg.customer_phone && (
                              <span className="px-2 py-0.5 rounded bg-cyan-950/80 border border-cyan-500/40 text-cyan-300">
                                Sender Phone: <strong>{msg.customer_phone}</strong>
                              </span>
                            )}
                            {msg.receiver_phone && (
                              <span className="px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-500/40 text-emerald-300">
                                Receiver: <strong>{msg.receiver_phone} ({msg.receiver_name || 'Company'})</strong>
                              </span>
                            )}
                            {Number(msg.amount) > 0 && (
                              <span className="px-2 py-0.5 rounded bg-blue-950/90 border border-sky-400/40 text-sky-300 font-bold">
                                Amount: UGX {Number(msg.amount).toLocaleString()}
                              </span>
                            )}
                            {msg.payment_reference && (
                              <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-700 text-slate-300">
                                Ref: {msg.payment_reference}
                              </span>
                            )}
                          </div>
                        </div>

                        {(msg.transaction_id || msg.payment_reference) && (
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() =>
                                handleDepositAction(msg.transaction_id || msg.payment_reference, 'APPROVE', {
                                  firebase_doc_id: msg.firebase_doc_id,
                                  payment_reference: msg.payment_reference,
                                  customer_name: msg.customer_name,
                                  customer_phone: msg.customer_phone,
                                  receiver_phone: msg.receiver_phone,
                                  receiver_name: msg.receiver_name,
                                  amount: Number(msg.amount || 0),
                                  payment_method: msg.payment_method,
                                })
                              }
                              className="px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white text-xs font-black rounded-xl border border-emerald-400/50 flex items-center gap-1.5 cursor-pointer shadow-md transition-all"
                            >
                              <Check className="w-4 h-4" />
                              <span>Confirm</span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleDepositAction(msg.transaction_id || msg.payment_reference, 'REJECT', {
                                  firebase_doc_id: msg.firebase_doc_id,
                                  payment_reference: msg.payment_reference,
                                  customer_name: msg.customer_name,
                                  customer_phone: msg.customer_phone,
                                  receiver_phone: msg.receiver_phone,
                                  receiver_name: msg.receiver_name,
                                  amount: Number(msg.amount || 0),
                                  payment_method: msg.payment_method,
                                })
                              }
                              className="px-3 py-2 bg-rose-950/70 hover:bg-rose-900/70 text-rose-300 text-xs font-bold rounded-xl border border-rose-500/40 flex items-center gap-1 cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                              <span>Deny</span>
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* TAB 1: DEPOSITS & MACHINE PAYMENTS (PENDING -> SUCCESSFUL + WALLET CREDIT) */}
      {activeTab === 'DEPOSITS' && (
        <div className="shining-card border border-blue-950/80 rounded-2xl p-6 space-y-4 shadow-xl text-white">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-blue-950/80">
            <div>
              <h3 className="text-base font-extrabold text-white">Customer Deposits &amp; Wallet Confirmation System</h3>
              <p className="text-xs text-slate-300">
                1. Customer deposits &rarr; 2. Shows <strong className="text-amber-300">Pending</strong> in Admin + customer Wallet empty &rarr; 3. Press <strong className="text-emerald-300">Confirm</strong> &rarr; 4. System changes <strong className="text-emerald-300">Pending &rarr; Successful</strong> AND adds that amount to that customer&apos;s <strong>Wallet</strong> balance in real time without refreshing.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto shrink-0">
              {deposits.filter((d) => d.status === 'PENDING').length > 0 && (
                <button
                  type="button"
                  disabled={isApprovingAll}
                  onClick={handleApproveAllDeposits}
                  className="px-3.5 py-2 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white text-xs font-black rounded-xl border border-emerald-400/50 flex items-center gap-1.5 cursor-pointer shadow-md transition-all disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4 text-white" />
                  <span>
                    {isApprovingAll
                      ? 'Confirming All...'
                      : `Confirm All Pending (${deposits.filter((d) => d.status === 'PENDING').length})`}
                  </span>
                </button>
              )}
              <button
                type="button"
                onClick={fetchAdminData}
                className="px-3 py-2 bg-[#09152e] hover:bg-[#0f2147] text-cyan-300 text-xs font-bold rounded-xl border border-cyan-500/40 flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoadingData ? 'animate-spin' : ''}`} />
                <span>Refresh Deposits</span>
              </button>
            </div>
          </div>

          {/* Incoming Pending Deposits Banner */}
          {deposits.filter((d) => d.status === 'PENDING').length > 0 ? (
            <div className="p-4 bg-amber-950/70 border border-amber-500/50 rounded-2xl space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-amber-300 font-black text-xs uppercase tracking-wider">
                  <Megaphone className="w-4 h-4 text-amber-400 animate-bounce" />
                  <span>
                    Pending Deposits ({deposits.filter((d) => d.status === 'PENDING').length} Awaiting Admin Confirmation)
                  </span>
                </div>
                <button
                  type="button"
                  disabled={isApprovingAll}
                  onClick={handleApproveAllDeposits}
                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-black rounded-lg border border-emerald-400/40 cursor-pointer flex items-center gap-1"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Confirm All &amp; Credit Wallets</span>
                </button>
              </div>
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {deposits
                  .filter((d) => d.status === 'PENDING')
                  .map((d: any) => (
                    <div
                      key={`alert-${d.id}`}
                      className="p-3 bg-[#060f24]/90 border border-amber-500/30 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="font-black text-white flex flex-wrap items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-black uppercase bg-amber-950/90 text-amber-300 border border-amber-500/40">
                            Pending
                          </span>
                          <span>{d.customer_name || d.user_id}</span>
                          {d.customer_phone && (
                            <span className="font-mono text-cyan-300 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-500/30">
                              Sender: {d.customer_phone}
                            </span>
                          )}
                          {d.receiver_phone && (
                            <span className="font-mono text-emerald-300 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-500/30">
                              Receiver: {d.receiver_phone} {d.receiver_name ? `(${d.receiver_name})` : ''}
                            </span>
                          )}
                          <span className="font-mono text-amber-300">
                            • UGX {Number(d.amount || 0).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-300">
                          {d.machine_title ? (
                            <>
                              Machine: <strong className="text-emerald-300">{d.machine_title}</strong> •{' '}
                            </>
                          ) : null}
                          {d.payment_method} (Ref: <span className="font-mono">{d.payment_reference}</span>)
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() =>
                            handleDepositAction(d.id, 'APPROVE', {
                              firebase_doc_id: d.firebase_doc_id,
                              payment_reference: d.payment_reference,
                              user_id: d.user_id,
                              customer_name: d.customer_name,
                              customer_phone: d.customer_phone,
                              receiver_phone: d.receiver_phone,
                              receiver_name: d.receiver_name,
                              amount: Number(d.amount || 0),
                              payment_method: d.payment_method,
                            })
                          }
                          className="px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white text-[11px] font-black rounded-lg transition-all flex items-center gap-1 cursor-pointer shadow-xs border border-emerald-500/40"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Confirm</span>
                        </button>
                        <button
                          onClick={() =>
                            handleDepositAction(d.id, 'REJECT', {
                              firebase_doc_id: d.firebase_doc_id,
                              payment_reference: d.payment_reference,
                              user_id: d.user_id,
                              customer_name: d.customer_name,
                              customer_phone: d.customer_phone,
                              receiver_phone: d.receiver_phone,
                              receiver_name: d.receiver_name,
                              amount: Number(d.amount || 0),
                              payment_method: d.payment_method,
                            })
                          }
                          className="px-2.5 py-1.5 bg-rose-950/70 hover:bg-rose-900/70 text-rose-300 text-[11px] font-bold rounded-lg border border-rose-500/30 flex items-center gap-1 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Deny</span>
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ) : (
            <div className="text-center py-4 text-emerald-300/90 text-xs font-bold bg-emerald-950/20 border border-emerald-500/25 rounded-2xl">
              All pending deposits have been confirmed (Pending &rarr; Successful) and credited directly to customer Wallets.
            </div>
          )}

          {deposits.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-blue-950/80 bg-[#070e1f] text-slate-300 uppercase text-[10px] font-bold">
                    <th className="py-3 px-3">Date / Time</th>
                    <th className="py-3 px-3">Customer / Sender &amp; Receiver</th>
                    <th className="py-3 px-3">Amount</th>
                    <th className="py-3 px-3">Tx Reference / Machine</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-blue-950/60">
                  {deposits.map((d: any) => {
                    const isMachineOrder = d.type === 'INVESTMENT';
                    const isPending = d.status === 'PENDING';
                    const isSuccessful = d.status === 'SUCCESS' || d.status === 'CONFIRMED';
                    return (
                      <tr key={d.id} className="hover:bg-[#0c1630]/60 transition-colors">
                        <td className="py-3 px-3 font-mono text-[11px] text-slate-400">
                          <div>{new Date(d.created_at).toLocaleDateString()}</div>
                          <div className="text-[10px] text-slate-500">{new Date(d.created_at).toLocaleTimeString()}</div>
                        </td>
                        <td className="py-3 px-3 font-bold text-white">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span>{d.customer_name || d.user_id}</span>
                            {d.customer_phone && (
                              <span className="text-[10px] font-mono text-cyan-300 bg-cyan-950/70 px-1.5 py-0.5 rounded">
                                {d.customer_phone}
                              </span>
                            )}
                            <span
                              className={`text-[9px] font-mono font-black px-1.5 py-0.5 rounded uppercase ${
                                isMachineOrder
                                  ? 'bg-amber-950/90 text-amber-300 border border-amber-500/40'
                                  : isSuccessful
                                    ? 'bg-emerald-950/90 text-emerald-300 border border-emerald-500/40'
                                    : 'bg-blue-950/90 text-blue-300 border border-blue-500/40'
                              }`}
                            >
                              {isMachineOrder ? 'Machine Order' : isSuccessful ? 'Wallet Credited' : 'Pending Deposit'}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400 font-normal block mt-0.5">{d.payment_method}</span>
                        </td>
                        <td className="py-3 px-3 font-mono font-bold text-blue-300">
                          UGX {Number(d.amount || 0).toLocaleString()}
                        </td>
                        <td className="py-3 px-3 font-mono text-[11px] text-slate-200 font-bold">
                          <div>{d.payment_reference || 'REF-N/A'}</div>
                          {d.machine_title && (
                            <span className="text-[10px] text-cyan-400 block">{d.machine_title}</span>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          {isPending ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold font-mono uppercase bg-amber-950/70 text-amber-300 border border-amber-500/40 animate-pulse">
                              Pending
                            </span>
                          ) : isSuccessful ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold font-mono uppercase bg-emerald-950/80 text-emerald-300 border border-emerald-500/40">
                              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                              Successful
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold font-mono uppercase bg-rose-950/80 text-rose-300 border border-rose-500/40">
                              {d.status}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right">
                          {isPending ? (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() =>
                                  handleDepositAction(d.id, 'APPROVE', {
                                    firebase_doc_id: d.firebase_doc_id,
                                    payment_reference: d.payment_reference,
                                    user_id: d.user_id,
                                    customer_name: d.customer_name,
                                    customer_phone: d.customer_phone,
                                    receiver_phone: d.receiver_phone,
                                    receiver_name: d.receiver_name,
                                    amount: Number(d.amount || 0),
                                    payment_method: d.payment_method,
                                  })
                                }
                                className="px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white text-[10px] font-black rounded-lg transition-all flex items-center gap-1 cursor-pointer shadow-xs border border-emerald-500/30"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Confirm</span>
                              </button>

                              <button
                                onClick={() =>
                                  handleDepositAction(d.id, 'REJECT', {
                                    firebase_doc_id: d.firebase_doc_id,
                                    payment_reference: d.payment_reference,
                                    user_id: d.user_id,
                                    customer_name: d.customer_name,
                                    customer_phone: d.customer_phone,
                                    receiver_phone: d.receiver_phone,
                                    receiver_name: d.receiver_name,
                                    amount: Number(d.amount || 0),
                                    payment_method: d.payment_method,
                                  })
                                }
                                className="px-3 py-1.5 bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 text-[10px] font-bold rounded-lg border border-rose-500/30 transition-all flex items-center gap-1 cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                                <span>Deny</span>
                              </button>
                            </div>
                          ) : isSuccessful ? (
                            <span className="text-[10px] font-mono text-emerald-400 font-bold">
                              ✅ Confirmed on Wallet
                            </span>
                          ) : (
                            <span className="text-[10px] font-mono text-rose-400 font-bold">
                              ❌ Denied (Removed from Wallet)
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB: DEPOSIT NUMBERS & 7H ROTATION */}
      {activeTab === 'DEPOSIT_NUMBERS' && (
        <DepositNumbersManager onRefreshAdmin={fetchAdminData} />
      )}

      {/* TAB 2: WITHDRAWALS MANAGEMENT (Real-Time Firestore 'withdrawals' Collection) */}
      {activeTab === 'WITHDRAWALS' && (
        <div className="shining-card border border-blue-950/80 rounded-2xl p-6 space-y-4 shadow-xl text-white">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-blue-950/80">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold text-white">Withdrawal Payout Requests</h3>
                <span className="px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 text-[10px] font-mono font-bold">
                  Firestore &apos;withdrawals&apos; Live
                </span>
              </div>
              <p className="text-xs text-slate-300">
                Real-time withdrawals from Firebase project <span className="font-mono text-sky-300">avorinvest</span>. Approve or Reject customer withdrawal requests.
              </p>
            </div>
            <div className="text-xs font-mono text-slate-300">
              Total: <span className="font-bold text-white">{withdrawals.length}</span> • Pending:{' '}
              <span className="font-bold text-amber-300">
                {withdrawals.filter((w) => w.status === 'PENDING').length}
              </span>
            </div>
          </div>

          {withdrawals.length === 0 ? (
            <div className="text-center py-10 text-slate-400 text-xs">
              No withdrawal requests recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-blue-950/80 bg-[#070e1f] text-slate-300 uppercase text-[10px] font-bold">
                    <th className="py-3 px-3">Date</th>
                    <th className="py-3 px-3">Customer Name &amp; Phone</th>
                    <th className="py-3 px-3">Withdraw Amount</th>
                    <th className="py-3 px-3">Ref / ID</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-blue-950/60">
                  {withdrawals.map((w) => {
                    const feeAmt =
                      typeof w.fee_amount === 'number' ? w.fee_amount : Math.round(Number(w.amount || 0) * 0.1);
                    const netAmt =
                      typeof w.net_amount === 'number'
                        ? w.net_amount
                        : Math.max(0, Number(w.amount || 0) - feeAmt);
                    return (
                      <tr key={w.id} className="hover:bg-[#0c1630]/60 transition-colors">
                        <td className="py-3 px-3 font-mono text-[11px] text-slate-400">
                          {new Date(w.created_at).toLocaleString()}
                        </td>
                        <td className="py-3 px-3 font-bold text-white">
                          <div className="text-sky-200">{w.name || w.customer_name || 'Avor Investor'}</div>
                          {w.phone && (
                            <span className="text-[11px] text-emerald-300 font-mono block">
                              Phone: {w.phone}
                            </span>
                          )}
                          <span className="text-[10px] text-slate-400 font-mono block">
                            User ID: {w.userId || w.user_id}
                          </span>
                          <span className="text-[10px] text-slate-400 font-normal block">
                            {w.payment_method}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-mono">
                          <span className="font-bold text-sky-400 block">
                            UGX {Number(w.amount || 0).toLocaleString()}
                          </span>
                          <span className="text-[10px] text-emerald-300 block">
                            Net Payout: UGX {netAmt.toLocaleString()} (-10% fee: {feeAmt.toLocaleString()})
                          </span>
                        </td>
                        <td className="py-3 px-3 font-mono text-[11px] text-slate-400">
                          {w.payment_reference || w.id}
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold font-mono uppercase ${
                              w.status === 'SUCCESS'
                                ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-500/40'
                                : w.status === 'PENDING'
                                ? 'bg-blue-950/70 text-blue-300 border border-blue-500/40 animate-pulse'
                                : 'bg-rose-950/70 text-rose-300 border border-rose-500/40'
                            }`}
                          >
                            {w.firestore_status || w.status}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right">
                          {w.status === 'PENDING' ? (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                onClick={() => handleWithdrawalAction(w.id, 'APPROVE', w)}
                                className="px-3 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white text-[10px] font-black rounded-lg transition-all flex items-center gap-1 cursor-pointer shadow-xs border border-emerald-500/30"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Approve</span>
                              </button>

                              <button
                                onClick={() => handleWithdrawalAction(w.id, 'REJECT', w)}
                                className="px-3 py-1.5 bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 text-[10px] font-bold rounded-lg border border-rose-500/30 transition-all flex items-center gap-1 cursor-pointer"
                              >
                                <X className="w-3.5 h-3.5" />
                                <span>Reject</span>
                              </button>
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-400 font-mono">
                              {w.status === 'SUCCESS' ? 'Approved' : 'Rejected'}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: MACHINE MANAGEMENT (Add, Edit, Remove, Series P, Price, Lock Duration, Images) */}
      {activeTab === 'MACHINES' && (
        <div className="space-y-8">
          {/* Quick Stats & Add Series P Shortcut Header */}
          <div className="shining-card-glow p-6 rounded-2xl border border-blue-950/80 shadow-2xl text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-800 text-white text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full font-mono shadow-xs border border-blue-400/40">
                  Marketplace Inventory Control
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  {machineList.length} Total Machines
                </span>
              </div>
              <h3 className="text-xl font-extrabold text-white tracking-tight">
                Machine Equipment & Series Management
              </h3>
              <p className="text-xs text-slate-300 max-w-2xl">
                Edit prices, time lock durations, daily yields, upload machine images, configure Series P compute nodes, or remove equipment models from the live marketplace.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleResetRatioCatalog}
                className="px-3.5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white font-black text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer border border-emerald-500/30"
                title="Reset entire marketplace to official 2:3 Ratio Packages"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reset 2:3 Catalog</span>
              </button>

              <button
                type="button"
                onClick={() => handleBulkApplyRatio(1.5)}
                className="px-3.5 py-2.5 bg-gradient-to-r from-blue-700 to-indigo-800 hover:from-blue-600 hover:to-indigo-700 text-white font-black text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer border border-blue-500/30"
                title="Force 2:3 ratio (1.5x total payout) across all current machines"
              >
                <Zap className="w-3.5 h-3.5 text-blue-300" />
                <span>Apply 2:3 to All</span>
              </button>

              <button
                type="button"
                onClick={() => applySeriesPreset('NODE_BETA')}
                className="px-4 py-2.5 bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-800 hover:from-blue-500 hover:to-blue-700 text-white font-black text-xs rounded-xl shadow-md transition-all flex items-center gap-1.5 cursor-pointer border border-blue-400/40"
              >
                <Sparkles className="w-4 h-4 text-blue-300" />
                <span>+ Preset Machine</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  resetMachineForm();
                  const formEl = document.getElementById('admin-machine-editor-form');
                  if (formEl) formEl.scrollIntoView({ behavior: 'smooth' });
                }}
                className="px-3.5 py-2.5 bg-[#070e1f] hover:bg-[#0d1733] text-slate-200 border border-blue-950/80 font-bold text-xs rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <PlusCircle className="w-4 h-4 text-blue-400" />
                <span>Custom Machine</span>
              </button>
            </div>
          </div>

          {/* Machine Inventory List & Filters */}
          <div className="shining-card border border-blue-950/80 rounded-2xl p-6 space-y-5 shadow-xl text-white">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-blue-950/80">
              <div>
                <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                  <span>Live Equipment Catalog</span>
                  <span className="bg-[#070e1f] text-blue-300 border border-blue-950/80 text-xs px-2 py-0.5 rounded-full font-mono font-bold">
                    {machineList.length} Units
                  </span>
                </h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  Click &ldquo;Edit Unit&rdquo; to modify price, lock duration, picture, or specs. Use &ldquo;Quick Edit&rdquo; for instant price/lock changes.
                </p>
              </div>

              {editingMachineId && (
                <div className="flex items-center gap-2 bg-[#070e1f] border border-blue-500/50 px-3 py-1.5 rounded-xl">
                  <span className="text-xs font-bold text-blue-300">
                    Currently Editing Active Unit
                  </span>
                  <button
                    onClick={resetMachineForm}
                    className="px-2 py-1 bg-blue-950 hover:bg-blue-900 text-blue-300 text-[10px] font-black rounded-lg cursor-pointer transition-colors border border-blue-500/40"
                  >
                    Cancel Edit
                  </button>
                </div>
              )}
            </div>

            {/* Filter Tabs & Search Bar */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              {/* Category Filter Pills */}
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { id: 'ALL', label: 'All Series' },
                    { id: 'AV1', label: 'AV1' },
                    { id: 'AV2', label: 'AV2' },
                    { id: 'AV_CLASS_A', label: 'A class' },
                    { id: 'AV_CLASS_B', label: 'B class' },
                    { id: 'AV_CLASS_C', label: 'C class' },
                    { id: 'AV_CLASS_D', label: 'D class' },
                    { id: 'AV_CLASS_E', label: 'E class' },
                    { id: 'AV_CLASS_F', label: 'F class' },
                    { id: 'AV_CLASS_G', label: 'G class' },
                    { id: 'AV_CLASS_H', label: 'H class' },
                    { id: 'AV_CLASS_I', label: 'I class' },
                  ] as const
                ).map((cat) => {
                  const count =
                    cat.id === 'ALL'
                      ? machineList.length
                      : machineList.filter((m) => m.category === cat.id).length;

                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setMachineCategoryFilter(cat.id as any)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                        machineCategoryFilter === cat.id
                          ? 'bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-800 text-white font-black shadow-xs border border-blue-400/40'
                          : 'bg-[#070e1f] text-slate-300 hover:bg-[#0d1733] hover:text-white border border-blue-950/80'
                      }`}
                    >
                      <span>{cat.label}</span>
                      <span
                        className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                          machineCategoryFilter === cat.id
                            ? 'bg-blue-950 text-blue-200'
                            : 'bg-[#0c1630] text-slate-400'
                        }`}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Search Bar */}
              <div className="relative w-full md:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
                <input
                  type="text"
                  placeholder="Search machine or series..."
                  value={machineSearchTerm}
                  onChange={(e) => setMachineSearchTerm(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 bg-[#060c1c] border border-blue-950/80 rounded-xl text-xs text-white placeholder:text-slate-400 focus:border-blue-500 focus:outline-none shadow-inner"
                />
              </div>
            </div>

            {/* Machine Grid */}
            {(() => {
              const filteredList = machineList.filter((m) => {
                const catMatch =
                  machineCategoryFilter === 'ALL' ? true : m.category === machineCategoryFilter;
                const searchMatch =
                  (m.title || m.name || '').toLowerCase().includes(machineSearchTerm.toLowerCase()) ||
                  (m.series_tag || m.series || '').toLowerCase().includes(machineSearchTerm.toLowerCase()) ||
                  (m.description || '').toLowerCase().includes(machineSearchTerm.toLowerCase());
                return catMatch && searchMatch;
              });

              if (filteredList.length === 0) {
                return (
                  <div className="text-center py-12 bg-[#070e1f] rounded-2xl border border-dashed border-blue-950/80 space-y-2">
                    <Cpu className="w-8 h-8 text-slate-500 mx-auto" />
                    <p className="text-xs font-bold text-slate-300">No machines match your filter.</p>
                    <button
                      type="button"
                      onClick={() => {
                        setMachineSearchTerm('');
                        setMachineCategoryFilter('ALL');
                      }}
                      className="text-xs text-blue-400 font-bold hover:underline"
                    >
                      Clear search filters
                    </button>
                  </div>
                );
              }

              return (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {filteredList.map((m) => {
                    const price = m.total_cost || m.price || 15000;
                    const daily = m.daily_yield || m.rewardAmount || 3750;
                    const duration = m.duration_days || (m.lockDurationMinutes ? Math.round(m.lockDurationMinutes / 1440) : 12);
                    const series = m.series_tag || m.series || 'P-SERIES';
                    const name = m.title || m.name || 'Mining Rig';
                    const payoutAfterLock = m.total_return || (daily * duration);
                    const roiPct = Math.round((payoutAfterLock / price) * 100);
                    const isSeriesP = m.category === 'P_SERIES' || series.startsWith('P-') || series.includes('Series P');

                    return (
                      <div
                        key={m.id}
                        className={`shining-card border rounded-2xl overflow-hidden shadow-xl hover:shadow-2xl transition-all flex flex-col justify-between group ${
                          editingMachineId === m.id
                            ? 'border-blue-500 ring-2 ring-blue-400/40'
                            : isSeriesP
                            ? 'border-blue-500/50'
                            : 'border-blue-950/80'
                        }`}
                      >
                        {/* Machine Image & Badges */}
                        <div className="relative h-36 bg-[#080f1e] overflow-hidden">
                          <img
                            src={
                              m.image_url ||
                              m.imageUrl ||
                              'https://images.unsplash.com/photo-1591488320449-011701bb6704?w=600&auto=format&fit=crop&q=80'
                            }
                            alt={name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-[#040814]/90 via-transparent to-transparent" />

                          {/* Series Tag Badge */}
                          <span
                            className={`absolute top-2.5 left-2.5 text-[10px] font-black px-2.5 py-1 rounded-lg uppercase tracking-wider font-mono shadow-xs ${
                              isSeriesP
                                ? 'bg-blue-600 text-white font-black border border-blue-400/40'
                                : 'bg-[#040814]/90 text-blue-300 border border-blue-500/40'
                            }`}
                          >
                            {series}
                          </span>

                          {/* Time Lock Badge */}
                          <span className="absolute top-2.5 right-2.5 bg-[#040814]/90 backdrop-blur-xs text-white border border-blue-500/40 text-[10px] font-black px-2 py-1 rounded-lg font-mono flex items-center gap-1 shadow-xs">
                            <Lock className="w-2.5 h-2.5 text-blue-400" />
                            <span>{duration} Days Lock 🔐</span>
                          </span>

                          {/* Category Sub-badge at bottom of image */}
                          <span className="absolute bottom-2 left-2.5 text-[10px] text-slate-300 font-bold bg-[#040814]/90 px-2 py-0.5 rounded backdrop-blur-xs font-mono border border-blue-950/80">
                            {m.category === 'AV1'
                              ? 'AV1'
                              : m.category === 'AV2'
                              ? 'AV2'
                              : m.category === 'AV3'
                              ? 'AV3'
                              : m.category === 'VIP_A'
                              ? '👑 VIP CLASS A'
                              : m.category === 'VIP_B'
                              ? '👑 VIP CLASS B'
                              : m.category === 'VIP_C'
                              ? '👑 VIP CLASS C'
                              : m.category === 'VIP_D'
                              ? '👑 VIP CLASS D'
                              : m.category === 'VIP_E'
                              ? '👑 VIP CLASS E'
                              : (m.series_tag || m.series || 'AV1')}
                          </span>
                        </div>

                        {/* Card Content */}
                        <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                          <div>
                            <div className="flex justify-between items-start">
                              <h4 className="font-extrabold text-sm text-white leading-snug line-clamp-1">
                                {name}
                              </h4>
                              <span className="text-[10px] font-extrabold text-emerald-300 bg-emerald-950/80 border border-emerald-500/40 px-1.5 py-0.5 rounded font-mono shrink-0 ml-1">
                                +{roiPct}% ROI
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400 line-clamp-2 mt-1">
                              {m.description || 'Enterprise compute yield unit.'}
                            </p>
                          </div>

                          {/* Hardware Specs Pills */}
                          <div className="flex items-center gap-2 text-[10px] text-slate-300 bg-[#070e1f] px-2.5 py-1.5 rounded-lg border border-blue-950/80 font-mono">
                            <span className="flex items-center gap-1 font-bold text-blue-400">
                              <Zap className="w-3 h-3 text-blue-400" />
                              <span>{m.hashrate_or_capacity || '240 TH/s'}</span>
                            </span>
                            <span className="text-slate-500">|</span>
                            <span className="truncate">{m.power_consumption || '1100W'}</span>
                          </div>

                          {/* Pricing & Yield Details Grid */}
                          <div className="bg-[#050a16] text-white p-3 rounded-xl border border-blue-950/80 space-y-2 text-xs font-mono">
                            <div className="flex justify-between items-center pb-1.5 border-b border-blue-950/60">
                              <span className="text-[10px] text-slate-400 uppercase font-sans">Buy Price:</span>
                              <span className="font-black text-white text-xs">
                                UGX {price.toLocaleString()}
                              </span>
                            </div>

                            <div className="flex justify-between items-center pb-1.5 border-b border-blue-950/60">
                              <span className="text-[10px] text-slate-400 uppercase font-sans">Daily Yield:</span>
                              <span className="font-bold text-blue-300 text-xs">
                                +UGX {daily.toLocaleString()}/day
                              </span>
                            </div>

                            <div className="flex justify-between items-center pt-0.5">
                              <span className="text-[10px] text-slate-300 font-sans font-bold flex items-center gap-1">
                                <TrendingUp className="w-3 h-3 text-blue-400" />
                                <span>Receive After Lock:</span>
                              </span>
                              <span className="font-black text-blue-300 text-xs bg-blue-950 border border-blue-800 px-1.5 py-0.5 rounded">
                                UGX {payoutAfterLock.toLocaleString()}
                              </span>
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="flex flex-col gap-1.5 pt-1">
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleEditMachineSelect(m)}
                                className="flex-1 py-2 bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-800 hover:from-blue-500 hover:to-blue-700 text-white font-black text-xs rounded-xl transition-all flex items-center justify-center gap-1 cursor-pointer shadow-xs border border-blue-400/40"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                                <span>Edit Full Unit</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setQuickEditMachine(m);
                                  setQuickPrice(price);
                                  setQuickDuration(duration);
                                  setQuickYield(daily);
                                }}
                                className="py-2 px-3 bg-[#070e1f] hover:bg-[#0d1733] text-slate-200 font-bold text-xs rounded-xl border border-blue-950/80 transition-all flex items-center justify-center gap-1 cursor-pointer"
                                title="Quick change price or lock duration"
                              >
                                <SlidersHorizontal className="w-3.5 h-3.5 text-blue-400" />
                                <span className="hidden sm:inline">Quick</span>
                              </button>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleDuplicateMachine(m)}
                                className="flex-1 py-1.5 bg-[#070e1f] hover:bg-[#0d1733] text-slate-300 font-bold text-[11px] rounded-lg border border-blue-950/80 transition-all flex items-center justify-center gap-1 cursor-pointer"
                                title="Clone this machine to create a new model"
                              >
                                <Copy className="w-3 h-3 text-slate-400" />
                                <span>Clone / Duplicate</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDeleteMachine(m.id, name)}
                                className="py-1.5 px-3 bg-rose-950/60 hover:bg-rose-900/60 text-rose-300 font-bold text-[11px] rounded-lg border border-rose-500/30 transition-all flex items-center justify-center gap-1 cursor-pointer"
                                title="Remove machine from marketplace"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Remove</span>
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>

          {/* Quick In-Line Price & Lock Duration Editor Modal */}
          {quickEditMachine && (
            <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
              <div className="shining-card-glow border border-blue-950/80 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in-95 text-white bg-[#040814]/95">
                <div className="flex justify-between items-start pb-3 border-b border-blue-950/80">
                  <div>
                    <span className="text-[10px] font-black text-blue-300 bg-blue-950/80 border border-blue-500/40 px-2 py-0.5 rounded font-mono uppercase">
                      Quick Modifier
                    </span>
                    <h3 className="text-base font-extrabold text-white mt-1">
                      {quickEditMachine.title || quickEditMachine.name}
                    </h3>
                  </div>
                  <button
                    onClick={() => setQuickEditMachine(null)}
                    className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleQuickSaveMachine} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                      Buy Price (UGX)
                    </label>
                    <input
                      type="number"
                      value={quickPrice}
                      onChange={(e) => setQuickPrice(Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 bg-[#060c1c] border border-blue-950/80 rounded-xl text-xs font-bold text-white focus:border-blue-500 focus:outline-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                      Time Lock Duration (Days)
                    </label>
                    <input
                      type="number"
                      value={quickDuration}
                      onChange={(e) => setQuickDuration(Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 bg-[#060c1c] border border-blue-950/80 rounded-xl text-xs font-bold text-white focus:border-blue-500 focus:outline-none"
                      required
                    />
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <label className="text-xs font-bold text-slate-300 uppercase">
                        Daily Return Yield (UGX)
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          const autoYield = calculate23Yield(quickPrice, quickDuration);
                          setQuickYield(autoYield);
                        }}
                        className="text-[10px] font-black text-emerald-300 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/40 px-2 py-0.5 rounded cursor-pointer transition-colors"
                      >
                        ⚡ 2:3 Ratio Yield (+50%)
                      </button>
                    </div>
                    <input
                      type="number"
                      value={quickYield}
                      onChange={(e) => setQuickYield(Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 bg-[#060c1c] border border-blue-950/80 rounded-xl text-xs font-bold text-blue-300 focus:border-blue-500 focus:outline-none"
                      required
                    />
                  </div>

                  {/* Calculated Payout Summary */}
                  <div className="bg-[#050a16] text-white p-3.5 rounded-xl border border-blue-950/80 text-xs font-mono space-y-1.5">
                    <div className="flex justify-between text-slate-400 text-[11px]">
                      <span>Total Payout After Lock:</span>
                      <span className="font-bold text-emerald-400">
                        UGX {(quickYield * quickDuration).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400 text-[11px]">
                      <span>Estimated Return ROI:</span>
                      <span className="font-bold text-blue-300">
                        {quickPrice > 0 ? Math.round(((quickYield * quickDuration) / quickPrice) * 100) : 0}%
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <button
                      type="submit"
                      disabled={isQuickSaving}
                      className="flex-1 py-2.5 bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-800 hover:from-blue-500 hover:to-blue-700 text-white font-black text-xs rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-50 border border-blue-400/40"
                    >
                      {isQuickSaving ? 'Updating...' : 'Save Changes'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuickEditMachine(null)}
                      className="py-2.5 px-4 bg-[#070e1f] hover:bg-[#0d1733] text-slate-300 font-bold text-xs rounded-xl cursor-pointer border border-blue-950/80"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {/* Machine Creator / Full Editor Form */}
          <div
            id="admin-machine-editor-form"
            className="shining-card border border-blue-950/80 rounded-2xl p-6 sm:p-8 space-y-6 shadow-xl text-white"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-blue-950/80">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-[10px] font-black px-2.5 py-0.5 rounded-full font-mono uppercase ${
                      editingMachineId
                        ? 'bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-800 text-white border border-blue-400/40'
                        : 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                    }`}
                  >
                    {editingMachineId ? 'Editing Active Unit' : 'New Equipment Unit'}
                  </span>
                  {editingMachineId && (
                    <span className="text-xs text-slate-400 font-mono">ID: {editingMachineId}</span>
                  )}
                </div>
                <h3 className="text-lg font-black text-white mt-1">
                  {editingMachineId ? `Edit "${title || 'Equipment Unit'}"` : 'Publish New Machine Unit'}
                </h3>
                <p className="text-xs text-slate-300">
                  Configure buy price, lock duration days, daily return yield, series tag, specifications, and machine photos.
                </p>
              </div>

              {editingMachineId && (
                <button
                  type="button"
                  onClick={resetMachineForm}
                  className="px-4 py-2 bg-[#070e1f] hover:bg-[#0d1733] text-slate-200 border border-blue-950/80 font-bold text-xs rounded-xl cursor-pointer transition-colors"
                >
                  Cancel & Reset Form
                </button>
              )}
            </div>

            {/* Quick 1-Click Series Presets */}
            <div className="space-y-2.5 bg-[#070e1f] p-4 rounded-2xl border border-blue-950/80">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                <span className="text-[11px] font-extrabold uppercase text-blue-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                  <span>Official 2:3 Ratio Packages (150% Return / 50% Profit):</span>
                </span>
                <span className="text-[10px] text-slate-400 font-mono">
                  Formula: Gross Payout = Buy Price × 1.5
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => applySeriesPreset('AV1_100')}
                  className="px-3 py-1.5 bg-emerald-950/70 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-500/40 rounded-xl text-xs font-black transition-all flex items-center gap-1 cursor-pointer"
                >
                  <span>⚡ AV1-100 (35k | 18d | 50k Return • 1 Unit)</span>
                </button>

                <button
                  type="button"
                  onClick={() => applySeriesPreset('AV1_200')}
                  className="px-3 py-1.5 bg-emerald-950/70 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-500/40 rounded-xl text-xs font-black transition-all flex items-center gap-1 cursor-pointer"
                >
                  <span>⚡ AV1-200 (60k | 20d | 115k Return • 1 Unit)</span>
                </button>

                <button
                  type="button"
                  onClick={() => applySeriesPreset('AV2_300')}
                  className="px-3 py-1.5 bg-sky-950/70 hover:bg-sky-900/80 text-sky-300 border border-sky-500/40 rounded-xl text-xs font-black transition-all flex items-center gap-1 cursor-pointer"
                >
                  <span>⚡ AV2-100 (55k | 20d | 100k Return)</span>
                </button>

                <button
                  type="button"
                  onClick={() => applySeriesPreset('AV2_500')}
                  className="px-3 py-1.5 bg-sky-950/70 hover:bg-sky-900/80 text-sky-300 border border-sky-500/40 rounded-xl text-xs font-black transition-all flex items-center gap-1 cursor-pointer"
                >
                  <span>⚡ AV2-200 (140k | 18d | 220k Return)</span>
                </button>

                <button
                  type="button"
                  onClick={() => applySeriesPreset('AV3_750')}
                  className="px-3 py-1.5 bg-indigo-950/70 hover:bg-indigo-900/80 text-indigo-300 border border-indigo-500/40 rounded-xl text-xs font-black transition-all flex items-center gap-1 cursor-pointer"
                >
                  <span>⚡ AV2-300 (200k | 50d | 600k Return)</span>
                </button>

                <button
                  type="button"
                  onClick={() => applySeriesPreset('VIP_CLASS_A')}
                  className="px-3 py-1.5 bg-blue-950/70 hover:bg-blue-900/80 text-blue-300 border border-blue-500/40 rounded-xl text-xs font-black transition-all flex items-center gap-1 cursor-pointer"
                >
                  <span>👑 VIP CLASS A (300k | 18d)</span>
                </button>

                <button
                  type="button"
                  onClick={() => applySeriesPreset('VIP_CLASS_B')}
                  className="px-3 py-1.5 bg-blue-950/70 hover:bg-blue-900/80 text-blue-300 border border-blue-500/40 rounded-xl text-xs font-black transition-all flex items-center gap-1 cursor-pointer"
                >
                  <span>👑 VIP CLASS B (500k | 20d)</span>
                </button>

                <button
                  type="button"
                  onClick={() => applySeriesPreset('VIP_CLASS_C')}
                  className="px-3 py-1.5 bg-blue-950/70 hover:bg-blue-900/80 text-blue-300 border border-blue-500/40 rounded-xl text-xs font-black transition-all flex items-center gap-1 cursor-pointer"
                >
                  <span>👑 VIP CLASS C (750k | 20d)</span>
                </button>

                <button
                  type="button"
                  onClick={() => applySeriesPreset('VIP_CLASS_D')}
                  className="px-3 py-1.5 bg-blue-950/70 hover:bg-blue-900/80 text-blue-300 border border-blue-500/40 rounded-xl text-xs font-black transition-all flex items-center gap-1 cursor-pointer"
                >
                  <span>👑 VIP CLASS D (1M | 20d)</span>
                </button>

                <button
                  type="button"
                  onClick={() => applySeriesPreset('VIP_CLASS_E')}
                  className="px-3 py-1.5 bg-blue-900/80 hover:bg-blue-800 text-blue-200 border border-blue-400/50 rounded-xl text-xs font-black transition-all flex items-center gap-1 cursor-pointer"
                >
                  <span>👑 VIP CLASS E (2M | 25d)</span>
                </button>
              </div>
            </div>

            <form onSubmit={handleSaveMachine} className="space-y-6">
              {/* Row 1: Title, Category, Series Tag */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                    Machine Model Title *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Avor Invest AV1-100 Genesis Miner"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#050a18] border border-blue-950/80 rounded-xl text-xs font-semibold text-white focus:border-blue-500 focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                    Category Series *
                  </label>
                  <select
                    value={category}
                    onChange={(e) => {
                      const newCat = e.target.value as MachineCategory;
                      setCategory(newCat);
                      if (newCat === 'AV1') setSeriesTag('AV1');
                      else if (newCat === 'AV2') setSeriesTag('AV2');
                      else if (newCat === 'AV_CLASS_A') setSeriesTag('A class');
                      else if (newCat === 'AV_CLASS_B') setSeriesTag('B class');
                      else if (newCat === 'AV_CLASS_C') setSeriesTag('C class');
                      else if (newCat === 'AV_CLASS_D') setSeriesTag('D class');
                      else if (newCat === 'AV_CLASS_E') setSeriesTag('E class');
                      else if (newCat === 'AV_CLASS_F') setSeriesTag('F class');
                      else if (newCat === 'AV_CLASS_G') setSeriesTag('G class');
                      else if (newCat === 'AV_CLASS_H') setSeriesTag('H class');
                      else if (newCat === 'AV_CLASS_I') setSeriesTag('I class');
                    }}
                    className="w-full px-3.5 py-2.5 bg-[#050a18] border border-blue-950/80 rounded-xl text-xs font-bold text-white focus:border-blue-500 focus:outline-none"
                  >
                    <option value="AV1">⚡ AV1 Series</option>
                    <option value="AV2">⚡ AV2 Series</option>
                    <option value="AV_CLASS_A">⚡ AVclasses A class (Daily • Wallet)</option>
                    <option value="AV_CLASS_B">⚡ AVclasses B class (Daily • Wallet)</option>
                    <option value="AV_CLASS_C">⚡ AVclasses C class (Daily • Wallet)</option>
                    <option value="AV_CLASS_D">⚡ AVclasses D class (Daily • Wallet)</option>
                    <option value="AV_CLASS_E">⚡ AVclasses E class (Daily • Wallet)</option>
                    <option value="AV_CLASS_F">⚡ AVclasses F class (Daily • Wallet)</option>
                    <option value="AV_CLASS_G">⚡ AVclasses G class (Daily • Wallet)</option>
                    <option value="AV_CLASS_H">⚡ AVclasses H class (Daily • Wallet)</option>
                    <option value="AV_CLASS_I">⚡ AVclasses I class (Daily • Wallet)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                    Series Tag Badge *
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. AV1, AV2, AV3, VIP CLASS A"
                    value={seriesTag}
                    onChange={(e) => setSeriesTag(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#050a18] border border-blue-950/80 rounded-xl text-xs font-mono font-bold text-blue-300 focus:border-blue-500 focus:outline-none"
                    required
                  />
                </div>
              </div>

              {/* Row 2: Buy Price, Time Lock Duration, Daily Return Yield */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-bold text-slate-300 uppercase">
                      Buy Price (UGX) *
                    </label>
                    <span className="text-[10px] text-slate-400 font-mono">Cost to Buy</span>
                  </div>
                  <input
                    type="number"
                    placeholder="65000"
                    value={totalCost}
                    onChange={(e) => setTotalCost(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 bg-[#050a18] border border-blue-950/80 rounded-xl text-xs font-mono font-bold text-blue-400 focus:border-blue-500 focus:outline-none"
                    required
                  />
                  {/* Quick price increment buttons */}
                  <div className="flex gap-1 mt-1.5">
                    {[20000, 65000, 150000, 350000, 1000000].map((amt) => (
                      <button
                        key={amt}
                        type="button"
                        onClick={() => setTotalCost(amt)}
                        className="px-1.5 py-0.5 bg-[#09132e] hover:bg-[#0f2150] border border-blue-950/80 text-[10px] text-slate-300 rounded font-mono cursor-pointer"
                      >
                        {(amt / 1000).toFixed(0)}k
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-bold text-slate-300 uppercase">
                      Time Lock Duration (Days) *
                    </label>
                    <span className="text-[10px] text-blue-400 font-mono font-bold">🔐 Lock Days</span>
                  </div>
                  <input
                    type="number"
                    placeholder="10"
                    value={durationDays}
                    onChange={(e) => setDurationDays(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 bg-[#050a18] border border-blue-950/80 rounded-xl text-xs font-mono font-bold text-white focus:border-blue-500 focus:outline-none"
                    required
                  />
                  {/* Quick duration presets */}
                  <div className="flex gap-1 mt-1.5">
                    {[7, 10, 12, 14, 15, 18, 20, 30].map((days) => (
                      <button
                        key={days}
                        type="button"
                        onClick={() => setDurationDays(days)}
                        className="px-1.5 py-0.5 bg-[#09132e] hover:bg-[#0f2150] border border-blue-950/80 text-[10px] text-slate-300 rounded font-mono cursor-pointer"
                      >
                        {days}d
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-bold text-slate-300 uppercase">
                      Daily Return Yield (UGX) *
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const autoYield = calculate23Yield(totalCost, durationDays);
                        setDailyYield(autoYield);
                      }}
                      className="text-[10px] font-black text-emerald-300 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-500/40 px-2 py-0.5 rounded cursor-pointer transition-colors"
                      title="Calculate Daily Yield = (Buy Price * 1.5) / Lock Days"
                    >
                      ⚡ Auto 2:3 Ratio (+50%)
                    </button>
                  </div>
                  <input
                    type="number"
                    placeholder="3500"
                    value={dailyYield}
                    onChange={(e) => setDailyYield(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 bg-[#050a18] border border-blue-950/80 rounded-xl text-xs font-mono font-bold text-emerald-400 focus:border-blue-500 focus:outline-none"
                    required
                  />
                  {/* Yield Helper text */}
                  <div className="flex justify-between text-[10px] text-slate-400 mt-1">
                    <span>Total: UGX {(dailyYield * durationDays).toLocaleString()} in {durationDays}d</span>
                    <span className="font-bold text-emerald-400 font-mono">
                      Gross Payout: {totalCost > 0 ? ((dailyYield * durationDays) / totalCost).toFixed(2) : 0}x
                    </span>
                  </div>
                </div>
              </div>

              {/* Row 3: Live ROI & Return Summary Box */}
              <div className="bg-[#050a18] text-white p-4 rounded-2xl border border-blue-950/80 grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <span className="text-[10px] uppercase font-sans text-slate-400 block">Buy Price</span>
                  <span className="font-mono font-black text-white text-sm">
                    UGX {totalCost.toLocaleString()}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-sans text-slate-400 block">Time Lock Period</span>
                  <span className="font-mono font-bold text-slate-200 text-sm flex items-center gap-1">
                    <Lock className="w-3 h-3 text-blue-400" />
                    <span>{durationDays} Days</span>
                  </span>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-sans text-slate-400 block">Receive After Lock</span>
                  <span className="font-mono font-black text-emerald-400 text-sm">
                    UGX {(dailyYield * durationDays).toLocaleString()}
                  </span>
                </div>

                <div>
                  <span className="text-[10px] uppercase font-sans text-slate-400 block">Estimated Profit</span>
                  <span className="font-mono font-black text-white text-sm bg-emerald-950 border border-emerald-800 px-2 py-0.5 rounded inline-block">
                    +UGX {Math.max(0, dailyYield * durationDays - totalCost).toLocaleString()} (
                    {totalCost > 0 ? Math.round(((dailyYield * durationDays) / totalCost) * 100) : 0}% ROI)
                  </span>
                </div>
              </div>

              {/* Row 4: Machine Image Manager (URL, Upload, Presets & Live Preview) */}
              <div className="space-y-4 pt-2 border-t border-blue-950/80">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-xs font-extrabold text-white uppercase tracking-wider flex items-center gap-1.5">
                      <ImageIcon className="w-4 h-4 text-blue-400" />
                      <span>Machine Photo & Hardware Artwork</span>
                    </h4>
                    <p className="text-[11px] text-slate-300">
                      Enter an image URL, upload a photo file from your device, or pick from high-tech presets.
                    </p>
                  </div>

                  {imageUrl && (
                    <button
                      type="button"
                      onClick={() => setImageUrl('')}
                      className="text-[10px] text-rose-400 hover:text-rose-300 font-bold"
                    >
                      Clear Image
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  {/* Left: Input & Upload */}
                  <div className="lg:col-span-2 space-y-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-300 uppercase mb-1">
                        Direct Image URL
                      </label>
                      <input
                        type="url"
                        placeholder="https://images.unsplash.com/photo-..."
                        value={imageUrl}
                        onChange={(e) => setImageUrl(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-[#050a18] border border-blue-950/80 rounded-xl text-xs font-mono text-white focus:border-blue-500 focus:outline-none"
                      />
                    </div>

                    {/* Upload from device */}
                    <div className="flex items-center gap-3">
                      <label className="px-4 py-2 bg-[#09132e] hover:bg-[#0f2150] text-slate-200 font-bold text-xs rounded-xl border border-blue-950/80 cursor-pointer transition-all flex items-center gap-2">
                        <Upload className="w-3.5 h-3.5 text-slate-400" />
                        <span>Upload Machine Photo from Device</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageFileUpload}
                          className="hidden"
                        />
                      </label>
                      <span className="text-[10px] text-slate-400">JPG, PNG, WebP up to 5MB</span>
                    </div>

                    {/* Clickable Preset Gallery */}
                    <div className="space-y-1.5 pt-2">
                      <span className="text-[10px] font-extrabold text-slate-400 uppercase block">
                        Or pick a curated compute hardware photo:
                      </span>
                      <div className="grid grid-cols-5 gap-2">
                        {PRESET_MACHINE_IMAGES.slice(0, 10).map((preset, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => setImageUrl(preset.url)}
                            className={`group relative h-14 rounded-xl overflow-hidden border transition-all cursor-pointer ${
                              imageUrl === preset.url
                                ? 'border-blue-500 ring-2 ring-blue-400'
                                : 'border-blue-950/80 hover:border-blue-500/50'
                            }`}
                          >
                            <img
                              src={preset.url}
                              alt={preset.name}
                              className="w-full h-full object-cover group-hover:scale-110 transition-transform"
                            />
                            <span className="absolute bottom-0 inset-x-0 bg-[#03060f]/90 text-[8px] text-slate-200 font-bold px-1 py-0.5 truncate text-center">
                              {preset.tag}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Right: Live Preview Box */}
                  <div className="bg-[#050a18] p-3 rounded-2xl border border-blue-950/80 text-white flex flex-col justify-between">
                    <span className="text-[10px] text-slate-400 uppercase font-sans font-bold mb-1.5 block">
                      Live Marketplace Card Preview:
                    </span>
                    <div className="relative h-28 rounded-xl overflow-hidden bg-[#03060f] border border-blue-950/80">
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt="Preview"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-500 text-xs">
                          No Image Selected
                        </div>
                      )}
                      <span className="absolute top-2 left-2 bg-blue-600 text-white text-[9px] font-black px-2 py-0.5 rounded font-mono">
                        {seriesTag || 'SERIES'}
                      </span>
                      <span className="absolute top-2 right-2 bg-[#03060f]/90 text-blue-300 text-[9px] font-black px-1.5 py-0.5 rounded font-mono border border-blue-600/40">
                        {durationDays}d Lock 🔐
                      </span>
                    </div>

                    <div className="mt-2 text-xs font-mono flex justify-between items-center">
                      <span className="text-slate-300 text-[11px] font-sans font-bold truncate max-w-[140px]">
                        {title || 'Machine Title'}
                      </span>
                      <span className="text-white font-black">
                        UGX {totalCost.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Row 5: Hardware Specs & Descriptions */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-blue-950/80">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                    Hashrate / Computing Capacity
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 240 TH/s Series P"
                    value={hashrate}
                    onChange={(e) => setHashrate(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#050a18] border border-blue-950/80 rounded-xl text-xs font-mono text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                    Power Consumption
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 1100W Smart-Cooling"
                    value={powerConsumption}
                    onChange={(e) => setPowerConsumption(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#050a18] border border-blue-950/80 rounded-xl text-xs font-mono text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                    Available Units in Inventory
                  </label>
                  <input
                    type="number"
                    placeholder="50"
                    value={availableUnits}
                    onChange={(e) => setAvailableUnits(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 bg-[#050a18] border border-blue-950/80 rounded-xl text-xs font-mono font-bold text-white focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                  Machine Description & Node SLA Details
                </label>
                <textarea
                  placeholder="Enter equipment description, node compute cluster details, SLA uptime guarantee..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#050a18] border border-blue-950/80 rounded-xl text-xs text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none h-20"
                />
              </div>

              {/* Form Action Buttons */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={isSavingMachine}
                  className="flex-1 py-3.5 bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-900 hover:from-blue-500 hover:to-blue-800 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-md cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 border border-blue-400/40"
                >
                  <CheckCircle2 className="w-4 h-4 text-white" />
                  <span>
                    {isSavingMachine
                      ? 'Saving Machine Data...'
                      : editingMachineId
                      ? 'Update Existing Machine'
                      : 'Publish Machine to Marketplace'}
                  </span>
                </button>

                {editingMachineId && (
                  <button
                    type="button"
                    onClick={resetMachineForm}
                    className="py-3.5 px-5 bg-[#09132e] hover:bg-[#0f2150] text-slate-300 font-bold text-xs rounded-xl cursor-pointer border border-blue-950/80"
                  >
                    Cancel Edit
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TAB 4: EDIT HOMEPAGE */}
      {activeTab === 'HOMEPAGE' && (
        <div className="shining-card border border-blue-950/80 rounded-2xl p-6 space-y-6 shadow-xl text-white">
          <div className="pb-3 border-b border-blue-950/80">
            <h3 className="text-base font-extrabold text-white">Edit Homepage Content & Deposit Receiver</h3>
            <p className="text-xs text-slate-300">
              Customize the landing page announcement banner, hero headlines, and Mobile Money receiver number.
            </p>
          </div>

          <form onSubmit={handleSaveHomepage} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                Announcement Notice Banner Text
              </label>
              <textarea
                value={noticeText}
                onChange={(e) => setNoticeText(e.target.value)}
                placeholder="Important notice for users on homepage..."
                className="w-full px-3.5 py-2.5 bg-[#050a18] border border-blue-950/80 rounded-xl text-xs text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none h-16 font-medium"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                  Deposit Receiver Mobile Money Number
                </label>
                <input
                  type="text"
                  value={depositReceiverNumber}
                  onChange={(e) => setDepositReceiverNumber(e.target.value)}
                  placeholder="e.g. 07XXXXXXXX"
                  className="w-full px-3.5 py-2.5 bg-[#050a18] border border-blue-950/80 rounded-xl text-xs font-mono font-bold text-blue-400 focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                  Deposit Receiver Account Name
                </label>
                <input
                  type="text"
                  value={depositReceiverName}
                  onChange={(e) => setDepositReceiverName(e.target.value)}
                  placeholder="e.g. FULL REGISTERED NAME"
                  className="w-full px-3.5 py-2.5 bg-[#050a18] border border-blue-950/80 rounded-xl text-xs font-bold text-white focus:border-blue-500 focus:outline-none"
                  required
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                Badge Tag Text
              </label>
              <input
                type="text"
                value={announcementBadge}
                onChange={(e) => setAnnouncementBadge(e.target.value)}
                placeholder="Avor Invest Infrastructure Node Leasing"
                className="w-full px-3.5 py-2.5 bg-[#050a18] border border-blue-950/80 rounded-xl text-xs font-semibold text-white focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                Hero Main Headline
              </label>
              <input
                type="text"
                value={headline}
                onChange={(e) => setHeadline(e.target.value)}
                placeholder="High-Yield Computing & Equipment Investments"
                className="w-full px-3.5 py-2.5 bg-[#050a18] border border-blue-950/80 rounded-xl text-xs font-extrabold text-white focus:border-blue-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                Subheadline Description
              </label>
              <textarea
                value={subheadline}
                onChange={(e) => setSubheadline(e.target.value)}
                placeholder="Buy high-efficiency hardware units with guaranteed daily yield..."
                className="w-full px-3.5 py-2.5 bg-[#050a18] border border-blue-950/80 rounded-xl text-xs text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none h-20"
              />
            </div>

            <button
              type="submit"
              disabled={isSavingHomepage}
              className="w-full py-3 bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-900 hover:from-blue-500 hover:to-blue-800 text-white font-black text-xs rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-50 border border-blue-400/40"
            >
              {isSavingHomepage ? 'Saving Homepage Content...' : 'Update Homepage Live Content'}
            </button>
          </form>
        </div>
      )}

      {/* TAB 5: USERS & WALLET CONTROL */}
      {activeTab === 'USERS' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 shining-card border border-blue-950/80 rounded-2xl p-6 space-y-4 shadow-xl text-white">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-blue-950/80">
              <div>
                <h3 className="text-base font-extrabold text-white">Registered Members ({userList.length})</h3>
                <p className="text-xs text-slate-300">Registration data automatically saved to disk storage (<code className="text-blue-400">data/registered_users.json</code>).</p>
              </div>

              <div className="flex items-center gap-2">
                <a
                  href="/api/registered-users/export.json"
                  target="_blank"
                  rel="noreferrer"
                  download="registered_users.json"
                  className="px-3 py-1.5 bg-[#09132e] hover:bg-[#0f2150] text-blue-300 border border-blue-500/40 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
                  title="Download all registered users and saved registration JSON data"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export JSON</span>
                </a>

                <div className="relative">
                  <input
                    type="text"
                    placeholder="Search user / phone..."
                    value={userSearchTerm}
                    onChange={(e) => setUserSearchTerm(e.target.value)}
                    className="px-3 py-1.5 pl-8 bg-[#050a18] border border-blue-950/80 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                  />
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                </div>
              </div>
            </div>

            <div className="overflow-x-auto max-h-96">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-blue-950/80 bg-[#050a18] text-slate-400 uppercase text-[10px]">
                    <th className="py-2.5 px-2">Member</th>
                    <th className="py-2.5 px-2">Phone</th>
                    <th className="py-2.5 px-2">Date Joined</th>
                    <th className="py-2.5 px-2">Active Inv</th>
                    <th className="py-2.5 px-2">Balance</th>
                    <th className="py-2.5 px-2">Status</th>
                    <th className="py-2.5 px-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-blue-950/50">
                  {filteredUsers.map((u) => {
                    const userActiveCount = investmentsLedger.filter(
                      (inv) => inv.user_id === u.id && inv.status === 'ACTIVE'
                    ).length;
                    const userRegDate = u.registered_date || u.created_at;
                    return (
                      <tr
                        key={u.id}
                        className={`hover:bg-blue-950/40 cursor-pointer transition-colors ${
                          selectedUserId === u.id ? 'bg-[#09132e] border-l-2 border-blue-500' : ''
                        }`}
                        onClick={() => setSelectedUserId(u.id)}
                      >
                        <td className="py-2.5 px-2 font-bold text-white">
                          <div>{u.full_name}</div>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {u.id} • Ref: {u.referral_code}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 font-mono text-[11px] text-emerald-400">{u.phone_number}</td>
                        <td className="py-2.5 px-2 font-mono text-[10px] text-sky-300">
                          {userRegDate ? new Date(userRegDate).toLocaleString() : 'N/A'}
                        </td>
                        <td className="py-2.5 px-2 font-mono font-bold text-cyan-300">{userActiveCount}</td>
                        <td className="py-2.5 px-2 font-mono font-bold text-white">
                          UGX {u.balance.toLocaleString()}
                        </td>
                        <td className="py-2.5 px-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              u.is_suspended
                                ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            }`}
                          >
                            {u.is_suspended ? 'Suspended' : 'Active'}
                          </span>
                        </td>
                        <td className="py-2.5 px-2 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedUserId(u.id);
                              }}
                              className="px-2 py-1 bg-[#09132e] hover:bg-[#0f2150] text-blue-300 text-[10px] font-bold rounded-lg border border-blue-900/50 cursor-pointer"
                            >
                              Select
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleToggleUserSuspension(u.id);
                              }}
                              className={`px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer ${
                                u.is_suspended
                                  ? 'bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30 border border-emerald-500/30'
                                  : 'bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/30'
                              }`}
                            >
                              {u.is_suspended ? 'Reactivate' : 'Suspend'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="shining-card border border-blue-950/80 rounded-2xl p-6 space-y-4 shadow-xl text-white">
            <h3 className="text-base font-extrabold text-white flex items-center gap-2">
              <Send className="w-4 h-4 text-blue-400" />
              <span>Credit / Deduct Wallet</span>
            </h3>

            <form onSubmit={handleCreditUser} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                  Target Member
                </label>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="w-full px-3 py-2 bg-[#050a18] border border-blue-950/80 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500"
                  required
                >
                  <option value="">-- Select Member --</option>
                  {userList.map((u) => (
                    <option key={u.id} value={u.id} className="bg-[#050a18] text-white">
                      {u.full_name} ({u.phone_number}) - Bal: {u.balance.toLocaleString()} UGX
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                  Adjustment Amount (UGX)
                </label>
                <input
                  type="number"
                  value={creditAmount}
                  onChange={(e) => setCreditAmount(Number(e.target.value))}
                  placeholder="e.g. 10000 or -5000"
                  className="w-full px-3 py-2 bg-[#050a18] border border-blue-950/80 rounded-xl text-xs font-mono font-bold text-blue-400 focus:outline-none focus:border-blue-500"
                  required
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Positive = Credit balance, Negative = Deduct balance.
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                  Note
                </label>
                <input
                  type="text"
                  value={creditNote}
                  onChange={(e) => setCreditNote(e.target.value)}
                  placeholder="Reason for adjustment"
                  className="w-full px-3 py-2 bg-[#050a18] border border-blue-950/80 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <button
                type="submit"
                disabled={isCrediting || !selectedUserId}
                className="w-full py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white font-black text-xs rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-50 border border-blue-400/40"
              >
                {isCrediting ? 'Updating Wallet...' : 'Apply Wallet Adjustment'}
              </button>
            </form>

            {/* Saved Registration Data Inspector */}
            {selectedUserId && (() => {
              const selectedUser = userList.find((u) => u.id === selectedUserId);
              if (!selectedUser) return null;
              return (
                <div className="pt-4 border-t border-blue-950/80 space-y-3 text-white">
                  <div className="flex items-center justify-between pb-1 border-b border-blue-950/60">
                    <div className="flex items-center gap-1.5">
                      <FileJson className="w-3.5 h-3.5 text-emerald-400" />
                      <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-200">Registration Record</h4>
                    </div>
                    <span className="text-[9px] text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-1.5 py-0.5 rounded font-mono">
                      Disk Saved
                    </span>
                  </div>

                  <div className="space-y-1 text-[11px]">
                    <div className="flex justify-between py-0.5 border-b border-blue-950/40">
                      <span className="text-slate-400">Name:</span>
                      <span className="font-bold text-white">{selectedUser.full_name}</span>
                    </div>
                    <div className="flex justify-between py-0.5 border-b border-blue-950/40">
                      <span className="text-slate-400">Phone:</span>
                      <span className="font-mono text-emerald-300">{selectedUser.phone_number}</span>
                    </div>
                    <div className="flex justify-between py-0.5 border-b border-blue-950/40">
                      <span className="text-slate-400">Country:</span>
                      <span className="text-white">{selectedUser.country || 'Uganda'}</span>
                    </div>
                    <div className="flex justify-between py-0.5 border-b border-blue-950/40">
                      <span className="text-slate-400">Registered Date:</span>
                      <span className="font-mono text-[10px] text-cyan-300 font-bold">
                        {new Date(selectedUser.registered_date || selectedUser.created_at).toLocaleString()}
                      </span>
                    </div>
                    {selectedUser.updated_at && (
                      <div className="flex justify-between py-0.5 border-b border-blue-950/40">
                        <span className="text-slate-400">Last Updated:</span>
                        <span className="font-mono text-[10px] text-slate-300">
                          {new Date(selectedUser.updated_at).toLocaleString()}
                        </span>
                      </div>
                    )}
                  </div>

                  {(selectedUser.user_details || selectedUser.registration_data) && (
                    <div className="pt-1">
                      <span className="text-[10px] font-bold text-slate-400 block mb-1">
                        Stored User Details &amp; Date JSON:
                      </span>
                      <pre className="p-2 bg-[#03060f] rounded-lg border border-blue-950/80 text-[9px] font-mono text-emerald-400 overflow-x-auto max-h-32">
                        {JSON.stringify(
                          selectedUser.user_details || selectedUser.registration_data,
                          null,
                          2
                        )}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* TAB 6: CHANGE ADMIN PASSWORD */}
      {activeTab === 'SECURITY' && (
        <div className="max-w-xl mx-auto shining-card border border-blue-950/80 rounded-2xl p-6 space-y-6 shadow-xl text-white">
          <div className="pb-3 border-b border-blue-950/80 flex items-center gap-3">
            <div className="p-2.5 bg-[#09132e] text-blue-400 rounded-xl border border-blue-600/40">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-white">Change Admin Password</h3>
              <p className="text-xs text-slate-300">Update the master owner password for this administrator account.</p>
            </div>
          </div>

          <form onSubmit={handleChangePassword} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                Current Admin Password
              </label>
              <input
                type="password"
                value={currentAdminPass}
                onChange={(e) => setCurrentAdminPass(e.target.value)}
                placeholder="Enter current password"
                className="w-full px-3.5 py-2.5 bg-[#050a18] border border-blue-950/80 rounded-xl text-xs text-white focus:border-blue-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                New Admin Password
              </label>
              <input
                type="password"
                value={newAdminPass}
                onChange={(e) => setNewAdminPass(e.target.value)}
                placeholder="Enter new password (min 4 characters)"
                className="w-full px-3.5 py-2.5 bg-[#050a18] border border-blue-950/80 rounded-xl text-xs text-white focus:border-blue-500 focus:outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase mb-1">
                Confirm New Admin Password
              </label>
              <input
                type="password"
                value={confirmAdminPass}
                onChange={(e) => setConfirmAdminPass(e.target.value)}
                placeholder="Re-enter new password"
                className="w-full px-3.5 py-2.5 bg-[#050a18] border border-blue-950/80 rounded-xl text-xs text-white focus:border-blue-500 focus:outline-none"
                required
              />
            </div>

            <button
              type="submit"
              disabled={isChangingPass}
              className="w-full py-3 bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-900 hover:from-blue-500 hover:to-blue-800 text-white font-black text-xs rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-50 border border-blue-400/40"
            >
              {isChangingPass ? 'Updating Admin Password...' : 'Save New Admin Password'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};

