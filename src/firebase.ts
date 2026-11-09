import { initializeApp } from 'firebase/app';
import { getAnalytics } from 'firebase/analytics';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import {
  initializeFirestore,
  collection,
  addDoc,
  setDoc,
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

// Suppress noisy internal Firestore idle stream / transport warnings
setLogLevel('silent');

// Your web app's Firebase configuration (avorinvest)
const firebaseConfig = {
  apiKey: 'AIzaSyB5ahJx-FXPghLqWaQmodKTJfzkiASqYw8',
  authDomain: 'avorinvest.firebaseapp.com',
  projectId: 'avorinvest',
  storageBucket: 'avorinvest.firebasestorage.app',
  messagingSenderId: '500402708773',
  appId: '1:500402708773:web:f901c0b8ba73fe2a19bacc',
  measurementId: 'G-X1D5N62VYB',
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

export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
});
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

export interface FirestoreOrderInput {
  id?: string;
  customername: string;
  name: string;
  status?: 'pending' | 'confirmed' | 'ACTIVE & DELIVERED' | 'denied';
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
 * Saves a customer order to the real Firebase Firestore 'orders' collection
 * with fields: customername, name, status = "pending", plus full order metadata.
 */
export async function createOrderInFirestore(orderData: FirestoreOrderInput): Promise<string | null> {
  const rawOrderId = (orderData.id || orderData.payment_reference || `inv-${Date.now()}`).replace(
    /[^a-zA-Z0-9_-]/g,
    ''
  );
  const cleanOrderId = rawOrderId.slice(0, 120) || `inv-${Date.now()}`;
  const path = `orders/${cleanOrderId}`;

  const safeCustomerName = (orderData.customername || orderData.customer_name || 'Avor Investor')
    .trim()
    .slice(0, 160) || 'Avor Investor';
  const safeName = (orderData.name || orderData.machine_title || 'Machine Order')
    .trim()
    .slice(0, 200) || 'Machine Order';
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
  if (typeof orderData.units === 'number' && !isNaN(orderData.units) && orderData.units >= 1 && orderData.units <= 100) {
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
    // Step 1: Update Firestore document status to "confirmed"
    await updateDoc(orderRef, {
      status: 'confirmed',
      updated_at: nowIso,
    });

    // Step 2: Update that same Firestore document status to "ACTIVE & DELIVERED"
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
    } catch {
      // Handled by server fallback if document was created server-side
    }
  }
}

/**
 * When Admin clicks Deny / Refund:
 * Updates that same Firestore document in 'orders' to status = "denied".
 */
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
    } catch {
      // Handled by server fallback
    }
  }
}

/**
 * Subscribes in real-time to all orders in the Firestore 'orders' collection.
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
    limit(150)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const items: FirestoreOrderRecord[] = snapshot.docs
        .map((d) => {
          const data = d.data();
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
            id: d.id,
            user_id: data.user_id || data.customer_phone || data.customername || d.id,
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
            payment_reference: data.payment_reference || d.id,
            created_at: ts,
            updated_at: data.updated_at || ts,
          };
        })
        .filter((o) => {
          if (o.status === 'DENIED') return false;
          const createdMs = new Date(o.created_at).getTime();
          if (!isNaN(createdMs) && createdMs < getResetCutoffMs()) {
            void deleteDoc(doc(db, 'orders', o.id)).catch(() => {});
            return false;
          }
          return true;
        })
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      onUpdate(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch {
        // Handled cleanly
      }
    }
  );
}

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

/**
 * Sends a real-time order/deposit message to BOTH Firebase Firestore ("admin_messages")
 * and the Admin Plane backend server whenever a user places an order or buys a machine.
 */
