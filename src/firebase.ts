import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
  doc,
  getDocFromServer,
  onSnapshot,
  query,
  orderBy,
  limit,
  deleteDoc,
  updateDoc,
  setLogLevel,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

// Suppress noisy internal Firestore idle stream / transport warnings
setLogLevel('silent');

// Initialize the Firebase backend connection using the provisioned configuration
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
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
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

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
testConnection();

export interface AdminMessageExtra {
  senderPhone?: string;
  receiverPhone?: string;
  receiverName?: string;
  amount?: number;
  machineTitle?: string;
  paymentMethod?: string;
  paymentReference?: string;
  status?: 'PENDING' | 'CONFIRMED' | 'SUCCESS';
}

/**
 * Sends a real-time message to Admin in Firestore ("admin_messages") and mirrors it to the server
 * whenever a user submits a deposit or taps "Buy a Machine".
 */
export async function sendMessageToAdmin(
  userName: string,
  machineDetails: string,
  extra?: AdminMessageExtra
): Promise<string | null> {
  const safeName = (userName || 'Avor Investor').trim().slice(0, 120) || 'Avor Investor';
  const safeItem = (machineDetails || 'Machine / Deposit Action').trim().slice(0, 1000) || 'Machine / Deposit Action';

  const payload: Record<string, any> = {
    name: safeName,
    item: safeItem,
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
  if (extra?.status && ['PENDING', 'CONFIRMED', 'SUCCESS'].includes(extra.status)) {
    payload.status = extra.status;
  }
  if (auth.currentUser?.uid) {
    payload.authorUid = auth.currentUser.uid.slice(0, 128);
  }

  let docId: string | null = null;
  try {
    const docRef = await addDoc(collection(db, 'admin_messages'), payload);
    docId = docRef.id;
  } catch (error) {
    try {
      handleFirestoreError(error, OperationType.CREATE, 'admin_messages');
    } catch {
      // Allow fallback server sync below even if Firestore throws
    }
  }

  // Also sync to backend server so all Admin views have the exact message immediately
  try {
    await fetch('/api/admin/firebase-message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        firebase_doc_id: docId,
        name: safeName,
        item: safeItem,
        ...extra,
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
  const q = query(collection(db, path), orderBy('timestamp', 'desc'), limit(100));
  return onSnapshot(
    q,
    (snapshot) => {
      snapshot.docChanges().forEach((change) => {
        if (change.type === 'added') {
          const d = change.doc;
          const depositData = d.data();
          const { amount, name, item } = depositData;
          console.log(`Processing new deposit of ${amount} from ${name} for ${item}`);
          if (depositData.status !== 'CONFIRMED') {
            updateDoc(d.ref, { status: 'CONFIRMED' }).catch((err) => {
              console.error('Failed to process deposit notification:', err);
            });
          }
        }
      });

      const items = snapshot.docs.map((d) => {
        const data = d.data();
        const ts = data.timestamp?.toDate ? data.timestamp.toDate().toISOString() : new Date().toISOString();
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
      });
      onUpdate(items);
    },
    (error) => {
      console.error('Firestore admin_messages listener error:', error);
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
