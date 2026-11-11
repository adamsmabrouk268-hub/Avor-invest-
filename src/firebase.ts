import { initializeApp } from 'firebase/app';
import { getAnalytics } from 'firebase/analytics';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import {
  initializeFirestore,
  collection,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
  getDocFromServer,
  serverTimestamp,
  doc,
  onSnapshot,
  query,
  where,
  limit,
  deleteDoc,
  updateDoc,
  setLogLevel,
} from 'firebase/firestore';
import firebaseAppletConfig from '../firebase-applet-config.json';

// Suppress noisy internal Firestore idle stream / transport warnings
setLogLevel('silent');

// Your web app's Firebase configuration (avorinvest)
const firebaseConfig = {
  apiKey: firebaseAppletConfig.apiKey || 'AIzaSyB5ahJx-FXPghLqWaQmodKTJfzkiASqYw8',
  authDomain: firebaseAppletConfig.authDomain || 'avorinvest.firebaseapp.com',
  projectId: firebaseAppletConfig.projectId || 'avorinvest',
  storageBucket: firebaseAppletConfig.storageBucket || 'avorinvest.firebasestorage.app',
  messagingSenderId: firebaseAppletConfig.messagingSenderId || '500402708773',
  appId: firebaseAppletConfig.appId || '1:500402708773:web:f901c0b8ba73fe2a19bacc',
  measurementId: firebaseAppletConfig.measurementId || 'G-X1D5N62VYB',
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const analytics =
  typeof window !== 'undefined'
    ? (() => {
        try {
          return getAnalytics(app);
        } catch {
          return null;
        }
      })()
    : null;

export const db = initializeFirestore(
  app,
  {
    experimentalAutoDetectLongPolling: true,
  },
  firebaseAppletConfig.firestoreDatabaseId
);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Validate connection to Firestore on boot
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
void testConnection();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// ============================================================================
// 1. COLLECTION: "machines"
// ============================================================================

export interface FirestoreMachineInput {
  id?: string;
  name?: string;
  title?: string;
  price?: number;
  total_cost?: number;
  daily_income?: number;
  daily_return?: number;
  daily_yield?: number;
  duration_days: number;
  total_return?: number;
  net_profit?: number;
  roi_percentage?: number;
  category?: string;
  series_tag?: string;
  hashrate_or_capacity?: string;
  power_consumption?: string;
  vip_level_required?: number;
  status?: 'AVAILABLE' | 'SOLD_OUT' | 'MAINTENANCE' | 'ACTIVE';
  image_url?: string;
  description?: string;
  specs?: string;
  location?: string;
  total_units?: number;
  available_units?: number;
  [key: string]: any;
}

export interface FirestoreMachineRecord {
  id: string;
  name: string;
  title: string;
  price: number;
  daily_income: number;
  daily_return: number;
  duration_days: number;
  total_return: number;
  net_profit: number;
  roi_percentage: number;
  category: string;
  status: 'AVAILABLE' | 'SOLD_OUT' | 'MAINTENANCE' | 'ACTIVE';
  image_url: string;
  description: string;
  specs: string;
  location: string;
  total_units: number;
  available_units: number;
  updated_at: string;
}

/**
 * Permanently saves a machine to the Firestore 'machines' collection using setDoc / addDoc.
 */
export async function saveMachineToFirestore(
  machineData: FirestoreMachineInput
): Promise<string | null> {
  const rawId = (machineData.id || `mch-${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '');
  const cleanId = rawId.slice(0, 120) || `mch-${Date.now()}`;
  const path = `machines/${cleanId}`;

  const safeName =
    (machineData.name || machineData.title || 'Avor Industrial Unit').trim().slice(0, 200) ||
    'Avor Industrial Unit';
  const safePrice = Math.max(
    0,
    Math.min(1000000000, Number(machineData.price ?? machineData.total_cost) || 0)
  );
  const safeDailyReturn = Math.max(
    0,
    Math.min(
      1000000000,
      Number(machineData.daily_return ?? machineData.daily_income ?? machineData.daily_yield) || 0
    )
  );
  const safeDuration = Math.max(1, Math.min(3650, Number(machineData.duration_days) || 45));
  const safeTotalReturn = Math.max(
    0,
    Math.min(
      1000000000,
      Number(machineData.total_return) || safeDailyReturn * safeDuration
    )
  );
  const safeNetProfit = Math.max(
    0,
    Math.min(1000000000, Number(machineData.net_profit) || Math.max(0, safeTotalReturn - safePrice))
  );
  const safeRoi = Math.max(
    0,
    Math.min(
      100000,
      Number(machineData.roi_percentage) ||
        (safePrice > 0 ? Math.round((safeNetProfit / safePrice) * 100) : 100)
    )
  );
  const rawStatus = String(machineData.status || 'AVAILABLE').toUpperCase();
  const safeStatus: 'AVAILABLE' | 'SOLD_OUT' | 'MAINTENANCE' | 'ACTIVE' = [
    'AVAILABLE',
    'SOLD_OUT',
    'MAINTENANCE',
    'ACTIVE',
  ].includes(rawStatus)
    ? (rawStatus as any)
    : 'AVAILABLE';

  const payload: Record<string, any> = {
    id: cleanId,
    name: safeName,
    title: safeName,
    price: safePrice,
    daily_income: safeDailyReturn,
    daily_return: safeDailyReturn,
    duration_days: safeDuration,
    total_return: safeTotalReturn,
    net_profit: safeNetProfit,
    roi_percentage: safeRoi,
    status: safeStatus,
    updated_at: new Date().toISOString().slice(0, 40),
    timestamp: serverTimestamp(),
  };

  if (machineData.category && machineData.category.trim().length >= 1) {
    payload.category = machineData.category.trim().slice(0, 120);
  }
  if (machineData.image_url && machineData.image_url.trim().length >= 1) {
    payload.image_url = machineData.image_url.trim().slice(0, 1000);
  }
  if (machineData.description && machineData.description.trim().length >= 1) {
    payload.description = machineData.description.trim().slice(0, 1500);
  }
  if (machineData.specs && machineData.specs.trim().length >= 1) {
    payload.specs = machineData.specs.trim().slice(0, 500);
  }
  if (machineData.location && machineData.location.trim().length >= 1) {
    payload.location = machineData.location.trim().slice(0, 200);
  }
  if (typeof machineData.total_units === 'number' && !isNaN(machineData.total_units)) {
    payload.total_units = Math.max(0, Math.min(1000000, machineData.total_units));
  }
  if (typeof machineData.available_units === 'number' && !isNaN(machineData.available_units)) {
    payload.available_units = Math.max(0, Math.min(1000000, machineData.available_units));
  }

  try {
    await setDoc(doc(db, 'machines', cleanId), payload);
    return cleanId;
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.WRITE, path);
    } catch {
      return cleanId;
    }
  }
}

export async function deleteMachineFromFirestore(machineId: string): Promise<void> {
  const cleanId = machineId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120);
  if (!cleanId) return;
  const path = `machines/${cleanId}`;
  try {
    await deleteDoc(doc(db, 'machines', cleanId));
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.DELETE, path);
    } catch {}
  }
}

function normalizeFirestoreMachineDoc(id: string, data: Record<string, any>): FirestoreMachineRecord {
  const price = Number(data.price || 0);
  const dailyReturn = Number(data.daily_return ?? data.daily_income ?? 0);
  const durationDays = Number(data.duration_days || 45);
  const totalReturn = Number(data.total_return || dailyReturn * durationDays);
  const netProfit = Number(data.net_profit ?? Math.max(0, totalReturn - price));
  const roiPercentage = Number(
    data.roi_percentage ?? (price > 0 ? Math.round((netProfit / price) * 100) : 100)
  );
  return {
    id: String(data.id || id),
    name: String(data.name || data.title || 'Avor Industrial Unit'),
    title: String(data.title || data.name || 'Avor Industrial Unit'),
    price,
    daily_income: dailyReturn,
    daily_return: dailyReturn,
    duration_days: durationDays,
    total_return: totalReturn,
    net_profit: netProfit,
    roi_percentage: roiPercentage,
    category: String(data.category || 'Industrial Processing'),
    status: (['AVAILABLE', 'SOLD_OUT', 'MAINTENANCE', 'ACTIVE'].includes(String(data.status))
      ? data.status
      : 'AVAILABLE') as any,
    image_url: String(data.image_url || '/assets/machines/coffee-huller.jpg'),
    description: String(data.description || 'Industrial-grade agricultural processing unit.'),
    specs: String(data.specs || 'High-efficiency automated processing system'),
    location: String(data.location || 'Kampala Industrial Agro-Park'),
    total_units: Number(data.total_units ?? 50),
    available_units: Number(data.available_units ?? 25),
    updated_at: String(data.updated_at || new Date().toISOString()),
  };
}

/**
 * Loads all machines from the Firestore 'machines' collection on startup using getDocs.
 */
export async function loadMachinesFromFirestore(): Promise<FirestoreMachineRecord[]> {
  const path = 'machines';
  const q = query(
    collection(db, path),
    where('status', 'in', ['AVAILABLE', 'SOLD_OUT', 'MAINTENANCE', 'ACTIVE']),
    limit(100)
  );
  try {
    const snap = await getDocs(q);
    return snap.docs.map((d) => normalizeFirestoreMachineDoc(d.id, d.data()));
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.LIST, path);
    } catch {
      return [];
    }
  }
}

/**
 * Subscribes in real-time to all machines in the Firestore 'machines' collection using onSnapshot.
 */
export function subscribeToFirestoreMachines(
  onUpdate: (machines: FirestoreMachineRecord[]) => void
): () => void {
  const path = 'machines';
  const q = query(
    collection(db, path),
    where('status', 'in', ['AVAILABLE', 'SOLD_OUT', 'MAINTENANCE', 'ACTIVE']),
    limit(100)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => normalizeFirestoreMachineDoc(d.id, d.data()));
      onUpdate(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch {}
    }
  );
}

// ============================================================================
// 2. COLLECTION: "users"
// ============================================================================

export interface FirestoreUserInput {
  id?: string;
  name?: string;
  full_name?: string;
  phone?: string;
  phone_number?: string;
  email?: string;
  password?: string;
  balance?: number;
  wallet_balance?: number;
  available_wallet?: number;
  registration_bonus?: number;
  has_bought_machine?: boolean;
  role?: 'INVESTOR' | 'ADMIN';
  referral_code?: string;
  registered_date?: string;
  date?: string;
  created_at?: string;
  updated_at?: string;
  status?: 'ACTIVE' | 'VERIFIED';
  [key: string]: any;
}

export interface FirestoreUserRecord {
  id: string;
  name: string;
  phone: string;
  email: string;
  password?: string;
  balance: number;
  wallet_balance: number;
  available_wallet: number;
  registration_bonus: number;
  has_bought_machine: boolean;
  role: 'INVESTOR' | 'ADMIN';
  referral_code: string;
  registered_date: string;
  date: string;
  created_at: string;
  updated_at: string;
  status: 'ACTIVE' | 'VERIFIED';
}

function getCleanUserId(userIdOrPhone: string): string {
  const digits = String(userIdOrPhone || '').replace(/\D/g, '');
  if (digits.length >= 7) {
    return `usr-${digits.slice(-9)}`;
  }
  const clean = String(userIdOrPhone || '')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 120);
  return clean || `usr-${Date.now()}`;
}

/**
 * Permanently saves a user account to the Firestore 'users' collection using setDoc.
 */
export async function saveUserToFirestore(
  userData: FirestoreUserInput
): Promise<string | null> {
  const resolvedPhone = userData.phone || userData.phone_number || '';
  const cleanId = getCleanUserId(resolvedPhone || userData.id || '');
  const path = `users/${cleanId}`;
  const nowIso = new Date().toISOString().slice(0, 40);
  const todayStr = nowIso.split('T')[0];

  const safePhone = (resolvedPhone || '+256700000000').trim().slice(0, 40) || '+256700000000';
  const safeName =
    (userData.name || userData.full_name || `Investor ${safePhone.slice(-4)}`).trim().slice(0, 160) ||
    'Avor Investor';
  const safeBalance = Math.max(
    0,
    Math.min(1000000000, typeof userData.balance === 'number' ? userData.balance : 3000)
  );
  const safeWallet = Math.max(
    0,
    Math.min(
      1000000000,
      typeof userData.wallet_balance === 'number'
        ? userData.wallet_balance
        : typeof userData.available_wallet === 'number'
          ? userData.available_wallet
          : 0
    )
  );

  const payload: Record<string, any> = {
    id: cleanId,
    name: safeName,
    phone: safePhone,
    balance: safeBalance,
    wallet_balance: safeWallet,
    available_wallet: safeWallet,
    registration_bonus:
      typeof userData.registration_bonus === 'number' ? userData.registration_bonus : 3000,
    has_bought_machine: Boolean(userData.has_bought_machine),
    role: userData.role === 'ADMIN' ? 'ADMIN' : 'INVESTOR',
    registered_date: (userData.registered_date || userData.date || todayStr).slice(0, 60),
    date: (userData.date || userData.registered_date || todayStr).slice(0, 60),
    created_at: (userData.created_at || nowIso).slice(0, 60),
    updated_at: nowIso,
    status: userData.status === 'VERIFIED' ? 'VERIFIED' : 'ACTIVE',
    timestamp: serverTimestamp(),
  };

  if (userData.email && userData.email.trim().length >= 3) {
    payload.email = userData.email.trim().slice(0, 160);
  } else {
    payload.email = safePhone;
  }
  if (userData.password && userData.password.trim().length >= 1) {
    payload.password = userData.password.trim().slice(0, 160);
  }
  if (userData.referral_code && userData.referral_code.trim().length >= 1) {
    payload.referral_code = userData.referral_code.trim().slice(0, 60);
  }

  try {
    await setDoc(doc(db, 'users', cleanId), payload);
    return cleanId;
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.WRITE, path);
    } catch {
      return cleanId;
    }
  }
}

function normalizeFirestoreUserDoc(id: string, data: Record<string, any>): FirestoreUserRecord {
  const nowIso = new Date().toISOString();
  const todayStr = nowIso.split('T')[0];
  const balance = typeof data.balance === 'number' ? data.balance : 3000;
  const walletBalance =
    typeof data.wallet_balance === 'number'
      ? data.wallet_balance
      : typeof data.available_wallet === 'number'
        ? data.available_wallet
        : 0;
  return {
    id: String(data.id || id),
    name: String(data.name || 'Avor Investor'),
    phone: String(data.phone || ''),
    email: String(data.email || data.phone || ''),
    password: data.password ? String(data.password) : undefined,
    balance,
    wallet_balance: walletBalance,
    available_wallet: walletBalance,
    registration_bonus: typeof data.registration_bonus === 'number' ? data.registration_bonus : 3000,
    has_bought_machine: Boolean(data.has_bought_machine),
    role: data.role === 'ADMIN' ? 'ADMIN' : 'INVESTOR',
    referral_code: String(data.referral_code || `AVOR-${String(id).slice(-4).toUpperCase()}`),
    registered_date: String(data.registered_date || data.date || todayStr),
    date: String(data.date || data.registered_date || todayStr),
    created_at: String(data.created_at || nowIso),
    updated_at: String(data.updated_at || nowIso),
    status: data.status === 'VERIFIED' ? 'VERIFIED' : 'ACTIVE',
  };
}

/**
 * Loads a single user from Firestore 'users' collection on startup by phone or userId.
 */
export async function loadUserFromFirestore(
  userIdOrPhone: string,
  secondPhone?: string
): Promise<FirestoreUserRecord | null> {
  const primary = secondPhone || userIdOrPhone;
  const cleanId = getCleanUserId(primary);
  const path = `users/${cleanId}`;
  try {
    const snap = await getDoc(doc(db, 'users', cleanId));
    if (snap.exists()) {
      return normalizeFirestoreUserDoc(snap.id, snap.data());
    }
  } catch {}

  try {
    const allUsers = await loadAllUsersFromFirestore();
    const digits = String(primary || userIdOrPhone || '').replace(/\D/g, '').slice(-9);
    const matched = allUsers.find((u) => {
      const uDigits = String(u.phone || '').replace(/\D/g, '').slice(-9);
      return (
        u.id === userIdOrPhone ||
        u.id === cleanId ||
        (digits.length >= 7 && uDigits === digits)
      );
    });
    return matched || null;
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.GET, path);
    } catch {
      return null;
    }
  }
}

/**
 * Loads all registered users from the Firestore 'users' collection on startup using getDocs.
 */
export async function loadAllUsersFromFirestore(): Promise<FirestoreUserRecord[]> {
  const path = 'users';
  const q = query(
    collection(db, path),
    where('status', 'in', ['ACTIVE', 'VERIFIED']),
    limit(200)
  );
  try {
    const snap = await getDocs(q);
    return snap.docs.map((d) => normalizeFirestoreUserDoc(d.id, d.data()));
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.LIST, path);
    } catch {
      return [];
    }
  }
}

/**
 * Subscribes in real-time to all users in the Firestore 'users' collection using onSnapshot.
 */
export function subscribeToFirestoreUsers(
  onUpdate: (users: FirestoreUserRecord[]) => void
): () => void {
  const path = 'users';
  const q = query(
    collection(db, path),
    where('status', 'in', ['ACTIVE', 'VERIFIED']),
    limit(200)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs.map((d) => normalizeFirestoreUserDoc(d.id, d.data()));
      onUpdate(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch {}
    }
  );
}

// ============================================================================
// 3. COLLECTION: "deposits"
// ============================================================================

export interface FirestoreDepositInput {
  id?: string;
  user_id: string;
  name?: string;
  phone?: string;
  customer_name?: string;
  customer_phone?: string;
  receiver_phone?: string;
  receiver_name?: string;
  amount: number;
  status?:
    | 'pending'
    | 'approved'
    | 'confirmed'
    | 'rejected'
    | 'PENDING'
    | 'SUCCESS'
    | 'CONFIRMED'
    | 'FAILED'
    | 'DENIED';
  payment_method?: string;
  payment_reference?: string;
  machine_id?: string;
  machine_title?: string;
}

export interface FirestoreDepositRecord {
  id: string;
  user_id: string;
  name: string;
  phone: string;
  customer_name?: string;
  customer_phone?: string;
  amount: number;
  type: 'DEPOSIT';
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  firestore_status: string;
  payment_method: string;
  payment_reference: string;
  machine_id?: string;
  machine_title?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Permanently saves a customer deposit to the Firestore 'deposits' collection using setDoc.
 */
export async function createDepositInFirestore(
  depositData: FirestoreDepositInput
): Promise<string | null> {
  const rawId = (
    depositData.id ||
    depositData.payment_reference ||
    `dep-${Date.now()}`
  ).replace(/[^a-zA-Z0-9_-]/g, '');
  const cleanId = rawId.slice(0, 120) || `dep-${Date.now()}`;
  const path = `deposits/${cleanId}`;
  const nowIso = new Date().toISOString().slice(0, 40);

  const resolvedPhone = depositData.phone || depositData.customer_phone || '';
  const resolvedName = depositData.name || depositData.customer_name || '';
  const safeUserId =
    (depositData.user_id || resolvedPhone || 'usr-investor').trim().slice(0, 128) ||
    'usr-investor';
  const safeName = (resolvedName || 'Avor Investor').trim().slice(0, 160) || 'Avor Investor';
  const safePhone = (resolvedPhone || '+256700000000').trim().slice(0, 40) || '+256700000000';
  const safeAmount = Math.max(0, Math.min(1000000000, Number(depositData.amount) || 0));
  const safeStatus = depositData.status || 'pending';

  const payload: Record<string, any> = {
    id: cleanId,
    user_id: safeUserId,
    name: safeName,
    phone: safePhone,
    amount: safeAmount,
    status: safeStatus,
    created_at: nowIso,
    updated_at: nowIso,
    timestamp: serverTimestamp(),
  };

  if (depositData.payment_method && depositData.payment_method.trim().length >= 1) {
    payload.payment_method = depositData.payment_method.trim().slice(0, 160);
  }
  if (depositData.payment_reference && depositData.payment_reference.trim().length >= 1) {
    payload.payment_reference = depositData.payment_reference.trim().slice(0, 120);
  }
  if (depositData.machine_id && depositData.machine_id.trim().length >= 1) {
    payload.machine_id = depositData.machine_id.trim().slice(0, 128);
  }
  if (depositData.machine_title && depositData.machine_title.trim().length >= 1) {
    payload.machine_title = depositData.machine_title.trim().slice(0, 200);
  }

  try {
    await setDoc(doc(db, 'deposits', cleanId), payload);
    return cleanId;
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.WRITE, path);
    } catch {
      return cleanId;
    }
  }
}

export async function approveDepositInFirestore(depositId: string): Promise<void> {
  const cleanId = depositId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120);
  if (!cleanId) return;
  const path = `deposits/${cleanId}`;
  try {
    await updateDoc(doc(db, 'deposits', cleanId), {
      status: 'approved',
      updated_at: new Date().toISOString().slice(0, 40),
    });
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.UPDATE, path);
    } catch {}
  }
}

export async function denyDepositInFirestore(depositId: string): Promise<void> {
  const cleanId = depositId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120);
  if (!cleanId) return;
  const path = `deposits/${cleanId}`;
  try {
    await updateDoc(doc(db, 'deposits', cleanId), {
      status: 'rejected',
      updated_at: new Date().toISOString().slice(0, 40),
    });
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.UPDATE, path);
    } catch {}
  }
}

function normalizeFirestoreDepositDoc(id: string, data: Record<string, any>): FirestoreDepositRecord {
  const ts = data.timestamp?.toDate
    ? data.timestamp.toDate().toISOString()
    : typeof data.created_at === 'string'
      ? data.created_at
      : new Date().toISOString();
  const rawStatus = String(data.status || 'pending');
  const upper = rawStatus.toUpperCase();
  let normalizedStatus: 'PENDING' | 'SUCCESS' | 'FAILED' = 'PENDING';
  if (
    rawStatus === 'approved' ||
    rawStatus === 'confirmed' ||
    upper === 'APPROVED' ||
    upper === 'CONFIRMED' ||
    upper === 'SUCCESS'
  ) {
    normalizedStatus = 'SUCCESS';
  } else if (
    rawStatus === 'rejected' ||
    upper === 'REJECTED' ||
    upper === 'FAILED' ||
    upper === 'DENIED'
  ) {
    normalizedStatus = 'FAILED';
  }
  return {
    id: String(data.id || id),
    user_id: String(data.user_id || data.phone || id),
    name: String(data.name || 'Avor Investor'),
    phone: String(data.phone || ''),
    customer_name: String(data.name || data.customer_name || 'Avor Investor'),
    customer_phone: String(data.phone || data.customer_phone || ''),
    amount: Number(data.amount || 0),
    type: 'DEPOSIT',
    status: normalizedStatus,
    firestore_status: rawStatus,
    payment_method: String(data.payment_method || 'MTN Mobile Money'),
    payment_reference: String(data.payment_reference || id),
    machine_id: data.machine_id ? String(data.machine_id) : undefined,
    machine_title: data.machine_title ? String(data.machine_title) : undefined,
    created_at: ts,
    updated_at: String(data.updated_at || ts),
  };
}

/**
 * Loads all deposits from the Firestore 'deposits' collection on startup using getDocs.
 */
export async function loadDepositsFromFirestore(): Promise<FirestoreDepositRecord[]> {
  const path = 'deposits';
  const q = query(
    collection(db, path),
    where('status', 'in', [
      'pending',
      'approved',
      'confirmed',
      'rejected',
      'PENDING',
      'SUCCESS',
      'CONFIRMED',
      'FAILED',
      'DENIED',
    ]),
    limit(200)
  );
  try {
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => normalizeFirestoreDepositDoc(d.id, d.data()))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.LIST, path);
    } catch {
      return [];
    }
  }
}

/**
 * Subscribes in real-time to all deposits in the Firestore 'deposits' collection using onSnapshot.
 */
export function subscribeToFirestoreDeposits(
  onUpdate: (deposits: FirestoreDepositRecord[]) => void
): () => void {
  const path = 'deposits';
  const q = query(
    collection(db, path),
    where('status', 'in', [
      'pending',
      'approved',
      'confirmed',
      'rejected',
      'PENDING',
      'SUCCESS',
      'CONFIRMED',
      'FAILED',
      'DENIED',
    ]),
    limit(200)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs
        .map((d) => normalizeFirestoreDepositDoc(d.id, d.data()))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      onUpdate(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch {}
    }
  );
}

// ============================================================================
// 4. COLLECTION: "orders"
// ============================================================================

export interface FirestoreOrderInput {
  id?: string;
  customername: string;
  name: string;
  status?:
    | 'pending'
    | 'confirmed'
    | 'ACTIVE & DELIVERED'
    | 'denied'
    | 'PENDING'
    | 'ACTIVE'
    | 'COMPLETED'
    | 'PAYOUT_COMPLETE';
  user_id?: string;
  customer_name?: string;
  customer_phone?: string;
  machine_id?: string;
  machine_title?: string;
  amount_invested?: number;
  amount?: number;
  daily_return?: number;
  duration_days?: number;
  total_return?: number;
  days_elapsed?: number;
  days_left?: number;
  units?: number;
  start_date?: string;
  end_date?: string;
  purchase_date?: string;
  ending_date?: string;
  payment_method?: string;
  payment_reference?: string;
}

/**
 * Permanently saves a customer order / investment to the Firestore 'orders' collection using setDoc.
 */
export async function createOrderInFirestore(
  orderData: FirestoreOrderInput
): Promise<string | null> {
  const rawOrderId = (orderData.id || orderData.payment_reference || `inv-${Date.now()}`).replace(
    /[^a-zA-Z0-9_-]/g,
    ''
  );
  const cleanOrderId = rawOrderId.slice(0, 120) || `inv-${Date.now()}`;
  const path = `orders/${cleanOrderId}`;

  const safeCustomerName =
    (orderData.customername || orderData.customer_name || 'Avor Investor').trim().slice(0, 160) ||
    'Avor Investor';
  const safeName =
    (orderData.name || orderData.machine_title || 'Machine Order').trim().slice(0, 200) ||
    'Machine Order';
  const safeStatus = orderData.status || 'pending';

  const payload: Record<string, any> = {
    id: cleanOrderId,
    customername: safeCustomerName,
    name: safeName,
    status: safeStatus,
    customer_name: safeCustomerName,
    machine_title: safeName,
    timestamp: serverTimestamp(),
  };

  if (orderData.user_id && orderData.user_id.trim().length >= 1) {
    payload.user_id = orderData.user_id.trim().slice(0, 128);
  }
  if (orderData.customer_phone && orderData.customer_phone.trim().length >= 3) {
    payload.customer_phone = orderData.customer_phone.trim().slice(0, 40);
  }
  if (orderData.machine_id && orderData.machine_id.trim().length >= 1) {
    payload.machine_id = orderData.machine_id.trim().slice(0, 128);
  }
  if (
    typeof orderData.amount_invested === 'number' &&
    !isNaN(orderData.amount_invested) &&
    orderData.amount_invested >= 0 &&
    orderData.amount_invested <= 1000000000
  ) {
    payload.amount_invested = orderData.amount_invested;
    payload.amount = orderData.amount_invested;
  } else if (
    typeof orderData.amount === 'number' &&
    !isNaN(orderData.amount) &&
    orderData.amount >= 0 &&
    orderData.amount <= 1000000000
  ) {
    payload.amount = orderData.amount;
    payload.amount_invested = orderData.amount;
  }
  if (
    typeof orderData.daily_return === 'number' &&
    !isNaN(orderData.daily_return) &&
    orderData.daily_return >= 0 &&
    orderData.daily_return <= 1000000000
  ) {
    payload.daily_return = orderData.daily_return;
  }
  if (
    typeof orderData.duration_days === 'number' &&
    !isNaN(orderData.duration_days) &&
    orderData.duration_days >= 1 &&
    orderData.duration_days <= 3650
  ) {
    payload.duration_days = orderData.duration_days;
  }
  if (
    typeof orderData.total_return === 'number' &&
    !isNaN(orderData.total_return) &&
    orderData.total_return >= 0 &&
    orderData.total_return <= 1000000000
  ) {
    payload.total_return = orderData.total_return;
  }
  if (
    typeof orderData.days_elapsed === 'number' &&
    !isNaN(orderData.days_elapsed) &&
    orderData.days_elapsed >= 0 &&
    orderData.days_elapsed <= 3650
  ) {
    payload.days_elapsed = orderData.days_elapsed;
  }
  if (
    typeof orderData.days_left === 'number' &&
    !isNaN(orderData.days_left) &&
    orderData.days_left >= 0 &&
    orderData.days_left <= 3650
  ) {
    payload.days_left = orderData.days_left;
  }
  if (
    typeof orderData.units === 'number' &&
    !isNaN(orderData.units) &&
    orderData.units >= 1 &&
    orderData.units <= 100
  ) {
    payload.units = orderData.units;
  }
  if (orderData.start_date && orderData.start_date.trim().length >= 1) {
    payload.start_date = orderData.start_date.trim().slice(0, 60);
  }
  if (orderData.end_date && orderData.end_date.trim().length >= 1) {
    payload.end_date = orderData.end_date.trim().slice(0, 60);
  }
  if (orderData.purchase_date && orderData.purchase_date.trim().length >= 1) {
    payload.purchase_date = orderData.purchase_date.trim().slice(0, 60);
  }
  if (orderData.ending_date && orderData.ending_date.trim().length >= 1) {
    payload.ending_date = orderData.ending_date.trim().slice(0, 60);
  }
  if (orderData.payment_method && orderData.payment_method.trim().length >= 1) {
    payload.payment_method = orderData.payment_method.trim().slice(0, 100);
  }
  if (orderData.payment_reference && orderData.payment_reference.trim().length >= 1) {
    payload.payment_reference = orderData.payment_reference.trim().slice(0, 120);
  }
  if (auth.currentUser?.uid) {
    payload.authorUid = auth.currentUser.uid.slice(0, 128);
  }

  try {
    await setDoc(doc(db, 'orders', cleanOrderId), payload);
    return cleanOrderId;
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.WRITE, path);
    } catch {
      return cleanOrderId;
    }
  }
}

export interface FirestoreOrderRecord {
  id: string;
  user_id: string;
  customername: string;
  customer_name: string;
  customer_phone: string;
  name: string;
  machine_id: string;
  machine_title: string;
  amount_invested: number;
  amount: number;
  daily_return: number;
  daily_yield: number;
  duration_days: number;
  total_return: number;
  days_elapsed: number;
  days_left: number;
  units: number;
  start_date: string;
  end_date: string;
  purchase_date: string;
  ending_date: string;
  status: 'PENDING' | 'ACTIVE' | 'PAYOUT_COMPLETE' | 'DENIED';
  firestore_status: string;
  raw_firestore_status: string;
  payment_method: string;
  payment_reference: string;
  created_at: string;
  updated_at: string;
}

/**
 * When Admin clicks Confirm Order / Approve / Deliver:
 * Updates that same Firestore document in 'orders' first to status = "confirmed"
 * and then to status = "ACTIVE & DELIVERED".
 */
export async function confirmOrderInFirestore(
  orderId: string,
  extraUpdates?: {
    days_elapsed?: number;
    days_left?: number;
    start_date?: string;
    end_date?: string;
    purchase_date?: string;
    ending_date?: string;
    [key: string]: any;
  }
): Promise<void> {
  const cleanOrderId = orderId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120);
  if (!cleanOrderId) return;
  const path = `orders/${cleanOrderId}`;
  const orderRef = doc(db, 'orders', cleanOrderId);
  const nowIso = new Date().toISOString().slice(0, 40);

  try {
    await updateDoc(orderRef, {
      status: 'confirmed',
      updated_at: nowIso,
    });

    const secondPayload: Record<string, any> = {
      status: 'ACTIVE & DELIVERED',
      days_elapsed: Math.max(1, Number(extraUpdates?.days_elapsed || 1)),
      updated_at: new Date().toISOString().slice(0, 40),
    };
    if (typeof extraUpdates?.days_left === 'number') {
      secondPayload.days_left = extraUpdates.days_left;
    }
    if (extraUpdates?.start_date) {
      secondPayload.start_date = String(extraUpdates.start_date).slice(0, 60);
    }
    if (extraUpdates?.end_date) {
      secondPayload.end_date = String(extraUpdates.end_date).slice(0, 60);
    }
    if (extraUpdates?.purchase_date) {
      secondPayload.purchase_date = String(extraUpdates.purchase_date).slice(0, 60);
    }
    if (extraUpdates?.ending_date) {
      secondPayload.ending_date = String(extraUpdates.ending_date).slice(0, 60);
    }
    await updateDoc(orderRef, secondPayload);
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.UPDATE, path);
    } catch {}
  }
}

export async function denyOrderInFirestore(orderId: string, _extraMeta?: any): Promise<void> {
  const cleanOrderId = orderId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120);
  if (!cleanOrderId) return;
  const path = `orders/${cleanOrderId}`;
  const orderRef = doc(db, 'orders', cleanOrderId);

  try {
    await updateDoc(orderRef, {
      status: 'denied',
      updated_at: new Date().toISOString().slice(0, 40),
    });
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.UPDATE, path);
    } catch {}
  }
}

function normalizeFirestoreOrderDoc(id: string, data: Record<string, any>): FirestoreOrderRecord {
  const ts = data.timestamp?.toDate
    ? data.timestamp.toDate().toISOString()
    : typeof data.timestamp === 'string'
      ? data.timestamp
      : data.start_date || new Date().toISOString();

  const rawStatus = String(data.status || 'pending');
  const upperStatus = rawStatus.toUpperCase();
  let normalizedStatus: 'PENDING' | 'ACTIVE' | 'PAYOUT_COMPLETE' | 'DENIED' = 'PENDING';
  if (rawStatus === 'denied' || upperStatus === 'DENIED') {
    normalizedStatus = 'DENIED';
  } else if (
    rawStatus === 'confirmed' ||
    rawStatus === 'ACTIVE & DELIVERED' ||
    upperStatus === 'CONFIRMED' ||
    upperStatus === 'ACTIVE & DELIVERED' ||
    upperStatus === 'ACTIVE'
  ) {
    normalizedStatus = 'ACTIVE';
  } else if (upperStatus === 'COMPLETED' || upperStatus === 'PAYOUT_COMPLETE') {
    normalizedStatus = 'PAYOUT_COMPLETE';
  } else {
    normalizedStatus = 'PENDING';
  }

  const durationDays = Number(data.duration_days || 45);
  const daysElapsed =
    normalizedStatus === 'PENDING' ? 0 : Math.max(1, Number(data.days_elapsed ?? 1));
  const daysLeft =
    typeof data.days_left === 'number'
      ? data.days_left
      : Math.max(0, durationDays - daysElapsed);
  const amountInvested = Number(data.amount_invested ?? data.amount ?? 0);
  const dailyReturn = Number(data.daily_return || 0);
  const unitsCount = Math.max(1, Number(data.units || 1));
  const rawTotalReturn = Number(data.total_return || dailyReturn * durationDays);
  const totalReturn =
    rawTotalReturn === 50004 ||
    rawTotalReturn === 50004 * unitsCount ||
    (dailyReturn === 2778 && durationDays === 18)
      ? 50000 * unitsCount
      : rawTotalReturn;

  return {
    id: String(data.id || id),
    user_id: data.user_id || data.customer_phone || data.customername || id,
    customername: data.customername || data.customer_name || 'Avor Investor',
    customer_name: data.customername || data.customer_name || 'Avor Investor',
    customer_phone: data.customer_phone || '',
    name: data.name || data.machine_title || 'Machine Order',
    machine_id: String(data.machine_id || 'av1-m1'),
    machine_title: data.machine_title || data.name || 'Machine Order',
    amount_invested: amountInvested,
    amount: amountInvested,
    daily_return: dailyReturn,
    daily_yield: dailyReturn,
    duration_days: durationDays,
    total_return: totalReturn,
    days_elapsed: daysElapsed,
    days_left: daysLeft,
    units: Number(data.units || 1),
    start_date: data.start_date || ts,
    end_date:
      data.end_date ||
      new Date(new Date(ts).getTime() + durationDays * 24 * 60 * 60 * 1000).toISOString(),
    purchase_date: data.purchase_date || ts.split('T')[0],
    ending_date:
      data.ending_date ||
      new Date(new Date(ts).getTime() + durationDays * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0],
    status: normalizedStatus,
    firestore_status: rawStatus,
    raw_firestore_status: rawStatus,
    payment_method: data.payment_method || 'Wallet Balance',
    payment_reference: data.payment_reference || id,
    created_at: ts,
    updated_at: data.updated_at || ts,
  };
}

/**
 * Loads all orders from the Firestore 'orders' collection on startup using getDocs.
 */
export async function loadOrdersFromFirestore(): Promise<FirestoreOrderRecord[]> {
  const path = 'orders';
  const q = query(
    collection(db, path),
    where('status', 'in', [
      'pending',
      'confirmed',
      'ACTIVE & DELIVERED',
      'denied',
      'PENDING',
      'ACTIVE',
      'COMPLETED',
      'PAYOUT_COMPLETE',
    ]),
    limit(200)
  );
  try {
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => normalizeFirestoreOrderDoc(d.id, d.data()))
      .filter((o) => o.status !== 'DENIED')
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.LIST, path);
    } catch {
      return [];
    }
  }
}

/**
 * Subscribes in real-time to all orders in the Firestore 'orders' collection using onSnapshot.
 */
export function subscribeToFirestoreOrders(
  onUpdate: (orders: FirestoreOrderRecord[]) => void
): () => void {
  const path = 'orders';
  const q = query(
    collection(db, path),
    where('status', 'in', [
      'pending',
      'confirmed',
      'ACTIVE & DELIVERED',
      'denied',
      'PENDING',
      'ACTIVE',
      'COMPLETED',
      'PAYOUT_COMPLETE',
    ]),
    limit(200)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const items: FirestoreOrderRecord[] = snapshot.docs
        .map((d) => normalizeFirestoreOrderDoc(d.id, d.data()))
        .filter((o) => o.status !== 'DENIED')
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      onUpdate(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch {}
    }
  );
}

// ============================================================================
// 5. COLLECTION: "withdrawals"
// ============================================================================

export interface FirestoreWithdrawalInput {
  id?: string;
  userId: string;
  name: string;
  phone: string;
  amount: number;
  status?: 'pending' | 'approved' | 'rejected';
  fee_amount?: number;
  net_amount?: number;
  payment_method?: string;
  payment_reference?: string;
  account_name?: string;
}

export interface FirestoreWithdrawalRecord {
  id: string;
  user_id: string;
  userId: string;
  name: string;
  phone: string;
  amount: number;
  type: 'WITHDRAWAL';
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  firestore_status: string;
  fee_amount: number;
  net_amount: number;
  payment_method: string;
  payment_reference: string;
  account_name: string;
  created_at: string;
  updated_at: string;
}

/**
 * Permanently saves a customer withdrawal request to the Firestore 'withdrawals' collection using setDoc.
 */
export async function createWithdrawalInFirestore(
  withdrawalData: FirestoreWithdrawalInput
): Promise<string | null> {
  const rawId = (
    withdrawalData.id ||
    withdrawalData.payment_reference ||
    `wdr-${Date.now()}`
  ).replace(/[^a-zA-Z0-9_-]/g, '');
  const cleanId = rawId.slice(0, 120) || `wdr-${Date.now()}`;
  const path = `withdrawals/${cleanId}`;

  const safeUserId =
    (withdrawalData.userId || withdrawalData.phone || 'usr-investor').trim().slice(0, 128) ||
    'usr-investor';
  const safeName =
    (withdrawalData.name || withdrawalData.account_name || 'Avor Investor').trim().slice(0, 160) ||
    'Avor Investor';
  const safePhone =
    (withdrawalData.phone || '+256700000000').trim().slice(0, 40) || '+256700000000';
  const safeAmount = Math.max(0, Math.min(1000000000, Number(withdrawalData.amount) || 0));
  const safeStatus = withdrawalData.status || 'pending';

  const payload: Record<string, any> = {
    id: cleanId,
    userId: safeUserId,
    name: safeName,
    phone: safePhone,
    amount: safeAmount,
    status: safeStatus,
    createdAt: serverTimestamp(),
  };

  if (
    typeof withdrawalData.fee_amount === 'number' &&
    !isNaN(withdrawalData.fee_amount) &&
    withdrawalData.fee_amount >= 0 &&
    withdrawalData.fee_amount <= 1000000000
  ) {
    payload.fee_amount = Math.round(withdrawalData.fee_amount);
  }
  if (
    typeof withdrawalData.net_amount === 'number' &&
    !isNaN(withdrawalData.net_amount) &&
    withdrawalData.net_amount >= 0 &&
    withdrawalData.net_amount <= 1000000000
  ) {
    payload.net_amount = Math.round(withdrawalData.net_amount);
  }
  if (withdrawalData.payment_method && withdrawalData.payment_method.trim().length >= 1) {
    payload.payment_method = withdrawalData.payment_method.trim().slice(0, 160);
  }
  if (withdrawalData.payment_reference && withdrawalData.payment_reference.trim().length >= 1) {
    payload.payment_reference = withdrawalData.payment_reference.trim().slice(0, 120);
  }
  if (withdrawalData.account_name && withdrawalData.account_name.trim().length >= 1) {
    payload.account_name = withdrawalData.account_name.trim().slice(0, 160);
  }
  if (auth.currentUser?.uid) {
    payload.authorUid = auth.currentUser.uid.slice(0, 128);
  }

  try {
    await setDoc(doc(db, 'withdrawals', cleanId), payload);
    return cleanId;
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.WRITE, path);
    } catch {
      return cleanId;
    }
  }
}

export async function approveWithdrawalInFirestore(withdrawalId: string): Promise<void> {
  const cleanId = withdrawalId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120);
  if (!cleanId) return;
  const path = `withdrawals/${cleanId}`;
  try {
    await updateDoc(doc(db, 'withdrawals', cleanId), {
      status: 'approved',
      updated_at: new Date().toISOString().slice(0, 40),
    });
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.UPDATE, path);
    } catch {}
  }
}

export async function rejectWithdrawalInFirestore(withdrawalId: string): Promise<void> {
  const cleanId = withdrawalId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120);
  if (!cleanId) return;
  const path = `withdrawals/${cleanId}`;
  try {
    await updateDoc(doc(db, 'withdrawals', cleanId), {
      status: 'rejected',
      updated_at: new Date().toISOString().slice(0, 40),
    });
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.UPDATE, path);
    } catch {}
  }
}

function normalizeFirestoreWithdrawalDoc(
  id: string,
  data: Record<string, any>
): FirestoreWithdrawalRecord {
  const ts = data.createdAt?.toDate
    ? data.createdAt.toDate().toISOString()
    : typeof data.createdAt === 'string'
      ? data.createdAt
      : data.timestamp?.toDate
        ? data.timestamp.toDate().toISOString()
        : new Date().toISOString();

  const rawStatus = String(data.status || 'pending');
  const upper = rawStatus.toUpperCase();
  let normalizedStatus: 'PENDING' | 'SUCCESS' | 'FAILED' = 'PENDING';
  if (
    rawStatus === 'approved' ||
    upper === 'APPROVED' ||
    upper === 'SUCCESS' ||
    upper === 'CONFIRMED'
  ) {
    normalizedStatus = 'SUCCESS';
  } else if (
    rawStatus === 'rejected' ||
    upper === 'REJECTED' ||
    upper === 'FAILED' ||
    upper === 'DENIED'
  ) {
    normalizedStatus = 'FAILED';
  } else {
    normalizedStatus = 'PENDING';
  }

  const amt = Number(data.amount || 0);
  const feeAmt = typeof data.fee_amount === 'number' ? data.fee_amount : Math.round(amt * 0.1);
  const netAmt = typeof data.net_amount === 'number' ? data.net_amount : Math.max(0, amt - feeAmt);
  const phoneStr = String(data.phone || '');
  const nameStr = String(data.name || data.account_name || 'Avor Investor');

  return {
    id: String(data.id || id),
    user_id: String(data.userId || phoneStr || id),
    userId: String(data.userId || phoneStr || id),
    name: nameStr,
    phone: phoneStr,
    amount: amt,
    type: 'WITHDRAWAL' as const,
    status: normalizedStatus,
    firestore_status: rawStatus,
    fee_amount: feeAmt,
    net_amount: netAmt,
    payment_method:
      data.payment_method ||
      `Mobile Money (${phoneStr || nameStr}) • Net Payout: ${netAmt.toLocaleString()} UGX (10% Fee: ${feeAmt.toLocaleString()} UGX)`,
    payment_reference: String(data.payment_reference || id),
    account_name: String(data.account_name || nameStr),
    created_at: ts,
    updated_at: String(data.updated_at || ts),
  };
}

/**
 * Loads all withdrawals from the Firestore 'withdrawals' collection on startup using getDocs.
 */
export async function loadWithdrawalsFromFirestore(): Promise<FirestoreWithdrawalRecord[]> {
  const path = 'withdrawals';
  const q = query(
    collection(db, path),
    where('status', 'in', [
      'pending',
      'approved',
      'rejected',
      'PENDING',
      'SUCCESS',
      'FAILED',
      'CONFIRMED',
      'REJECTED',
    ]),
    limit(200)
  );
  try {
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => normalizeFirestoreWithdrawalDoc(d.id, d.data()))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.LIST, path);
    } catch {
      return [];
    }
  }
}

/**
 * Subscribes in real-time to all withdrawals in the Firestore 'withdrawals' collection using onSnapshot.
 */
export function subscribeToFirestoreWithdrawals(
  onUpdate: (withdrawals: FirestoreWithdrawalRecord[]) => void
): () => void {
  const path = 'withdrawals';
  const q = query(
    collection(db, path),
    where('status', 'in', [
      'pending',
      'approved',
      'rejected',
      'PENDING',
      'SUCCESS',
      'FAILED',
      'CONFIRMED',
      'REJECTED',
    ]),
    limit(200)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const items: FirestoreWithdrawalRecord[] = snapshot.docs
        .map((d) => normalizeFirestoreWithdrawalDoc(d.id, d.data()))
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      onUpdate(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch {}
    }
  );
}

// ============================================================================
// ADMIN MESSAGES & AUTH HELPERS
// ============================================================================

export interface AdminMessageExtra {
  senderPhone?: string;
  receiverPhone?: string;
  receiverName?: string;
  amount?: number;
  machineTitle?: string;
  paymentMethod?: string;
  paymentReference?: string;
  status?: 'PENDING' | 'CONFIRMED' | 'SUCCESS';
  userId?: string;
  transactionId?: string;
}

export async function sendMessageToAdmin(
  userName: string,
  machineDetails: string,
  extra?: AdminMessageExtra
): Promise<string | null> {
  const safeName = (userName || 'Avor Investor').trim().slice(0, 120) || 'Avor Investor';
  const safeItem =
    (machineDetails || 'Machine / Deposit Order').trim().slice(0, 1000) ||
    'Machine / Deposit Order';
  const safeStatus: 'PENDING' | 'CONFIRMED' | 'SUCCESS' =
    extra?.status && ['PENDING', 'CONFIRMED', 'SUCCESS'].includes(extra.status)
      ? extra.status
      : 'CONFIRMED';

  const payload: Record<string, any> = {
    name: safeName,
    item: safeItem,
    status: safeStatus,
    timestamp: serverTimestamp(),
  };

  if (extra?.senderPhone && extra.senderPhone.trim().length >= 3) {
    payload.senderPhone = extra.senderPhone.trim().slice(0, 40);
  }
  if (extra?.receiverPhone && extra.receiverPhone.trim().length >= 3) {
    payload.receiverPhone = extra.receiverPhone.trim().slice(0, 40);
  }
  if (extra?.receiverName && extra.receiverName.trim().length >= 1) {
    payload.receiverName = extra.receiverName.trim().slice(0, 120);
  }
  if (
    typeof extra?.amount === 'number' &&
    !isNaN(extra.amount) &&
    extra.amount >= 0 &&
    extra.amount <= 1000000000
  ) {
    payload.amount = extra.amount;
  }
  if (extra?.machineTitle && extra.machineTitle.trim().length >= 1) {
    payload.machineTitle = extra.machineTitle.trim().slice(0, 160);
  }
  if (extra?.paymentMethod && extra.paymentMethod.trim().length >= 1) {
    payload.paymentMethod = extra.paymentMethod.trim().slice(0, 100);
  }
  if (extra?.paymentReference && extra.paymentReference.trim().length >= 1) {
    payload.paymentReference = extra.paymentReference.trim().slice(0, 120);
  }
  if (extra?.userId && extra.userId.trim().length >= 1) {
    payload.userId = extra.userId.trim().slice(0, 128);
  }
  if (extra?.transactionId && extra.transactionId.trim().length >= 1) {
    payload.transactionId = extra.transactionId.trim().slice(0, 128);
  }
  if (auth.currentUser?.uid) {
    payload.authorUid = auth.currentUser.uid.slice(0, 128);
  }

  const cleanRefId = extra?.paymentReference
    ? extra.paymentReference.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120)
    : '';
  let docId: string | null = cleanRefId || null;
  try {
    if (cleanRefId) {
      await setDoc(doc(db, 'admin_messages', cleanRefId), payload);
      docId = cleanRefId;
    } else {
      const docRef = await addDoc(collection(db, 'admin_messages'), payload);
      docId = docRef.id;
    }
  } catch {}

  try {
    await fetch('/api/admin/firebase-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firebase_doc_id: docId,
        name: safeName,
        item: safeItem,
        ...extra,
        status: safeStatus,
      }),
    });
  } catch {}

  return docId;
}

export async function signInAdminWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  return result.user;
}

export function subscribeToFirestoreAdminMessages(
  onUpdate: (messages: any[]) => void
): () => void {
  const path = 'admin_messages';
  const q = query(
    collection(db, path),
    where('status', 'in', ['PENDING', 'CONFIRMED', 'SUCCESS']),
    limit(150)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const items = snapshot.docs
        .map((d) => {
          const data = d.data();
          const ts = data.timestamp?.toDate
            ? data.timestamp.toDate().toISOString()
            : typeof data.timestamp === 'string'
              ? data.timestamp
              : new Date().toISOString();
          return {
            id: d.id,
            name: data.name || 'Avor Investor',
            item: data.item || '',
            senderPhone: data.senderPhone || '',
            receiverPhone: data.receiverPhone || '',
            receiverName: data.receiverName || '',
            amount: data.amount || 0,
            machineTitle: data.machineTitle || '',
            paymentMethod: data.paymentMethod || '',
            paymentReference: data.paymentReference || '',
            userId: data.userId || '',
            transactionId: data.transactionId || '',
            status: data.status || 'CONFIRMED',
            created_at: ts,
          };
        })
        .filter(
          (m) =>
            m.machineTitle !== 'USER_ACCOUNT_BACKUP' &&
            !String(m.id || '').startsWith('reg-user-')
        )
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      onUpdate(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch {}
    }
  );
}

export async function deleteFirestoreAdminMessage(docId: string): Promise<void> {
  const path = `admin_messages/${docId}`;
  try {
    await deleteDoc(doc(db, 'admin_messages', docId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export function getResetCutoffMs(): number {
  return 0;
}

export function applyLocalZeroReset(_epochId: string, _cutoffMs?: number): void {
  // Disabled automatic wiping so no user, order, deposit, withdrawal, or machine is ever lost.
}

export async function clearAllFirestoreOrdersAndMessages(): Promise<void> {
  // Disabled automatic Firestore deletion so data is permanently preserved in Firestore.
}

export async function syncSystemZeroReset(): Promise<void> {
  // No-op: permanent Firestore persistence is active.
}