export async function sendMessageToAdmin(
  userName: string,
  machineDetails: string,
  extra?: AdminMessageExtra
): Promise<string | null> {
  const safeName = (userName || 'Avor Investor').trim().slice(0, 120) || 'Avor Investor';
  const safeItem = (machineDetails || 'Machine / Deposit Order').trim().slice(0, 1000) || 'Machine / Deposit Order';
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
  if (typeof extra?.amount === 'number' && !isNaN(extra.amount) && extra.amount >= 0 && extra.amount <= 1000000000) {
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
  } catch {
    // Document may already have been committed by the server endpoint (`ensureOrderSavedInFirestore`)
    // or will be committed via `/api/admin/firebase-message` below.
  }

  // Mirror to the Admin Plane server so both Firebase and the Admin Plane have the order immediately
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
  } catch {
    // Non-blocking fallback
  }

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
    limit(100)
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
            ![
              'mVXN2reH39ZgMfPtm4fa',
              '9lB4x8f3sfySWbccJpQs',
              'DEP-032838-916837',
              'IBE1kSI80LLSZEWXTZPC',
              'QUaVEnnLMICjrqqCvJ7m',
              'QsJeM5oMFY2L8IiawzNv',
              'RVSOi02GrYWTRYxoevPT',
              'Tk9PE6WUE12PJs34qoBv',
              'c5TMqgzjEWNNjilAGubx',
              'r8W9OClO23IN2wcwEspw',
              'sdX7pGtep1DtSMe6izj5',
              'w8UmlixTw9p6WqJi9DVK',
              'xz6gy3HVphWxCjuC71an',
              'DEP-032838-723296',
              'inv-1794134361035',
              'inv-1793996950987',
              'DEP-552412-575094',
              'DEP-834700-229546',
              'MACH-884635',
              'DEP-552549-639128',
              'DEP-552548-379787',
              'inv-1793951372902',
              'DEP-1794033057006',
              'DEP-032838-992595',
              'MACH-212919',
              'DEP-552549-802838',
              'DEP-552549-621040',
              'MACH-586494',
              'DEP-552412-755587',
              'DEP-032838-382353',
              'inv-1794134250285',
              'inv-1794138008186',
              'DEP-032838-275068',
              'DEP-032838-586206',
              'DEP-552549-402992',
              'inv-1793965367086',
              'MACH-352369',
              'MACH-217138',
            ].includes(m.id) &&
            m.name !== 'Test Investor' &&
            m.name !== 'Verification User'
        )
        .filter((m) => {
          const createdMs = new Date(m.created_at).getTime();
          if (!isNaN(createdMs) && createdMs < getResetCutoffMs()) {
            void deleteDoc(doc(db, 'admin_messages', m.id)).catch(() => {});
            return false;
          }
          return true;
        })
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      onUpdate(items);
    },
    (error) => {
      try {
        handleFirestoreError(error, OperationType.LIST, path);
      } catch {
        // Handled cleanly
      }
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

let activeResetCutoffMs = 1794158500000;

export function getResetCutoffMs(): number {
  if (typeof window !== 'undefined') {
    const saved = Number(localStorage.getItem('avor_zero_reset_cutoff_ms') || 0);
    if (saved > activeResetCutoffMs) {
      activeResetCutoffMs = saved;
    }
  }
  return activeResetCutoffMs;
}

export function applyLocalZeroReset(epochId: string, cutoffMs?: number): void {
  if (typeof window === 'undefined') return;
  if (cutoffMs && cutoffMs > activeResetCutoffMs) {
    activeResetCutoffMs = cutoffMs;
    localStorage.setItem('avor_zero_reset_cutoff_ms', String(cutoffMs));
  }
  localStorage.removeItem('avor_admin_vault_backup_v1');
  localStorage.removeItem('avor_admin_vault_backup_v2');
  localStorage.removeItem('avor_my_deposit_refs');
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k && k.startsWith('avor_invest_txs_')) {
      localStorage.removeItem(k);
    }
  }
  const rawUser = localStorage.getItem('avor_invest_user');
  if (rawUser) {
    try {
      const parsedUser = JSON.parse(rawUser);
      if (parsedUser && typeof parsedUser === 'object') {
        parsedUser.balance = 0;
        parsedUser.wallet_balance = 0;
        parsedUser.available_wallet = 0;
        parsedUser.has_bought_machine = false;
        localStorage.setItem('avor_invest_user', JSON.stringify(parsedUser));
      }
    } catch {}
  }
  localStorage.setItem('avor_zero_reset_epoch', epochId);
  window.dispatchEvent(new CustomEvent('avor-system-reset-zero', { detail: { epochId, cutoffMs: activeResetCutoffMs } }));
}

/**
 * Deletes all documents in Firestore 'orders' and 'admin_messages' collections
 * so the system resets cleanly to 0 (0 orders, 0 machines sold, 0 active cycles).
 */
export async function clearAllFirestoreOrdersAndMessages(): Promise<void> {
  try {
    const ordersQ = query(
      collection(db, 'orders'),
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
      limit(150)
    );
    const ordersSnap = await getDocs(ordersQ);
    await Promise.all(
      ordersSnap.docs.map(async (d) => {
        try {
          await deleteDoc(doc(db, 'orders', d.id));
        } catch {
          try {
            await updateDoc(doc(db, 'orders', d.id), { status: 'denied' });
          } catch {}
        }
      })
    );
  } catch {}

  try {
    const msgsQ = query(
      collection(db, 'admin_messages'),
      where('status', 'in', ['PENDING', 'CONFIRMED', 'SUCCESS']),
      limit(100)
    );
    const msgsSnap = await getDocs(msgsQ);
    await Promise.all(
      msgsSnap.docs.map(async (d) => {
        try {
          await deleteDoc(doc(db, 'admin_messages', d.id));
        } catch {}
      })
    );
  } catch {}
}

/**
 * Synchronizes browser localStorage and Firestore with the server's zero-reset epoch
 * so stale cached deposits, orders, or wallet balances are cleared to 0 across all devices.
 */
export async function syncSystemZeroReset(): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const res = await fetch('/api/system/reset-state');
    if (!res.ok) return;
    const data = await res.json();
    const epochId = data?.reset_epoch_id || 'avor-zero-reset-v8-all-devices';
    const cutoffMs = Number(data?.reset_cutoff_ms || 1794158500000);
    if (cutoffMs > activeResetCutoffMs) {
      activeResetCutoffMs = cutoffMs;
      localStorage.setItem('avor_zero_reset_cutoff_ms', String(cutoffMs));
    }
    const localEpoch = localStorage.getItem('avor_zero_reset_epoch');

    if (localEpoch !== epochId) {
      applyLocalZeroReset(epochId, cutoffMs);
      await clearAllFirestoreOrdersAndMessages();
    }

    if (!data?.firestore_cleaned) {
      await clearAllFirestoreOrdersAndMessages();
      await fetch('/api/system/reset-state', { method: 'POST' });
    }
  } catch {}
}

if (typeof window !== 'undefined') {
  void syncSystemZeroReset();
  setInterval(() => {
    void syncSystemZeroReset();
  }, 4000);
}

