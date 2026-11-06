import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import {
  initializeFirestore,
  collection,
  addDoc,
  setDoc,
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
import firebaseConfig from '../firebase-applet-config.json';

// Suppress noisy internal Firestore idle stream / transport warnings
setLogLevel('silent');

// Initialize the Firebase backend connection using the provisioned configuration
// Enable long-polling auto-detection so mobile networks and iframe proxies never fail with "client is offline"
const app = initializeApp(firebaseConfig);
export const db = initializeFirestore(
  app,
  {
    experimentalAutoDetectLongPolling: true,
  },
  firebaseConfig.firestoreDatabaseId
);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

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
  throw new Error(JSON.stringify(errInfo));
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
            ].includes(m.id) &&
            m.name !== 'Test Investor' &&
            m.name !== 'Verification User'
        )
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
