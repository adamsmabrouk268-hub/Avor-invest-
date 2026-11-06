import {
  collection,
  onSnapshot,
  updateDoc,
  query,
  where,
  limit,
  DocumentData,
  QueryDocumentSnapshot as ClientQueryDocumentSnapshot,
} from 'firebase/firestore';
import { db } from './firebase';

// Define an interface matching your Firestore rules schema
export interface DepositMessage {
  name: string;
  item: string;
  timestamp: any;
  amount?: number;
  status?: 'PENDING' | 'CONFIRMED' | 'SUCCESS';
  authorUid?: string;
  senderPhone?: string;
  receiverPhone?: string;
  receiverName?: string;
  machineTitle?: string;
  paymentMethod?: string;
  paymentReference?: string;
}

export interface TriggerQueryDocumentSnapshot {
  id: string;
  data: () => DocumentData;
  ref: {
    update: (fields: Record<string, any>) => Promise<void>;
  };
}

export interface FirestoreEvent<T = TriggerQueryDocumentSnapshot | undefined> {
  params: Record<string, string>;
  data: T;
}

/**
 * Adapter matching `firebase-functions/v2/firestore` `onDocumentCreated`
 * that binds a real-time Firestore listener to "admin_messages/{messageId}".
 */
export function onDocumentCreated(
  pathPattern: string,
  handler: (event: FirestoreEvent<TriggerQueryDocumentSnapshot | undefined>) => Promise<void> | void
) {
  const collectionName = pathPattern.split('/')[0] || 'admin_messages';
  const processedIds = new Set<string>();

  const startListener = () => {
    const q = query(
      collection(db, collectionName),
      where('status', 'in', ['PENDING', 'CONFIRMED', 'SUCCESS']),
      limit(100)
    );
    return onSnapshot(
      q,
      (querySnapshot) => {
        querySnapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const docSnap: ClientQueryDocumentSnapshot<DocumentData> = change.doc;
            if (docSnap.id === 'mVXN2reH39ZgMfPtm4fa' || processedIds.has(docSnap.id)) {
              return;
            }
            processedIds.add(docSnap.id);

            const event: FirestoreEvent<TriggerQueryDocumentSnapshot | undefined> = {
              params: { messageId: docSnap.id },
              data: {
                id: docSnap.id,
                data: () => docSnap.data(),
                ref: {
                  update: async (fields: Record<string, any>) => {
                    await updateDoc(docSnap.ref, fields);
                  },
                },
              },
            };

            Promise.resolve(handler(event)).catch(() => {
              // Handled silently
            });
          }
        });
      },
      () => {
        // Handled silently
      }
    );
  };

  return {
    pathPattern,
    handler,
    startListener,
  };
}

// ============================================================================
// Trigger: processNewDeposit ("admin_messages/{messageId}")
// ============================================================================
export const processNewDeposit = onDocumentCreated(
  'admin_messages/{messageId}',
  async (event: FirestoreEvent<TriggerQueryDocumentSnapshot | undefined>) => {
    const snapshot = event.data;
    if (!snapshot) {
      console.log('No snapshot data available.');
      return;
    }

    // Cast the document data to your TypeScript interface
    const message = snapshot.data() as DepositMessage;

    // Wildcard parameters are automatically accessible via event.params
    const messageId = event.params.messageId;
    console.log(`Processing message with ID: ${messageId}`);

    const { name, amount, status } = message;

    if (amount && amount > 1000) {
      console.log(`High-value deposit of ${amount} from ${name}!`);
    }

    try {
      // Safely perform actions on the triggering document
      if (!status) {
        await snapshot.ref.update({
          status: status || 'PENDING',
        });
      }

      // Sync the deposit message to the Admin Plane server so it appears in both Firebase and the Admin Plane
      if (typeof window !== 'undefined') {
        await fetch('/api/admin/firebase-message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            firebase_doc_id: messageId,
            name: message.name || 'Avor Investor',
            item: message.item || 'Machine / Deposit Order',
            senderPhone: message.senderPhone || '',
            receiverPhone: message.receiverPhone || '',
            receiverName: message.receiverName || '',
            amount: Number(amount) || 0,
            machineTitle: message.machineTitle || message.item || '',
            paymentMethod: message.paymentMethod || 'Mobile Money',
            paymentReference: message.paymentReference || `FB-${messageId.slice(0, 8)}`,
            status: status || 'CONFIRMED',
          }),
        });
      }
    } catch {
      // Handled cleanly
    }
  }
);

export const notifyAdminOnDeposit = processNewDeposit;
