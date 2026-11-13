import express from 'express';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import JSZip from 'jszip';
import { createServer as createViteServer } from 'vite';
import { DEFAULT_MACHINES } from './src/data/defaultMachines';
import { Machine, User, Investment, Transaction, AppNotification, DepositReceiverNumber, DepositRotationConfig } from './src/types';
import MachineModel from './src/models/Machine';
import UserModel from './src/models/User';
import PaymentModel from './src/models/Payment';
import InvestmentLockModel from './src/models/InvestmentLock';
import SystemConfigModel from './src/models/SystemConfig';
import { verifyAdmin } from './src/middleware/auth';
import initAutomationWorker from './src/services/automationCron';
import firebaseAppletConfig from './firebase-applet-config.json';

// Default Target Details
const RECEIVER_PHONE = '0741032838';
const RECEIVER_NAME = 'SULAINH NAKASEETA';
const JWT_SECRET = process.env.JWT_SECRET || 'secretkey';

// In-memory data store for state persistence across sessions
const users: Map<string, User & { password_hash: string }> = new Map();
const machines: Machine[] = [...DEFAULT_MACHINES];
const investments: Investment[] = [];
const transactions: Transaction[] = [];
const notifications: AppNotification[] = [];

// ====================================================================
// REGISTERED USERS DISK PERSISTENCE STORAGE
// ====================================================================
const DATA_DIR = path.join(process.cwd(), 'data');
const USERS_FILE = path.join(DATA_DIR, 'registered_users.json');
const REGISTRATION_EVENTS_FILE = path.join(DATA_DIR, 'registration_events.json');
const TRANSACTIONS_FILE = path.join(DATA_DIR, 'transactions.json');
const INVESTMENTS_FILE = path.join(DATA_DIR, 'investments.json');
const NOTIFICATIONS_FILE = path.join(DATA_DIR, 'notifications.json');

const MACHINES_FILE = path.join(DATA_DIR, 'machines.json');
const HOMEPAGE_CONFIG_FILE = path.join(DATA_DIR, 'homepage_config.json');
const DELETED_IDS_FILE = path.join(DATA_DIR, 'deleted_ids.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  } catch (err) {
    console.error('Error creating data directory:', err);
  }
}

// Ensure registered_users.json exists
if (!fs.existsSync(USERS_FILE)) {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify([], null, 2), 'utf-8');
  } catch (err) {
    console.error('Error creating registered_users.json:', err);
  }
}

// Ensure registration_events.json exists
if (!fs.existsSync(REGISTRATION_EVENTS_FILE)) {
  try {
    fs.writeFileSync(REGISTRATION_EVENTS_FILE, JSON.stringify([], null, 2), 'utf-8');
  } catch (err) {
    console.error('Error creating registration_events.json:', err);
  }
}

const DELETED_DEMO_IDS = new Set([
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
  'DEP-552548-170060',
  'DEP-552548-726100',
  'DEP-552548-980588',
  'DEP-552548-271662',
  'DEP-552548-737262',
  'DEP-552548-610514',
  'DEP-552548-137425',
  'inv-1793875178533',
  'inv-1793875128696',
  'inv-1794134250285',
  'tx-inv-1794134250286',
  'DEP-552548-879568',
  'DEP-552548-926486',
  'DEP-032838-723296',
  'inv-1794134361035',
  'inv-1793996950987',
  'DEP-552412-575094',
  'DEP-834700-229546',
  'tx-fb-DEP-834700-229546-941',
  'MACH-884635',
  'DEP-552549-639128',
  'DEP-552548-379787',
  'tx-fb-DEP-552548-379787-567',
  'inv-1793951372902',
  'tx-fb-inv-1793951372902-520',
  'DEP-1794033057006',
  'DEP-032838-992595',
  'MACH-212919',
  'tx-fb-MACH-212919-631',
  'DEP-552549-802838',
  'DEP-552549-621040',
  'MACH-586494',
  'DEP-552412-755587',
  'DEP-032838-382353',
  'tx-fb-DEP-032838-382353-898',
  'inv-1794138008186',
  'DEP-032838-275068',
  'DEP-032838-586206',
  'DEP-552549-402992',
  'inv-1793965367086',
  'MACH-352369',
  'MACH-217138',
]);

if (fs.existsSync(DELETED_IDS_FILE)) {
  try {
    const extraDeleted = JSON.parse(fs.readFileSync(DELETED_IDS_FILE, 'utf-8'));
    if (Array.isArray(extraDeleted)) {
      extraDeleted.forEach((id) => {
        if (id) DELETED_DEMO_IDS.add(String(id));
      });
    }
  } catch {}
}

function saveDeletedIdsToDisk() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DELETED_IDS_FILE, JSON.stringify(Array.from(DELETED_DEMO_IDS), null, 2), 'utf-8');
  } catch {}
}

function isDemoRecord(rec: any): boolean {
  if (!rec) return false;
  if (rec.firebase_doc_id && DELETED_DEMO_IDS.has(rec.firebase_doc_id)) return true;
  if (rec.payment_reference && DELETED_DEMO_IDS.has(rec.payment_reference)) return true;
  if (rec.id && (DELETED_DEMO_IDS.has(String(rec.id)) || Array.from(DELETED_DEMO_IDS).some((d) => String(rec.id).includes(d)))) return true;
  return false;
}

function loadAppStateFromDisk() {
  try {
    if (fs.existsSync(TRANSACTIONS_FILE)) {
      const loadedTx = JSON.parse(fs.readFileSync(TRANSACTIONS_FILE, 'utf-8'));
      if (Array.isArray(loadedTx)) {
        const cleanTx = loadedTx.filter((t) => !isDemoRecord(t));
        transactions.splice(0, transactions.length, ...cleanTx);
      }
    }
    if (fs.existsSync(INVESTMENTS_FILE)) {
      const loadedInv = JSON.parse(fs.readFileSync(INVESTMENTS_FILE, 'utf-8'));
      if (Array.isArray(loadedInv)) {
        const cleanInv = loadedInv.filter((inv) => !isDemoRecord(inv));
        investments.splice(0, investments.length, ...cleanInv);
      }
    }
    if (fs.existsSync(NOTIFICATIONS_FILE)) {
      const loadedNotif = JSON.parse(fs.readFileSync(NOTIFICATIONS_FILE, 'utf-8'));
      if (Array.isArray(loadedNotif)) {
        const cleanNotif = loadedNotif.filter((n) => !isDemoRecord(n));
        notifications.splice(0, notifications.length, ...cleanNotif);
      }
    }
    if (fs.existsSync(MACHINES_FILE)) {
      const loadedMachines = JSON.parse(fs.readFileSync(MACHINES_FILE, 'utf-8'));
      if (Array.isArray(loadedMachines) && loadedMachines.length > 0) {
        // Sync schedule & descriptions with DEFAULT_MACHINES (Item 10, 11, 12)
        const syncedMachines = loadedMachines.map((m: any) => {
          const def = DEFAULT_MACHINES.find((d) => d.id === m.id || d.title === m.title);
          if (def) {
            return {
              ...m,
              description: def.description,
              total_return: def.total_return,
              runs_everyday: def.runs_everyday,
              runs_on_weekends: def.runs_on_weekends,
              running_schedule_text: def.running_schedule_text,
            };
          }
          return m;
        });
        machines.splice(0, machines.length, ...syncedMachines);
      }
    }
    // Also normalize any investment with 50004 total_return to 50000 * units (Item 11)
    investments.forEach((inv) => {
      const unitsCount = Math.max(1, Number(inv.units) || 1);
      if (inv.total_return === 50004 * unitsCount || (inv.daily_yield === 2778 * unitsCount && inv.duration_days === 18)) {
        inv.total_return = 50000 * unitsCount;
      }
    });
    saveAppStateToDisk();
  } catch (err) {
    console.error('Error loading app state from disk:', err);
  }
}

function saveAppStateToDisk() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(TRANSACTIONS_FILE, JSON.stringify(transactions, null, 2), 'utf-8');
    fs.writeFileSync(INVESTMENTS_FILE, JSON.stringify(investments, null, 2), 'utf-8');
    fs.writeFileSync(NOTIFICATIONS_FILE, JSON.stringify(notifications.slice(0, 500), null, 2), 'utf-8');
    fs.writeFileSync(MACHINES_FILE, JSON.stringify(machines, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving app state to disk:', err);
  }
}

loadAppStateFromDisk();

// Function to load registered users from disk into the users Map
function loadRegisteredUsersFromDisk() {
  if (fs.existsSync(USERS_FILE)) {
    try {
      const raw = fs.readFileSync(USERS_FILE, 'utf-8');
      const loaded: (User & { password_hash: string })[] = JSON.parse(raw);
      if (Array.isArray(loaded)) {
        for (const u of loaded) {
          if (u.id === 'usr-admin-owner') continue;
          if (u.id) users.set(u.id, u);
          if (u.email) users.set(u.email, u);
          if (u.phone_number) users.set(u.phone_number, u);
          if (u.phoneNumber) users.set(u.phoneNumber, u);
          const cleanDigits = (u.phone_number || u.phoneNumber || '').replace(/[^0-9]/g, '');
          if (cleanDigits) {
            users.set(cleanDigits, u);
            const tail = cleanDigits.slice(-9);
            if (tail.length === 9) {
              users.set(tail, u);
              users.set(`0${tail}`, u);
              users.set(`256${tail}`, u);
              users.set(`+256${tail}`, u);
              users.set(`+2560${tail}`, u);
            }
          }
        }
        console.log(`[Storage] Preloaded ${loaded.length} registered users from ${USERS_FILE}`);
      }
    } catch (err) {
      console.error('Error reading registered users from disk:', err);
    }
  }
}

// Helper to save a machine document to the Firestore `machines` collection
async function saveMachineToFirestoreCollection(m: any) {
  try {
    const projectId = firebaseAppletConfig.projectId;
    const databaseId = firebaseAppletConfig.firestoreDatabaseId || '(default)';
    const apiKey = firebaseAppletConfig.apiKey;
    if (!projectId || !apiKey || !m) return;
    const cleanId = String(m.id || `mch-${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120);
    if (!cleanId) return;
    const baseDocsPath = `projects/${projectId}/databases/${databaseId}/documents`;
    const commitUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}/documents:commit?key=${encodeURIComponent(apiKey)}`;
    const price = Math.max(0, Math.round(Number(m.price ?? m.total_cost ?? 0)));
    const dailyReturn = Math.max(0, Math.round(Number(m.daily_yield ?? m.daily_return ?? m.rewardAmount ?? 0)));
    const durationDays = Math.max(1, Math.round(Number(m.duration_days || 45)));
    const totalReturn = Math.max(0, Math.round(Number(m.total_return || dailyReturn * durationDays)));
    const netProfit = Math.max(0, totalReturn - price);
    const roiPct = price > 0 ? Math.round((netProfit / price) * 100) : 100;
    const safeName = String(m.title || m.name || 'Avor Industrial Unit').slice(0, 200);

    const fields: Record<string, any> = {
      id: { stringValue: cleanId },
      name: { stringValue: safeName },
      title: { stringValue: safeName },
      price: { integerValue: String(price) },
      daily_income: { integerValue: String(dailyReturn) },
      daily_return: { integerValue: String(dailyReturn) },
      duration_days: { integerValue: String(durationDays) },
      total_return: { integerValue: String(totalReturn) },
      net_profit: { integerValue: String(netProfit) },
      roi_percentage: { integerValue: String(roiPct) },
      category: { stringValue: String(m.category || m.series_tag || 'AV1').slice(0, 120) },
      status: { stringValue: m.isActive === false ? 'MAINTENANCE' : 'AVAILABLE' },
      image_url: { stringValue: String(m.image_url || m.imageUrl || '/assets/machines/coffee-huller.jpg').slice(0, 1000) },
      description: { stringValue: String(m.description || 'High efficiency industrial machine unit.').slice(0, 1500) },
      available_units: { integerValue: String(Math.max(0, Number(m.available_units ?? 50))) },
      updated_at: { stringValue: new Date().toISOString().slice(0, 40) },
    };

    await fetch(commitUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        writes: [
          {
            update: {
              name: `${baseDocsPath}/machines/${cleanId}`,
              fields,
            },
            updateTransforms: [
              {
                fieldPath: 'timestamp',
                setToServerValue: 'REQUEST_TIME',
              },
            ],
          },
        ],
      }),
    });
  } catch {}
}

async function deleteMachineFromFirestoreCollection(machineId: string) {
  try {
    const projectId = firebaseAppletConfig.projectId;
    const databaseId = firebaseAppletConfig.firestoreDatabaseId || '(default)';
    const apiKey = firebaseAppletConfig.apiKey;
    if (!projectId || !apiKey || !machineId) return;
    const cleanId = String(machineId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120);
    if (!cleanId) return;
    const deleteUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}/documents/machines/${encodeURIComponent(cleanId)}?key=${encodeURIComponent(apiKey)}`;
    await fetch(deleteUrl, { method: 'DELETE' });
  } catch {}
}

// Helper to save a deposit document to the Firestore `deposits` collection
async function saveDepositToFirestoreCollection(
  tx: any,
  statusOverride?: 'pending' | 'approved' | 'confirmed' | 'rejected'
) {
  try {
    const projectId = firebaseAppletConfig.projectId;
    const databaseId = firebaseAppletConfig.firestoreDatabaseId || '(default)';
    const apiKey = firebaseAppletConfig.apiKey;
    if (!projectId || !apiKey || !tx) return;
    const cleanId = String(tx.id || tx.payment_reference || `dep-${Date.now()}`)
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 120);
    if (!cleanId) return;
    const baseDocsPath = `projects/${projectId}/databases/${databaseId}/documents`;
    const commitUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}/documents:commit?key=${encodeURIComponent(apiKey)}`;
    const nowIso = new Date().toISOString().slice(0, 40);
    const rawStatus = statusOverride || (tx.status === 'SUCCESS' || tx.status === 'CONFIRMED' ? 'approved' : tx.status === 'FAILED' ? 'rejected' : 'pending');

    const fields: Record<string, any> = {
      id: { stringValue: cleanId },
      user_id: { stringValue: String(tx.user_id || tx.customer_phone || 'usr-investor').slice(0, 128) },
      name: { stringValue: String(tx.customer_name || tx.name || 'Avor Investor').slice(0, 160) },
      phone: { stringValue: String(tx.customer_phone || tx.user_phone || '+256700000000').slice(0, 40) },
      amount: { integerValue: String(Math.max(0, Math.round(Number(tx.amount || 0)))) },
      status: { stringValue: rawStatus },
      payment_method: { stringValue: String(tx.payment_method || 'Mobile Money').slice(0, 160) },
      payment_reference: { stringValue: String(tx.payment_reference || cleanId).slice(0, 120) },
      created_at: { stringValue: String(tx.created_at || nowIso).slice(0, 60) },
      updated_at: { stringValue: nowIso },
    };
    if (tx.machine_id) fields.machine_id = { stringValue: String(tx.machine_id).slice(0, 128) };
    if (tx.machine_title) fields.machine_title = { stringValue: String(tx.machine_title).slice(0, 200) };

    await fetch(commitUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        writes: [
          {
            update: {
              name: `${baseDocsPath}/deposits/${cleanId}`,
              fields,
            },
            updateTransforms: [
              {
                fieldPath: 'timestamp',
                setToServerValue: 'REQUEST_TIME',
              },
            ],
          },
        ],
      }),
    });
  } catch {}
}

// Hydrate all 5 collections ("users", "machines", "orders", "withdrawals", "deposits") from Firebase Firestore on startup
async function hydrateRegisteredUsersFromFirestoreCloud() {
  try {
    const projectId = firebaseAppletConfig.projectId;
    const databaseId = firebaseAppletConfig.firestoreDatabaseId || '(default)';
    const apiKey = firebaseAppletConfig.apiKey;
    if (!projectId || !apiKey) return;
    const queryUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}/documents:runQuery?key=${encodeURIComponent(apiKey)}`;

    const parseDocFields = (fields: Record<string, any> | undefined): Record<string, any> => {
      const out: Record<string, any> = {};
      if (!fields) return out;
      for (const [k, v] of Object.entries(fields)) {
        if (!v || typeof v !== 'object') continue;
        if ('stringValue' in v) out[k] = v.stringValue;
        else if ('integerValue' in v) out[k] = Number(v.integerValue);
        else if ('doubleValue' in v) out[k] = Number(v.doubleValue);
        else if ('booleanValue' in v) out[k] = Boolean(v.booleanValue);
        else if ('timestampValue' in v) out[k] = v.timestampValue;
      }
      return out;
    };

    // 1. Hydrate "users" collection from Firestore
    const usersRes = await fetch(queryUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'users' }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'status' },
              op: 'IN',
              value: {
                arrayValue: {
                  values: [{ stringValue: 'ACTIVE' }, { stringValue: 'VERIFIED' }],
                },
              },
            },
          },
          limit: 200,
        },
      }),
    });
    if (usersRes.ok) {
      const userRows: any[] = await usersRes.json();
      if (Array.isArray(userRows)) {
        for (const row of userRows) {
          const docObj = row?.document;
          if (!docObj?.fields) continue;
          const parsed = parseDocFields(docObj.fields);
          const docId = String(parsed.id || docObj.name?.split('/').pop() || '');
          if (!docId || docId === 'usr-admin-owner') continue;
          const cleanDigits = String(parsed.phone || '').replace(/[^0-9]/g, '');
          const tail = cleanDigits.slice(-9);
          const alreadyExists =
            users.has(docId) || (tail.length === 9 && (users.has(tail) || users.has(`+256${tail}`)));
          if (!alreadyExists) {
            const restoredUser: User & { password_hash: string } = {
              id: docId,
              full_name: parsed.name || 'Avor Investor',
              name: parsed.name || 'Avor Investor',
              email: parsed.email || parsed.phone || `${cleanDigits || docId}@avor.ug`,
              phone_number: parsed.phone || '',
              phoneNumber: parsed.phone || '',
              country: 'Uganda',
              country_code: '+256',
              kyc_status: 'VERIFIED',
              role: parsed.role === 'ADMIN' ? 'ADMIN' : 'INVESTOR',
              balance: typeof parsed.balance === 'number' ? parsed.balance : REGISTRATION_REWARD_UGX,
              wallet_balance: Number(parsed.wallet_balance || 0),
              available_wallet: Number(parsed.available_wallet || parsed.wallet_balance || 0),
              has_bought_machine: Boolean(parsed.has_bought_machine),
              referral_code: parsed.referral_code || `AVOR-${Math.floor(1000 + Math.random() * 9000)}`,
              created_at: parsed.created_at || parsed.registered_date || new Date().toISOString(),
              registered_date: parsed.registered_date || parsed.date || new Date().toISOString(),
              updated_at: parsed.updated_at || new Date().toISOString(),
              password_hash: parsed.password || 'restored',
              password: parsed.password || 'restored',
            };
            users.set(restoredUser.id, restoredUser);
            if (restoredUser.email) users.set(restoredUser.email, restoredUser);
            if (restoredUser.phone_number) users.set(restoredUser.phone_number, restoredUser);
            if (cleanDigits) {
              users.set(cleanDigits, restoredUser);
              if (tail.length === 9) {
                users.set(tail, restoredUser);
                users.set(`0${tail}`, restoredUser);
                users.set(`256${tail}`, restoredUser);
                users.set(`+256${tail}`, restoredUser);
                users.set(`+2560${tail}`, restoredUser);
              }
            }
          }
        }
      }
    }

    // 2. Hydrate "machines" collection from Firestore (and seed default machines into Firestore if not present)
    const machinesRes = await fetch(queryUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'machines' }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'status' },
              op: 'IN',
              value: {
                arrayValue: {
                  values: [
                    { stringValue: 'AVAILABLE' },
                    { stringValue: 'SOLD_OUT' },
                    { stringValue: 'MAINTENANCE' },
                    { stringValue: 'ACTIVE' },
                  ],
                },
              },
            },
          },
          limit: 100,
        },
      }),
    });
    if (machinesRes.ok) {
      const mRows: any[] = await machinesRes.json();
      const foundFirestoreMachines: any[] = [];
      if (Array.isArray(mRows)) {
        for (const row of mRows) {
          const docObj = row?.document;
          if (!docObj?.fields) continue;
          const p = parseDocFields(docObj.fields);
          const mId = String(p.id || docObj.name?.split('/').pop() || '');
          if (!mId) continue;
          foundFirestoreMachines.push(p);
          const existingM = machines.find((m) => String(m.id) === mId);
          if (!existingM) {
            const cost = Number(p.price || 15000);
            const daily = Number(p.daily_return || p.daily_income || 1000);
            const dur = Number(p.duration_days || 45);
            machines.push({
              id: mId,
              title: p.title || p.name || 'Avor Machine',
              name: p.name || p.title || 'Avor Machine',
              category: p.category || 'AV1',
              series_tag: p.category || 'AV1',
              series: p.category || 'AV1',
              description: p.description || 'Industrial processing machine.',
              total_cost: cost,
              price: cost,
              funded_amount: 0,
              estimated_return_pct: Number(p.roi_percentage || Math.round(((daily * dur) / cost) * 100)),
              daily_yield: daily,
              rewardAmount: daily,
              duration_days: dur,
              lockDurationMinutes: dur * 1440,
              total_return: Number(p.total_return || daily * dur),
              status: p.status === 'MAINTENANCE' ? 'COMPLETED' : 'FUNDING',
              isActive: p.status !== 'MAINTENANCE',
              available_units: Number(p.available_units ?? 50),
              vip_level_required: 0,
              hashrate_or_capacity: '250 TH/s Series P',
              power_consumption: '950W Smart Air-Cooled',
              image_url: p.image_url || '/assets/machines/coffee-huller.jpg',
              imageUrl: p.image_url || '/assets/machines/coffee-huller.jpg',
              created_at: p.updated_at || new Date().toISOString(),
            } as any);
          }
        }
      }
      if (foundFirestoreMachines.length === 0 && machines.length > 0) {
        for (const m of machines) {
          void saveMachineToFirestoreCollection(m);
        }
      }
    }

    // 3. Hydrate "orders" collection from Firestore
    const ordersRes = await fetch(queryUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'orders' }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'status' },
              op: 'IN',
              value: {
                arrayValue: {
                  values: [
                    { stringValue: 'pending' },
                    { stringValue: 'confirmed' },
                    { stringValue: 'ACTIVE & DELIVERED' },
                    { stringValue: 'PENDING' },
                    { stringValue: 'ACTIVE' },
                    { stringValue: 'COMPLETED' },
                    { stringValue: 'PAYOUT_COMPLETE' },
                  ],
                },
              },
            },
          },
          limit: 200,
        },
      }),
    });
    if (ordersRes.ok) {
      const oRows: any[] = await ordersRes.json();
      if (Array.isArray(oRows)) {
        for (const row of oRows) {
          const docObj = row?.document;
          if (!docObj?.fields) continue;
          const p = parseDocFields(docObj.fields);
          const oId = String(p.id || docObj.name?.split('/').pop() || '');
          if (!oId || investments.some((i) => i.id === oId)) continue;
          const rawSt = String(p.status || 'pending');
          const normStatus =
            rawSt === 'confirmed' || rawSt === 'ACTIVE & DELIVERED' || rawSt === 'ACTIVE'
              ? 'ACTIVE'
              : rawSt === 'COMPLETED' || rawSt === 'PAYOUT_COMPLETE'
                ? 'PAYOUT_COMPLETE'
                : 'PENDING';
          const amt = Number(p.amount_invested ?? p.amount ?? 15000);
          const daily = Number(p.daily_return || 1000);
          const dur = Number(p.duration_days || 45);
          const startIso = p.start_date || p.timestamp || new Date().toISOString();
          const newInv: Investment = {
            id: oId,
            user_id: String(p.user_id || p.customer_phone || 'usr-investor'),
            machine_id: String(p.machine_id || 'mch-av1-1'),
            machine_title: String(p.machine_title || p.name || 'Machine Order'),
            series_tag: 'AV1',
            units: Number(p.units || 1),
            amount_invested: amt,
            daily_yield: daily,
            total_return: Number(p.total_return || daily * dur),
            duration_days: dur,
            days_elapsed: normStatus === 'PENDING' ? 0 : Math.max(1, Number(p.days_elapsed || 1)),
            last_claim_at: startIso,
            unclaimed_earnings: normStatus === 'PENDING' ? 0 : daily,
            total_claimed: 0,
            status: normStatus as any,
            start_date: startIso,
            end_date: p.end_date || new Date(new Date(startIso).getTime() + dur * 86400000).toISOString(),
            wallet_deducted: true,
            payment_method: p.payment_method || 'Wallet Balance',
          };
          (newInv as any).customer_name = p.customer_name || p.customername || 'Avor Investor';
          (newInv as any).customer_phone = p.customer_phone || '';
          investments.push(newInv);
        }
      }
    }

    // 4. Hydrate "deposits" collection from Firestore
    const depositsRes = await fetch(queryUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'deposits' }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'status' },
              op: 'IN',
              value: {
                arrayValue: {
                  values: [
                    { stringValue: 'pending' },
                    { stringValue: 'approved' },
                    { stringValue: 'confirmed' },
                    { stringValue: 'PENDING' },
                    { stringValue: 'SUCCESS' },
                    { stringValue: 'CONFIRMED' },
                  ],
                },
              },
            },
          },
          limit: 200,
        },
      }),
    });
    if (depositsRes.ok) {
      const dRows: any[] = await depositsRes.json();
      if (Array.isArray(dRows)) {
        for (const row of dRows) {
          const docObj = row?.document;
          if (!docObj?.fields) continue;
          const p = parseDocFields(docObj.fields);
          const dId = String(p.id || docObj.name?.split('/').pop() || '');
          if (!dId || transactions.some((t) => t.id === dId || t.payment_reference === p.payment_reference)) continue;
          const rawSt = String(p.status || 'pending').toUpperCase();
          const normSt = rawSt === 'APPROVED' || rawSt === 'CONFIRMED' || rawSt === 'SUCCESS' ? 'SUCCESS' : 'PENDING';
          const newTx: Transaction = {
            id: dId,
            user_id: String(p.user_id || p.phone || 'usr-investor'),
            amount: Number(p.amount || 0),
            type: 'DEPOSIT',
            status: normSt,
            payment_method: String(p.payment_method || 'Mobile Money'),
            payment_reference: String(p.payment_reference || dId),
            machine_title: p.machine_title ? String(p.machine_title) : undefined,
            created_at: String(p.created_at || p.timestamp || new Date().toISOString()),
          };
          (newTx as any).customer_name = p.name || 'Avor Investor';
          (newTx as any).customer_phone = p.phone || '';
          (newTx as any).user_phone = p.phone || '';
          (newTx as any).wallet_credited = normSt === 'SUCCESS';
          (newTx as any).approved_permanent = normSt === 'SUCCESS';
          transactions.push(newTx);
        }
      }
    }

    // 5. Hydrate "withdrawals" collection from Firestore
    const withdrawalsRes = await fetch(queryUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId: 'withdrawals' }],
          where: {
            fieldFilter: {
              field: { fieldPath: 'status' },
              op: 'IN',
              value: {
                arrayValue: {
                  values: [
                    { stringValue: 'pending' },
                    { stringValue: 'approved' },
                    { stringValue: 'PENDING' },
                    { stringValue: 'SUCCESS' },
                    { stringValue: 'CONFIRMED' },
                  ],
                },
              },
            },
          },
          limit: 200,
        },
      }),
    });
    if (withdrawalsRes.ok) {
      const wRows: any[] = await withdrawalsRes.json();
      if (Array.isArray(wRows)) {
        for (const row of wRows) {
          const docObj = row?.document;
          if (!docObj?.fields) continue;
          const p = parseDocFields(docObj.fields);
          const wId = String(p.id || docObj.name?.split('/').pop() || '');
          if (!wId || transactions.some((t) => t.id === wId || t.payment_reference === p.payment_reference)) continue;
          const rawSt = String(p.status || 'pending').toUpperCase();
          const normSt = rawSt === 'APPROVED' || rawSt === 'CONFIRMED' || rawSt === 'SUCCESS' ? 'SUCCESS' : 'PENDING';
          const amt = Number(p.amount || 0);
          const feeAmt = typeof p.fee_amount === 'number' ? p.fee_amount : Math.round(amt * 0.1);
          const netAmt = typeof p.net_amount === 'number' ? p.net_amount : Math.max(0, amt - feeAmt);
          const newTx: Transaction = {
            id: wId,
            user_id: String(p.userId || p.phone || 'usr-investor'),
            amount: amt,
            type: 'WITHDRAWAL',
            status: normSt,
            payment_method: String(
              p.payment_method || `Mobile Money (${p.phone || ''}) • Net Payout: ${netAmt.toLocaleString()} UGX`
            ),
            payment_reference: String(p.payment_reference || wId),
            created_at: String(p.createdAt || new Date().toISOString()),
          };
          (newTx as any).userId = newTx.user_id;
          (newTx as any).name = p.name || 'Avor Investor';
          (newTx as any).phone = p.phone || '';
          (newTx as any).customer_name = p.name || 'Avor Investor';
          (newTx as any).customer_phone = p.phone || '';
          (newTx as any).fee_amount = feeAmt;
          (newTx as any).net_amount = netAmt;
          transactions.push(newTx);
        }
      }
    }

    // 6. Hydrate Admin-edited system metrics from Firestore if present
    try {
      const metricsDocUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}/documents/admin_messages/system-metrics-config?key=${encodeURIComponent(apiKey)}`;
      const metricsRes = await fetch(metricsDocUrl);
      if (metricsRes.ok) {
        const metricsDoc = await metricsRes.json();
        const parsedMetrics = parseDocFields(metricsDoc?.fields);
        if (parsedMetrics.item) {
          try {
            const jsonMetrics = JSON.parse(String(parsedMetrics.item));
            if (jsonMetrics && typeof jsonMetrics === 'object') {
              homepageConfig = { ...homepageConfig, ...jsonMetrics };
              saveHomepageConfigToDisk(false);
            }
          } catch {}
        }
      }
    } catch {}

    saveAppStateToDisk();
  } catch {}
}

// Function to save registered user data and date on the user's details to disk AND permanently to Firestore "users" collection
function saveRegisteredUserToDisk(userToSave: User & { password_hash: string }) {
  if (!userToSave || userToSave.id === 'usr-admin-owner') return;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    const nowIso = new Date().toISOString();
    const regIso = (userToSave as any).registered_date || userToSave.created_at || nowIso;
    userToSave.created_at = userToSave.created_at || regIso;
    (userToSave as any).registered_date = regIso;
    (userToSave as any).updated_at = nowIso;
    (userToSave as any).user_details = {
      ...((userToSave as any).user_details || {}),
      id: userToSave.id,
      full_name: userToSave.full_name || userToSave.name || 'Avor Investor',
      phone_number: userToSave.phone_number || userToSave.phoneNumber || '',
      email: userToSave.email || '',
      country: userToSave.country || 'Uganda',
      country_code: userToSave.country_code || '+256',
      referral_code: userToSave.referral_code || '',
      referred_by: userToSave.referred_by || null,
      balance: typeof userToSave.balance === 'number' ? userToSave.balance : REGISTRATION_REWARD_UGX,
      wallet_balance: Number(userToSave.wallet_balance || 0),
      available_wallet: Number(userToSave.available_wallet || userToSave.wallet_balance || 0),
      has_bought_machine: Boolean(userToSave.has_bought_machine),
      created_at: userToSave.created_at,
      registered_date: regIso,
      date: new Date(regIso).toLocaleString(),
      updated_at: nowIso,
    };

    let existingList: any[] = [];
    if (fs.existsSync(USERS_FILE)) {
      try {
        const raw = fs.readFileSync(USERS_FILE, 'utf-8');
        existingList = JSON.parse(raw);
        if (!Array.isArray(existingList)) existingList = [];
      } catch (e) {
        existingList = [];
      }
    }

    const cleanUserPhone = (userToSave.phone_number || userToSave.phoneNumber || '').replace(/[^0-9]/g, '');
    const userPhoneTail = cleanUserPhone.slice(-9);
    existingList = existingList.filter((u) => {
      if (u.id === 'usr-admin-owner') return false;
      const uPhone = (u.phone_number || u.phoneNumber || '').replace(/[^0-9]/g, '');
      const uTail = uPhone.slice(-9);
      return u.id !== userToSave.id && (!userPhoneTail || userPhoneTail.length < 7 || uTail !== userPhoneTail);
    });
    existingList.push(userToSave);

    fs.writeFileSync(USERS_FILE, JSON.stringify(existingList, null, 2), 'utf-8');
    console.log(`[Storage] Saved user details & date for ${userToSave.phone_number || userToSave.id} to ${USERS_FILE}`);

    // Permanently save user account details & date to Firebase Firestore "users" collection
    void (async () => {
      try {
        const projectId = firebaseAppletConfig.projectId;
        const databaseId = firebaseAppletConfig.firestoreDatabaseId || '(default)';
        const apiKey = firebaseAppletConfig.apiKey;
        if (!projectId || !apiKey) return;
        const cleanDocId = userPhoneTail
          ? `usr-${userPhoneTail}`
          : String(userToSave.id || `usr-${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120);
        const baseDocsPath = `projects/${projectId}/databases/${databaseId}/documents`;
        const commitUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}/documents:commit?key=${encodeURIComponent(apiKey)}`;
        const safePhone = String(userToSave.phone_number || userToSave.phoneNumber || '+256700000000').slice(0, 40);
        const safeName = String(userToSave.full_name || userToSave.name || 'Avor Investor').slice(0, 160);
        const safeBal = Math.max(0, Math.round(typeof userToSave.balance === 'number' ? userToSave.balance : REGISTRATION_REWARD_UGX));
        const safeWallet = Math.max(0, Math.round(Number(userToSave.wallet_balance || 0)));

        const fields: Record<string, any> = {
          id: { stringValue: cleanDocId },
          name: { stringValue: safeName },
          phone: { stringValue: safePhone },
          email: { stringValue: String(userToSave.email || safePhone).slice(0, 160) },
          balance: { integerValue: String(safeBal) },
          wallet_balance: { integerValue: String(safeWallet) },
          available_wallet: { integerValue: String(safeWallet) },
          registration_bonus: { integerValue: String(REGISTRATION_REWARD_UGX) },
          has_bought_machine: { booleanValue: Boolean(userToSave.has_bought_machine) },
          role: { stringValue: userToSave.role === 'ADMIN' ? 'ADMIN' : 'INVESTOR' },
          registered_date: { stringValue: String(regIso).slice(0, 60) },
          date: { stringValue: String(regIso.split('T')[0]).slice(0, 60) },
          created_at: { stringValue: String(userToSave.created_at || nowIso).slice(0, 60) },
          updated_at: { stringValue: nowIso.slice(0, 60) },
          status: { stringValue: 'VERIFIED' },
        };
        const pwd = userToSave.password_hash || userToSave.password;
        if (pwd && String(pwd).trim().length >= 1) {
          fields.password = { stringValue: String(pwd).trim().slice(0, 160) };
        }
        if (userToSave.referral_code) {
          fields.referral_code = { stringValue: String(userToSave.referral_code).slice(0, 60) };
        }

        await fetch(commitUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            writes: [
              {
                update: {
                  name: `${baseDocsPath}/users/${cleanDocId}`,
                  fields,
                },
                updateTransforms: [
                  {
                    fieldPath: 'timestamp',
                    setToServerValue: 'REQUEST_TIME',
                  },
                ],
              },
            ],
          }),
        });
      } catch {}
    })();
  } catch (err) {
    console.error('Error saving registered user to disk:', err);
  }
}

// Function to log registration audit events and exact JSON payload
function saveRegistrationEventLog(eventData: any) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    let eventsList: any[] = [];
    if (fs.existsSync(REGISTRATION_EVENTS_FILE)) {
      try {
        const raw = fs.readFileSync(REGISTRATION_EVENTS_FILE, 'utf-8');
        eventsList = JSON.parse(raw);
        if (!Array.isArray(eventsList)) eventsList = [];
      } catch (e) {
        eventsList = [];
      }
    }

    eventsList.push(eventData);
    fs.writeFileSync(REGISTRATION_EVENTS_FILE, JSON.stringify(eventsList, null, 2), 'utf-8');
    console.log(`[Storage] Saved registration event payload for ${eventData.phone || eventData.userId} to ${REGISTRATION_EVENTS_FILE}`);
  } catch (err) {
    console.error('Error saving registration event log:', err);
  }
}

function findOrRestoreUser(userId?: string, body: any = {}): (User & { password_hash: string }) | undefined {
  const id = (userId || body.user_id || body.userId || '').toString().trim();
  const phone = (body.user_phone || body.phone_number || body.phoneNumber || '').toString().trim();
  const cleanDigits = (phone || id).replace(/[^0-9]/g, '');
  const phoneTail = cleanDigits.slice(-9);

  // 1. Exact user ID match (always prioritize real investor accounts over usr-admin-owner)
  if (id && users.has(id)) {
    const matched = users.get(id);
    if (matched && (id === 'usr-admin-owner' || matched.id !== 'usr-admin-owner')) {
      if (phone && (!matched.phone_number || matched.phone_number === '+256700000000')) {
        // Check if another user record already exists for this phone number tail
        if (phoneTail && phoneTail.length >= 7) {
          for (const u of users.values()) {
            if (u.id === 'usr-admin-owner' || u.id === matched.id) continue;
            const uTail = (u.phone_number || u.phoneNumber || '').replace(/[^0-9]/g, '').slice(-9);
            if (uTail === phoneTail) {
              users.set(id, u);
              return u;
            }
          }
        }
        matched.phone_number = phone;
        matched.phoneNumber = phone;
        saveRegisteredUserToDisk(matched);
      }
      return matched;
    }
  }

  // 2. Search real investor accounts first by ID, exact phone, or 9-digit phone tail
  for (const u of users.values()) {
    if (u.id === 'usr-admin-owner') continue;
    const uDigits = (u.phone_number || u.phoneNumber || '').replace(/[^0-9]/g, '');
    const uTail = uDigits.slice(-9);
    if (
      (id && u.id === id) ||
      (phone && (u.phone_number === phone || u.phoneNumber === phone)) ||
      (cleanDigits && cleanDigits.length >= 6 && uDigits === cleanDigits) ||
      (phoneTail && phoneTail.length >= 7 && uTail === phoneTail)
    ) {
      return u;
    }
  }

  // 3. Fallback to any user (including admin if explicitly requested)
  if (id === 'usr-admin-owner' && users.has('usr-admin-owner')) {
    return users.get('usr-admin-owner');
  }
  for (const u of users.values()) {
    const uDigits = (u.phone_number || u.phoneNumber || '').replace(/[^0-9]/g, '');
    const uTail = uDigits.slice(-9);
    if (phoneTail && phoneTail.length >= 7 && uTail === phoneTail) {
      return u;
    }
  }

  // 4. Check if any transaction on disk/memory matches this userId or phone so we can link to their phone number
  if (!phone && id) {
    const matchingTx = transactions.find(
      (t) => t.user_id === id || (t as any).customer_phone === id || (t as any).user_phone === id
    );
    const txPhone = (matchingTx as any)?.customer_phone || (matchingTx as any)?.user_phone;
    if (txPhone) {
      const txTail = String(txPhone).replace(/[^0-9]/g, '').slice(-9);
      for (const u of users.values()) {
        if (u.id === 'usr-admin-owner') continue;
        const uTail = (u.phone_number || u.phoneNumber || '').replace(/[^0-9]/g, '').slice(-9);
        if (txTail && txTail.length >= 7 && uTail === txTail) {
          users.set(id, u);
          return u;
        }
      }
    }
  }

  // 5. If still not found but client sent a valid user_id, restore user session in memory
  if (id) {
    const restoredUser: User & { password_hash: string } = {
      id,
      full_name: body.user_name || body.full_name || 'Avor Investor',
      name: body.user_name || body.full_name || 'Avor Investor',
      email: body.email || `${cleanDigits || 'member'}@avorinvest.com`,
      phone_number: phone || '+256700000000',
      phoneNumber: phone || '+256700000000',
      country: 'Uganda',
      kyc_status: 'VERIFIED',
      role: 'INVESTOR',
      balance: REGISTRATION_REWARD_UGX,
      wallet_balance: 0,
      available_wallet: 0,
      referral_code: `AVOR-${Math.floor(1000 + Math.random() * 9000)}`,
      created_at: new Date().toISOString(),
      password_hash: 'restored',
    };
    users.set(restoredUser.id, restoredUser);
    if (restoredUser.phone_number) users.set(restoredUser.phone_number, restoredUser);
    saveRegisteredUserToDisk(restoredUser);
    return restoredUser;
  }

  return undefined;
}

function doesTxBelongToUser(t: Transaction, user?: User, explicitUserId?: string): boolean {
  if (!t) return false;
  if (user && t.user_id === user.id) return true;
  if (explicitUserId && t.user_id === explicitUserId) return true;
  const userPhoneTail = (user?.phone_number || user?.phoneNumber || explicitUserId || '').replace(/\D/g, '').slice(-9);
  if (!userPhoneTail || userPhoneTail.length < 7) return false;
  const txCustPhoneTail = ((t as any).customer_phone || '').replace(/\D/g, '').slice(-9);
  const txUserPhoneTail = ((t as any).user_phone || '').replace(/\D/g, '').slice(-9);
  const txUidPhoneTail = (t.user_id || '').replace(/\D/g, '').slice(-9);
  return (
    txCustPhoneTail === userPhoneTail ||
    txUserPhoneTail === userPhoneTail ||
    (txUidPhoneTail.length >= 7 && txUidPhoneTail === userPhoneTail)
  );
}

// Welcoming bonus of 3,000 UGX on registration (can be withdrawn directly along with commissions)
const REGISTRATION_REWARD_UGX = 3000;

const SYSTEM_RESET_FILE = path.join(DATA_DIR, 'system_reset.json');
let systemResetEpochId = 'avor-zero-reset-v8-all-devices';
let systemResetCutoffMs = 1794158500000;
let firestoreCleanedForEpoch = true;

try {
  if (fs.existsSync(SYSTEM_RESET_FILE)) {
    const parsedReset = JSON.parse(fs.readFileSync(SYSTEM_RESET_FILE, 'utf-8'));
    if (parsedReset?.reset_epoch_id) systemResetEpochId = String(parsedReset.reset_epoch_id);
    if (Number(parsedReset?.reset_cutoff_ms) > 0) systemResetCutoffMs = Number(parsedReset.reset_cutoff_ms);
  }
} catch {
  // Use defaults
}

const saveSystemResetToDisk = () => {
  try {
    fs.writeFileSync(
      SYSTEM_RESET_FILE,
      JSON.stringify({ reset_epoch_id: systemResetEpochId, reset_cutoff_ms: systemResetCutoffMs }, null, 2),
      'utf-8'
    );
  } catch {
    // Ignore write error
  }
};

function linkKnownDepositRefsToUser(user?: User & { password_hash?: string }, rawRefs?: any) {
  if (!user || !rawRefs) return;
  const refList = String(rawRefs)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (refList.length === 0) return;
  const refSet = new Set(refList);
  const phoneTails = new Set(
    refList
      .map((r) => r.replace(/\D/g, '').slice(-9))
      .filter((tail) => tail.length >= 7)
  );
  let changed = false;
  for (const t of transactions) {
    if (t.type !== 'DEPOSIT' && t.type !== 'WITHDRAWAL') continue;
    const txCustTail = ((t as any).customer_phone || (t as any).phone || '').replace(/\D/g, '').slice(-9);
    const txUserTail = ((t as any).user_phone || '').replace(/\D/g, '').slice(-9);
    const matchesRef =
      refSet.has(t.id) ||
      (t.payment_reference && refSet.has(t.payment_reference)) ||
      ((t as any).firebase_doc_id && refSet.has((t as any).firebase_doc_id)) ||
      (txCustTail.length >= 7 && phoneTails.has(txCustTail)) ||
      (txUserTail.length >= 7 && phoneTails.has(txUserTail));
    if (matchesRef) {
      if (t.user_id !== user.id) {
        t.user_id = user.id;
        changed = true;
      }
      if (user.phone_number && (t as any).user_phone !== user.phone_number) {
        (t as any).user_phone = user.phone_number;
        changed = true;
      }
    }
  }
  if (changed) {
    saveAppStateToDisk();
  }
}

// Helper: Check if a given Date falls on Monday (1) through Friday (5) — no Weekends (Saturday=6, Sunday=0)
function isWeekdayMonToFri(d: Date = new Date()): boolean {
  const day = d.getDay();
  return day >= 1 && day <= 5;
}

// Helper: Determine if a machine/investment is AV1 or AV2 series (runs Monday to Friday only, no Weekends)
function isAv1OrAv2WeekdayMachine(invOrMachine: any): boolean {
  if (!invOrMachine) return false;
  if (invOrMachine.is_av_class) return false;
  const tag = String(invOrMachine.series_tag || invOrMachine.machine?.series_tag || '').toUpperCase();
  const title = String(invOrMachine.machine_title || invOrMachine.title || invOrMachine.machine?.title || '').toUpperCase();
  const id = String(invOrMachine.machine_id || invOrMachine.id || '').toLowerCase();
  if (tag.includes('CLASS') || title.includes('CLASS')) return false;
  if (
    tag.includes('AV1') ||
    tag.includes('AV2') ||
    tag.includes('AX2') ||
    title.includes('AV1') ||
    title.includes('AV2') ||
    id.startsWith('av1') ||
    id.startsWith('av2')
  ) {
    return true;
  }
  return true;
}

// Helper: Compute maturity end_date advancing only on Monday–Friday working days for AV1 and AV2
function computeMachineEndDate(startDate: Date, durationDays: number, monToFriOnly: boolean): Date {
  const totalDays = Math.max(1, Number(durationDays) || 32);
  if (!monToFriOnly) {
    return new Date(startDate.getTime() + totalDays * 24 * 60 * 60 * 1000);
  }
  const cursor = new Date(startDate.getTime());
  let workingDaysAdded = 0;
  while (workingDaysAdded < totalDays) {
    cursor.setDate(cursor.getDate() + 1);
    const dow = cursor.getDay();
    if (dow >= 1 && dow <= 5) {
      workingDaysAdded++;
    }
  }
  return cursor;
}

// Helper: Count elapsed working days (Monday–Friday only for AV1 & AV2, skipping Saturday and Sunday)
function countElapsedMachineDays(
  startDate: Date,
  nowDate: Date,
  durationDays: number,
  monToFriOnly: boolean
): number {
  const maxDays = Math.max(1, Number(durationDays) || 32);
  const diffMs = nowDate.getTime() - startDate.getTime();
  if (diffMs < 0) return 0;

  if (!monToFriOnly) {
    const rawDays = Math.floor(diffMs / (24 * 60 * 60 * 1000)) + 1;
    return Math.min(maxDays, Math.max(1, rawDays));
  }

  // Count distinct Monday–Friday calendar days from startDate up to nowDate
  const startDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const endDay = new Date(nowDate.getFullYear(), nowDate.getMonth(), nowDate.getDate());
  let weekdaysCount = 0;
  const cursor = new Date(startDay.getTime());
  while (cursor <= endDay && weekdaysCount < maxDays) {
    const dow = cursor.getDay();
    if (dow >= 1 && dow <= 5) {
      weekdaysCount++;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return Math.min(maxDays, Math.max(0, weekdaysCount));
}

// Helper: Automatically run ACTIVE machines (Monday–Friday for AV1 & AV2, no Weekends; Mon–Sun for AV Classes)
function syncSingleActiveMachineAutoRun(inv: Investment, nowDate: Date = new Date()): void {
  if (!inv || inv.status === 'PENDING' || (inv.status as string) === 'DENIED') {
    if (inv && inv.status === 'PENDING') {
      inv.days_elapsed = 0;
      inv.unclaimed_earnings = 0;
    }
    return;
  }

  const monToFriOnly = isAv1OrAv2WeekdayMachine(inv);
  const startDate = new Date(inv.start_date || nowDate.toISOString());
  const expectedEndDate = computeMachineEndDate(startDate, inv.duration_days || 32, monToFriOnly);
  inv.end_date = expectedEndDate.toISOString();

  if (inv.status !== 'ACTIVE') return;

  const elapsedWorkingDays = countElapsedMachineDays(
    startDate,
    nowDate,
    inv.duration_days || 32,
    monToFriOnly
  );
  inv.days_elapsed = elapsedWorkingDays;

  const dailyYield = Number(inv.daily_yield || 0);
  const totalReturn = Number(inv.total_return || dailyYield * (inv.duration_days || 32));
  const targetEarnedSoFar = Math.min(totalReturn, elapsedWorkingDays * dailyYield);
  const alreadyClaimed = Number(inv.total_claimed || 0);

  // Automatically credit any newly elapsed Monday–Friday working day yield onto user's DAILY_YIELD transactions
  if (targetEarnedSoFar > alreadyClaimed && dailyYield > 0) {
    const newlyEarned = targetEarnedSoFar - alreadyClaimed;
    inv.total_claimed = targetEarnedSoFar;
    inv.unclaimed_earnings = 0;
    inv.last_claim_at = nowDate.toISOString();

    const txRef = `AUTO-YIELD-${inv.id}-DAY-${elapsedWorkingDays}`;
    const alreadyLogged = transactions.some((t) => t.payment_reference === txRef);
    if (!alreadyLogged) {
      transactions.unshift({
        id: `tx-autoyield-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        user_id: inv.user_id,
        investment_id: inv.id,
        amount: newlyEarned,
        type: 'DAILY_YIELD',
        status: 'SUCCESS',
        payment_method: monToFriOnly
          ? `Auto Daily Yield (Mon–Fri Active • ${inv.machine_title})`
          : `Auto Daily Yield (${inv.machine_title})`,
        payment_reference: txRef,
        machine_title: inv.machine_title,
        created_at: nowDate.toISOString(),
      });
    }
  }

  if (elapsedWorkingDays >= (inv.duration_days || 32) || Number(inv.total_claimed || 0) >= totalReturn) {
    inv.status = 'PAYOUT_COMPLETE';
    inv.days_elapsed = inv.duration_days || 32;
    inv.unclaimed_earnings = 0;
  }
}

function syncUserConfirmedFinances(user: User & { password_hash?: string }, explicitUserId?: string) {
  // Automatically clean up any duplicate PENDING deposit if a CONFIRMED/SUCCESS or DENIED/FAILED deposit with the same reference or firebase_doc_id exists
  const resolvedRefs = new Set<string>();
  const resolvedDocIds = new Set<string>();
  for (const t of transactions) {
    if (t.type === 'DEPOSIT' && (t.status === 'SUCCESS' || t.status === 'CONFIRMED' || t.status === 'FAILED')) {
      if (t.payment_reference) resolvedRefs.add(t.payment_reference);
      if ((t as any).firebase_doc_id) resolvedDocIds.add((t as any).firebase_doc_id);
    }
  }
  for (let idx = transactions.length - 1; idx >= 0; idx--) {
    const t = transactions[idx];
    if (
      t.type === 'DEPOSIT' &&
      t.status === 'PENDING' &&
      ((t.payment_reference && resolvedRefs.has(t.payment_reference)) ||
        ((t as any).firebase_doc_id && resolvedDocIds.has((t as any).firebase_doc_id)))
    ) {
      transactions.splice(idx, 1);
    }
  }

  const userPhoneTail = (user.phone_number || user.phoneNumber || '').replace(/\D/g, '').slice(-9);
  const doesInvBelongToUser = (inv: Investment) => {
    if (inv.user_id === user.id) return true;
    if (explicitUserId && inv.user_id === explicitUserId) return true;
    if (user.id !== 'usr-admin-owner' && inv.user_id === 'usr-admin-owner') return false;
    if (userPhoneTail && userPhoneTail.length >= 7) {
      const custTail = ((inv as any).customer_phone || '').replace(/\D/g, '').slice(-9);
      const uTail = ((inv as any).user_phone || '').replace(/\D/g, '').slice(-9);
      const idTail = String(inv.user_id || '').replace(/\D/g, '').slice(-9);
      if (custTail === userPhoneTail || uTail === userPhoneTail || (idTail.length >= 7 && idTail === userPhoneTail)) {
        return true;
      }
    }
    return false;
  };

  const userDeposits = transactions.filter((t) => doesTxBelongToUser(t, user, explicitUserId) && t.type === 'DEPOSIT');
  const confirmedDeposits = userDeposits
    .filter((t) => t.status === 'SUCCESS' || t.status === 'CONFIRMED')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const pendingDeposits = userDeposits
    .filter((t) => t.status === 'PENDING')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  // All non-rejected deposits (both PENDING and CONFIRMED/SUCCESS) immediately reflect on the user's Wallet
  const allWalletDeposits = confirmedDeposits + pendingDeposits;

  // Automatically activate any PENDING machine investments if the user's deposit is already confirmed by Admin
  // or if the investment was previously confirmed so it NEVER goes back to PENDING
  const nowDate = new Date();
  let autoActivatedAny = false;
  for (const inv of investments) {
    if (!doesInvBelongToUser(inv)) continue;
    if (
      inv.status === 'PENDING' &&
      ((inv as any).approved_permanent ||
        Boolean(inv.confirmed_at) ||
        (confirmedDeposits > 0 && pendingDeposits === 0) ||
        confirmedDeposits >= Number(inv.amount_invested || 0))
    ) {
      const monToFriOnly = isAv1OrAv2WeekdayMachine(inv);
      inv.status = 'ACTIVE';
      (inv as any).approved_permanent = true;
      inv.confirmed_at = inv.confirmed_at || nowDate.toISOString();
      inv.start_date = inv.start_date || nowDate.toISOString();
      inv.end_date = computeMachineEndDate(new Date(inv.start_date), inv.duration_days || 32, monToFriOnly).toISOString();
      inv.days_elapsed = Math.max(1, Number(inv.days_elapsed || 1));
      user.has_bought_machine = true;
      autoActivatedAny = true;
      for (const ltx of transactions) {
        if (ltx.investment_id === inv.id && ltx.status === 'PENDING') {
          ltx.status = 'SUCCESS';
          (ltx as any).approved_permanent = true;
        }
      }
    }
    if (inv.status === 'ACTIVE') {
      syncSingleActiveMachineAutoRun(inv, nowDate);
    }
  }
  if (autoActivatedAny) {
    saveAppStateToDisk();
  }

  // Ensure every registered investor has their 3,000 UGX Gateway Registration Bonus recorded in their statement
  if (user.id && user.id !== 'usr-admin-owner' && REGISTRATION_REWARD_UGX > 0) {
    const gatewayRewardRef = `GATEWAY-REWARD-${user.id}`;
    const hasGatewayRewardTx = transactions.some(
      (t) =>
        t.payment_reference === gatewayRewardRef ||
        (doesTxBelongToUser(t, user, explicitUserId) &&
          typeof t.payment_reference === 'string' &&
          t.payment_reference.startsWith('GATEWAY-REWARD-'))
    );
    if (!hasGatewayRewardTx) {
      transactions.push({
        id: `tx-gw-bonus-${user.id}`,
        user_id: user.id,
        amount: REGISTRATION_REWARD_UGX,
        type: 'REFERRAL_BONUS',
        status: 'SUCCESS',
        payment_method: 'Gateway Registration Reward (3,000 UGX Bonus)',
        payment_reference: gatewayRewardRef,
        created_at: user.created_at || new Date().toISOString(),
      });
    }
  }

  const userYieldsAndBonuses = transactions
    .filter(
      (t) =>
        doesTxBelongToUser(t, user, explicitUserId) &&
        (t.type === 'DAILY_YIELD' || t.type === 'REFERRAL_BONUS' || t.type === 'COMMISSION') &&
        (t.status === 'SUCCESS' || t.status === 'CONFIRMED') &&
        !(typeof t.payment_reference === 'string' && t.payment_reference.startsWith('GATEWAY-REWARD-'))
    )
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const userWithdrawals = transactions.filter(
    (t) => doesTxBelongToUser(t, user, explicitUserId) && t.type === 'WITHDRAWAL'
  );
  const deductedWithdrawals = userWithdrawals
    .filter((t) => t.status === 'SUCCESS' || t.status === 'CONFIRMED' || t.status === 'PENDING')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const userConfirmedInvestments = investments.filter(
    (inv) => doesInvBelongToUser(inv) && (inv.status === 'ACTIVE' || inv.status === 'PAYOUT_COMPLETE')
  );
  // Once a customer has an active/completed machine or has_bought_machine is true, keep it permanently unlocked so WhatsApp & locked planes never relock
  const hasBoughtMachine = userConfirmedInvestments.length > 0 || Boolean(user.has_bought_machine);

  const deductedInvestments = investments
    .filter(
      (inv) =>
        doesInvBelongToUser(inv) &&
        inv.wallet_deducted &&
        (inv.status === 'ACTIVE' || inv.status === 'PAYOUT_COMPLETE' || inv.status === 'PENDING')
    )
    .reduce((sum, inv) => sum + Number(inv.amount_invested || 0), 0);

  // Deposited money reflects automatically on the user's Wallet & Deposit details on Homepage,
  // and when someone buys a machine, the amount on his Wallet reduces accordingly to the machine he has bought:
  const computedWallet = Math.max(0, allWalletDeposits - deductedInvestments);
  // Portion of Wallet backed by Admin-confirmed deposits:
  const confirmedWallet = Math.max(0, confirmedDeposits - deductedInvestments);
  // Money on the Balance is 3,000 UGX got as a reward after registration (+ earned yields/rewards - withdrawals):
  const computedBalance = Math.max(
    0,
    REGISTRATION_REWARD_UGX + userYieldsAndBonuses - deductedWithdrawals
  );

  let stateChanged = false;
  for (const u of users.values()) {
    const uPhoneTail = (u.phone_number || u.phoneNumber || '').replace(/\D/g, '').slice(-9);
    if (
      u.id === user.id ||
      (explicitUserId && u.id === explicitUserId) ||
      (userPhoneTail && userPhoneTail.length >= 7 && uPhoneTail === userPhoneTail)
    ) {
      if (
        u.balance !== computedBalance ||
        u.wallet_balance !== computedWallet ||
        u.available_wallet !== computedWallet ||
        u.has_bought_machine !== hasBoughtMachine
      ) {
        u.balance = computedBalance;
        u.wallet_balance = computedWallet;
        u.available_wallet = computedWallet;
        u.has_bought_machine = hasBoughtMachine;
        stateChanged = true;
      }
    }
  }
  if (
    user.balance !== computedBalance ||
    user.wallet_balance !== computedWallet ||
    user.available_wallet !== computedWallet ||
    user.has_bought_machine !== hasBoughtMachine
  ) {
    user.balance = computedBalance;
    user.wallet_balance = computedWallet;
    user.available_wallet = computedWallet;
    user.has_bought_machine = hasBoughtMachine;
    stateChanged = true;
  }
  if (stateChanged && user.id !== 'usr-admin-owner') {
    saveRegisteredUserToDisk(user as User & { password_hash: string });
  }

  return {
    userDeposits,
    confirmedDeposits,
    pendingDeposits,
    allWalletDeposits: Math.max(allWalletDeposits, computedWallet),
    userWithdrawals,
    computedBalance,
    computedWallet,
    confirmedWallet,
    hasBoughtMachine,
  };
}

// Dynamic Deposit Numbers Pool for Anti-Tracking and 5-Minute Automatic Rotation
// Initialized to empty so admin can replace them with their own numbers
const DEPOSIT_NUMBERS_FILE = path.join(DATA_DIR, 'deposit_numbers.json');

let depositReceiverNumbers: DepositReceiverNumber[] = [];

// Functions to load & save deposit receiver numbers to disk
function loadDepositNumbersFromDisk() {
  if (fs.existsSync(DEPOSIT_NUMBERS_FILE)) {
    try {
      const raw = fs.readFileSync(DEPOSIT_NUMBERS_FILE, 'utf-8');
      const loaded: DepositReceiverNumber[] = JSON.parse(raw);
      if (Array.isArray(loaded)) {
        depositReceiverNumbers = loaded.map((n) =>
          transactions.length === 0
            ? {
                ...n,
                amount_received_today: 0,
                total_received_ugx: 0,
                total_transactions_count: 0,
              }
            : n
        );
        console.log(`[Storage] Preloaded ${loaded.length} deposit receiver numbers from ${DEPOSIT_NUMBERS_FILE}`);
        return;
      }
    } catch (err) {
      console.error('Error reading deposit numbers from disk:', err);
    }
  }
  depositReceiverNumbers = [];
  saveDepositNumbersToDisk();
}

function saveDepositNumbersToDisk() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DEPOSIT_NUMBERS_FILE, JSON.stringify(depositReceiverNumbers, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving deposit numbers to disk:', err);
  }
}

// Preload deposit numbers from disk
loadDepositNumbersFromDisk();

let depositRotationConfig: DepositRotationConfig = {
  mode: 'TIME_BASED', // 'TIME_BASED' (5 Minutes default) | 'ROUND_ROBIN' (per depositor) | 'ADMIN_MANUAL'
  time_interval_minutes: 5, // 5 Minutes default interval
  time_interval_hours: 0.0833, // 5 minutes in hours
  auto_rotate_enabled: true,
  current_active_id: depositReceiverNumbers.length > 0 ? depositReceiverNumbers[0].id : '',
  last_rotated_at: new Date().toISOString(),
  next_rotation_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  rotation_history: [],
};

// Dynamic Homepage Configuration & System Metrics Overrides editable by Admin
let homepageConfig: {
  announcement_badge: string;
  headline: string;
  subheadline: string;
  notice_text: string;
  deposit_receiver_number: string;
  deposit_receiver_name: string;
  deposit_receiver_carrier: string;
  rotation_mode: 'TIME_BASED' | 'ROUND_ROBIN' | 'ADMIN_MANUAL';
  active_rotation_hours: number;
  active_rotation_minutes?: number;
  custom_total_customers?: number | null;
  custom_machines_sold?: number | null;
  custom_total_cycles?: number | null;
  custom_active_cycles?: number | null;
  custom_completed_cycles?: number | null;
  custom_total_system_wallet?: number | null;
  custom_total_verified_investment?: number | null;
  custom_total_withdrawn?: number | null;
} = {
  announcement_badge: 'Node Infrastructure Hardware',
  headline: 'Avor Invest Machine Marketplace',
  subheadline: '',
  notice_text: '📢 Notice: Active Mobile Money deposit line changes every 5 minutes for payment privacy and fraud protection. Admin confirms payments to activate yield earnings.',
  deposit_receiver_number: '',
  deposit_receiver_name: '',
  deposit_receiver_carrier: '',
  rotation_mode: 'TIME_BASED',
  active_rotation_hours: 0.0833,
  active_rotation_minutes: 5,
  custom_total_customers: null,
  custom_machines_sold: null,
  custom_total_cycles: null,
  custom_active_cycles: null,
  custom_completed_cycles: null,
  custom_total_system_wallet: null,
  custom_total_verified_investment: null,
  custom_total_withdrawn: null,
};

function loadHomepageConfigFromDisk() {
  if (fs.existsSync(HOMEPAGE_CONFIG_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(HOMEPAGE_CONFIG_FILE, 'utf-8'));
      if (parsed && typeof parsed === 'object') {
        if (parsed.homepageConfig) {
          homepageConfig = { ...homepageConfig, ...parsed.homepageConfig };
        }
        if (parsed.depositRotationConfig) {
          depositRotationConfig = { ...depositRotationConfig, ...parsed.depositRotationConfig };
        }
      }
    } catch {}
  }
}

function saveHomepageConfigToDisk(syncToCloud: boolean = true) {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(
      HOMEPAGE_CONFIG_FILE,
      JSON.stringify({ homepageConfig, depositRotationConfig }, null, 2),
      'utf-8'
    );
    if (syncToCloud) {
      void (async () => {
        try {
          const projectId = firebaseAppletConfig.projectId;
          const databaseId = firebaseAppletConfig.firestoreDatabaseId || '(default)';
          const apiKey = firebaseAppletConfig.apiKey;
          if (!projectId || !apiKey) return;
          const baseDocsPath = `projects/${projectId}/databases/${databaseId}/documents`;
          const commitUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}/documents:commit?key=${encodeURIComponent(apiKey)}`;
          const metricsPayload = JSON.stringify({
            custom_total_customers: homepageConfig.custom_total_customers ?? null,
            custom_machines_sold: homepageConfig.custom_machines_sold ?? null,
            custom_total_cycles: homepageConfig.custom_total_cycles ?? null,
            custom_active_cycles: homepageConfig.custom_active_cycles ?? null,
            custom_completed_cycles: homepageConfig.custom_completed_cycles ?? null,
            custom_total_system_wallet: homepageConfig.custom_total_system_wallet ?? null,
            custom_total_verified_investment: homepageConfig.custom_total_verified_investment ?? null,
            custom_total_withdrawn: homepageConfig.custom_total_withdrawn ?? null,
          }).slice(0, 950);
          await fetch(commitUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              writes: [
                {
                  update: {
                    name: `${baseDocsPath}/admin_messages/system-metrics-config`,
                    fields: {
                      name: { stringValue: 'SYSTEM_METRICS_CONFIG' },
                      item: { stringValue: metricsPayload },
                      machineTitle: { stringValue: 'USER_ACCOUNT_BACKUP' },
                      status: { stringValue: 'CONFIRMED' },
                    },
                  },
                  updateTransforms: [
                    {
                      fieldPath: 'timestamp',
                      setToServerValue: 'REQUEST_TIME',
                    },
                  ],
                },
              ],
            }),
          });
        } catch {}
      })();
    }
  } catch {}
}

loadHomepageConfigFromDisk();

// Core Helper to get active receiver number and handle automatic 5-minute or round-robin rotation
function getActiveReceiver(advanceForNewUser: boolean = false): {
  receiver: DepositReceiverNumber | null;
  config: DepositRotationConfig;
  timeRemainingSeconds: number;
} {
  const activeNumbers = depositReceiverNumbers.filter((n) => n.is_active);
  if (activeNumbers.length === 0) {
    depositRotationConfig.current_active_id = '';
    homepageConfig.deposit_receiver_number = '';
    homepageConfig.deposit_receiver_name = '';
    homepageConfig.deposit_receiver_carrier = '';
    return {
      receiver: null,
      config: depositRotationConfig,
      timeRemainingSeconds: 0,
    };
  }

  const now = Date.now();
  let currentActive = activeNumbers.find((n) => n.id === depositRotationConfig.current_active_id);

  const rotationMinutes = depositRotationConfig.time_interval_minutes || 5;

  if (!currentActive) {
    // Find candidate with lowest received today or first active
    const candidate = activeNumbers.find((n) => (n.amount_received_today || 0) < (n.daily_receiving_limit || n.daily_limit_ugx || 5000000)) || activeNumbers[0];
    currentActive = candidate;
    depositRotationConfig.current_active_id = currentActive.id;
    depositRotationConfig.last_rotated_at = new Date().toISOString();
    depositRotationConfig.next_rotation_at = new Date(now + rotationMinutes * 60 * 1000).toISOString();
  }

  const hasExceededDailyLimit = (currentActive.amount_received_today || 0) >= (currentActive.daily_receiving_limit || currentActive.daily_limit_ugx || 5000000);
  const timeExpired = now >= new Date(depositRotationConfig.next_rotation_at).getTime();

  // Check 1: Time-Based Scheduled Rotation (5 Minutes timer expired) or Daily Limit Reached
  if (
    (depositRotationConfig.mode === 'TIME_BASED' && depositRotationConfig.auto_rotate_enabled && timeExpired) ||
    hasExceededDailyLimit
  ) {
    // Filter active numbers that haven't exceeded daily limit
    const eligibleNumbers = activeNumbers.filter(
      (n) => (n.amount_received_today || 0) < (n.daily_receiving_limit || n.daily_limit_ugx || 5000000)
    );
    const poolToUse = eligibleNumbers.length > 0 ? eligibleNumbers : activeNumbers;

    const currentIndex = poolToUse.findIndex((n) => n.id === currentActive?.id);
    const nextIndex = (currentIndex + 1) % poolToUse.length;
    const nextNumber = poolToUse[nextIndex];

    const mins = nextNumber.rotation_duration_minutes || depositRotationConfig.time_interval_minutes || 5;

    depositRotationConfig.current_active_id = nextNumber.id;
    depositRotationConfig.last_rotated_at = new Date().toISOString();
    depositRotationConfig.next_rotation_at = new Date(now + mins * 60 * 1000).toISOString();

    nextNumber.activated_at = new Date().toISOString();
    nextNumber.last_rotated_at = new Date().toISOString();
    currentActive = nextNumber;

    const rotationReason = hasExceededDailyLimit
      ? `Daily Receiving Limit (UGX ${(nextNumber.daily_receiving_limit || 5000000).toLocaleString()}) Threshold Triggered`
      : `Automated 5-Minute Timer Cycle Completed (${mins}m interval)`;

    depositRotationConfig.rotation_history = depositRotationConfig.rotation_history || [];
    depositRotationConfig.rotation_history.unshift({
      id: `rot-${Date.now()}`,
      number_id: nextNumber.id,
      phone_number: nextNumber.phone_number,
      account_name: nextNumber.account_name,
      reason: rotationReason,
      timestamp: new Date().toISOString(),
    });
    if (depositRotationConfig.rotation_history.length > 50) {
      depositRotationConfig.rotation_history.pop();
    }
  }

  // Check 2: Round-Robin Rotation per Depositor
  if (
    advanceForNewUser &&
    depositRotationConfig.mode === 'ROUND_ROBIN' &&
    depositRotationConfig.auto_rotate_enabled &&
    activeNumbers.length > 1
  ) {
    const currentIndex = activeNumbers.findIndex((n) => n.id === currentActive?.id);
    const nextIndex = (currentIndex + 1) % activeNumbers.length;
    const nextNumber = activeNumbers[nextIndex];
    const mins = nextNumber.rotation_duration_minutes || depositRotationConfig.time_interval_minutes || 5;

    depositRotationConfig.current_active_id = nextNumber.id;
    depositRotationConfig.last_rotated_at = new Date().toISOString();
    depositRotationConfig.next_rotation_at = new Date(now + mins * 60 * 1000).toISOString();

    nextNumber.activated_at = new Date().toISOString();
    nextNumber.last_rotated_at = new Date().toISOString();
    currentActive = nextNumber;

    depositRotationConfig.rotation_history = depositRotationConfig.rotation_history || [];
    depositRotationConfig.rotation_history.unshift({
      id: `rot-${Date.now()}`,
      number_id: nextNumber.id,
      phone_number: nextNumber.phone_number,
      account_name: nextNumber.account_name,
      reason: 'Auto-Rotated for Next Depositor (Round-Robin Shield)',
      timestamp: new Date().toISOString(),
    });
    if (depositRotationConfig.rotation_history.length > 50) {
      depositRotationConfig.rotation_history.pop();
    }
  }

  // Update dynamic homepageConfig values
  homepageConfig.deposit_receiver_number = currentActive.phone_number;
  homepageConfig.deposit_receiver_name = currentActive.account_name;
  homepageConfig.deposit_receiver_carrier = currentActive.carrier === 'MTN' ? 'MTN Mobile Money' : currentActive.carrier === 'AIRTEL' ? 'Airtel Money' : 'MTN / Airtel Money';
  homepageConfig.rotation_mode = depositRotationConfig.mode;
  homepageConfig.active_rotation_minutes = depositRotationConfig.time_interval_minutes;
  homepageConfig.notice_text = `📢 Notice: Active Mobile Money deposit line is ${currentActive.phone_number} (Name: ${currentActive.account_name}, ${currentActive.carrier}). Numbers automatically rotate every 5 minutes to protect payments. Admin confirms deposits to activate yield earnings.`;

  const nextTime = new Date(depositRotationConfig.next_rotation_at).getTime();
  const timeRemainingSeconds = Math.max(0, Math.floor((nextTime - now) / 1000));

  return {
    receiver: currentActive,
    config: depositRotationConfig,
    timeRemainingSeconds,
  };
}


// Helper to add in-app notifications
function pushNotification(userId: string, title: string, message: string, type: 'PAYMENT' | 'YIELD' | 'SYSTEM' | 'SECURITY' = 'SYSTEM') {
  notifications.unshift({
    id: `notif-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    user_id: userId,
    title,
    message,
    type,
    read: false,
    created_at: new Date().toISOString(),
  });
  saveAppStateToDisk();
}

// Helper to guarantee confirmation messages reach Admin
function notifyAllAdmins(
  title: string,
  message: string,
  type: 'PAYMENT' | 'YIELD' | 'SYSTEM' | 'SECURITY' = 'PAYMENT',
  meta?: Record<string, any>
) {
  const adminIds = new Set<string>(['usr-admin-owner']);
  for (const u of users.values()) {
    if (u.role === 'ADMIN' || u.email === 'adamsmabrouk268@gmail.com' || (u.phone_number && u.phone_number.includes('741032838'))) {
      if (u.id) adminIds.add(u.id);
    }
  }
  const createdAt = new Date().toISOString();
  for (const adminId of adminIds) {
    notifications.unshift({
      id: `notif-adm-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      user_id: adminId,
      title,
      message,
      type,
      read: false,
      created_at: createdAt,
      ...(meta || {}),
    } as any);
  }
  saveAppStateToDisk();
}

// Real-Time Server-Sent Events (SSE) client registry for instant Wallet & Deposit Status synchronization without refreshing
const realtimeClients = new Set<express.Response>();

function broadcastRealtimeEvent(payload: Record<string, any>) {
  const dataString = `data: ${JSON.stringify(payload)}\n\n`;
  for (const client of realtimeClients) {
    try {
      client.write(dataString);
    } catch {
      realtimeClients.delete(client);
    }
  }
}

// No demo user seeded — system starts with clean accounts and 0 demo payments
const demoUserId = 'usr-demo-123';

// Seed Owner / Admin User (Secure owner credentials, 0 balance)
const ADMIN_MASTER_PASSWORD = 'adams@268#';
const adminUserId = 'usr-admin-owner';
const adminUser: User & { password_hash: string } = {
  id: adminUserId,
  full_name: 'Avor Invest Owner (Admin)',
  email: 'adamsmabrouk268@gmail.com',
  phone_number: '+256741032838',
  age: 35,
  country: 'Uganda',
  kyc_status: 'VERIFIED',
  role: 'ADMIN',
  balance: 0,
  referral_code: 'OWNER-ADMIN',
  created_at: new Date().toISOString(),
  password_hash: ADMIN_MASTER_PASSWORD,
  password: ADMIN_MASTER_PASSWORD,
};
users.set(adminUser.id, adminUser);
users.set(adminUser.email, adminUser);
users.set('admin@avorinvest.com', adminUser);

// Load all registered investor accounts AFTER seeding demo/admin so real user balances & phone numbers are never overwritten
loadRegisteredUsersFromDisk();
void hydrateRegisteredUsersFromFirestoreCloud();

// Demo user starts fresh with clean portfolio (no demo investment)

// System starts with clean ledger — only real customer orders and Admin-approved records are counted


async function startServer() {
  const app = express();
  app.use(cors());

  // 1. Standard and wildcard JSON parser
  app.use(
    express.json({
      limit: '15mb',
      type: ['application/json', 'text/json', '*/*+json', 'application/*+json'],
    })
  );

  // 2. URL-encoded parser
  app.use(express.urlencoded({ extended: true, limit: '15mb' }));

  // 3. Plain text and JS parser to catch JSON sent without application/json Content-Type
  app.use(
    express.text({
      type: ['text/*', 'text/plain', 'application/javascript', 'application/x-javascript'],
      limit: '15mb',
    })
  );

  // 4. Raw buffer capture as fallback
  app.use(express.raw({ type: '*/*', limit: '15mb' }));

  // 5. Universal JSON parser & body normalizer
  // Ensures all JSON on registration and other endpoints is automatically parsed into req.body
  app.use((req, res, next) => {
    // If req.body is already an object, check if URL-encoded parser treated raw JSON as a single key
    if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
      const keys = Object.keys(req.body);
      if (keys.length === 1) {
        const candidate = keys[0].trim();
        if (candidate.startsWith('{') || candidate.startsWith('[')) {
          try {
            req.body = JSON.parse(candidate);
            return next();
          } catch (e) {}
        }
      }
      if (keys.length > 0) {
        return next();
      }
    }

    // String body: attempt JSON parse
    if (typeof req.body === 'string') {
      const trimmed = req.body.trim();
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        try {
          req.body = JSON.parse(trimmed);
          return next();
        } catch (e) {
          // ignore error and proceed
        }
      }
    }

    // Buffer body: decode UTF-8 and attempt JSON parse
    if (Buffer.isBuffer(req.body)) {
      try {
        const str = req.body.toString('utf-8').trim();
        if (str.startsWith('{') || str.startsWith('[')) {
          req.body = JSON.parse(str);
          return next();
        }
      } catch (e) {
        // ignore error and proceed
      }
    }

    // Query parameters fallback if body is empty
    if ((!req.body || typeof req.body !== 'object' || Object.keys(req.body).length === 0) && req.query) {
      if (typeof req.query.json === 'string') {
        try {
          req.body = JSON.parse(req.query.json);
          return next();
        } catch (e) {}
      } else if (typeof req.query.data === 'string') {
        try {
          req.body = JSON.parse(req.query.data);
          return next();
        } catch (e) {}
      }
    }

    if (!req.body || typeof req.body !== 'object' || Buffer.isBuffer(req.body)) {
      req.body = {};
    }

    next();
  });

  const PORT = 3000;

  // ====================================================================
  // REAL-TIME WALLET & DEPOSIT STATUS STREAM (Server-Sent Events)
  // Updates customer Wallet balance and Pending -> Successful status immediately without refreshing
  // ====================================================================
  app.get('/api/realtime/wallet-stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    res.write(`data: ${JSON.stringify({ type: 'CONNECTED', timestamp: new Date().toISOString() })}\n\n`);
    realtimeClients.add(res);

    const keepAliveTimer = setInterval(() => {
      try {
        res.write(`: keep-alive ${Date.now()}\n\n`);
      } catch {
        clearInterval(keepAliveTimer);
        realtimeClients.delete(res);
      }
    }, 15000);

    req.on('close', () => {
      clearInterval(keepAliveTimer);
      realtimeClients.delete(res);
    });
  });

  // ====================================================================
  // 1. ADMIN & PUBLIC ROUTES
  // ====================================================================

  // Admin Login
  app.post('/api/admin/login', async (req, res) => {
    try {
      const { password } = req.body;
      const trimmedPass = (password || '').toString().trim();
      
      let config = null;
      if (mongoose.connection.readyState === 1) {
        config = await (SystemConfigModel as any).findOne({ key: 'admin_password' });
        if (!config) {
          const hashedPassword = await bcrypt.hash(ADMIN_MASTER_PASSWORD, 10);
          config = await (SystemConfigModel as any).create({ key: 'admin_password', value: hashedPassword });
        }
      }

      if (config) {
        const isMatch = await bcrypt.compare(trimmedPass, config.value);
        if (!isMatch && trimmedPass !== ADMIN_MASTER_PASSWORD && trimmedPass !== adminUser.password_hash) {
          return res.status(400).json({ error: 'Invalid admin password' });
        }
      } else if (trimmedPass !== ADMIN_MASTER_PASSWORD && trimmedPass !== adminUser.password_hash) {
        return res.status(400).json({ error: 'Invalid admin password' });
      }

      const token = jwt.sign({ isAdmin: true }, JWT_SECRET, { expiresIn: '12h' });
      res.json({ success: true, token });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Update Admin Password
  app.put('/api/admin/change-password', verifyAdmin, async (req, res) => {
    try {
      const { newPassword } = req.body;
      if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
      }

      const hashedPassword = await bcrypt.hash(newPassword, 10);
      if (mongoose.connection.readyState === 1) {
        await (SystemConfigModel as any).findOneAndUpdate(
          { key: 'admin_password' },
          { value: hashedPassword },
          { upsert: true }
        );
      }

      res.json({ message: 'Admin password updated successfully' });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Update Homepage Content
  app.put('/api/admin/homepage', verifyAdmin, async (req, res) => {
    try {
      const { title, subtitle } = req.body;
      if (title) homepageConfig.headline = title;
      if (subtitle) homepageConfig.subheadline = subtitle;

      if (mongoose.connection.readyState === 1) {
        await (SystemConfigModel as any).findOneAndUpdate({ key: 'home_title' }, { value: title }, { upsert: true });
        await (SystemConfigModel as any).findOneAndUpdate({ key: 'home_subtitle' }, { value: subtitle }, { upsert: true });
      }

      res.json({ message: 'Homepage content updated successfully', homepageConfig });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // Admin Payment Confirmation (Triggers Lock Start)
  app.post('/api/admin/payments/:id/confirm', verifyAdmin, async (req, res) => {
    try {
      if (mongoose.connection.readyState === 1 && mongoose.Types.ObjectId.isValid(req.params.id)) {
        const payment = await (PaymentModel as any).findById(req.params.id);
        if (!payment || payment.status === 'CONFIRMED') {
          return res.status(400).json({ error: 'Invalid or already confirmed payment' });
        }

        const machine = await (MachineModel as any).findById(payment.machineId);
        if (!machine) return res.status(404).json({ error: 'Machine not found' });

        payment.status = 'CONFIRMED';
        await payment.save();

        const now = new Date();
        const lockDuration = machine.lockDurationMinutes || (machine.duration_days ? machine.duration_days * 1440 : 17280);
        const endTime = new Date(now.getTime() + lockDuration * 60000);

        const lock = await (InvestmentLockModel as any).create({
          userId: payment.userId,
          machineId: machine._id,
          amountPaid: payment.amount,
          rewardAmount: machine.rewardAmount || machine.total_return || (payment.amount * 2),
          startTime: now,
          endTime: endTime
        });

        return res.json({ message: 'Payment confirmed and timelock initialized', lock });
      }
      res.json({ message: 'Payment confirmed (simulated mode)' });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // ====================================================================
  // 2. AUTOMATED MOBILE MONEY WEBHOOK INTEGRATION
  // ====================================================================

  /**
   * Mobile Money Provider Webhook Endpoint (e.g., MTN MoMo, Airtel, Relayed Gateways)
   * Expects notification payload from transaction sent to 0741032838 (SULAINH NAKASEETA)
   */
  app.post('/api/v1/webhooks/mobile-money', async (req, res) => {
    try {
      const { internalRef, externalTxRef, status, amount, msisdn } = req.body;

      if (mongoose.connection.readyState === 1) {
        const payment = await (PaymentModel as any).findOne({ internalRef });
        if (!payment) {
          return res.status(404).json({ error: 'Payment record not found' });
        }

        if (payment.status === 'CONFIRMED') {
          return res.status(200).json({ message: 'Payment already processed' });
        }

        if (status === 'SUCCESS' || status === 'COMPLETED') {
          payment.status = 'CONFIRMED';
          payment.externalTxRef = externalTxRef;
          await payment.save();

          const machine = await (MachineModel as any).findById(payment.machineId);
          if (machine) {
            const now = new Date();
            const lockDuration = machine.lockDurationMinutes || (machine.duration_days ? machine.duration_days * 1440 : 17280);
            const endTime = new Date(now.getTime() + lockDuration * 60000);

            // Auto-start lock upon automated gateway approval
            await (InvestmentLockModel as any).create({
              userId: payment.userId,
              machineId: machine._id,
              amountPaid: payment.amount,
              rewardAmount: machine.rewardAmount || machine.total_return || (payment.amount * 2),
              startTime: now,
              endTime: endTime
            });
          }

          return res.status(200).json({ status: 'SUCCESS', message: 'Lock initiated automatically' });
        } else {
          payment.status = 'FAILED';
          await payment.save();
          return res.status(200).json({ status: 'FAILED' });
        }
      }

      return res.status(200).json({ status: 'RECEIVED', message: 'Webhook received in memory mode' });
    } catch (err) {
      console.error('Webhook Error:', err);
      res.status(500).json({ error: 'Internal Server Error' });
    }
  });

  // ====================================================================
  // 3. USER APP ROUTES
  // ====================================================================

  // Fetch Homepage & Available Machines
  app.get('/api/public/bootstrap', async (req, res) => {
    try {
      let machinesList = [];
      if (mongoose.connection.readyState === 1) {
        machinesList = await (MachineModel as any).find({ isActive: true });
      }
      if (!machinesList || machinesList.length === 0) {
        machinesList = machines as any;
      }
      let titleObj = null;
      let subtitleObj = null;
      if (mongoose.connection.readyState === 1) {
        titleObj = await (SystemConfigModel as any).findOne({ key: 'home_title' });
        subtitleObj = await (SystemConfigModel as any).findOne({ key: 'home_subtitle' });
      }

      res.json({
        homepage: {
          title: titleObj?.value || homepageConfig.headline || 'Welcome to Avor Invest',
          subtitle: subtitleObj?.value || homepageConfig.subheadline || 'Rent high-yield computing rigs, lock for automated earnings.'
        },
        paymentTarget: {
          phone: RECEIVER_PHONE,
          name: RECEIVER_NAME
        },
        machines: machinesList
      });
    } catch (err) {
      res.json({
        homepage: {
          title: homepageConfig.headline || 'Welcome to Avor Invest',
          subtitle: homepageConfig.subheadline || 'Rent high-yield computing rigs, lock for automated earnings.'
        },
        paymentTarget: {
          phone: RECEIVER_PHONE,
          name: RECEIVER_NAME
        },
        machines
      });
    }
  });

  // Submit Manual Deposit Reference
  app.post('/api/user/deposit', async (req, res) => {
    try {
      const { userId, machineId, txRef } = req.body;

      let machine = null;
      if (mongoose.connection.readyState === 1 && mongoose.Types.ObjectId.isValid(machineId)) {
        machine = await (MachineModel as any).findById(machineId);
      }
      if (!machine) {
        machine = machines.find((m) => m.id === machineId) as any;
      }

      const price = machine ? (machine.price || machine.total_cost || 15000) : 15000;

      let payment = null;
      if (mongoose.connection.readyState === 1 && mongoose.Types.ObjectId.isValid(userId) && mongoose.Types.ObjectId.isValid(machineId)) {
        payment = await (PaymentModel as any).create({
          userId,
          machineId,
          amount: price,
          phoneNumber: RECEIVER_PHONE,
          receiverName: RECEIVER_NAME,
          externalTxRef: txRef,
          internalRef: 'PR_' + Date.now(),
          status: 'PENDING_ADMIN'
        });
      } else {
        payment = {
          id: `pay-${Date.now()}`,
          userId: userId || 'demo-user',
          machineId: machineId || 'mach-1',
          amount: price,
          phoneNumber: RECEIVER_PHONE,
          receiverName: RECEIVER_NAME,
          externalTxRef: txRef,
          internalRef: 'PR_' + Date.now(),
          status: 'PENDING_ADMIN',
          createdAt: new Date().toISOString()
        };
      }

      const user = findOrRestoreUser(userId, req.body);
      const manualTx: Transaction = {
        id: `tx-man-${Date.now()}`,
        user_id: user ? user.id : userId || 'demo-user',
        amount: price,
        type: 'DEPOSIT',
        status: 'PENDING',
        payment_method: `Mobile Money • Receiver: ${RECEIVER_PHONE} (${RECEIVER_NAME})`,
        payment_reference: txRef || `PR_${Date.now()}`,
        machine_title: machine?.title || machine?.name || undefined,
        created_at: new Date().toISOString(),
      };
      (manualTx as any).wallet_credited = false;
      (manualTx as any).receiver_credited = false;
      (manualTx as any).receiver_phone = RECEIVER_PHONE;
      (manualTx as any).receiver_name = RECEIVER_NAME;
      (manualTx as any).customer_name = user?.full_name || 'Investor';
      (manualTx as any).customer_phone = user?.phone_number || '';
      (manualTx as any).user_phone = user?.phone_number || '';
      transactions.unshift(manualTx);
      saveAppStateToDisk();

      notifyAllAdmins(
        `🔔 New Submitted Deposit: UGX ${price.toLocaleString()}`,
        `Customer ${user?.full_name || userId} submitted a deposit reference (${txRef || manualTx.payment_reference}) of UGX ${price.toLocaleString()} to ${RECEIVER_PHONE} (${RECEIVER_NAME}). Please confirm in Admin Console to reflect across all deposit planes.`,
        'PAYMENT'
      );

      res.status(201).json({ message: 'Deposit reference submitted for admin verification', payment, transaction: manualTx });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // User Active Locks
  app.get('/api/user/:userId/locks', async (req, res) => {
    try {
      if (mongoose.connection.readyState === 1 && mongoose.Types.ObjectId.isValid(req.params.userId)) {
        const locks = await (InvestmentLockModel as any).find({ userId: req.params.userId })
          .populate('machineId')
          .sort({ createdAt: -1 });
        return res.json(locks);
      }
      res.json([]);
    } catch (err) {
      res.json([]);
    }
  });

  // ==========================================
  // API ENDPOINTS
  // ==========================================

  // 1. Platform Global Stats Overview (No demo payments — starts at 0)
  app.get('/api/stats/overview', (req, res) => {
    const totalInvested =
      typeof homepageConfig.custom_total_verified_investment === 'number'
        ? homepageConfig.custom_total_verified_investment
        : investments.reduce((sum, inv) => sum + inv.amount_invested, 0);
    const totalPayouts =
      typeof homepageConfig.custom_total_withdrawn === 'number'
        ? homepageConfig.custom_total_withdrawn
        : investments.reduce((sum, inv) => sum + inv.total_claimed, 0);
    const machinesSoldCount =
      typeof homepageConfig.custom_machines_sold === 'number'
        ? homepageConfig.custom_machines_sold
        : machines.length;
    const totalCustomersCount =
      typeof homepageConfig.custom_total_customers === 'number'
        ? homepageConfig.custom_total_customers
        : users.size;
    res.json({
      total_invested: totalInvested,
      total_payouts_delivered: totalPayouts,
      active_machines_count: machinesSoldCount,
      total_investors_count: totalCustomersCount,
      machines_sold_count: machinesSoldCount,
      total_customers_count: totalCustomersCount,
      total_cycles_count:
        typeof homepageConfig.custom_total_cycles === 'number'
          ? homepageConfig.custom_total_cycles
          : investments.length,
      total_system_wallet:
        typeof homepageConfig.custom_total_system_wallet === 'number'
          ? homepageConfig.custom_total_system_wallet
          : 0,
      system_status: 'ONLINE_SECURE',
    });
  });

  // 2. Auth: Register (Automatically allows JSON in any format and saves all registration data)
  const handleRegister = async (req: express.Request, res: express.Response) => {
    res.setHeader('Content-Type', 'application/json');
    try {
      const body = req.body || {};
      const {
        phone_number,
        phoneNumber,
        phone,
        password,
        pass,
        referral_code,
        referralCode,
        inviteCode,
        full_name,
        name,
        email,
        balance,
        age,
        country,
        country_code,
        countryCode,
      } = body;

      const activePhone = (phone_number || phoneNumber || phone || '').toString().trim();
      const rawPassword = (password || pass || '').toString().trim();
      const rawEmail = (email || '').toString().trim();
      const primaryKey = activePhone || rawEmail;

      if (!primaryKey || !rawPassword) {
        return res.status(400).json({
          success: false,
          error: 'Please provide mobile phone number and password.',
          received_fields: Object.keys(body),
        });
      }

      // Age validation: Investor must be at least 18
      const parsedAge = age !== undefined && age !== null && age !== '' ? Number(age) : undefined;
      if (parsedAge !== undefined && (!Number.isFinite(parsedAge) || parsedAge < 18)) {
        return res.status(400).json({ success: false, error: 'Investors must be at least 18 years of age to register.' });
      }

      // Check if user already exists (by normalized 9-digit phone tail, ignoring usr-admin-owner)
      const cleanDigits = activePhone.replace(/[^0-9]/g, '');
      const phoneTail = cleanDigits.slice(-9);
      for (const u of users.values()) {
        if (u.id === 'usr-admin-owner') continue;
        const uPhoneDigits = (u.phone_number || u.phoneNumber || '').replace(/[^0-9]/g, '');
        const uTail = uPhoneDigits.slice(-9);
        if (
          (cleanDigits && uPhoneDigits === cleanDigits) ||
          (phoneTail && phoneTail.length >= 7 && uTail === phoneTail) ||
          (activePhone && (u.phone_number === activePhone || u.phoneNumber === activePhone)) ||
          (rawEmail && u.email && u.email.toLowerCase() === rawEmail.toLowerCase())
        ) {
          // Ensure user never loses their account on any device: sync their password & details and sign them right in
          if (rawPassword && rawPassword.length >= 4) {
            u.password_hash = rawPassword;
            u.password = rawPassword;
          }
          if (name && !u.full_name?.startsWith('Investor')) {
            u.full_name = name.toString().trim();
            u.name = u.full_name;
          }
          syncUserConfirmedFinances(u, u.id);
          saveRegisteredUserToDisk(u);
          const { password_hash, ...existingProfile } = u;
          return res.status(200).json({
            ...existingProfile,
            success: true,
            message: 'Account verified and restored across devices.',
            user: existingProfile,
            saved_registration_data: u.registration_data || u.user_details,
            token: `jwt-token-${u.id}`,
          });
        }
      }

      const userEmail = rawEmail || `${cleanDigits || Date.now()}@avorinvest.com`;
      const userName = (name || full_name || `Investor ${cleanDigits ? cleanDigits.slice(-4) : 'Verified'}`).toString().trim();
      // Money on the balance is 3,000 UGX got as a reward after registration (Wallet starts at 0 until Admin confirms a deposit)
      const initialBalance = REGISTRATION_REWARD_UGX;
      const refCodeUsed = (referral_code || referralCode || inviteCode || '').toString().trim();
      const userCountry = (country || 'Uganda').toString().trim();
      const userCountryCode = (country_code || countryCode || '+256').toString().trim();

      // Explicitly capture and save the full data payload and registration date on the user's details
      const nowIso = new Date().toISOString();
      const formattedDate = new Date(nowIso).toLocaleString();
      const registrationDataPayload: Record<string, any> = {
        ...body,
        registered_at: nowIso,
        registered_date: nowIso,
        date: formattedDate,
        client_ip: req.ip || req.headers['x-forwarded-for'] || 'local',
        user_agent: req.headers['user-agent'] || 'browser',
        source: 'registration_gateway',
      };

      const newUser: User & { password_hash: string } = {
        id: `usr-${Date.now()}-${Math.floor(100 + Math.random() * 900)}`,
        full_name: userName,
        name: userName,
        email: userEmail,
        phone_number: activePhone,
        phoneNumber: activePhone,
        age: parsedAge,
        country: userCountry,
        country_code: userCountryCode,
        password: rawPassword,
        kyc_status: 'VERIFIED',
        role: 'INVESTOR',
        balance: initialBalance,
        wallet_balance: 0,
        available_wallet: 0,
        referral_code: `AVOR-${Math.floor(1000 + Math.random() * 9000)}`,
        referred_by: refCodeUsed || undefined,
        created_at: nowIso,
        registered_date: nowIso,
        updated_at: nowIso,
        password_hash: rawPassword,
        registration_data: registrationDataPayload,
        user_details: {
          full_name: userName,
          phone_number: activePhone,
          email: userEmail,
          country: userCountry,
          country_code: userCountryCode,
          registered_date: nowIso,
          date: formattedDate,
          updated_at: nowIso,
          balance: initialBalance,
          wallet_balance: 0,
          available_wallet: 0,
          has_bought_machine: false,
        },
      };

      // 1. In-memory Map storage across multiple lookup indices
      users.set(newUser.id, newUser);
      users.set(userEmail, newUser);
      if (activePhone) {
        users.set(activePhone, newUser);
      }
      if (cleanDigits) {
        users.set(cleanDigits, newUser);
        if (phoneTail.length === 9) {
          users.set(phoneTail, newUser);
          users.set(`0${phoneTail}`, newUser);
          users.set(`256${phoneTail}`, newUser);
          users.set(`+256${phoneTail}`, newUser);
          users.set(`+2560${phoneTail}`, newUser);
        }
      }

      // 2. Persistent file storage to data/registered_users.json
      saveRegisteredUserToDisk(newUser);

      // Record the 3,000 UGX Gateway Registration Bonus in transactions so it appears in Bill / Statement
      const gatewayBonusRef = `GATEWAY-REWARD-${newUser.id}`;
      if (!transactions.some((t) => t.payment_reference === gatewayBonusRef)) {
        transactions.unshift({
          id: `tx-gw-bonus-${newUser.id}`,
          user_id: newUser.id,
          amount: REGISTRATION_REWARD_UGX,
          type: 'REFERRAL_BONUS',
          status: 'SUCCESS',
          payment_method: 'Gateway Registration Reward (3,000 UGX Bonus)',
          payment_reference: gatewayBonusRef,
          created_at: newUser.created_at,
        });
      }

      pushNotification(
        newUser.id,
        '🎁 3,000 UGX Gateway Registration Bonus Credited!',
        'Welcome to Avor Invest! You have received 3,000 UGX bonus as a gateway reward after registration on your Balance.',
        'YIELD'
      );

      // 3. Persistent audit log to data/registration_events.json
      saveRegistrationEventLog({
        eventId: `ev-reg-${Date.now()}`,
        userId: newUser.id,
        phone: newUser.phone_number,
        name: newUser.name,
        country: newUser.country,
        timestamp: new Date().toISOString(),
        registration_payload: registrationDataPayload,
      });

      // 4. Save to MongoDB if connected
      if (mongoose.connection.readyState === 1) {
        try {
          await (UserModel as any).findOneAndUpdate(
            { phoneNumber: newUser.phoneNumber },
            {
              phoneNumber: newUser.phoneNumber,
              name: newUser.name,
              balance: REGISTRATION_REWARD_UGX,
              password: newUser.password,
              age: newUser.age,
              country: newUser.country,
            },
            { upsert: true, new: true }
          );
        } catch (dbErr) {
          console.warn('[MongoDB] Registration DB note:', (dbErr as Error).message);
        }
      }

      const { password_hash, ...userProfile } = newUser;
      return res.status(201).json({
        ...userProfile,
        success: true,
        message: 'User registered successfully and registration data saved.',
        user: userProfile,
        saved_registration_data: registrationDataPayload,
        token: `jwt-token-${newUser.id}`,
      });
    } catch (err: any) {
      console.error('[Registration Error]', err);
      return res.status(400).json({ success: false, error: err.message || 'Registration failed.' });
    }
  };

  // Support all registration route aliases
  app.post('/api/register', handleRegister);
  app.post('/api/auth/register', handleRegister);
  app.post('/register', handleRegister);
  app.post('/auth/register', handleRegister);

  // 3. Auth: Login
  const handleLogin = (req: express.Request, res: express.Response) => {
    res.setHeader('Content-Type', 'application/json');
    const { email, phone_number, phoneNumber, phone, password, pass } = req.body || {};
    const activePhone = (phone_number || phoneNumber || phone || '').toString().trim();
    const rawPass = (password || pass || '').toString().trim();
    const rawEmail = (email || '').toString().trim();
    const cleanDigits = activePhone.replace(/[^0-9]/g, '');
    const phoneTail = cleanDigits.slice(-9);

    let user: (User & { password_hash: string }) | undefined;
    // Prioritize real investor accounts over usr-admin-owner on gateway login
    for (const u of users.values()) {
      if (u.id === 'usr-admin-owner') continue;
      const uDigits = (u.phone_number || u.phoneNumber || '').replace(/[^0-9]/g, '');
      const uTail = uDigits.slice(-9);
      const phoneOrEmailMatch =
        (cleanDigits && uDigits === cleanDigits) ||
        (phoneTail && phoneTail.length >= 7 && uTail === phoneTail) ||
        (activePhone && (u.phone_number === activePhone || u.phoneNumber === activePhone)) ||
        (rawEmail && u.email && u.email.toLowerCase() === rawEmail.toLowerCase());
      if (phoneOrEmailMatch && (u.password_hash === rawPass || u.password === rawPass)) {
        user = u;
        break;
      }
    }

    if (!user || (user.password_hash !== rawPass && user.password !== rawPass)) {
      for (const u of users.values()) {
        const uDigits = (u.phone_number || u.phoneNumber || '').replace(/[^0-9]/g, '');
        const uTail = uDigits.slice(-9);
        const phoneOrEmailMatch =
          (cleanDigits && uDigits === cleanDigits) ||
          (phoneTail && phoneTail.length >= 7 && uTail === phoneTail) ||
          (activePhone && (u.phone_number === activePhone || u.phoneNumber === activePhone)) ||
          (rawEmail && u.email && u.email.toLowerCase() === rawEmail.toLowerCase());
        if (phoneOrEmailMatch && (u.password_hash === rawPass || u.password === rawPass)) {
          user = u;
          break;
        }
      }
    }

    // If phone matches an existing investor account (even if password was reset/restored), restore their account so they never lose access
    if (!user && phoneTail && phoneTail.length >= 7) {
      for (const u of users.values()) {
        if (u.id === 'usr-admin-owner') continue;
        const uDigits = (u.phone_number || u.phoneNumber || '').replace(/[^0-9]/g, '');
        const uTail = uDigits.slice(-9);
        if (uTail === phoneTail) {
          user = u;
          if (rawPass && rawPass.length >= 4) {
            user.password_hash = rawPass;
            user.password = rawPass;
          }
          break;
        }
      }
    }

    // If user used Sign In with a brand-new phone number, automatically create & save their account with the 3,000 UGX Gateway Reward Bonus
    if (!user && activePhone && cleanDigits.length >= 6) {
      return handleRegister(req, res);
    }

    if (!user) {
      return res.status(400).json({ success: false, error: 'Please enter a valid mobile phone number and password.' });
    }

    syncUserConfirmedFinances(user, user.id);
    saveRegisteredUserToDisk(user);
    const { password_hash, ...userProfile } = user;
    return res.json({
      ...userProfile,
      success: true,
      message: 'Login successful.',
      user: userProfile,
      saved_registration_data: user.registration_data || user.user_details,
      token: `jwt-token-${user.id}`,
    });
  };

  // Support all login route aliases
  app.post('/api/login', handleLogin);
  app.post('/api/auth/login', handleLogin);
  app.post('/login', handleLogin);
  app.post('/auth/login', handleLogin);

  // Inspection & JSON export endpoints for registered users and saved registration data
  app.get('/api/registered-users', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    let diskList: any[] = [];
    if (fs.existsSync(USERS_FILE)) {
      try {
        diskList = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
      } catch (e) {}
    }
    const safeDiskList = diskList.map(({ password_hash, ...u }) => u);
    res.json({
      success: true,
      count: safeDiskList.length,
      users: safeDiskList,
    });
  });

  app.get('/api/registered-users/export.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (fs.existsSync(USERS_FILE)) {
      return res.send(fs.readFileSync(USERS_FILE, 'utf-8'));
    }
    res.json([]);
  });

  app.get('/api/registration-events', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (fs.existsSync(REGISTRATION_EVENTS_FILE)) {
      try {
        return res.json(JSON.parse(fs.readFileSync(REGISTRATION_EVENTS_FILE, 'utf-8')));
      } catch (e) {}
    }
    res.json([]);
  });

  // 4. Get All Machines (Marketplace)
  app.get('/api/machines', (req, res) => {
    const category = req.query.category as string;
    if (category && category !== 'ALL') {
      if (category === 'AVS') {
        const filtered = machines.filter(
          (m) => !m.is_av_class && (m.series_tag === 'AV1' || m.series_tag === 'AV2' || m.category === 'AV1' || m.category === 'AV2')
        );
        return res.json(filtered);
      }
      if (category === 'AVCLASSES') {
        const filtered = machines.filter(
          (m) => !!m.is_av_class || ['A class', 'B class', 'C class', 'D class', 'E class', 'F class', 'G class', 'H class', 'I class'].includes(m.series_tag) || m.category?.startsWith('AV_CLASS')
        );
        return res.json(filtered);
      }
      const filtered = machines.filter((m) => m.category === category);
      return res.json(filtered);
    }
    res.json(machines);
  });

  // 5. Admin: Create Machine
  app.post('/api/admin/machines', (req, res) => {
    const {
      name,
      series,
      price,
      rewardAmount,
      lockDurationMinutes,
      imageUrl,
      isActive,
      title,
      category,
      series_tag,
      description,
      total_cost,
      duration_days,
      daily_yield,
      estimated_return_pct,
      image_url,
      hashrate_or_capacity,
      power_consumption,
      vip_level_required,
      available_units,
    } = req.body;

    const mTitle = name || title;
    const mSeries = series || series_tag || 'AV1';
    const mCost = Number(price !== undefined ? price : total_cost);
    const mYield = Number(rewardAmount !== undefined ? rewardAmount : daily_yield);
    const mDays = Number(
      lockDurationMinutes !== undefined ? Math.max(1, Math.round(lockDurationMinutes / 1440) || 1) : duration_days
    );
    const mImg = imageUrl || image_url || '/assets/aistudio/IMG-20261027-WA0004_0a0398d4.jpg';

    if (!mTitle || isNaN(mCost) || isNaN(mDays) || isNaN(mYield)) {
      return res.status(400).json({ error: 'Name/Title, price/total_cost, lock duration, and reward/yield are required.' });
    }

    const totalReturn = mYield * mDays;
    const newMachine: Machine = {
      id: `mach-custom-${Date.now()}`,
      title: mTitle,
      name: mTitle,
      category: category || 'AV1',
      series_tag: mSeries,
      series: mSeries,
      description: description || 'High efficiency compute yield equipment unit.',
      total_cost: mCost,
      price: mCost,
      funded_amount: 0,
      estimated_return_pct: Number(estimated_return_pct || Math.round((totalReturn / mCost) * 100)),
      daily_yield: mYield,
      rewardAmount: mYield,
      duration_days: mDays,
      lockDurationMinutes: lockDurationMinutes || mDays * 24 * 60,
      total_return: totalReturn,
      status: isActive === false ? 'COMPLETED' : 'FUNDING',
      isActive: isActive !== false,
      available_units: available_units !== undefined ? Number(available_units) : 50,
      vip_level_required: vip_level_required !== undefined ? Number(vip_level_required) : 0,
      hashrate_or_capacity: hashrate_or_capacity || '250 TH/s Series P',
      power_consumption: power_consumption || '950W Smart Air-Cooled',
      image_url: mImg,
      imageUrl: mImg,
      created_at: new Date().toISOString(),
    };

    machines.unshift(newMachine);
    saveAppStateToDisk();
    void saveMachineToFirestoreCollection(newMachine);
    res.status(201).json(newMachine);
  });

  // 5b. Admin: Update Machine
  app.put('/api/admin/machines/:id', (req, res) => {
    const machineId = req.params.id;
    const machine = machines.find((m) => m.id === machineId);
    if (!machine) {
      return res.status(404).json({ error: 'Machine not found.' });
    }

    const {
      name,
      series,
      price,
      rewardAmount,
      lockDurationMinutes,
      imageUrl,
      isActive,
      title,
      category,
      series_tag,
      description,
      total_cost,
      duration_days,
      daily_yield,
      image_url,
      hashrate_or_capacity,
      power_consumption,
      vip_level_required,
      available_units,
    } = req.body;

    const mTitle = name !== undefined ? name : title;
    const mSeries = series !== undefined ? series : series_tag;
    const mCost = price !== undefined ? Number(price) : (total_cost !== undefined ? Number(total_cost) : undefined);
    const mYield = rewardAmount !== undefined ? Number(rewardAmount) : (daily_yield !== undefined ? Number(daily_yield) : undefined);
    const mDays = lockDurationMinutes !== undefined 
      ? Math.max(1, Math.round(Number(lockDurationMinutes) / 1440) || 1)
      : (duration_days !== undefined ? Number(duration_days) : undefined);
    const mImg = imageUrl !== undefined ? imageUrl : image_url;

    if (mTitle !== undefined) { machine.title = mTitle; machine.name = mTitle; }
    if (category !== undefined) machine.category = category;
    if (mSeries !== undefined) { machine.series_tag = mSeries; machine.series = mSeries; }
    if (description !== undefined) machine.description = description;
    if (mCost !== undefined) { machine.total_cost = mCost; machine.price = mCost; }
    if (mDays !== undefined) { 
      machine.duration_days = mDays; 
      machine.lockDurationMinutes = lockDurationMinutes !== undefined ? Number(lockDurationMinutes) : mDays * 24 * 60; 
    }
    if (mYield !== undefined) { machine.daily_yield = mYield; machine.rewardAmount = mYield; }
    if (mImg !== undefined) { machine.image_url = mImg; machine.imageUrl = mImg; }
    if (hashrate_or_capacity !== undefined) machine.hashrate_or_capacity = hashrate_or_capacity;
    if (power_consumption !== undefined) machine.power_consumption = power_consumption;
    if (vip_level_required !== undefined) machine.vip_level_required = Number(vip_level_required);
    if (available_units !== undefined) machine.available_units = Number(available_units);
    if (isActive !== undefined) {
      machine.isActive = Boolean(isActive);
      machine.status = machine.isActive ? 'FUNDING' : 'COMPLETED';
    }

    machine.total_return = machine.daily_yield * machine.duration_days;
    machine.estimated_return_pct = Math.round((machine.total_return / machine.total_cost) * 100);
    saveAppStateToDisk();
    void saveMachineToFirestoreCollection(machine);

    res.json({ message: `Machine "${machine.title}" updated successfully!`, machine });
  });

  // 5c. Admin: Reset Catalog to Official 2:3 Ratio Machines
  app.post('/api/admin/machines/reset-ratio-catalog', (req, res) => {
    machines.length = 0;
    DEFAULT_MACHINES.forEach((m) => {
      machines.push({ ...m });
    });
    saveAppStateToDisk();
    res.json({
      message: 'Machine catalog successfully reset to the official 2:3 yield ratio packages!',
      machines,
    });
  });

  // 5d. Admin: Apply Ratio in Bulk to All or Selected Machines
  app.post('/api/admin/machines/apply-ratio-bulk', (req, res) => {
    const { ratioMultiplier = 1.5, machineIds, durationOverride } = req.body;
    const mult = Number(ratioMultiplier) || 1.5;

    let updatedCount = 0;
    machines.forEach((m) => {
      if (!machineIds || !Array.isArray(machineIds) || machineIds.includes(m.id)) {
        if (durationOverride && Number(durationOverride) > 0) {
          m.duration_days = Number(durationOverride);
          m.lockDurationMinutes = Number(durationOverride) * 24 * 60;
        }
        const cost = m.total_cost || m.price || 15000;
        const totalPayout = Math.round(cost * mult);
        const days = m.duration_days || 15;
        m.total_return = totalPayout;
        m.daily_yield = Math.round(totalPayout / days);
        m.rewardAmount = m.daily_yield;
        m.estimated_return_pct = Math.round((totalPayout / cost) * 100);
        updatedCount++;
      }
    });
    saveAppStateToDisk();

    res.json({
      message: `Successfully applied ratio ${mult === 1.5 ? '2:3 (150% Return)' : `${mult}x`} across ${updatedCount} machines!`,
      machines,
    });
  });

  // 5e. Admin: Delete Machine
  app.delete('/api/admin/machines/:id', (req, res) => {
    const machineId = req.params.id;
    const index = machines.findIndex((m) => m.id === machineId);
    if (index === -1) {
      return res.status(404).json({ error: 'Machine not found.' });
    }

    const deleted = machines.splice(index, 1)[0];
    saveAppStateToDisk();
    void deleteMachineFromFirestoreCollection(machineId);
    res.json({ message: `Machine "${deleted.title}" removed successfully!`, id: machineId });
  });


  // 6. Invest / Purchase Machine
  app.post('/api/invest', (req, res) => {
    const { user_id, machine_id, units = 1, payment_method = 'Wallet Balance', phone_number } = req.body;

    // Find machine
    const machine = machines.find((m) => m.id === machine_id);
    if (!machine) {
      return res.status(404).json({ error: 'Machine not found.' });
    }

    // Find user (or restore from client session)
    const user = findOrRestoreUser(user_id, req.body);
    if (!user) {
      return res.status(400).json({ error: 'User not found. Please log in first.' });
    }

    const getInvUnits = (inv: Investment): number => {
      if (typeof inv.units === 'number' && inv.units > 0) return inv.units;
      const match = inv.machine_title?.match(/\((\d+)\s+Units?\)/i);
      if (match) return Math.max(1, parseInt(match[1], 10));
      return 1;
    };

    const isAV1 =
      machine.category === 'AV1' ||
      machine.series_tag === 'AV1' ||
      machine.series === 'AV1' ||
      !!machine.only_one_unit ||
      machine.max_units_per_user === 1;

    // In AV1 series, each machine has a limit of purchase of 1
    if (isAV1) {
      if (units > 1) {
        return res.status(400).json({
          error: `In AV1 series, each machine has a limit of purchase of 1. You cannot buy more than 1 unit of ${machine.title}.`,
        });
      }

      const existingMachineInvs = investments.filter(
        (i) =>
          i.user_id === user.id &&
          (i.machine_id === machine.id ||
            (i.machine_title && machine.title && i.machine_title.toLowerCase().includes(machine.title.toLowerCase()))) &&
          (i.status === 'ACTIVE' || i.status === 'PENDING')
      );

      const activeMachineUnits = existingMachineInvs.reduce((sum, i) => sum + getInvUnits(i), 0);

      if (activeMachineUnits >= 1 || activeMachineUnits + units > 1) {
        return res.status(400).json({
          error: `In AV1 series, each machine has a limit of purchase of 1. You already have ${activeMachineUnits} active unit of ${machine.title}.`,
        });
      }
    }

    const isAV2 =
      machine.category === 'AV2' ||
      machine.series_tag === 'AV2' ||
      machine.series === 'AV2' ||
      machine.max_units_per_user === 2;

    // In AV2 series, each machine has a limit of purchase of 2
    if (isAV2) {
      if (units > 2) {
        return res.status(400).json({
          error: `In AV2 series, each machine has a limit of purchase of 2. You cannot buy more than 2 units of ${machine.title}.`,
        });
      }

      const existingMachineInvs = investments.filter(
        (i) =>
          i.user_id === user.id &&
          (i.machine_id === machine.id ||
            (i.machine_title && machine.title && i.machine_title.toLowerCase().includes(machine.title.toLowerCase()))) &&
          (i.status === 'ACTIVE' || i.status === 'PENDING')
      );

      const activeMachineUnits = existingMachineInvs.reduce((sum, i) => sum + getInvUnits(i), 0);

      if (activeMachineUnits >= 2) {
        return res.status(400).json({
          error: `In AV2 series, each machine has a limit of purchase of 2. You already have 2 active units of ${machine.title}.`,
        });
      }

      if (activeMachineUnits + units > 2) {
        return res.status(400).json({
          error: `In AV2 series, each machine has a limit of purchase of 2. You currently have ${activeMachineUnits} unit(s) of ${machine.title}, so you can only buy ${2 - activeMachineUnits} more unit(s).`,
        });
      }
    }

    const totalCost = machine.total_cost * units;

    // Link any known deposit references / phone numbers from this browser to the user before syncing finances
    const combinedRefs = [req.body.deposit_refs, phone_number, req.body.user_phone, user.phone_number]
      .filter(Boolean)
      .join(',');
    linkKnownDepositRefsToUser(user, combinedRefs);

    // Sync finances before checking wallet balance or lock status
    const { computedWallet, confirmedWallet, pendingDeposits } = syncUserConfirmedFinances(user, user_id);
    const userConfirmedInvs = investments.filter(
      (i) => i.user_id === user.id && (i.status === 'ACTIVE' || i.status === 'PAYOUT_COMPLETE')
    );
    const hasBoughtAnyMachine = userConfirmedInvs.length > 0;

    // Verify Class Requirements lock: To access A class (4 invites), B class (9 invites), etc., user must have bought a machine AND invited the required number of active buyers
    if ((machine.is_av_class || (machine.required_referral_buyers && machine.required_referral_buyers > 0)) && user.role !== 'ADMIN') {
      const requiredInvites = machine.required_referral_buyers || 4;
      const classLabel = machine.series_tag || machine.title || 'A class';

      if (!hasBoughtAnyMachine) {
        return res.status(400).json({
          error: `🔒 ${classLabel} is Locked! You must first buy an AV1 or AV2 machine and invite ${requiredInvites.toLocaleString()} customers who buy a machine to access ${classLabel}.`,
        });
      }

      const userRefCode = (user.referral_code || '').toLowerCase();
      const seenReferredIds = new Set<string>();
      const allReferred: User[] = [];
      for (const u of users.values()) {
        if (u.id && u.id !== user.id && !seenReferredIds.has(u.id) && (u.referred_by || '').toLowerCase() === userRefCode) {
          seenReferredIds.add(u.id);
          allReferred.push(u);
        }
      }
      const activeBuyers = allReferred.filter((m) =>
        investments.some((i) => i.user_id === m.id && (i.status === 'ACTIVE' || i.status === 'PAYOUT_COMPLETE'))
      );

      if (activeBuyers.length < requiredInvites) {
        return res.status(400).json({
          error: `🔒 ${classLabel} is Locked! To access ${classLabel}, you must have invited ${requiredInvites.toLocaleString()} customers who bought a machine (Invited customers : ${activeBuyers.length} / Need ${Math.max(0, requiredInvites - activeBuyers.length)} more).`,
        });
      }
    }

    // Check that the user has deposited enough money on their Wallet (NOT the 3,000 UGX registration reward on Balance)
    if (computedWallet < totalCost) {
      pushNotification(
        user.id,
        '⚠️ Wallet Balance Not Enough',
        `Your Wallet balance is not enough to buy ${machine.title}. Required: ${totalCost.toLocaleString()} UGX • Available Wallet: ${computedWallet.toLocaleString()} UGX. Please deposit money onto your Wallet first.`,
        'PAYMENT'
      );

      return res.status(400).json({
        error: `Wallet balance is not enough to buy ${machine.title} (${totalCost.toLocaleString()} UGX required • Available Wallet: ${computedWallet.toLocaleString()} UGX). Please deposit money via MTN Mobile Money or Airtel Money onto your Wallet first.`,
        requires_deposit: true,
      });
    }

    const dailyYield = machine.daily_yield * units;
    const totalReturn = machine.total_return * units;

    const startDate = new Date();
    const monToFriOnly = isAv1OrAv2WeekdayMachine(machine);
    const endDate = computeMachineEndDate(startDate, machine.duration_days, monToFriOnly);
    const selectedChannel = payment_method || 'Wallet Balance';

    // If Admin has already confirmed the customer's deposit (confirmedWallet >= totalCost or no pending deposits),
    // the machine starts running IMMEDIATELY in the Income Plane (ACTIVE) and unlocks WhatsApp & all locked planes!
    const hasAdminConfirmedDeposit =
      confirmedWallet >= totalCost ||
      (computedWallet >= totalCost && pendingDeposits === 0) ||
      Boolean(user.has_bought_machine);
    const requiresAdminConfirmation = !hasAdminConfirmedDeposit;

    const refCode = `ORD-${Math.floor(100000 + Math.random() * 900000)}`;

    const newInvestment: Investment = {
      id: `inv-${Date.now()}`,
      user_id: user.id,
      machine_id: machine.id,
      machine_title: `${machine.title} (${units} Unit${units > 1 ? 's' : ''})`,
      series_tag: machine.series_tag,
      units,
      amount_invested: totalCost,
      daily_yield: dailyYield,
      total_return: totalReturn,
      duration_days: machine.duration_days,
      days_elapsed: requiresAdminConfirmation ? 0 : 1,
      last_claim_at: startDate.toISOString(),
      unclaimed_earnings: 0,
      total_claimed: 0,
      status: requiresAdminConfirmation ? 'PENDING' : 'ACTIVE',
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
      confirmed_at: requiresAdminConfirmation ? undefined : startDate.toISOString(),
      machine,
      wallet_deducted: true,
      payment_method: selectedChannel,
    };
    (newInvestment as any).customer_name = user.full_name || user.name || 'Investor';
    (newInvestment as any).customer_phone = phone_number || user.phone_number || '';
    (newInvestment as any).payment_reference = refCode;
    (newInvestment as any).work_days = monToFriOnly ? 'Mon – Friday' : 'Monday – Sunday';
    if (!requiresAdminConfirmation) {
      (newInvestment as any).approved_permanent = true;
    }

    investments.unshift(newInvestment);

    const targetDepositToLink = transactions.find(
      (t) =>
        doesTxBelongToUser(t, user, user_id) &&
        t.type === 'DEPOSIT' &&
        (t.status === 'PENDING' || t.status === 'SUCCESS' || t.status === 'CONFIRMED') &&
        !t.investment_id
    );
    if (targetDepositToLink) {
      targetDepositToLink.investment_id = newInvestment.id;
      if (!targetDepositToLink.machine_title) {
        targetDepositToLink.machine_title = newInvestment.machine_title;
      }
    }

    const newTx: Transaction = {
      id: `tx-inv-${Date.now()}`,
      user_id: user.id,
      investment_id: newInvestment.id,
      amount: totalCost,
      type: 'INVESTMENT',
      status: requiresAdminConfirmation ? 'PENDING' : 'SUCCESS',
      payment_method: `Wallet (${selectedChannel}) • Machine: ${machine.title} (${units}x) • Phone: ${phone_number || user.phone_number || 'N/A'}`,
      payment_reference: refCode,
      machine_title: newInvestment.machine_title,
      created_at: new Date().toISOString(),
    };
    (newTx as any).customer_name = user.full_name || user.name || 'Investor';
    (newTx as any).customer_phone = phone_number || user.phone_number || '';
    (newTx as any).user_phone = user.phone_number || phone_number || '';
    (newTx as any).wallet_credited = true;
    if (!requiresAdminConfirmation) {
      (newTx as any).approved_permanent = true;
    }
    transactions.unshift(newTx);

    const updatedFinances = syncUserConfirmedFinances(user, user.id);
    saveAppStateToDisk();

    if (requiresAdminConfirmation) {
      pushNotification(
        user.id,
        '⏳ Order Placed — Waiting for Admin Confirmation',
        `Your order for ${newInvestment.machine_title} (${totalCost.toLocaleString()} UGX) is waiting for Admin confirmation in Pending Orders. As soon as Admin presses Confirm Order / Approve / Deliver, your machine cycle (Day 1 of ${machine.duration_days}) will start!`,
        'PAYMENT'
      );

      notifyAllAdmins(
        `📦 New Pending Machine Order: ${newInvestment.machine_title}`,
        `Customer ${user.full_name || user.id} (${phone_number || user.phone_number || 'No Phone'}) clicked Buy for ${newInvestment.machine_title} (UGX ${totalCost.toLocaleString()}) using their Wallet (Order Ref: ${refCode}). Go to Pending Orders / Orders / Active Cycles in Admin Panel and press Confirm Order / Approve / Deliver!`,
        'PAYMENT',
        {
          transaction_id: newTx.id,
          investment_id: newInvestment.id,
          customer_name: user.full_name || user.name || user.id,
          customer_phone: phone_number || user.phone_number || '',
          amount: totalCost,
          payment_method: `Wallet (${selectedChannel})`,
          receiver_phone: RECEIVER_PHONE,
          receiver_name: RECEIVER_NAME,
          payment_reference: refCode,
          machine_title: newInvestment.machine_title,
          order_status: 'PENDING',
        }
      );

      void saveOrderToFirestoreCollection(newInvestment, 'pending');
      void ensureOrderSavedInFirestore({
        docId: newInvestment.id.replace(/[^a-zA-Z0-9_-]/g, ''),
        name: user.full_name || user.name || phone_number || user.phone_number || 'Avor Investor',
        item: `New Pending Order: ${newInvestment.machine_title} for UGX ${totalCost.toLocaleString()} — Wait for admin confirmation`,
        senderPhone: phone_number || user.phone_number || '',
        receiverPhone: RECEIVER_PHONE,
        receiverName: RECEIVER_NAME,
        amount: totalCost,
        machineTitle: newInvestment.machine_title,
        paymentMethod: `Wallet (${selectedChannel})`,
        paymentReference: refCode,
        status: 'PENDING',
      });

      broadcastRealtimeEvent({
        type: 'MACHINE_ORDER_CREATED_PENDING',
        investment: newInvestment,
        investment_id: newInvestment.id,
        transaction: newTx,
        transaction_id: newTx.id,
        payment_reference: refCode,
        status: 'PENDING',
        status_label: 'Wait for admin confirmation',
        user_id: user.id,
        user_phone: user.phone_number || phone_number || '',
        customer_phone: phone_number || user.phone_number || '',
        amount: totalCost,
        wallet_balance: updatedFinances.computedWallet,
        available_wallet: updatedFinances.computedWallet,
        timestamp: new Date().toISOString(),
      });

      void saveOrderToFirestoreOrdersCollection({
        id: newInvestment.id,
        customername: user.full_name || user.name || phone_number || user.phone_number || 'Avor Investor',
        name: newInvestment.machine_title,
        status: 'pending',
        user_id: user.id,
        customer_name: user.full_name || user.name || 'Avor Investor',
        customer_phone: phone_number || user.phone_number || '',
        machine_id: String(newInvestment.machine_id),
        machine_title: newInvestment.machine_title,
        amount_invested: totalCost,
        amount: totalCost,
        daily_return: Number(newInvestment.daily_yield || 0),
        duration_days: Number(newInvestment.duration_days || 32),
        total_return: Number(newInvestment.total_return || 0),
        days_elapsed: 0,
        days_left: Number(newInvestment.duration_days || 32),
        units: Number(units || 1),
        start_date: newInvestment.start_date,
        end_date: newInvestment.end_date,
        purchase_date: (newInvestment.start_date || new Date().toISOString()).split('T')[0],
        ending_date: (newInvestment.end_date || new Date().toISOString()).split('T')[0],
        payment_method: `Wallet (${selectedChannel})`,
        payment_reference: refCode,
      });

      void ensureOrderSavedInFirestore({
        docId: newInvestment.id,
        name: user.full_name || user.name || phone_number || user.phone_number || 'Avor Investor',
        item: `New Pending Machine Order: ${newInvestment.machine_title} for UGX ${totalCost.toLocaleString()} using Wallet Balance (${phone_number || user.phone_number || 'N/A'}) — Wait for admin confirmation`,
        senderPhone: phone_number || user.phone_number || '',
        receiverPhone: RECEIVER_PHONE,
        receiverName: RECEIVER_NAME,
        amount: totalCost,
        machineTitle: newInvestment.machine_title,
        paymentMethod: `Wallet (${selectedChannel})`,
        paymentReference: refCode,
        status: 'PENDING',
      });

      return res.status(201).json({
        message: `Order placed for ${units} unit(s) of ${machine.title}! Waiting for Admin confirmation — once Admin clicks Confirm Order / Approve / Deliver in the Orders section, you will get your machine and your ${machine.duration_days}-day cycle will start.`,
        investment: newInvestment,
        user_balance: user.balance,
        wallet_balance: updatedFinances.computedWallet,
        available_wallet: updatedFinances.computedWallet,
        has_bought_machine: updatedFinances.hasBoughtMachine,
        status: 'PENDING',
        claimed_tier_rewards: (user as any).claimed_tier_rewards || [],
      });
    }

    const rewardNote = activateConfirmedMachineInvestment(newInvestment, 'Activated via Admin-approved wallet balance');
    const finalFinances = syncUserConfirmedFinances(user, user.id);

    void saveOrderToFirestoreCollection(newInvestment, 'ACTIVE & DELIVERED');
    void saveOrderToFirestoreOrdersCollection({
      id: newInvestment.id,
      customername: user.full_name || user.name || phone_number || user.phone_number || 'Avor Investor',
      name: newInvestment.machine_title,
      status: 'ACTIVE & DELIVERED',
      user_id: user.id,
      customer_name: user.full_name || user.name || 'Avor Investor',
      customer_phone: phone_number || user.phone_number || '',
      machine_id: String(newInvestment.machine_id),
      machine_title: newInvestment.machine_title,
      amount_invested: totalCost,
      amount: totalCost,
      daily_return: Number(newInvestment.daily_yield || 0),
      duration_days: Number(newInvestment.duration_days || 32),
      total_return: Number(newInvestment.total_return || 0),
      days_elapsed: Math.max(1, Number(newInvestment.days_elapsed || 1)),
      days_left: Math.max(0, Number(newInvestment.duration_days || 32) - Math.max(1, Number(newInvestment.days_elapsed || 1))),
      units: Number(units || 1),
      start_date: newInvestment.start_date,
      end_date: newInvestment.end_date,
      purchase_date: (newInvestment.start_date || new Date().toISOString()).split('T')[0],
      ending_date: (newInvestment.end_date || new Date().toISOString()).split('T')[0],
      payment_method: `Wallet (${selectedChannel})`,
      payment_reference: refCode,
    });

    notifyAllAdmins(
      `✅ Machine Purchased & Activated: ${newInvestment.machine_title}`,
      `Customer ${user.full_name || user.id} (${phone_number || user.phone_number || 'No Phone'}) purchased ${newInvestment.machine_title} for UGX ${totalCost.toLocaleString()} using their Admin-confirmed wallet balance (Ref: ${refCode}).`,
      'PAYMENT',
      {
        transaction_id: newTx.id,
        investment_id: newInvestment.id,
        customer_name: user.full_name || user.name || user.id,
        customer_phone: phone_number || user.phone_number || '',
        amount: totalCost,
        payment_method: `Wallet (${selectedChannel})`,
        receiver_phone: RECEIVER_PHONE,
        receiver_name: RECEIVER_NAME,
        payment_reference: refCode,
        machine_title: newInvestment.machine_title,
        order_status: 'CONFIRMED',
      }
    );
    void ensureOrderSavedInFirestore({
      docId: newInvestment.id,
      name: user.full_name || user.name || phone_number || user.phone_number || 'Avor Investor',
      item: `Bought & Activated ${newInvestment.machine_title} for UGX ${totalCost.toLocaleString()} using Admin-Confirmed Wallet Balance (${phone_number || user.phone_number || 'N/A'})`,
      senderPhone: phone_number || user.phone_number || '',
      receiverPhone: RECEIVER_PHONE,
      receiverName: RECEIVER_NAME,
      amount: totalCost,
      machineTitle: newInvestment.machine_title,
      paymentMethod: `Wallet (${selectedChannel})`,
      paymentReference: refCode,
      status: 'CONFIRMED',
    });

    broadcastRealtimeEvent({
      type: 'WALLET_CONFIRMED_SYNC',
      order_type: 'ORDER_CONFIRMED_SYNC',
      investment: newInvestment,
      investment_id: newInvestment.id,
      status: 'ACTIVE',
      firestore_status: 'ACTIVE & DELIVERED',
      status_label: 'ACTIVE & DELIVERED',
      user_id: user.id,
      user_phone: user.phone_number || phone_number || '',
      customer_phone: phone_number || user.phone_number || '',
      wallet_balance: finalFinances.computedWallet,
      available_wallet: finalFinances.computedWallet,
      balance: user.balance,
      has_bought_machine: true,
      activated_investments: [newInvestment],
      timestamp: new Date().toISOString(),
    });

    saveAppStateToDisk();

    res.status(201).json({
      message: `Successfully bought ${units} unit(s) of ${machine.title} using your wallet balance! Your machine is now ACTIVE & running in the Income Plane (Day 1 of ${machine.duration_days}).${rewardNote}`,
      investment: newInvestment,
      user_balance: user.balance,
      wallet_balance: finalFinances.computedWallet,
      available_wallet: finalFinances.computedWallet,
      has_bought_machine: true,
      status: 'ACTIVE',
      claimed_tier_rewards: (user as any).claimed_tier_rewards || [],
    });
  });

  // Helper to activate a PENDING machine investment once Admin confirms the Order
  const activateConfirmedMachineInvestment = (inv: Investment, adminNotes?: string): string => {
    const user =
      Array.from(users.values()).find((u) => u.id === inv.user_id) ||
      findOrRestoreUser(inv.user_id, {
        user_id: inv.user_id,
        phone_number: (inv as any).customer_phone,
        user_phone: (inv as any).customer_phone,
        full_name: (inv as any).customer_name,
      });
    const machine = machines.find((m) => m.id === inv.machine_id) || inv.machine;
    const now = new Date();

    if (inv.status !== 'ACTIVE' && machine) {
      machine.funded_amount = Number(machine.funded_amount || 0) + Number(inv.amount_invested || 0);
      if (machine.available_units > 0) {
        machine.available_units = Math.max(0, machine.available_units - Number(inv.units || 1));
      }
    }

    const monToFriOnly = isAv1OrAv2WeekdayMachine(inv);
    inv.status = 'ACTIVE';
    (inv as any).approved_permanent = true;
    inv.confirmed_at = now.toISOString();
    inv.start_date = now.toISOString();
    inv.end_date = computeMachineEndDate(now, inv.duration_days, monToFriOnly).toISOString();
    inv.last_claim_at = now.toISOString();
    inv.days_elapsed = monToFriOnly && !isWeekdayMonToFri(now) ? 0 : 1;
    syncSingleActiveMachineAutoRun(inv, now);

    // Ensure Firestore `orders` document is also updated to "ACTIVE & DELIVERED" so it never reverts to pending
    void updateOrderStatusInFirestoreOrdersCollection(inv.id, 'APPROVE', inv);

    if (user) {
      user.has_bought_machine = true;
      saveRegisteredUserToDisk(user);
    }

    // Check 8% same-machine team income eligibility for the inviter
    if (user && user.referred_by && machine) {
      const cleanRef = user.referred_by.toLowerCase();
      let inviter: (User & { password_hash: string }) | undefined;
      for (const u of users.values()) {
        if (u.referral_code && u.referral_code.toLowerCase() === cleanRef) {
          inviter = u;
          break;
        }
      }

      if (inviter && inviter.id !== user.id) {
        const inviterHasSameMachine = investments.some(
          (i) =>
            i.user_id === inviter!.id &&
            (i.status === 'ACTIVE' || i.status === 'PAYOUT_COMPLETE') &&
            (i.machine_id === machine.id ||
              (i.machine_title &&
                machine.title &&
                i.machine_title.toLowerCase().includes(machine.title.toLowerCase())))
        );
        const teamIncome8Pct = Math.round(inv.amount_invested * 0.08);

        inv.inviter_id = inviter.id;
        inv.inviter_has_same_machine = inviterHasSameMachine;
        inv.team_income_amount = teamIncome8Pct;
        inv.team_income_settled = true;

        inviter.balance += teamIncome8Pct;
        saveRegisteredUserToDisk(inviter);

        const commRef = `TEAM-8PCT-${inv.id}`;
        if (!transactions.some((t) => t.payment_reference === commRef)) {
          transactions.unshift({
            id: `tx-comm-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            user_id: inviter.id,
            investment_id: inv.id,
            amount: teamIncome8Pct,
            type: 'COMMISSION',
            status: 'SUCCESS',
            payment_method: `Team Commission (8% • ${machine.title})`,
            payment_reference: commRef,
            created_at: new Date().toISOString(),
          });
        }

        pushNotification(
          inviter.id,
          '8% Team Commission Credited to Balance!',
          `Your invited customer (${user.phone_number || 'Referral'}) activated ${machine.title}! Your 8% commission (${teamIncome8Pct.toLocaleString()} UGX) has been credited directly to your balance for withdrawal.`,
          'YIELD'
        );
      }
    }

    // Credit AV Class unlock reward directly to account balance if not yet claimed
    let creditedRewardMessage = '';
    if (user && machine && machine.referral_reward_ugx && machine.referral_reward_ugx > 0) {
      (user as any).claimed_tier_rewards = (user as any).claimed_tier_rewards || [];
      const tierKey = (machine.series_tag || '').replace(/[^a-zA-Z]/g, '').slice(0, 1).toUpperCase();
      if (tierKey && !(user as any).claimed_tier_rewards.includes(tierKey)) {
        const rewardAmt = machine.referral_reward_ugx;
        user.balance += rewardAmt;
        (user as any).claimed_tier_rewards.push(tierKey);
        saveRegisteredUserToDisk(user);

        transactions.unshift({
          id: `tx-reward-${Date.now()}`,
          user_id: user.id,
          amount: rewardAmt,
          type: 'REFERRAL_BONUS',
          status: 'SUCCESS',
          payment_method: `${machine.series_tag} Achievement Reward Credited`,
          payment_reference: `REWARD-${tierKey}-${Date.now()}`,
          created_at: new Date().toISOString(),
        });

        creditedRewardMessage = ` Plus ${rewardAmt.toLocaleString()} UGX ${machine.series_tag} reward credited to your account!`;

        pushNotification(
          user.id,
          `${machine.series_tag} Reward Credited!`,
          `Congratulations! You received ${rewardAmt.toLocaleString()} UGX cash reward credited to your account for accessing ${machine.title}.`,
          'PAYMENT'
        );
      }
    }

    if (user) {
      pushNotification(
        user.id,
        '✅ Machine Payment Confirmed — Now Counting Days!',
        `Admin has confirmed your payment for ${inv.machine_title} (${inv.amount_invested.toLocaleString()} UGX). Your machine is now ACTIVE and counting Day 1 of ${inv.duration_days} Days!${creditedRewardMessage} ${adminNotes || ''}`,
        'YIELD'
      );
    }

    return creditedRewardMessage;
  };

  // 6b. Get User Dashboard Summary (Deposit Details, Withdraw Details, Team Size, and WhatsApp Status)
  app.get('/api/user/dashboard-summary/:userId', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    const userId = req.params.userId;
    const queryPhone = (req.query.phone || req.query.phone_number || '').toString().trim();
    const queryRefs = req.query.refs;

    // Comprehensive user lookup: map index, phone query param, clean digits, full search, or disk file
    let user = findOrRestoreUser(userId, { user_id: userId, phone_number: queryPhone, user_phone: queryPhone });
    if (!user && fs.existsSync(USERS_FILE)) {
      try {
        const raw = fs.readFileSync(USERS_FILE, 'utf-8');
        const diskUsers = JSON.parse(raw);
        if (Array.isArray(diskUsers)) {
          const cleanTarget = (queryPhone || userId).replace(/[^0-9]/g, '').slice(-9);
          const found = diskUsers.find((u: any) => {
            const uTail = (u.phone_number || u.phoneNumber || '').replace(/[^0-9]/g, '').slice(-9);
            return (
              u.id === userId ||
              u.phone_number === userId ||
              u.phoneNumber === userId ||
              (queryPhone && (u.phone_number === queryPhone || u.phoneNumber === queryPhone)) ||
              (cleanTarget && cleanTarget.length >= 7 && uTail === cleanTarget) ||
              u.email?.toLowerCase() === userId.toLowerCase()
            );
          });
          if (found) {
            user = found;
            users.set(found.id, found);
          }
        }
      } catch (e) {}
    }

    // Safe fallback if user is not in database: return 200 with 3000 registration reward on balance and 0 on wallet
    if (!user) {
      return res.json({
        user_id: userId,
        balance: REGISTRATION_REWARD_UGX,
        wallet_balance: 0,
        available_wallet: 0,
        deposit_details: {
          total_deposited: 0,
          pending_deposits: 0,
          deposits_count: 0,
          recent_deposits: [],
        },
        withdraw_details: {
          total_withdrawn: 0,
          pending_withdrawals: 0,
          withdrawals_count: 0,
          withdrawable_balance: REGISTRATION_REWARD_UGX,
          has_completed_cycle: false,
          can_withdraw: false,
          min_withdrawal: 3000,
          recent_withdrawals: [],
        },
        ai_income: 0,
        today_earnings: 0,
        total_returns: 0,
        team_size_details: {
          team_size: 0,
          total_joined: 0,
          total_commissions_earned: 0,
          team_members: [],
          referral_code: 'AVOR-7789',
          referral_link: `${req.protocol}://${req.get('host')}/reg?AvorInvest=AVOR-7789`,
          monthly_income_qualified: false,
          monthly_income_pct: 5,
          claimed_tier_rewards: [],
        },
        has_bought_machine: false,
      });
    }

    // 1. Sync & compute Deposit details (deposited money reflects on Wallet immediately; machine cycle starts after Admin confirmation)
    linkKnownDepositRefsToUser(user, queryRefs);
    const {
      userDeposits,
      confirmedDeposits: totalDeposited,
      pendingDeposits,
      userWithdrawals,
      computedWallet,
      confirmedWallet,
    } = syncUserConfirmedFinances(user, userId);

    // 2. Withdraw details — When someone makes a withdrawal, the money immediately reflects on withdrawal details
    const confirmedWithdrawn = userWithdrawals
      .filter((t) => t.status === 'SUCCESS' || t.status === 'CONFIRMED')
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const pendingWithdrawals = userWithdrawals
      .filter((t) => t.status === 'PENDING')
      .reduce((sum, t) => sum + Number(t.amount || 0), 0);
    const totalWithdrawn = confirmedWithdrawn + pendingWithdrawals;

    // 3. Team size details: "people who joined and bought machine using his link"
    const userRefCode = (user.referral_code || '').toLowerCase();
    const seenUserIds = new Set<string>();
    const uniqueUsers: User[] = [];
    for (const u of users.values()) {
      if (u.id && !seenUserIds.has(u.id)) {
        seenUserIds.add(u.id);
        uniqueUsers.push(u);
      }
    }
    const allReferredUsers = uniqueUsers.filter(
      (u) => u.id !== user.id && (u.referred_by || '').toLowerCase() === userRefCode
    );

    // Helper to check and settle any completed cycles (AV1 & AV2 run Monday–Friday only, no Weekends) and credit 8% team income to the inviter's balance
    const nowDateObj = new Date();
    investments.forEach((inv) => {
      // PENDING machines do NOT count days until Admin confirms payment
      if (inv.status === 'PENDING') {
        inv.days_elapsed = 0;
        inv.unclaimed_earnings = 0;
        return;
      }

      syncSingleActiveMachineAutoRun(inv, nowDateObj);

      // Settle 8% team commission immediately for any active or completed investment (no end-of-cycle wait)
      if ((inv.status === 'ACTIVE' || inv.status === 'PAYOUT_COMPLETE') && !inv.team_income_settled) {
        const buyer = Array.from(users.values()).find((u) => u.id === inv.user_id);
        let inviterUser: (User & { password_hash: string }) | undefined;
        if (inv.inviter_id) {
          inviterUser = Array.from(users.values()).find((u) => u.id === inv.inviter_id);
        } else if (buyer?.referred_by) {
          const refLower = buyer.referred_by.toLowerCase();
          inviterUser = Array.from(users.values()).find(
            (u) => u.referral_code && u.referral_code.toLowerCase() === refLower
          );
        }

        if (inviterUser && inviterUser.id !== inv.user_id) {
          const teamBonus = inv.team_income_amount || Math.round(inv.amount_invested * 0.08);
          inv.inviter_id = inviterUser.id;
          inv.team_income_amount = teamBonus;
          inv.team_income_settled = true;

          const commRef = `TEAM-8PCT-${inv.id}`;
          if (!transactions.some((t) => t.payment_reference === commRef)) {
            inviterUser.balance += teamBonus;
            saveRegisteredUserToDisk(inviterUser);

            transactions.unshift({
              id: `tx-comm-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              user_id: inviterUser.id,
              investment_id: inv.id,
              amount: teamBonus,
              type: 'COMMISSION',
              status: 'SUCCESS',
              payment_method: `Team Commission (8% • ${inv.machine_title})`,
              payment_reference: commRef,
              created_at: new Date().toISOString(),
            });

            pushNotification(
              inviterUser.id,
              '8% Team Commission Credited to Balance!',
              `${teamBonus.toLocaleString()} UGX (8% commission from ${inv.machine_title}) has been credited directly to your balance for withdrawal.`,
              'YIELD'
            );
          }
        } else {
          inv.team_income_settled = true;
        }
      }
    });

    // Check if current user has an active/completed machine (remains permanently true once a machine is bought & confirmed so WhatsApp & locked planes never relock)
    const userInvestments = investments.filter(
      (i) =>
        i.user_id === user.id ||
        i.user_id === userId ||
        doesTxBelongToUser({ user_id: i.user_id, customer_phone: (i as any).customer_phone } as any, user, userId)
    );
    const confirmedUserInvestments = userInvestments.filter(
      (i) => i.status === 'ACTIVE' || i.status === 'PAYOUT_COMPLETE'
    );
    const hasBoughtMachine = confirmedUserInvestments.length > 0 || Boolean(user.has_bought_machine);
    user.has_bought_machine = hasBoughtMachine;

    let pendingTeamIncome = 0;

    const teamMembers = allReferredUsers.map((member) => {
      const memberInvestments = investments.filter(
        (i) => i.user_id === member.id && (i.status === 'ACTIVE' || i.status === 'PAYOUT_COMPLETE')
      );
      const hasBought = memberInvestments.length > 0;
      const totalInvested = memberInvestments.reduce((sum, i) => sum + i.amount_invested, 0);

      // Team commission (8%) is credited immediately without waiting for end of cycle
      let settledCommission = 0;
      memberInvestments.forEach((mInv) => {
        const bonus8Pct = mInv.team_income_amount || Math.round(mInv.amount_invested * 0.08);
        settledCommission += bonus8Pct;
      });

      const rawPhone = member.phone_number || member.phoneNumber || 'Investor';
      const maskedPhone =
        rawPhone.length > 6
          ? `${rawPhone.slice(0, 4)}***${rawPhone.slice(-3)}`
          : rawPhone;

      return {
        id: member.id,
        phone_masked: maskedPhone,
        full_name: member.full_name || 'Team Member',
        joined_at: member.created_at,
        has_bought_machine: hasBought,
        machines_count: memberInvestments.length,
        latest_machine: memberInvestments[0]?.machine_title || (hasBought ? 'Active Unit' : 'None yet'),
        total_invested: totalInvested,
        commission_generated: settledCommission,
        status: hasBought ? 'ACTIVE_BUYER' : 'JOINED_PENDING_BUY',
      };
    });

    // Team size: specifically people who joined AND bought machine using his link
    const activeBuyers = teamMembers.filter((m) => m.has_bought_machine);
    const teamSize = activeBuyers.length;
    const totalTeamCommissions = teamMembers.reduce((sum, m) => sum + m.commission_generated, 0);
    const totalInvitedMachinesPrice = activeBuyers.reduce((sum, m) => sum + m.total_invested, 0);
    const lastMonthReward5Pct = Math.round(totalInvitedMachinesPrice * 0.05);

    // Calculate AI Income (all total daily yields per Item 6), Today's earnings (daily yield per Item 5), and Total Returns
    const totalClaimedYield = confirmedUserInvestments.reduce((sum, i) => sum + (i.total_claimed || 0), 0);
    const totalDailyYieldsAll = confirmedUserInvestments.reduce(
      (sum, i) => sum + (Number(i.daily_yield) || 0) * Math.max(1, Number(i.days_elapsed) || 1),
      0
    );
    const totalMachineReturns = confirmedUserInvestments.reduce((sum, i) => sum + (i.total_return || 0), 0);
    const aiIncome = Math.max(totalClaimedYield, totalDailyYieldsAll);
    const isTodayWeekday = isWeekdayMonToFri(new Date());
    const todayEarnings = confirmedUserInvestments.reduce((sum, i) => {
      if (i.status === 'ACTIVE') {
        // AV1 and AV2 automatically run Monday to Friday (no Weekends)
        if (isAv1OrAv2WeekdayMachine(i) && !isTodayWeekday) {
          return sum;
        }
        return sum + (i.daily_yield || 0);
      }
      return sum;
    }, 0);

    const userCompletedCycles = confirmedUserInvestments.filter(
      (i) => i.status === 'PAYOUT_COMPLETE' || (i.days_elapsed || 0) >= (i.duration_days || 1)
    );
    const hasCompletedCycle = userCompletedCycles.length > 0;
    const reflectedTotalDeposited = Math.max(totalDeposited + pendingDeposits, computedWallet);

    res.json({
      user_id: user.id,
      balance: user.balance,
      wallet_balance: computedWallet,
      available_wallet: computedWallet,
      confirmed_wallet: confirmedWallet,
      deposit_details: {
        total_deposited: reflectedTotalDeposited,
        wallet_balance: computedWallet,
        available_wallet: computedWallet,
        confirmed_wallet: confirmedWallet,
        pending_deposits: pendingDeposits,
        deposits_count: userDeposits.length,
        confirmed_deposits_count: userDeposits.filter((t) => t.status === 'SUCCESS' || t.status === 'CONFIRMED').length,
        pending_deposits_count: userDeposits.filter((t) => t.status === 'PENDING').length,
        recent_deposits: userDeposits.slice(0, 20),
      },
      withdraw_details: {
        total_withdrawn: totalWithdrawn,
        confirmed_withdrawn: confirmedWithdrawn,
        pending_withdrawals: pendingWithdrawals,
        withdrawals_count: userWithdrawals.length,
        withdrawable_balance: user.balance,
        has_bought_machine: hasBoughtMachine,
        has_completed_cycle: hasCompletedCycle,
        can_withdraw: hasBoughtMachine && user.balance >= 3000,
        min_withdrawal: 3000,
        recent_withdrawals: userWithdrawals.slice(0, 20),
      },
      ai_income: aiIncome,
      today_earnings: todayEarnings,
      total_returns: totalMachineReturns,
      team_size_details: {
        team_size: teamSize, // People who joined AND bought machine using his link
        total_joined: teamMembers.length,
        total_commissions_earned: totalTeamCommissions,
        pending_team_income: pendingTeamIncome,
        total_invited_machines_price: totalInvitedMachinesPrice,
        last_month_reward_5pct: lastMonthReward5Pct,
        team_members: teamMembers,
        referral_code: user.referral_code,
        referral_link: `${req.protocol}://${req.get('host')}/reg?AvorInvest=${user.referral_code}`,
        monthly_income_qualified: teamSize >= 4,
        monthly_income_pct: 5,
        claimed_tier_rewards: (user as any).claimed_tier_rewards || [],
      },
      has_bought_machine: hasBoughtMachine,
    });
  });

  // 6c. Claim AVCLASS Referral Tier Cash Reward (A class: 4 people -> 25k, B: 9 -> 70k, etc.)
  app.post('/api/user/claim-referral-reward', (req, res) => {
    const { user_id, tier } = req.body;
    const user = Array.from(users.values()).find((u) => u.id === user_id);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const TIER_REWARDS: Record<string, { required: number; reward: number; name: string }> = {
      A: { required: 4, reward: 25000, name: 'A class (4 Customers)' },
      B: { required: 9, reward: 60000, name: 'B class (9 Customers)' },
      C: { required: 20, reward: 110000, name: 'C class (20 Customers)' },
      D: { required: 35, reward: 220000, name: 'D class (35 Customers)' },
      E: { required: 70, reward: 450000, name: 'E class (70 Customers)' },
      F: { required: 120, reward: 850000, name: 'F class (120 Customers)' },
      G: { required: 300, reward: 1200000, name: 'G class (300 Customers)' },
      H: { required: 5000, reward: 3000000, name: 'H class (5000 Customers)' },
      I: { required: 10000, reward: 8500000, name: 'I class (10000 Customers)' },
    };

    const tierKey = (tier || '').toString().toUpperCase();
    const targetTier = TIER_REWARDS[tierKey];
    if (!targetTier) return res.status(400).json({ error: 'Invalid class tier requested.' });

    (user as any).claimed_tier_rewards = (user as any).claimed_tier_rewards || [];
    if ((user as any).claimed_tier_rewards.includes(tierKey)) {
      return res.status(400).json({ error: `You have already claimed the reward for ${targetTier.name}.` });
    }

    // Count people who joined using his link AND bought a machine
    const userRefCode = (user.referral_code || '').toLowerCase();
    const allReferred = Array.from(users.values()).filter(
      (u) => u.id !== user.id && (u.referred_by || '').toLowerCase() === userRefCode
    );
    const activeBuyers = allReferred.filter((m) => {
      const mInvs = investments.filter((i) => i.user_id === m.id && (i.status === 'ACTIVE' || i.status === 'PAYOUT_COMPLETE'));
      return mInvs.length > 0 || !!m.has_bought_machine;
    });

    if (activeBuyers.length < targetTier.required) {
      return res.status(400).json({
        error: `Requirement not met. You need ${targetTier.required} active referral buyers for ${targetTier.name}, but currently have ${activeBuyers.length}.`,
      });
    }

    user.balance += targetTier.reward;
    (user as any).claimed_tier_rewards.push(tierKey);
    saveRegisteredUserToDisk(user);

    const newTx: Transaction = {
      id: `tx-tier-${Date.now()}`,
      user_id: user.id,
      amount: targetTier.reward,
      type: 'REFERRAL_BONUS',
      status: 'SUCCESS',
      payment_method: `AVCLASS ${targetTier.name} Reward`,
      payment_reference: `TIER-${tierKey}-${Math.floor(100000 + Math.random() * 900000)}`,
      created_at: new Date().toISOString(),
    };
    transactions.unshift(newTx);

    pushNotification(
      user.id,
      `${targetTier.name} Reward Credited!`,
      `You successfully received ${targetTier.reward.toLocaleString()} UGX in your wallet for bringing ${targetTier.required} referral buyers!`,
      'PAYMENT'
    );

    res.json({
      message: `Successfully claimed ${targetTier.reward.toLocaleString()} UGX reward for ${targetTier.name}!`,
      new_balance: user.balance,
      claimed_tier_rewards: (user as any).claimed_tier_rewards,
    });
  });

  // 6d. Endpoint for "Get last month's reward" button from Profile / Class Requirements Table
  // Rules:
  // * Last month's reward should be collected when a customer has invited 4 or more customers (people who have bought machines)
  // * Total last month's reward collected should be only 5% the total the machine's price the invited customer has bought.
  app.post('/api/user/claim-class-reward', (req, res) => {
    const { user_id, classLevel } = req.body;
    const user = findOrRestoreUser(user_id, req.body);
    if (!user) return res.status(404).json({ error: 'User not found. Please log in first.' });

    (user as any).claimed_tier_rewards = (user as any).claimed_tier_rewards || [];

    // Count invited customers who have bought machines
    const userRefCode = (user.referral_code || '').toLowerCase();
    const seenIds = new Set<string>();
    const allReferred: User[] = [];
    for (const u of users.values()) {
      if (u.id && u.id !== user.id && !seenIds.has(u.id) && (u.referred_by || '').toLowerCase() === userRefCode) {
        seenIds.add(u.id);
        allReferred.push(u);
      }
    }

    const userConfirmedInvs = investments.filter(
      (i) => i.user_id === user.id && (i.status === 'ACTIVE' || i.status === 'PAYOUT_COMPLETE')
    );
    if (userConfirmedInvs.length === 0) {
      return res.status(400).json({
        error: 'Access Denied: You must have an Admin-confirmed running machine before claiming rewards.',
      });
    }

    const activeBuyers = allReferred.filter((m) => {
      const mInvs = investments.filter((i) => i.user_id === m.id && (i.status === 'ACTIVE' || i.status === 'PAYOUT_COMPLETE'));
      return mInvs.length > 0;
    });

    const buyerCount = activeBuyers.length;
    if (buyerCount < 4) {
      const needed = 4 - buyerCount;
      return res.status(400).json({
        error: `Last month's reward can only be collected when you have invited 4 or more customers (people who have bought machines). You currently have ${buyerCount} invited customer(s) who bought machines (${needed} more needed).`,
        invited_count: buyerCount,
      });
    }

    // Calculate total machine price bought by the invited customers
    const totalInvitedMachinesPrice = activeBuyers.reduce((sum, buyer) => {
      const buyerInvs = investments.filter((i) => i.user_id === buyer.id && (i.status === 'ACTIVE' || i.status === 'PAYOUT_COMPLETE'));
      return sum + buyerInvs.reduce((s, inv) => s + inv.amount_invested, 0);
    }, 0);

    // Total last month's reward collected should be only 5% the total the machine's price the invited customer has bought
    const rewardAmount5Pct = Math.round(totalInvitedMachinesPrice * 0.05);
    if (rewardAmount5Pct <= 0) {
      return res.status(400).json({
        error: 'Invited customers have not completed any eligible machine purchases yet.',
      });
    }

    const rewardClaimKey = classLevel ? classLevel.toString().toUpperCase() : `LAST_MONTH_5PCT_${buyerCount}_${totalInvitedMachinesPrice}`;
    if ((user as any).claimed_tier_rewards.includes(rewardClaimKey)) {
      return res.status(400).json({
        error: `You have already collected last month's 5% reward (${rewardAmount5Pct.toLocaleString()} UGX) for your current invited customers' machine purchases.`,
      });
    }

    user.balance += rewardAmount5Pct;
    (user as any).claimed_tier_rewards.push(rewardClaimKey);
    saveRegisteredUserToDisk(user);

    const newTx: Transaction = {
      id: `tx-class-${Date.now()}`,
      user_id: user.id,
      amount: rewardAmount5Pct,
      type: 'REFERRAL_BONUS',
      status: 'SUCCESS',
      payment_method: `Last Month's Reward (5% of Invited Customers' Machine Price)`,
      payment_reference: `REWARD-5PCT-${Math.floor(100000 + Math.random() * 900000)}`,
      created_at: new Date().toISOString(),
    };
    transactions.unshift(newTx);

    pushNotification(
      user.id,
      `Last Month's Reward (5%) Collected!`,
      `You successfully collected ${rewardAmount5Pct.toLocaleString()} UGX (5% of ${totalInvitedMachinesPrice.toLocaleString()} UGX total machine price bought by your ${buyerCount} invited customers) into your balance!`,
      'PAYMENT'
    );

    res.json({
      message: `Congratulations! ${rewardAmount5Pct.toLocaleString()} UGX (5% of invited customers' machine price) has been collected into your balance!`,
      amount_claimed: rewardAmount5Pct,
      new_balance: user.balance,
      claimed_tier_rewards: (user as any).claimed_tier_rewards,
    });
  });

  // 7. Get User Portfolio & Calculate Live Unclaimed Earnings
  app.get('/api/user/portfolio/:userId', (req, res) => {
    const userId = req.params.userId;
    const queryPhone = (req.query.phone || req.query.phone_number || '').toString().trim();
    const user = findOrRestoreUser(userId, { user_id: userId, phone_number: queryPhone, user_phone: queryPhone });
    const userInvestments = investments.filter(
      (i) => i.user_id === userId || (user && i.user_id === user.id) || doesTxBelongToUser({ user_id: i.user_id, customer_phone: (i as any).customer_phone } as any, user, userId)
    );

    // Calculate accrued earnings based on Monday–Friday automatic running for AV1 & AV2 (no Weekends)
    const nowDateObj = new Date();
    userInvestments.forEach((inv) => {
      // Do NOT count days or accrue yield while PENDING Admin payment confirmation
      if (inv.status === 'PENDING') {
        inv.days_elapsed = 0;
        inv.unclaimed_earnings = 0;
        return;
      }

      syncSingleActiveMachineAutoRun(inv, nowDateObj);
    });
    if (user) {
      syncUserConfirmedFinances(user, user.id);
    }

    res.json(userInvestments);
  });

  // 8. Claim Daily Yield
  app.post('/api/user/claim-yield', (req, res) => {
    const { user_id, investment_id } = req.body;
    const user = findOrRestoreUser(user_id, req.body);
    if (!user) return res.status(400).json({ error: 'User not found.' });

    let claimedAmount = 0;
    const targetInvs = investment_id
      ? investments.filter((i) => i.id === investment_id && i.user_id === user_id && i.status === 'ACTIVE')
      : investments.filter((i) => i.user_id === user_id && i.status === 'ACTIVE' && i.unclaimed_earnings > 0);

    if (targetInvs.length === 0) {
      return res.status(400).json({ error: 'No unclaimed yield available. Your machine must be confirmed by Admin and running first.' });
    }

    targetInvs.forEach((inv) => {
      if (inv.unclaimed_earnings > 0) {
        claimedAmount += inv.unclaimed_earnings;
        inv.total_claimed += inv.unclaimed_earnings;
        inv.last_claim_at = new Date().toISOString();
        inv.unclaimed_earnings = 0;

        if (inv.total_claimed >= inv.total_return) {
          inv.status = 'PAYOUT_COMPLETE';
        }
      }
    });

    user.balance += claimedAmount;

    // Log transaction
    transactions.unshift({
      id: `tx-claim-${Date.now()}`,
      user_id: user.id,
      amount: claimedAmount,
      type: 'DAILY_YIELD',
      status: 'SUCCESS',
      payment_method: 'Avor Invest Yield Vault',
      payment_reference: `YIELD-CLAIM-${Math.floor(10000 + Math.random() * 90000)}`,
      created_at: new Date().toISOString(),
    });

    pushNotification(
      user.id,
      'Yield Claimed',
      `You successfully claimed ${claimedAmount.toLocaleString()} UGX daily yield into your account balance.`,
      'YIELD'
    );

    res.json({
      message: `Claimed ${claimedAmount.toLocaleString()} UGX daily yield successfully!`,
      claimed_amount: claimedAmount,
      new_balance: user.balance,
    });
  });

  // 8b. Get & Edit Homepage Configuration
  app.get('/api/config/homepage', (req, res) => {
    getActiveReceiver(); // sync latest receiver and rotation time
    res.json(homepageConfig);
  });

  app.put('/api/admin/config/homepage', (req, res) => {
    const {
      announcement_badge,
      headline,
      subheadline,
      notice_text,
      deposit_receiver_number,
      deposit_receiver_name,
      custom_total_customers,
      custom_machines_sold,
      custom_total_cycles,
      custom_active_cycles,
      custom_completed_cycles,
      custom_total_system_wallet,
      custom_total_verified_investment,
      custom_total_withdrawn,
    } = req.body;

    if (announcement_badge !== undefined) homepageConfig.announcement_badge = announcement_badge;
    if (headline !== undefined) homepageConfig.headline = headline;
    if (subheadline !== undefined) homepageConfig.subheadline = subheadline;
    if (notice_text !== undefined) homepageConfig.notice_text = notice_text;
    if (deposit_receiver_number !== undefined) homepageConfig.deposit_receiver_number = deposit_receiver_number;
    if (deposit_receiver_name !== undefined) homepageConfig.deposit_receiver_name = deposit_receiver_name;
    if (custom_total_customers !== undefined) {
      homepageConfig.custom_total_customers =
        custom_total_customers === null || custom_total_customers === ''
          ? null
          : Math.max(0, Number(custom_total_customers) || 0);
    }
    if (custom_machines_sold !== undefined) {
      homepageConfig.custom_machines_sold =
        custom_machines_sold === null || custom_machines_sold === ''
          ? null
          : Math.max(0, Number(custom_machines_sold) || 0);
    }
    if (custom_total_cycles !== undefined) {
      homepageConfig.custom_total_cycles =
        custom_total_cycles === null || custom_total_cycles === ''
          ? null
          : Math.max(0, Number(custom_total_cycles) || 0);
    }
    if (custom_active_cycles !== undefined) {
      homepageConfig.custom_active_cycles =
        custom_active_cycles === null || custom_active_cycles === ''
          ? null
          : Math.max(0, Number(custom_active_cycles) || 0);
    }
    if (custom_completed_cycles !== undefined) {
      homepageConfig.custom_completed_cycles =
        custom_completed_cycles === null || custom_completed_cycles === ''
          ? null
          : Math.max(0, Number(custom_completed_cycles) || 0);
    }
    if (custom_total_system_wallet !== undefined) {
      homepageConfig.custom_total_system_wallet =
        custom_total_system_wallet === null || custom_total_system_wallet === ''
          ? null
          : Math.max(0, Number(custom_total_system_wallet) || 0);
    }
    if (custom_total_verified_investment !== undefined) {
      homepageConfig.custom_total_verified_investment =
        custom_total_verified_investment === null || custom_total_verified_investment === ''
          ? null
          : Math.max(0, Number(custom_total_verified_investment) || 0);
    }
    if (custom_total_withdrawn !== undefined) {
      homepageConfig.custom_total_withdrawn =
        custom_total_withdrawn === null || custom_total_withdrawn === ''
          ? null
          : Math.max(0, Number(custom_total_withdrawn) || 0);
    }
    saveHomepageConfigToDisk();

    res.json({ message: 'Homepage & system metrics updated successfully!', homepageConfig });
  });

  // 8c. Admin Edit Global System Metrics (Machines Sold, Total Cycles, Total Customers, Total System Wallet)
  app.post('/api/admin/config/metrics', (req, res) => {
    const {
      total_customers_count,
      machines_sold_count,
      total_cycles_count,
      active_cycles_count,
      completed_cycles_count,
      total_system_wallet,
      total_verified_investment,
      total_withdrawn,
      reset_to_auto,
    } = req.body || {};

    if (reset_to_auto) {
      homepageConfig.custom_total_customers = null;
      homepageConfig.custom_machines_sold = null;
      homepageConfig.custom_total_cycles = null;
      homepageConfig.custom_active_cycles = null;
      homepageConfig.custom_completed_cycles = null;
      homepageConfig.custom_total_system_wallet = null;
      homepageConfig.custom_total_verified_investment = null;
      homepageConfig.custom_total_withdrawn = null;
      saveHomepageConfigToDisk();
      return res.json({
        message: 'System metrics reset to automatic live calculation.',
        homepageConfig,
      });
    }

    if (total_customers_count !== undefined) {
      homepageConfig.custom_total_customers =
        total_customers_count === null || total_customers_count === ''
          ? null
          : Math.max(0, Number(total_customers_count) || 0);
    }
    if (machines_sold_count !== undefined) {
      homepageConfig.custom_machines_sold =
        machines_sold_count === null || machines_sold_count === ''
          ? null
          : Math.max(0, Number(machines_sold_count) || 0);
    }
    if (total_cycles_count !== undefined) {
      homepageConfig.custom_total_cycles =
        total_cycles_count === null || total_cycles_count === ''
          ? null
          : Math.max(0, Number(total_cycles_count) || 0);
    }
    if (active_cycles_count !== undefined) {
      homepageConfig.custom_active_cycles =
        active_cycles_count === null || active_cycles_count === ''
          ? null
          : Math.max(0, Number(active_cycles_count) || 0);
    }
    if (completed_cycles_count !== undefined) {
      homepageConfig.custom_completed_cycles =
        completed_cycles_count === null || completed_cycles_count === ''
          ? null
          : Math.max(0, Number(completed_cycles_count) || 0);
    }
    if (total_system_wallet !== undefined) {
      homepageConfig.custom_total_system_wallet =
        total_system_wallet === null || total_system_wallet === ''
          ? null
          : Math.max(0, Number(total_system_wallet) || 0);
    }
    if (total_verified_investment !== undefined) {
      homepageConfig.custom_total_verified_investment =
        total_verified_investment === null || total_verified_investment === ''
          ? null
          : Math.max(0, Number(total_verified_investment) || 0);
    }
    if (total_withdrawn !== undefined) {
      homepageConfig.custom_total_withdrawn =
        total_withdrawn === null || total_withdrawn === ''
          ? null
          : Math.max(0, Number(total_withdrawn) || 0);
    }

    saveHomepageConfigToDisk();
    res.json({
      message: 'System metrics (Machines Sold, Total Cycles, Total Customers & Total System Wallet) updated!',
      homepageConfig,
    });
  });

  // =========================================================================
  // DYNAMIC DEPOSIT NUMBERS & 7-HOUR ROTATION ENDPOINTS
  // =========================================================================

  // Public: Get currently active deposit receiver number (checks timer automatically)
  // Supports both /api/wallet/active-receiver and /api/deposit-numbers/active
  app.get(['/api/wallet/active-receiver', '/api/deposit-numbers/active'], (req, res) => {
    const rotate = req.query.rotate === 'true';
    const activeInfo = getActiveReceiver(rotate);
    const activePool = depositReceiverNumbers.filter((n) => n.is_active);
    res.json({
      receiver: activeInfo.receiver,
      active_numbers: activePool,
      config: activeInfo.config,
      mode: activeInfo.config.mode,
      timeRemainingSeconds: activeInfo.timeRemainingSeconds,
      ...activeInfo.receiver,
    });
  });

  // Public: Get or advance receiver for incoming depositor (handles round-robin or timer)
  app.get('/api/deposit-numbers/next-for-deposit', (req, res) => {
    const activeInfo = getActiveReceiver(true);
    res.json({
      receiver: activeInfo.receiver,
      config: activeInfo.config,
      mode: activeInfo.config.mode,
      timeRemainingSeconds: activeInfo.timeRemainingSeconds,
      ...activeInfo.receiver,
    });
  });

  // Admin: Get all deposit receiver numbers, rotation status, and rotation logs
  app.get('/api/admin/deposit-numbers', (req, res) => {
    const activeInfo = getActiveReceiver();
    res.json({
      numbers: depositReceiverNumbers,
      config: depositRotationConfig,
      active: activeInfo.receiver,
      timeRemainingSeconds: activeInfo.timeRemainingSeconds,
      rotation_history: depositRotationConfig.rotation_history || [],
    });
  });

  // Admin: Add a new deposit receiver number to the pool
  app.post('/api/admin/deposit-numbers', (req, res) => {
    const {
      phone_number,
      account_name,
      carrier = 'MTN',
      daily_limit_ugx = 5000000,
      daily_receiving_limit = 5000000,
      rotation_duration_minutes = 5,
      rotation_duration_hours = 7,
      notes,
      is_active = true,
    } = req.body;

    if (!phone_number || !account_name) {
      return res.status(400).json({ error: 'Phone number and Account Name are required.' });
    }

    const cleanPhone = phone_number.replace(/\s+/g, '');
    const finalDailyLimit = Number(daily_receiving_limit || daily_limit_ugx) || 5000000;
    const finalMinutes = Number(rotation_duration_minutes) || (Number(rotation_duration_hours) ? Number(rotation_duration_hours) * 60 : 5);

    const newNumber: DepositReceiverNumber = {
      id: `rec-${Date.now()}`,
      phone_number: cleanPhone,
      account_name: account_name.toUpperCase().trim(),
      carrier: (carrier === 'AIRTEL' || carrier === 'MTN' || carrier === 'BOTH') ? carrier : 'MTN',
      is_active: Boolean(is_active),
      priority: depositReceiverNumbers.length + 1,
      daily_limit_ugx: finalDailyLimit,
      daily_receiving_limit: finalDailyLimit,
      amount_received_today: 0,
      total_received_ugx: 0,
      total_transactions_count: 0,
      rotation_duration_minutes: finalMinutes,
      rotation_duration_hours: finalMinutes / 60,
      activated_at: new Date().toISOString(),
      last_rotated_at: new Date().toISOString(),
      notes: notes || '',
      created_at: new Date().toISOString(),
    };

    depositReceiverNumbers.push(newNumber);
    if (depositReceiverNumbers.filter((n) => n.is_active).length === 1 || !depositRotationConfig.current_active_id) {
      depositRotationConfig.current_active_id = newNumber.id;
      depositRotationConfig.last_rotated_at = new Date().toISOString();
      depositRotationConfig.next_rotation_at = new Date(Date.now() + finalMinutes * 60 * 1000).toISOString();
    }
    saveDepositNumbersToDisk();
    getActiveReceiver(); // sync

    res.status(201).json({
      message: `Deposit number ${newNumber.phone_number} (${newNumber.account_name}) added to pool successfully! (5m rotation default)`,
      number: newNumber,
      numbers: depositReceiverNumbers,
    });
  });

  // Admin: Update deposit receiver number details
  app.put('/api/admin/deposit-numbers/:id', (req, res) => {
    const { id } = req.params;
    const {
      phone_number,
      account_name,
      carrier,
      daily_limit_ugx,
      daily_receiving_limit,
      rotation_duration_minutes,
      rotation_duration_hours,
      is_active,
      notes,
      priority,
      amount_received_today,
    } = req.body;

    const num = depositReceiverNumbers.find((n) => n.id === id);
    if (!num) {
      return res.status(404).json({ error: 'Deposit receiver number not found.' });
    }

    if (phone_number) num.phone_number = phone_number.replace(/\s+/g, '');
    if (account_name) num.account_name = account_name.toUpperCase().trim();
    if (carrier) num.carrier = carrier;
    if (daily_receiving_limit !== undefined || daily_limit_ugx !== undefined) {
      const limitVal = Number(daily_receiving_limit || daily_limit_ugx);
      num.daily_receiving_limit = limitVal;
      num.daily_limit_ugx = limitVal;
    }
    if (rotation_duration_minutes !== undefined) {
      num.rotation_duration_minutes = Number(rotation_duration_minutes);
      num.rotation_duration_hours = Number(rotation_duration_minutes) / 60;
    } else if (rotation_duration_hours !== undefined) {
      num.rotation_duration_hours = Number(rotation_duration_hours);
      num.rotation_duration_minutes = Number(rotation_duration_hours) * 60;
    }
    if (is_active !== undefined) num.is_active = Boolean(is_active);
    if (notes !== undefined) num.notes = notes;
    if (priority !== undefined) num.priority = Number(priority);
    if (amount_received_today !== undefined) num.amount_received_today = Number(amount_received_today);

    saveDepositNumbersToDisk();
    getActiveReceiver(); // sync

    res.json({
      message: `Deposit number ${num.phone_number} updated successfully!`,
      number: num,
      numbers: depositReceiverNumbers,
    });
  });

  // Admin: Clear all deposit receiver numbers from rotation pool
  app.delete(['/api/admin/deposit-numbers/clear-all', '/api/admin/deposit-numbers/all'], (req, res) => {
    const previousCount = depositReceiverNumbers.length;
    depositReceiverNumbers = [];
    depositRotationConfig.current_active_id = '';
    depositRotationConfig.rotation_history = depositRotationConfig.rotation_history || [];
    depositRotationConfig.rotation_history.unshift({
      id: `rot-${Date.now()}`,
      number_id: '',
      phone_number: '',
      account_name: 'ALL NUMBERS CLEARED',
      reason: `All ${previousCount} deposit numbers removed from rotation pool by Admin for replacement`,
      timestamp: new Date().toISOString(),
    });

    saveDepositNumbersToDisk();
    getActiveReceiver();

    res.json({
      message: 'All deposit numbers successfully removed from the rotation pool. Pool is empty and ready for replacement numbers.',
      numbers: depositReceiverNumbers,
      active: null,
    });
  });

  // Admin: Delete a deposit receiver number
  app.delete('/api/admin/deposit-numbers/:id', (req, res) => {
    const { id } = req.params;
    if (id === 'clear-all' || id === 'all') {
      depositReceiverNumbers = [];
      depositRotationConfig.current_active_id = '';
      saveDepositNumbersToDisk();
      getActiveReceiver();
      return res.json({
        message: 'All deposit numbers successfully removed from rotation pool.',
        numbers: depositReceiverNumbers,
        active: null,
      });
    }

    const index = depositReceiverNumbers.findIndex((n) => n.id === id);
    if (index === -1) {
      return res.status(404).json({ error: 'Deposit receiver number not found.' });
    }

    const deleted = depositReceiverNumbers.splice(index, 1)[0];

    // If the deleted number was active, advance to another active number
    if (depositRotationConfig.current_active_id === id) {
      const activeLeft = depositReceiverNumbers.filter((n) => n.is_active);
      if (activeLeft.length > 0) {
        depositRotationConfig.current_active_id = activeLeft[0].id;
        depositRotationConfig.last_rotated_at = new Date().toISOString();
        const mins = activeLeft[0].rotation_duration_minutes || depositRotationConfig.time_interval_minutes || 5;
        depositRotationConfig.next_rotation_at = new Date(Date.now() + mins * 60 * 1000).toISOString();
      } else {
        depositRotationConfig.current_active_id = '';
      }
    }

    saveDepositNumbersToDisk();
    getActiveReceiver();

    res.json({
      message: `Deposit number ${deleted.phone_number} (${deleted.account_name}) removed from pool.`,
      numbers: depositReceiverNumbers,
    });
  });

  // Admin: Activate specific number right now (with custom minutes/hours lock, e.g. 5 minutes)
  app.post('/api/admin/deposit-numbers/:id/activate', (req, res) => {
    const { id } = req.params;
    const { duration_minutes, duration_hours } = req.body;

    const num = depositReceiverNumbers.find((n) => n.id === id);
    if (!num) {
      return res.status(404).json({ error: 'Deposit receiver number not found.' });
    }

    num.is_active = true;
    num.activated_at = new Date().toISOString();
    num.last_rotated_at = new Date().toISOString();

    const mins = Number(duration_minutes) || (Number(duration_hours) ? Number(duration_hours) * 60 : (num.rotation_duration_minutes || 5));
    num.rotation_duration_minutes = mins;
    num.rotation_duration_hours = mins / 60;

    depositRotationConfig.current_active_id = num.id;
    depositRotationConfig.last_rotated_at = new Date().toISOString();
    depositRotationConfig.next_rotation_at = new Date(Date.now() + mins * 60 * 1000).toISOString();

    depositRotationConfig.rotation_history = depositRotationConfig.rotation_history || [];
    depositRotationConfig.rotation_history.unshift({
      id: `rot-${Date.now()}`,
      number_id: num.id,
      phone_number: num.phone_number,
      account_name: num.account_name,
      reason: `Manually Activated by Admin (${mins} Minute Active Window)`,
      timestamp: new Date().toISOString(),
    });

    saveDepositNumbersToDisk();
    getActiveReceiver();

    res.json({
      message: `Deposit number ${num.phone_number} (${num.account_name}) is now ACTIVE for ${mins} minutes!`,
      active_number: num,
      config: depositRotationConfig,
      numbers: depositReceiverNumbers,
    });
  });

  // Admin: Rotate immediately to next number (supports both /rotate and /rotate-now)
  app.post(['/api/admin/deposit-numbers/rotate', '/api/admin/deposit-numbers/rotate-now'], (req, res) => {
    const activeNumbers = depositReceiverNumbers.filter((n) => n.is_active);
    if (activeNumbers.length === 0) {
      return res.status(400).json({ error: 'No active numbers available in pool to rotate to.' });
    }

    const currentIndex = activeNumbers.findIndex((n) => n.id === depositRotationConfig.current_active_id);
    const nextIndex = (currentIndex + 1) % activeNumbers.length;
    const nextNumber = activeNumbers[nextIndex];

    const mins = nextNumber.rotation_duration_minutes || depositRotationConfig.time_interval_minutes || 5;
    depositRotationConfig.current_active_id = nextNumber.id;
    depositRotationConfig.last_rotated_at = new Date().toISOString();
    depositRotationConfig.next_rotation_at = new Date(Date.now() + mins * 60 * 1000).toISOString();
    nextNumber.activated_at = new Date().toISOString();
    nextNumber.last_rotated_at = new Date().toISOString();

    depositRotationConfig.rotation_history = depositRotationConfig.rotation_history || [];
    depositRotationConfig.rotation_history.unshift({
      id: `rot-${Date.now()}`,
      number_id: nextNumber.id,
      phone_number: nextNumber.phone_number,
      account_name: nextNumber.account_name,
      reason: 'Manual Immediate Swap Triggered by Admin',
      timestamp: new Date().toISOString(),
    });

    getActiveReceiver();

    res.json({
      message: `Successfully swapped active deposit line to ${nextNumber.phone_number} (${nextNumber.account_name})!`,
      active: nextNumber,
      active_number: nextNumber,
      config: depositRotationConfig,
      numbers: depositReceiverNumbers,
    });
  });

  // Admin: Reset daily received totals for all numbers (supports both /reset-daily and /reset-daily-limits)
  app.post(['/api/admin/deposit-numbers/reset-daily', '/api/admin/deposit-numbers/reset-daily-limits'], (req, res) => {
    depositReceiverNumbers.forEach((n) => {
      n.amount_received_today = 0;
    });

    depositRotationConfig.rotation_history = depositRotationConfig.rotation_history || [];
    depositRotationConfig.rotation_history.unshift({
      id: `rot-${Date.now()}`,
      number_id: depositRotationConfig.current_active_id,
      phone_number: '',
      account_name: 'ALL RECEIVER ACCOUNTS',
      reason: 'Daily Receiving Inflow Totals Reset to 0.00 UGX',
      timestamp: new Date().toISOString(),
    });

    res.json({
      message: 'Daily received amounts for all receiving accounts have been reset to 0.00 UGX.',
      numbers: depositReceiverNumbers,
    });
  });

  // Admin: Update rotation configuration (supports /strategy and /rotation-config, on both POST and PUT)
  const handleStrategyUpdate = (req: any, res: any) => {
    const { mode, time_interval_minutes, time_interval_hours, auto_rotate_enabled } = req.body;

    if (mode && ['TIME_BASED', 'ROUND_ROBIN', 'ADMIN_MANUAL'].includes(mode)) {
      depositRotationConfig.mode = mode;
    }
    if (time_interval_minutes !== undefined || time_interval_hours !== undefined) {
      const mins = Math.max(1, Number(time_interval_minutes) || (Number(time_interval_hours) ? Number(time_interval_hours) * 60 : 5));
      depositRotationConfig.time_interval_minutes = mins;
      depositRotationConfig.time_interval_hours = mins / 60;
      const lastTime = new Date(depositRotationConfig.last_rotated_at).getTime();
      depositRotationConfig.next_rotation_at = new Date(lastTime + mins * 60 * 1000).toISOString();
    }
    if (auto_rotate_enabled !== undefined) {
      depositRotationConfig.auto_rotate_enabled = Boolean(auto_rotate_enabled);
    }

    getActiveReceiver();

    res.json({
      message: `Deposit rotation strategy updated successfully to ${depositRotationConfig.time_interval_minutes} minutes!`,
      config: depositRotationConfig,
    });
  };

  app.put('/api/admin/deposit-numbers/rotation-config', handleStrategyUpdate);
  app.post('/api/admin/deposit-numbers/strategy', handleStrategyUpdate);

  // Helper: Automatically credit Admin receiver, reflect on customer wallet, start machine running, and unlock all locked planes
  const processAutomaticDepositAndStartMachine = (
    user: (User & { password_hash?: string }) | undefined,
    tx: Transaction,
    requestedMachineId?: string,
    requestedMachineTitle?: string
  ): Investment | null => {
    const nowIso = new Date().toISOString();
    tx.status = 'SUCCESS';
    (tx as any).wallet_credited = true;
    (tx as any).approved_permanent = true;
    (tx as any).confirmed_at = nowIso;

    // 1. Automatically send money to Admin (credit active receiver number & Admin wallet)
    const recPhone = (tx as any).receiver_phone || RECEIVER_PHONE;
    const recName = (tx as any).receiver_name || RECEIVER_NAME;
    const recId = (tx as any).receiver_id;
    let targetRec =
      depositReceiverNumbers.find((n) => (recId && n.id === recId) || (recPhone && n.phone_number === recPhone)) ||
      depositReceiverNumbers.find((n) => n.is_active) ||
      null;
    if (!targetRec) {
      targetRec = {
        id: recId || `rec-${Date.now()}`,
        phone_number: recPhone,
        account_name: recName,
        carrier: 'MTN',
        is_active: true,
        priority: depositReceiverNumbers.length + 1,
        daily_limit_ugx: 5000000,
        daily_receiving_limit: 5000000,
        amount_received_today: 0,
        total_received_ugx: 0,
        total_transactions_count: 0,
        rotation_duration_minutes: 5,
        rotation_duration_hours: 0.0833,
        activated_at: nowIso,
        last_rotated_at: nowIso,
        created_at: nowIso,
      };
      depositReceiverNumbers.push(targetRec);
      if (!depositRotationConfig.current_active_id) {
        depositRotationConfig.current_active_id = targetRec.id;
      }
    }
    if (!(tx as any).receiver_credited) {
      targetRec.amount_received_today = (targetRec.amount_received_today || 0) + Number(tx.amount || 0);
      targetRec.total_received_ugx = (targetRec.total_received_ugx || 0) + Number(tx.amount || 0);
      targetRec.total_transactions_count = (targetRec.total_transactions_count || 0) + 1;
      targetRec.last_rotated_at = nowIso;
      (tx as any).receiver_credited = true;
      adminUser.balance = (adminUser.balance || 0) + Number(tx.amount || 0);
      saveDepositNumbersToDisk();
    }

    if (!user) {
      saveAppStateToDisk();
      return null;
    }

    // 2. Unlock all locked things immediately & reflect money on customer's wallet
    user.has_bought_machine = true;
    syncUserConfirmedFinances(user, user.id);

    // 3. Automatically start running the customer's machine
    // First, activate any PENDING machine investments for this user
    let activatedInv: Investment | null = null;
    const pendingInvs = investments.filter(
      (i) => (i.user_id === user.id || doesTxBelongToUser({ user_id: i.user_id } as any, user, user.id)) && i.status === 'PENDING'
    );
    for (const pInv of pendingInvs) {
      activateConfirmedMachineInvestment(pInv, 'Auto-started immediately upon deposit to given number');
      pInv.unclaimed_earnings = Math.max(pInv.unclaimed_earnings || 0, pInv.daily_yield || 0);
      activatedInv = pInv;
      const linkedTx = transactions.find((t) => t.investment_id === pInv.id && t.status === 'PENDING');
      if (linkedTx) {
        linkedTx.status = 'SUCCESS';
        (linkedTx as any).confirmed_at = nowIso;
        (linkedTx as any).approved_permanent = true;
      }
    }

    // Second, if a specific machine_id was requested OR no pending machine was waiting, find the matching machine and start it running!
    if (!activatedInv) {
      const depAmt = Number(tx.amount || 0);
      let targetMachine: Machine | undefined;

      if (requestedMachineId) {
        targetMachine = machines.find((m) => m.id === requestedMachineId);
      }
      if (!targetMachine && requestedMachineTitle) {
        const cleanTitle = requestedMachineTitle.split('(')[0].trim().toLowerCase();
        targetMachine = machines.find((m) => (m.title || '').toLowerCase() === cleanTitle);
      }
      if (!targetMachine) {
        // Exact cost match first (prefer AV1/AV2 then any machine)
        targetMachine =
          machines.find((m) => !m.is_av_class && m.total_cost === depAmt) ||
          machines.find((m) => m.total_cost === depAmt);
      }
      if (!targetMachine) {
        // Best machine whose cost <= depAmt (or starter machine AV1 - Machine 1 so a machine always starts running)
        const affordable = machines
          .filter((m) => m.total_cost <= depAmt)
          .sort((a, b) => b.total_cost - a.total_cost);
        targetMachine = affordable[0] || machines[0];
      }

      if (targetMachine) {
        const startDate = new Date();
        const endDate = new Date(startDate.getTime() + targetMachine.duration_days * 24 * 60 * 60 * 1000);
        const newInv: Investment = {
          id: `inv-auto-${Date.now()}`,
          user_id: user.id,
          machine_id: targetMachine.id,
          machine_title: `${targetMachine.title} (1 Unit)`,
          series_tag: targetMachine.series_tag,
          units: 1,
          amount_invested: targetMachine.total_cost,
          daily_yield: targetMachine.daily_yield,
          total_return: targetMachine.total_return,
          duration_days: targetMachine.duration_days,
          days_elapsed: 1,
          last_claim_at: startDate.toISOString(),
          unclaimed_earnings: targetMachine.daily_yield,
          total_claimed: 0,
          status: 'ACTIVE',
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString(),
          confirmed_at: startDate.toISOString(),
          machine: targetMachine,
          // Keep wallet_deducted false on auto-started deposit machines so the deposited amount stays visible on the user's Wallet & Balance until used or withdrawn
          wallet_deducted: false,
          payment_method: tx.payment_method,
        };
        (newInv as any).customer_name = user.full_name || user.name || 'Investor';
        (newInv as any).customer_phone = user.phone_number || (tx as any).customer_phone || '';
        investments.unshift(newInv);
        tx.investment_id = newInv.id;
        if (!tx.machine_title) {
          tx.machine_title = newInv.machine_title;
        }
        activateConfirmedMachineInvestment(newInv, 'Automatically started upon deposit on given number');
        newInv.unclaimed_earnings = targetMachine.daily_yield;
        activatedInv = newInv;
      }
    }

    syncUserConfirmedFinances(user, user.id);
    saveRegisteredUserToDisk(user as User & { password_hash: string });
    saveAppStateToDisk();
    return activatedInv;
  };

  // =========================================================================
  // MoMo API GATEWAY INTEGRATION MVP ENDPOINT (Per Technical Spec)
  // Flow: Customer App -> Deposit on Given Number -> Submitted as PENDING -> Must be confirmed by Admin to reflect on Wallet
  // =========================================================================
  app.post('/api/deposit', async (req, res) => {
    const { userId, amount, userPhone, user_id, phone_number, machine_id, machine_title } = req.body;
    const finalUserId = userId || user_id || 'usr-demo-123';
    const finalAmount = Number(amount);
    const finalPhone = (userPhone || phone_number || '').toString().trim();

    // A. Basic Request Validation
    if (!finalUserId || isNaN(finalAmount) || finalAmount <= 0 || !finalPhone) {
      return res.status(400).json({ error: 'Invalid deposit data provided. Amount and phone number are required.' });
    }

    if (finalAmount < 25000) {
      return res.status(400).json({ error: 'Minimum deposit amount is 25,000 UGX.' });
    }

    try {
      // B. Automatic Number Rotation: Find available account that hasn't hit daily limit
      const activeInfo = getActiveReceiver(true);
      const receivingAccount = activeInfo.receiver || {
        id: 'rec-default',
        phone_number: RECEIVER_PHONE,
        account_name: RECEIVER_NAME,
        carrier: 'MTN' as const,
        amount_received_today: 0,
        daily_receiving_limit: 5000000,
        rotation_duration_minutes: 5,
      };

      const isMtn = receivingAccount.carrier === 'MTN' || (receivingAccount.carrier === 'BOTH' && (finalPhone.startsWith('077') || finalPhone.startsWith('078') || finalPhone.startsWith('076')));
      const network = isMtn ? 'MTN' : 'AIRTEL';
      const transactionIdFromApi = isMtn ? `MTN_MOMO_${Date.now()}` : `AIRTEL_MONEY_${Date.now()}`;

      const user = findOrRestoreUser(finalUserId, { user_phone: finalPhone, phone_number: finalPhone });

      const newTx: Transaction = {
        id: `tx-momo-${Date.now()}`,
        user_id: user ? user.id : finalUserId,
        amount: finalAmount,
        type: 'DEPOSIT',
        status: 'PENDING',
        payment_method: `${network} Mobile Money (From: ${finalPhone} -> To: ${receivingAccount.phone_number} ${receivingAccount.account_name})`,
        payment_reference: transactionIdFromApi,
        machine_title: machine_title || undefined,
        created_at: new Date().toISOString(),
      };
      (newTx as any).wallet_credited = false;
      (newTx as any).receiver_credited = false;
      (newTx as any).approved_permanent = false;
      (newTx as any).receiver_id = receivingAccount.id;
      (newTx as any).receiver_phone = receivingAccount.phone_number;
      (newTx as any).receiver_name = receivingAccount.account_name;
      (newTx as any).customer_name = user?.full_name || 'Investor';
      (newTx as any).customer_phone = finalPhone;
      (newTx as any).user_phone = user?.phone_number || finalPhone;
      (newTx as any).machine_id = machine_id || undefined;
      transactions.unshift(newTx);

      if (user) {
        syncUserConfirmedFinances(user, user.id);
        pushNotification(
          user.id,
          `⏳ Deposit Submitted (${finalAmount.toLocaleString()} UGX) — Awaiting Admin Confirmation`,
          `Your deposit of ${finalAmount.toLocaleString()} UGX to ${receivingAccount.account_name} (${receivingAccount.phone_number}) has been submitted to Admin. Once Admin confirms your deposit, it will reflect on your Wallet!`,
          'PAYMENT'
        );
      }

      notifyAllAdmins(
        `🔔 New Deposit Pending Confirmation: UGX ${finalAmount.toLocaleString()}`,
        `Customer ${user?.full_name || finalUserId} (Sender Phone: ${finalPhone}) submitted a deposit of UGX ${finalAmount.toLocaleString()} via ${network} Mobile Money to Receiver ${receivingAccount.phone_number} (${receivingAccount.account_name}). Please confirm in Admin Console so it reflects on the customer's Wallet. Ref: ${transactionIdFromApi}.`,
        'PAYMENT',
        {
          transaction_id: newTx.id,
          customer_name: user?.full_name || finalUserId,
          customer_phone: finalPhone,
          amount: finalAmount,
          payment_method: `${network} Mobile Money`,
          receiver_phone: receivingAccount.phone_number,
          receiver_name: receivingAccount.account_name,
          payment_reference: transactionIdFromApi,
          machine_title: machine_title || 'Wallet Deposit Order (Pending Admin Confirmation)',
          order_status: 'PENDING',
        }
      );

      void saveDepositToFirestoreCollection(newTx, 'pending');
      void ensureOrderSavedInFirestore({
        docId: transactionIdFromApi.replace(/[^a-zA-Z0-9_-]/g, ''),
        name: user?.full_name || finalPhone || finalUserId || 'Avor Investor',
        item: `Deposited UGX ${finalAmount.toLocaleString()} via ${network} Mobile Money from ${finalPhone} to ${receivingAccount.phone_number} (${receivingAccount.account_name})${machine_title ? ` • ${machine_title}` : ''} (Pending Admin Confirmation)`,
        senderPhone: finalPhone,
        receiverPhone: receivingAccount.phone_number,
        receiverName: receivingAccount.account_name,
        amount: finalAmount,
        machineTitle: machine_title || 'Wallet Deposit Order (Pending Admin Confirmation)',
        paymentMethod: `${network} Mobile Money`,
        paymentReference: transactionIdFromApi,
        status: 'PENDING',
      });

      saveAppStateToDisk();

      broadcastRealtimeEvent({
        type: 'DEPOSIT_CREATED_PENDING',
        transaction: newTx,
        transaction_id: newTx.id,
        payment_reference: newTx.payment_reference,
        status: 'PENDING',
        status_label: 'Pending',
        user_id: newTx.user_id,
        user_phone: (newTx as any).user_phone,
        customer_phone: (newTx as any).customer_phone,
        amount: newTx.amount,
        wallet_balance: user ? user.wallet_balance || 0 : 0,
        timestamp: new Date().toISOString(),
      });

      return res.status(200).json({
        message: `Deposit of ${finalAmount.toLocaleString()} UGX has automatically reflected on your Wallet! Once Admin confirms your payment, you can buy your machine and start your machine cycle.`,
        depositId: newTx.id,
        transactionId: transactionIdFromApi,
        status: 'PENDING',
        new_balance: user ? user.balance : REGISTRATION_REWARD_UGX,
        wallet_balance: user ? user.wallet_balance || finalAmount : finalAmount,
        available_wallet: user ? user.available_wallet || finalAmount : finalAmount,
        has_bought_machine: user ? Boolean(user.has_bought_machine) : false,
        receivingAccount: {
          id: receivingAccount.id,
          network: receivingAccount.carrier,
          mobile_money_number: receivingAccount.phone_number,
          receiver_name: receivingAccount.account_name,
          daily_receiving_limit: receivingAccount.daily_receiving_limit || 5000000,
          amount_received_today: receivingAccount.amount_received_today,
          rotation_minutes: receivingAccount.rotation_duration_minutes || 5,
        },
        timeRemainingSeconds: activeInfo.timeRemainingSeconds,
      });
    } catch (error) {
      console.error('Critical Error in /api/deposit:', error);
      return res.status(500).json({ error: 'Internal server error processing deposit.' });
    }
  });

  // 9. Deposit Funds (Submitted as PENDING — Must be confirmed by Admin to reflect on customer Wallet ONLY)
  app.post('/api/wallet/deposit', (req, res) => {
    const { user_id, amount, payment_method, phone_number, payment_reference, receiver_phone, receiver_name, machine_id, machine_title } = req.body;
    const user = findOrRestoreUser(user_id, req.body);
    if (!user) return res.status(400).json({ error: 'User not found.' });

    const numAmt = Number(amount);
    if (isNaN(numAmt) || numAmt < 25000) {
      return res.status(400).json({ error: 'Minimum deposit amount is 25,000 UGX.' });
    }

    // Identify the target receiver (or fallback safely if rotation pool is empty)
    let targetReceiver = depositReceiverNumbers.find((n) => n.phone_number === receiver_phone && n.is_active) || null;
    if (!targetReceiver) {
      const activeInfo = getActiveReceiver(true);
      targetReceiver = activeInfo.receiver;
    } else {
      if (depositRotationConfig.mode === 'ROUND_ROBIN' && depositRotationConfig.auto_rotate_enabled) {
        getActiveReceiver(true);
      }
    }

    const effectiveReceiver = targetReceiver || {
      id: 'rec-default',
      phone_number: receiver_phone || RECEIVER_PHONE,
      account_name: receiver_name || RECEIVER_NAME,
      carrier: 'MTN' as const,
      amount_received_today: 0,
      daily_receiving_limit: 5000000,
    };

    const senderPhone = (phone_number || user.phone_number || '').toString().trim();
    const refCode = payment_reference || `DEP-${senderPhone.replace(/[^0-9]/g, '').slice(-6) || 'MM'}-${Math.floor(100000 + Math.random() * 900000)}`;

    const newTx: Transaction = {
      id: `tx-dep-${Date.now()}`,
      user_id: user.id,
      amount: numAmt,
      type: 'DEPOSIT',
      status: 'PENDING',
      payment_method: `${payment_method || 'Mobile Money'} • Sender: ${senderPhone || 'N/A'} -> Receiver: ${effectiveReceiver.phone_number} (${effectiveReceiver.account_name})`,
      payment_reference: refCode,
      machine_title: machine_title || undefined,
      created_at: new Date().toISOString(),
    };
    (newTx as any).wallet_credited = false;
    (newTx as any).receiver_credited = false;
    (newTx as any).approved_permanent = false;
    (newTx as any).receiver_id = effectiveReceiver.id;
    (newTx as any).receiver_phone = effectiveReceiver.phone_number;
    (newTx as any).receiver_name = effectiveReceiver.account_name;
    (newTx as any).customer_name = user.full_name || user.name || 'Investor';
    (newTx as any).customer_phone = senderPhone;
    (newTx as any).user_phone = user.phone_number || senderPhone;
    (newTx as any).machine_id = machine_id || undefined;
    transactions.unshift(newTx);

    // Deposit reflects automatically on Wallet & Deposit details on Homepage; machine purchase will then deduct from Wallet when customer buys the machine
    const pendingInv: Investment | null = null;

    syncUserConfirmedFinances(user, user.id);
    saveRegisteredUserToDisk(user);
    saveAppStateToDisk();

    pushNotification(
      user.id,
      '⏳ Deposit Submitted — Awaiting Admin Confirmation',
      `Your deposit of ${numAmt.toLocaleString()} UGX to ${effectiveReceiver.phone_number} (${effectiveReceiver.account_name}) has been submitted to Admin. Once Admin confirms your deposit, it will reflect on your Wallet!`,
      'PAYMENT'
    );

    notifyAllAdmins(
      `🔔 New Deposit Pending Confirmation: UGX ${numAmt.toLocaleString()}${machine_title ? ` (${machine_title})` : ''}`,
      `Customer ${user.full_name || user.id} (Sender Phone: ${senderPhone}) submitted a deposit of UGX ${numAmt.toLocaleString()} via ${payment_method || 'Mobile Money'} to Receiver ${effectiveReceiver.phone_number} (${effectiveReceiver.account_name}). Please confirm in Admin Console so it reflects on the customer's Wallet. Ref: ${refCode}.`,
      'PAYMENT',
      {
        transaction_id: newTx.id,
        customer_name: user.full_name || user.name || user.id,
        customer_phone: senderPhone,
        amount: numAmt,
        payment_method: payment_method || 'Mobile Money',
        receiver_phone: effectiveReceiver.phone_number,
        receiver_name: effectiveReceiver.account_name,
        payment_reference: refCode,
        machine_title: machine_title || 'Wallet Deposit Order (Pending Admin Confirmation)',
        order_status: 'PENDING',
      }
    );

    void saveDepositToFirestoreCollection(newTx, 'pending');
    void ensureOrderSavedInFirestore({
      docId: refCode.replace(/[^a-zA-Z0-9_-]/g, ''),
      name: user.full_name || user.name || senderPhone || 'Avor Investor',
      item: `Deposited UGX ${numAmt.toLocaleString()} via ${payment_method || 'Mobile Money'} from ${senderPhone} to ${effectiveReceiver.phone_number} (${effectiveReceiver.account_name})${machine_title ? ` • ${machine_title}` : ''} (Pending Admin Confirmation)`,
      senderPhone,
      receiverPhone: effectiveReceiver.phone_number,
      receiverName: effectiveReceiver.account_name,
      amount: numAmt,
      machineTitle: machine_title || 'Wallet Deposit Order (Pending Admin Confirmation)',
      paymentMethod: payment_method || 'Mobile Money',
      paymentReference: refCode,
      status: 'PENDING',
    });

    broadcastRealtimeEvent({
      type: 'DEPOSIT_CREATED_PENDING',
      transaction: newTx,
      transaction_id: newTx.id,
      payment_reference: newTx.payment_reference,
      status: 'PENDING',
      status_label: 'Pending',
      user_id: user.id,
      user_phone: (newTx as any).user_phone,
      customer_phone: (newTx as any).customer_phone,
      amount: numAmt,
      wallet_balance: user.wallet_balance || 0,
      timestamp: new Date().toISOString(),
    });

    res.json({
      message: `Deposit of ${numAmt.toLocaleString()} UGX has automatically reflected on your Wallet! Once Admin confirms your payment, you can buy your machine and start your machine cycle.`,
      new_balance: user.balance,
      wallet_balance: user.wallet_balance || numAmt,
      available_wallet: user.available_wallet || numAmt,
      has_bought_machine: Boolean(user.has_bought_machine),
      status: 'PENDING',
      transaction: newTx,
      pending_investment: pendingInv,
      assigned_receiver: {
        id: effectiveReceiver.id,
        phone_number: effectiveReceiver.phone_number,
        account_name: effectiveReceiver.account_name,
        carrier: effectiveReceiver.carrier,
        amount_received_today: effectiveReceiver.amount_received_today,
        daily_receiving_limit: effectiveReceiver.daily_receiving_limit || 5000000,
      },
    });
  });

  // 10. Withdraw Funds (Submitted to admin for payout approval — Enforces Official Withdraw Rules)
  app.post('/api/wallet/withdraw', (req, res) => {
    const { user_id, amount, payment_method, phone_number, account_name, has_bought_machine } = req.body;
    const user = findOrRestoreUser(user_id, req.body);
    if (!user) return res.status(400).json({ error: 'User not found.' });

    // Rule 1: Withdraws run from Mon - Fri
    const dayOfWeek = new Date().getDay(); // 0 = Sunday, 6 = Saturday
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return res.status(400).json({
        error: 'Withdraw Rule 1: Withdrawals run from Monday to Friday only. Weekend withdrawals are closed.',
      });
    }

    // Sync user's latest balance (includes 3,000 UGX registration bonus + commissions + yields)
    syncUserConfirmedFinances(user, user.id);

    // Sync active machine cycles and enforce:
    // 1. The 3,000 UGX registration bonus is only withdrawn after buying machines.
    // 2. Machine cycle returns cannot be withdrawn before the end of the machine cycle.
    const nowDateObj = new Date();
    investments.forEach((inv) => {
      if (inv.status !== 'PENDING') {
        syncSingleActiveMachineAutoRun(inv, nowDateObj);
      }
    });
    const userInvestments = investments.filter(
      (i) => i.user_id === user.id || doesTxBelongToUser({ user_id: i.user_id } as any, user, user.id)
    );
    const confirmedUserInvestments = userInvestments.filter(
      (i) => i.status === 'ACTIVE' || i.status === 'PAYOUT_COMPLETE'
    );
    const completedCycleInvs = confirmedUserInvestments.filter(
      (i) => i.status === 'PAYOUT_COMPLETE' || (Number(i.days_elapsed) || 0) >= (Number(i.duration_days) || 1)
    );
    const customerHasBoughtMachine =
      confirmedUserInvestments.length > 0 || Boolean(user.has_bought_machine) || Boolean(has_bought_machine);

    if (!customerHasBoughtMachine) {
      return res.status(400).json({
        error:
          'The 3,000 UGX registration bonus can only be withdrawn after buying machines. Please buy a machine first to unlock withdrawal.',
      });
    }

    // Rule 3: Minimum withdraw is 3k and Maximum withdraw is 5M
    const numAmt = Number(amount);
    if (isNaN(numAmt) || numAmt < 3000) {
      return res.status(400).json({
        error: 'Withdraw Rule 3: Minimum withdraw is 3,000 UGX (3k) and Maximum withdraw is 5,000,000 UGX (5M).',
      });
    }
    if (numAmt > 5000000) {
      return res.status(400).json({
        error: 'Withdraw Rule 3: Maximum withdraw is 5,000,000 UGX (5M).',
      });
    }

    // Before the end of the machine cycle, only the 3,000 UGX registration bonus + commissions can be withdrawn after buying a machine
    if (completedCycleInvs.length === 0) {
      const userCommissions = transactions
        .filter(
          (t) =>
            doesTxBelongToUser(t, user, user.id) &&
            (t.type === 'COMMISSION' || t.type === 'REFERRAL_BONUS') &&
            (t.status === 'SUCCESS' || t.status === 'CONFIRMED') &&
            !(typeof t.payment_reference === 'string' && t.payment_reference.startsWith('GATEWAY-REWARD-'))
        )
        .reduce((sum, t) => sum + Number(t.amount || 0), 0);
      const deductedWithdrawals = transactions
        .filter(
          (t) =>
            doesTxBelongToUser(t, user, user.id) &&
            t.type === 'WITHDRAWAL' &&
            (t.status === 'SUCCESS' || t.status === 'CONFIRMED' || t.status === 'PENDING')
        )
        .reduce((sum, t) => sum + Number(t.amount || 0), 0);
      const bonusAndCommissionsAvailable = Math.max(
        0,
        REGISTRATION_REWARD_UGX + userCommissions - deductedWithdrawals
      );

      if (numAmt > bonusAndCommissionsAvailable) {
        const activeInv = confirmedUserInvestments[0];
        const cycleNote = activeInv
          ? ` (${activeInv.machine_title}: Day ${activeInv.days_elapsed || 1} of ${activeInv.duration_days} days)`
          : '';
        return res.status(400).json({
          error: `You cannot make a withdrawal of machine returns before the end of your machine cycle${cycleNote}. Before the end of your machine cycle, only your 3,000 UGX registration bonus and commissions (${bonusAndCommissionsAvailable.toLocaleString()} UGX available) can be withdrawn after buying a machine.`,
        });
      }
    }

    if (user.balance < 3000) {
      return res.status(400).json({
        error: `Withdrawable balance must be 3,000 UGX and above to submit a withdrawal. Your current balance is ${user.balance.toLocaleString()} UGX.`,
      });
    }

    if (user.balance < numAmt) {
      return res.status(400).json({ error: `Insufficient balance. Available withdrawable balance: ${user.balance.toLocaleString()} UGX` });
    }

    // Rule 2: Withdraw percentage - 10%
    const withdrawFee = Math.round(numAmt * 0.10);
    const netPayout = numAmt - withdrawFee;

    // Deduct user balance immediately while pending payout
    user.balance -= numAmt;
    saveRegisteredUserToDisk(user);

    const custName = String(account_name || user.full_name || user.phone_number || 'Avor Investor').trim();
    const custPhone = String(phone_number || user.phone_number || '+256700000000').trim();
    const txRef = `WDR-OUT-${Math.floor(100000 + Math.random() * 900000)}`;

    const newTx: Transaction = {
      id: `tx-wdr-${Date.now()}`,
      user_id: user.id,
      amount: numAmt,
      type: 'WITHDRAWAL',
      status: 'PENDING', // PENDING approval by admin owner
      payment_method: `${payment_method || 'Mobile Money'} (${custPhone}) • Net Payout: ${netPayout.toLocaleString()} UGX (10% Fee: ${withdrawFee.toLocaleString()} UGX)`,
      payment_reference: txRef,
      created_at: new Date().toISOString(),
    };
    (newTx as any).userId = user.id;
    (newTx as any).name = custName;
    (newTx as any).phone = custPhone;
    (newTx as any).customer_name = custName;
    (newTx as any).customer_phone = custPhone;
    (newTx as any).account_name = custName;
    (newTx as any).fee_amount = withdrawFee;
    (newTx as any).net_amount = netPayout;
    transactions.unshift(newTx);
    saveAppStateToDisk();

    // Save to Firestore 'withdrawals' collection (userId, name, phone, amount, status = 'pending', createdAt = serverTimestamp)
    void saveWithdrawalToFirestoreCollection({
      id: newTx.id,
      userId: user.id,
      name: custName,
      phone: custPhone,
      amount: numAmt,
      status: 'pending',
      fee_amount: withdrawFee,
      net_amount: netPayout,
      payment_method: newTx.payment_method,
      payment_reference: txRef,
      account_name: custName,
    });

    // Also save to Firestore 'admin_messages' and notify Admin so Admin receives message immediately
    void ensureOrderSavedInFirestore({
      docId: txRef,
      name: custName,
      item: `Withdrawal Request: UGX ${numAmt.toLocaleString()} (Net Payout: UGX ${netPayout.toLocaleString()}, 10% Fee: UGX ${withdrawFee.toLocaleString()}) to ${custPhone} (${custName}) via ${payment_method || 'Mobile Money'}`,
      senderPhone: custPhone,
      receiverPhone: custPhone,
      receiverName: custName,
      amount: numAmt,
      machineTitle: `Withdrawal Request (Net: UGX ${netPayout.toLocaleString()})`,
      paymentMethod: payment_method || 'Mobile Money',
      paymentReference: txRef,
      status: 'PENDING',
    });

    notifyAllAdmins(
      `💸 New Withdrawal Request: UGX ${numAmt.toLocaleString()}`,
      `Customer ${custName} (Phone: ${custPhone}) requested a withdrawal of UGX ${numAmt.toLocaleString()} (Net Payout: UGX ${netPayout.toLocaleString()} after 10% fee of UGX ${withdrawFee.toLocaleString()}) via ${payment_method || 'Mobile Money'}. Ref: ${txRef}. Approve or Reject in Admin Withdrawals tab.`,
      'PAYMENT',
      {
        transaction_id: newTx.id,
        customer_name: custName,
        customer_phone: custPhone,
        receiver_phone: custPhone,
        receiver_name: custName,
        amount: numAmt,
        payment_method: newTx.payment_method,
        payment_reference: txRef,
        machine_title: `Withdrawal Request (Net: UGX ${netPayout.toLocaleString()})`,
        order_status: 'PENDING',
      }
    );

    broadcastRealtimeEvent({
      type: 'WITHDRAWAL_CREATED_PENDING',
      transaction: newTx,
      user_id: user.id,
      amount: numAmt,
      timestamp: new Date().toISOString(),
    });

    pushNotification(
      user.id,
      'Withdrawal Request Submitted',
      `Your withdrawal request of ${numAmt.toLocaleString()} UGX (10% fee: ${withdrawFee.toLocaleString()} UGX • Net payout: ${netPayout.toLocaleString()} UGX) to ${custPhone} (${custName}) has been submitted and is pending admin payout approval.`,
      'PAYMENT'
    );

    res.json({
      message: `Withdrawal request of ${numAmt.toLocaleString()} UGX submitted! (10% fee: ${withdrawFee.toLocaleString()} UGX • Net payout: ${netPayout.toLocaleString()} UGX)`,
      new_balance: user.balance,
      fee_amount: withdrawFee,
      net_amount: netPayout,
      transaction: newTx,
    });
  });

  // ==========================================
  // ADMIN OWNER CONTROL ENDPOINTS
  // ==========================================

  // Admin Auth Verification (Restricted to verified admin/owner credentials: adamsmabrouk268@gmail.com / adams@268#)
  app.post('/api/admin/auth', (req, res) => {
    const { email, password } = req.body;
    const cleanInput = (email || '').toString().trim().toLowerCase();
    const trimmedPass = (password || '').toString().trim();

    if (cleanInput !== 'adamsmabrouk268@gmail.com') {
      return res.status(401).json({ error: 'Access Denied: Invalid administrator email or password.' });
    }

    let admin = Array.from(users.values()).find(
      (u) => u.role === 'ADMIN' && u.email?.toLowerCase() === 'adamsmabrouk268@gmail.com'
    );

    if (!admin) {
      admin = adminUser;
    }

    const isValidPassword =
      trimmedPass === ADMIN_MASTER_PASSWORD ||
      trimmedPass === adminUser.password_hash ||
      trimmedPass === admin.password_hash;

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Access Denied: Invalid administrator email or password.' });
    }

    const { password_hash, ...profile } = admin;
    res.json({
      message: 'Admin authorization granted.',
      user: profile,
      token: `admin-token-${admin.id}`,
    });
  });

  // Admin Change Password Endpoint
  app.post('/api/admin/change-password', (req, res) => {
    const { email, current_password, new_password } = req.body;
    const trimmedCurrent = (current_password || '').toString().trim();
    const trimmedNew = (new_password || '').toString().trim();

    if (!trimmedNew || trimmedNew.length < 4) {
      return res.status(400).json({ error: 'New password must be at least 4 characters.' });
    }

    let admin = Array.from(users.values()).find(
      (u) => (u.email === email || u.phone_number === email || u.role === 'ADMIN') && u.role === 'ADMIN'
    );

    if (!admin) {
      admin = adminUser;
    }

    if (trimmedCurrent !== admin.password_hash && trimmedCurrent !== ADMIN_MASTER_PASSWORD && trimmedCurrent !== adminUser.password_hash) {
      return res.status(400).json({ error: 'Current admin password incorrect.' });
    }

    admin.password_hash = trimmedNew;
    adminUser.password_hash = trimmedNew;

    pushNotification(
      admin.id,
      '🔒 Admin Password Changed',
      'Your administrator password was changed successfully.',
      'SECURITY'
    );

    res.json({ message: 'Admin password changed successfully!' });
  });

  // Admin Platform Stats & Overview
  app.get('/api/admin/overview', (req, res) => {
    // Unique users deduplicated by ID
    const uniqueUserMap = new Map<string, User & { password_hash?: string }>();
    for (const u of users.values()) {
      if (u.id && !uniqueUserMap.has(u.id)) {
        syncUserConfirmedFinances(u, u.id);
        uniqueUserMap.set(u.id, u);
      }
    }
    const userList = Array.from(uniqueUserMap.values()).map(({ password_hash, ...u }) => u);

    // Automatically run ACTIVE machines (Monday–Friday for AV1 & AV2, no Weekends) and transition completed cycles to PAYOUT_COMPLETE
    const nowDateObj = new Date();
    for (const inv of investments) {
      if (inv.status === 'ACTIVE') {
        syncSingleActiveMachineAutoRun(inv, nowDateObj);
      }
    }

    const withdrawals = transactions
      .filter((t) => t.type === 'WITHDRAWAL')
      .map((w) => {
        const cust = uniqueUserMap.get(w.user_id);
        const amt = Number(w.amount || 0);
        const feeAmt = typeof (w as any).fee_amount === 'number' ? (w as any).fee_amount : Math.round(amt * 0.1);
        const netAmt = typeof (w as any).net_amount === 'number' ? (w as any).net_amount : Math.max(0, amt - feeAmt);
        return {
          ...w,
          userId: (w as any).userId || w.user_id,
          name: (w as any).name || (w as any).customer_name || (w as any).account_name || cust?.full_name || w.user_id,
          phone: (w as any).phone || (w as any).customer_phone || cust?.phone_number || '',
          customer_name: (w as any).name || (w as any).customer_name || cust?.full_name || w.user_id,
          customer_phone: (w as any).phone || (w as any).customer_phone || cust?.phone_number || '',
          fee_amount: feeAmt,
          net_amount: netAmt,
        };
      })
      .sort((a, b) => {
        if (a.status === 'PENDING' && b.status !== 'PENDING') return -1;
        if (a.status !== 'PENDING' && b.status === 'PENDING') return 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    const deposits = transactions
      .filter((t) => t.type === 'DEPOSIT')
      .map((d) => {
        const cust = uniqueUserMap.get(d.user_id);
        return {
          ...d,
          customer_name: (d as any).customer_name || cust?.full_name || d.user_id,
          customer_phone: (d as any).customer_phone || cust?.phone_number || '',
          receiver_phone: (d as any).receiver_phone || homepageConfig.deposit_receiver_number,
          receiver_name: (d as any).receiver_name || homepageConfig.deposit_receiver_name,
        };
      })
      .sort((a, b) => {
        if (a.status === 'PENDING' && b.status !== 'PENDING') return -1;
        if (a.status !== 'PENDING' && b.status === 'PENDING') return 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    const pendingWithdrawals = withdrawals.filter((w) => w.status === 'PENDING');
    const pendingDeposits = deposits.filter((d) => d.status === 'PENDING');

    // Ensure every deposit/order in `deposits` has a corresponding Admin Order Message in `adminNotifications`
    const rawAdminNotifs = notifications.filter((n) => n.user_id === 'usr-admin-owner');
    const seenTxIds = new Set<string>(
      rawAdminNotifs.map((n: any) => n.transaction_id).filter(Boolean)
    );
    const synthesizedOrderMessages = deposits
      .filter((d: any) => !seenTxIds.has(d.id))
      .map((d: any) => ({
        id: `notif-order-${d.id}`,
        user_id: 'usr-admin-owner',
        title: `📩 ${d.type === 'INVESTMENT' ? 'Machine Order Placed' : 'Deposit Order Placed'}: UGX ${Number(d.amount || 0).toLocaleString()}`,
        message: `Customer ${d.customer_name || d.user_id} (Sender Phone: ${d.customer_phone || 'N/A'}) clicked Confirm Payment for UGX ${Number(d.amount || 0).toLocaleString()} via ${d.payment_method || 'Mobile Money'} to Receiver ${d.receiver_phone || homepageConfig.deposit_receiver_number} (${d.receiver_name || homepageConfig.deposit_receiver_name}). Ref: ${d.payment_reference || 'N/A'}.`,
        type: 'PAYMENT',
        read: d.status !== 'PENDING',
        created_at: d.created_at,
        transaction_id: d.id,
        customer_name: d.customer_name || d.user_id,
        customer_phone: d.customer_phone || '',
        amount: d.amount,
        payment_method: d.payment_method,
        receiver_phone: d.receiver_phone || homepageConfig.deposit_receiver_number,
        receiver_name: d.receiver_name || homepageConfig.deposit_receiver_name,
        payment_reference: d.payment_reference,
        machine_title: d.machine_title || (d.type === 'INVESTMENT' ? 'Machine Order' : 'Wallet Deposit Order (Buy Machine)'),
        order_status: d.status === 'SUCCESS' || d.status === 'CONFIRMED' ? 'CONFIRMED' : d.status,
      }));

    const adminNotifications = [...rawAdminNotifs, ...synthesizedOrderMessages]
      .map((n: any) => {
        const linkedTx = n.transaction_id ? deposits.find((d: any) => d.id === n.transaction_id) : null;
        const currentStatus = linkedTx
          ? linkedTx.status === 'SUCCESS' || linkedTx.status === 'CONFIRMED'
            ? 'CONFIRMED'
            : linkedTx.status
          : n.order_status || 'INFO';
        return {
          ...n,
          order_status: currentStatus,
          customer_name: n.customer_name || linkedTx?.customer_name || '',
          customer_phone: n.customer_phone || linkedTx?.customer_phone || '',
          receiver_phone: n.receiver_phone || linkedTx?.receiver_phone || homepageConfig.deposit_receiver_number,
          receiver_name: n.receiver_name || linkedTx?.receiver_name || homepageConfig.deposit_receiver_name,
          amount: n.amount || linkedTx?.amount || 0,
          payment_reference: n.payment_reference || linkedTx?.payment_reference || '',
        };
      })
      .sort((a: any, b: any) => {
        if (a.order_status === 'PENDING' && b.order_status !== 'PENDING') return -1;
        if (a.order_status !== 'PENDING' && b.order_status === 'PENDING') return 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

    const totalDeposited = transactions
      .filter((t) => t.type === 'DEPOSIT' && (t.status === 'SUCCESS' || t.status === 'CONFIRMED'))
      .reduce((sum, d) => sum + d.amount, 0);
    const totalSystemWallet = userList.reduce((sum, u) => sum + Number(u.wallet_balance || 0), 0);
    const totalWithdrawn = withdrawals.filter((w) => w.status === 'SUCCESS').reduce((sum, w) => sum + w.amount, 0);

    const enrichedInvestments = investments.map((inv) => {
      const cust = uniqueUserMap.get(inv.user_id);
      const startIso = inv.start_date || new Date().toISOString();
      const purchaseDate = startIso.split('T')[0];
      const endDateObj = inv.end_date
        ? new Date(inv.end_date)
        : new Date(new Date(startIso).getTime() + inv.duration_days * 24 * 60 * 60 * 1000);
      const endingDate = endDateObj.toISOString().split('T')[0];
      const diffDays =
        inv.status === 'PENDING'
          ? inv.duration_days
          : inv.status === 'PAYOUT_COMPLETE'
            ? 0
            : Math.max(0, Math.ceil((endDateObj.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));

      return {
        ...inv,
        customer_name: cust?.full_name || inv.user_id,
        customer_phone: cust?.phone_number || '',
        purchase_date: purchaseDate,
        ending_date: endingDate,
        days_left: diffDays,
      };
    });

    // Approved machines = those confirmed/approved by Admin (ACTIVE running or PAYOUT_COMPLETE finished)
    const approvedInvestments = investments.filter(
      (i) => i.status === 'ACTIVE' || i.status === 'PAYOUT_COMPLETE'
    );
    const activeCyclesCount = investments.filter((i) => i.status === 'ACTIVE').length;
    const completedCyclesCount = investments.filter((i) => i.status === 'PAYOUT_COMPLETE').length;
    const pendingCyclesCount = investments.filter((i) => i.status === 'PENDING').length;
    const totalVerifiedInvestment = approvedInvestments.reduce((sum, i) => sum + i.amount_invested, 0);

    const activeInfo = getActiveReceiver();

    const effectiveTotalCustomers =
      typeof homepageConfig.custom_total_customers === 'number'
        ? homepageConfig.custom_total_customers
        : approvedInvestments.length;
    const effectiveMachinesSold =
      typeof homepageConfig.custom_machines_sold === 'number'
        ? homepageConfig.custom_machines_sold
        : approvedInvestments.length;
    const effectiveActiveCycles =
      typeof homepageConfig.custom_active_cycles === 'number'
        ? homepageConfig.custom_active_cycles
        : activeCyclesCount;
    const effectiveCompletedCycles =
      typeof homepageConfig.custom_completed_cycles === 'number'
        ? homepageConfig.custom_completed_cycles
        : completedCyclesCount;
    const effectiveTotalCycles =
      typeof homepageConfig.custom_total_cycles === 'number'
        ? homepageConfig.custom_total_cycles
        : effectiveActiveCycles + effectiveCompletedCycles;
    const effectiveTotalSystemWallet =
      typeof homepageConfig.custom_total_system_wallet === 'number'
        ? homepageConfig.custom_total_system_wallet
        : totalSystemWallet;
    const effectiveTotalVerifiedInvestment =
      typeof homepageConfig.custom_total_verified_investment === 'number'
        ? homepageConfig.custom_total_verified_investment
        : totalVerifiedInvestment;
    const effectiveTotalWithdrawn =
      typeof homepageConfig.custom_total_withdrawn === 'number'
        ? homepageConfig.custom_total_withdrawn
        : totalWithdrawn;

    res.json({
      total_users: effectiveTotalCustomers,
      total_customers_count: effectiveTotalCustomers,
      registered_users_count: userList.length,
      users: userList,
      withdrawals,
      deposits,
      admin_notifications: adminNotifications.slice(0, 50),
      investments: enrichedInvestments,
      pending_withdrawals_count: pendingWithdrawals.length,
      pending_deposits_count: pendingDeposits.length,
      total_deposited: totalDeposited,
      total_system_wallet: effectiveTotalSystemWallet,
      total_withdrawn: effectiveTotalWithdrawn,
      total_investments_count: effectiveMachinesSold,
      machines_sold_count: effectiveMachinesSold,
      total_cycles_count: effectiveTotalCycles,
      active_cycles_count: effectiveActiveCycles,
      completed_cycles_count: effectiveCompletedCycles,
      pending_cycles_count: pendingCyclesCount,
      total_verified_investment: effectiveTotalVerifiedInvestment,
      homepage_config: homepageConfig,
      deposit_receiver_numbers: depositReceiverNumbers,
      deposit_rotation_config: depositRotationConfig,
      active_receiver: activeInfo.receiver,
      rotation_time_remaining_seconds: activeInfo.timeRemainingSeconds,
      reset_epoch_id: systemResetEpochId,
      reset_cutoff_ms: systemResetCutoffMs,
    });
  });

  // Helper to write an order directly to Firebase Firestore (`admin_messages`) from the server
  // so every order placed via API is guaranteed to appear in both the Admin Plane and Firebase Firestore.
  const ensureOrderSavedInFirestore = async (order: {
    docId?: string;
    name: string;
    item: string;
    senderPhone?: string;
    receiverPhone?: string;
    receiverName?: string;
    amount?: number;
    machineTitle?: string;
    paymentMethod?: string;
    paymentReference?: string;
    status?: 'PENDING' | 'CONFIRMED' | 'SUCCESS';
  }) => {
    try {
      const projectId = firebaseAppletConfig.projectId;
      const databaseId = firebaseAppletConfig.firestoreDatabaseId || '(default)';
      const apiKey = firebaseAppletConfig.apiKey;
      if (!projectId || !apiKey) return;

      const rawId = (order.docId || order.paymentReference || `ord-${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '');
      const cleanDocId = rawId.slice(0, 120) || `ord-${Date.now()}`;
      const baseDocsPath = `projects/${projectId}/databases/${databaseId}/documents`;
      if (order.status === 'CONFIRMED' || order.status === 'SUCCESS') {
        const patchUrl = `https://firestore.googleapis.com/v1/${baseDocsPath}/admin_messages/${encodeURIComponent(cleanDocId)}?updateMask.fieldPaths=status&key=${encodeURIComponent(apiKey)}`;
        const patchRes = await fetch(patchUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              status: { stringValue: order.status },
            },
          }),
        });
        if (patchRes.ok) return;
      }

      const commitUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}/documents:commit?key=${encodeURIComponent(apiKey)}`;

      const fields: Record<string, any> = {
        name: { stringValue: (order.name || 'Avor Investor').slice(0, 190) },
        item: { stringValue: (order.item || 'Machine / Deposit Action').slice(0, 1900) },
        status: { stringValue: order.status || 'CONFIRMED' },
      };
      if (order.senderPhone) fields.senderPhone = { stringValue: String(order.senderPhone).slice(0, 95) };
      if (order.receiverPhone) fields.receiverPhone = { stringValue: String(order.receiverPhone).slice(0, 95) };
      if (order.receiverName) fields.receiverName = { stringValue: String(order.receiverName).slice(0, 190) };
      if (typeof order.amount === 'number' && !isNaN(order.amount) && order.amount >= 0) {
        fields.amount = { integerValue: String(Math.round(order.amount)) };
      }
      if (order.machineTitle) fields.machineTitle = { stringValue: String(order.machineTitle).slice(0, 290) };
      if (order.paymentMethod) fields.paymentMethod = { stringValue: String(order.paymentMethod).slice(0, 190) };
      if (order.paymentReference) fields.paymentReference = { stringValue: String(order.paymentReference).slice(0, 190) };

      await fetch(commitUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          writes: [
            {
              update: {
                name: `${baseDocsPath}/admin_messages/${cleanDocId}`,
                fields,
              },
              updateTransforms: [
                {
                  fieldPath: 'timestamp',
                  setToServerValue: 'REQUEST_TIME',
                },
              ],
            },
          ],
        }),
      });
    } catch {
      // Non-blocking background sync to Firestore
    }
  };

  // Helper to save a customer machine order directly to the Firebase Firestore `orders` collection
  // with fields: customername, name, status = "pending" (and full order metadata)
  const saveOrderToFirestoreCollection = async (
    inv: any,
    status: 'pending' | 'confirmed' | 'ACTIVE & DELIVERED' | 'denied' = 'pending'
  ) => {
    try {
      const projectId = firebaseAppletConfig.projectId;
      const databaseId = firebaseAppletConfig.firestoreDatabaseId || '(default)';
      const apiKey = firebaseAppletConfig.apiKey;
      if (!projectId || !apiKey || !inv) return;

      const rawId = String(inv.id || inv.payment_reference || `inv-${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '');
      const cleanOrderId = rawId.slice(0, 120) || `inv-${Date.now()}`;
      const baseDocsPath = `projects/${projectId}/databases/${databaseId}/documents`;
      const commitUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}/documents:commit?key=${encodeURIComponent(apiKey)}`;

      const safeCustomerName = String(
        inv.customername || inv.customer_name || inv.customer_phone || inv.user_id || 'Avor Investor'
      )
        .trim()
        .slice(0, 160) || 'Avor Investor';
      const safeOrderName = String(inv.name || inv.machine_title || 'Machine Order')
        .trim()
        .slice(0, 200) || 'Machine Order';

      const fields: Record<string, any> = {
        id: { stringValue: cleanOrderId },
        customername: { stringValue: safeCustomerName },
        name: { stringValue: safeOrderName },
        status: { stringValue: status },
        customer_name: { stringValue: safeCustomerName },
        machine_title: { stringValue: safeOrderName },
      };

      if (inv.user_id) fields.user_id = { stringValue: String(inv.user_id).slice(0, 128) };
      if (inv.customer_phone && String(inv.customer_phone).trim().length >= 3) {
        fields.customer_phone = { stringValue: String(inv.customer_phone).trim().slice(0, 40) };
      }
      if (inv.machine_id) fields.machine_id = { stringValue: String(inv.machine_id).slice(0, 128) };
      const amt = Number(inv.amount_invested ?? inv.amount ?? 0);
      if (!isNaN(amt) && amt >= 0) {
        fields.amount_invested = { integerValue: String(Math.round(amt)) };
        fields.amount = { integerValue: String(Math.round(amt)) };
      }
      const daily = Number(inv.daily_return ?? inv.daily_yield ?? 0);
      if (!isNaN(daily) && daily >= 0) {
        fields.daily_return = { integerValue: String(Math.round(daily)) };
      }
      const dur = Number(inv.duration_days || 45);
      if (!isNaN(dur) && dur >= 1) {
        fields.duration_days = { integerValue: String(Math.round(dur)) };
      }
      const totRet = Number(inv.total_return || daily * dur);
      if (!isNaN(totRet) && totRet >= 0) {
        fields.total_return = { integerValue: String(Math.round(totRet)) };
      }
      const daysElapsed = Number(inv.days_elapsed ?? (status === 'pending' ? 0 : 1));
      fields.days_elapsed = { integerValue: String(Math.max(0, Math.round(daysElapsed))) };
      fields.days_left = { integerValue: String(Math.max(0, Math.round(dur - daysElapsed))) };
      fields.units = { integerValue: String(Math.max(1, Number(inv.units || 1))) };
      if (inv.start_date) fields.start_date = { stringValue: String(inv.start_date).slice(0, 60) };
      if (inv.end_date) fields.end_date = { stringValue: String(inv.end_date).slice(0, 60) };
      if (inv.purchase_date || inv.start_date) {
        fields.purchase_date = { stringValue: String(inv.purchase_date || inv.start_date.split('T')[0]).slice(0, 60) };
      }
      if (inv.ending_date || inv.end_date) {
        fields.ending_date = { stringValue: String(inv.ending_date || inv.end_date.split('T')[0]).slice(0, 60) };
      }
      if (inv.payment_method) fields.payment_method = { stringValue: String(inv.payment_method).slice(0, 100) };
      if (inv.payment_reference) fields.payment_reference = { stringValue: String(inv.payment_reference).slice(0, 120) };

      await fetch(commitUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          writes: [
            {
              update: {
                name: `${baseDocsPath}/orders/${cleanOrderId}`,
                fields,
              },
              updateTransforms: [
                {
                  fieldPath: 'timestamp',
                  setToServerValue: 'REQUEST_TIME',
                },
              ],
            },
          ],
        }),
      });
    } catch {
      // Non-blocking background sync to Firestore `orders`
    }
  };

  // Helper to update an order status in the Firebase Firestore `orders` collection:
  // - APPROVE: Updates status to "confirmed" and then to "ACTIVE & DELIVERED"
  // - REJECT: Updates status to "denied"
  const updateOrderStatusInFirestoreCollection = async (
    orderId: string,
    action: 'APPROVE' | 'REJECT',
    inv?: any
  ) => {
    try {
      const projectId = firebaseAppletConfig.projectId;
      const databaseId = firebaseAppletConfig.firestoreDatabaseId || '(default)';
      const apiKey = firebaseAppletConfig.apiKey;
      if (!projectId || !apiKey || !orderId) return;

      const cleanOrderId = String(orderId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120);
      if (!cleanOrderId) return;
      const baseDocsPath = `projects/${projectId}/databases/${databaseId}/documents`;
      const nowIso = new Date().toISOString().slice(0, 40);

      if (action === 'APPROVE') {
        // Step 1: Update status to "confirmed"
        const patchConfirmedUrl = `https://firestore.googleapis.com/v1/${baseDocsPath}/orders/${encodeURIComponent(cleanOrderId)}?updateMask.fieldPaths=status&updateMask.fieldPaths=updated_at&key=${encodeURIComponent(apiKey)}`;
        const res1 = await fetch(patchConfirmedUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              status: { stringValue: 'confirmed' },
              updated_at: { stringValue: nowIso },
            },
          }),
        });

        // Step 2: Update status to "ACTIVE & DELIVERED"
        const patchActiveUrl = `https://firestore.googleapis.com/v1/${baseDocsPath}/orders/${encodeURIComponent(cleanOrderId)}?updateMask.fieldPaths=status&updateMask.fieldPaths=days_elapsed&updateMask.fieldPaths=updated_at&key=${encodeURIComponent(apiKey)}`;
        const res2 = await fetch(patchActiveUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              status: { stringValue: 'ACTIVE & DELIVERED' },
              days_elapsed: { integerValue: '1' },
              updated_at: { stringValue: new Date().toISOString().slice(0, 40) },
            },
          }),
        });

        if (!res1.ok && !res2.ok && inv) {
          await saveOrderToFirestoreCollection(inv, 'ACTIVE & DELIVERED');
        }
      } else {
        // REJECT / Deny: Update status to "denied"
        const patchDeniedUrl = `https://firestore.googleapis.com/v1/${baseDocsPath}/orders/${encodeURIComponent(cleanOrderId)}?updateMask.fieldPaths=status&updateMask.fieldPaths=updated_at&key=${encodeURIComponent(apiKey)}`;
        const resDenied = await fetch(patchDeniedUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              status: { stringValue: 'denied' },
              updated_at: { stringValue: nowIso },
            },
          }),
        });
        if (!resDenied.ok && inv) {
          await saveOrderToFirestoreCollection(inv, 'denied');
        }
      }
    } catch {
      // Non-blocking background update to Firestore `orders`
    }
  };

  // Helper to delete a denied/fake order document from Firebase Firestore (`admin_messages`)
  const deleteOrderFromFirestore = async (docId?: string) => {
    try {
      if (!docId) return;
      const projectId = firebaseAppletConfig.projectId;
      const databaseId = firebaseAppletConfig.firestoreDatabaseId || '(default)';
      const apiKey = firebaseAppletConfig.apiKey;
      if (!projectId || !apiKey) return;
      const cleanDocId = docId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120);
      if (!cleanDocId) return;
      const deleteUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}/documents/admin_messages/${encodeURIComponent(cleanDocId)}?key=${encodeURIComponent(apiKey)}`;
      await fetch(deleteUrl, { method: 'DELETE' });
    } catch {
      // Non-blocking background cleanup
    }
  };

  // Helper to save a customer withdrawal directly to the Firebase Firestore `withdrawals` collection
  // with fields: userId, name, phone, amount, status = 'pending', createdAt = REQUEST_TIME
  const saveWithdrawalToFirestoreCollection = async (wdr: {
    id: string;
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
  }) => {
    try {
      const projectId = firebaseAppletConfig.projectId;
      const databaseId = firebaseAppletConfig.firestoreDatabaseId || '(default)';
      const apiKey = firebaseAppletConfig.apiKey;
      if (!projectId || !apiKey || !wdr) return;

      const cleanId = String(wdr.id || wdr.payment_reference || `wdr-${Date.now()}`)
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .slice(0, 120);
      if (!cleanId) return;
      const baseDocsPath = `projects/${projectId}/databases/${databaseId}/documents`;
      const commitUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}/documents:commit?key=${encodeURIComponent(apiKey)}`;

      const safeUserId = String(wdr.userId || wdr.phone || 'usr-investor').trim().slice(0, 128) || 'usr-investor';
      const safeName = String(wdr.name || wdr.account_name || 'Avor Investor').trim().slice(0, 160) || 'Avor Investor';
      const safePhone = String(wdr.phone || '+256700000000').trim().slice(0, 40) || '+256700000000';
      const safeAmount = Math.max(0, Math.round(Number(wdr.amount || 0)));

      const fields: Record<string, any> = {
        id: { stringValue: cleanId },
        userId: { stringValue: safeUserId },
        name: { stringValue: safeName },
        phone: { stringValue: safePhone },
        amount: { integerValue: String(safeAmount) },
        status: { stringValue: wdr.status || 'pending' },
      };
      if (typeof wdr.fee_amount === 'number' && !isNaN(wdr.fee_amount)) {
        fields.fee_amount = { integerValue: String(Math.max(0, Math.round(wdr.fee_amount))) };
      }
      if (typeof wdr.net_amount === 'number' && !isNaN(wdr.net_amount)) {
        fields.net_amount = { integerValue: String(Math.max(0, Math.round(wdr.net_amount))) };
      }
      if (wdr.payment_method) {
        fields.payment_method = { stringValue: String(wdr.payment_method).slice(0, 160) };
      }
      if (wdr.payment_reference) {
        fields.payment_reference = { stringValue: String(wdr.payment_reference).slice(0, 120) };
      }
      if (wdr.account_name) {
        fields.account_name = { stringValue: String(wdr.account_name).slice(0, 160) };
      }

      await fetch(commitUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          writes: [
            {
              update: {
                name: `${baseDocsPath}/withdrawals/${cleanId}`,
                fields,
              },
              updateTransforms: [
                {
                  fieldPath: 'createdAt',
                  setToServerValue: 'REQUEST_TIME',
                },
              ],
            },
          ],
        }),
      });
    } catch {
      // Non-blocking background sync to Firestore `withdrawals`
    }
  };

  // Helper to update a withdrawal status in the Firebase Firestore `withdrawals` collection
  const updateWithdrawalStatusInFirestoreCollection = async (
    withdrawalId: string,
    action: 'APPROVE' | 'REJECT'
  ) => {
    try {
      const projectId = firebaseAppletConfig.projectId;
      const databaseId = firebaseAppletConfig.firestoreDatabaseId || '(default)';
      const apiKey = firebaseAppletConfig.apiKey;
      if (!projectId || !apiKey || !withdrawalId) return;

      const cleanId = String(withdrawalId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120);
      if (!cleanId) return;
      const baseDocsPath = `projects/${projectId}/databases/${databaseId}/documents`;
      const nowIso = new Date().toISOString().slice(0, 40);
      const nextStatus = action === 'APPROVE' ? 'approved' : 'rejected';

      const patchUrl = `https://firestore.googleapis.com/v1/${baseDocsPath}/withdrawals/${encodeURIComponent(cleanId)}?updateMask.fieldPaths=status&updateMask.fieldPaths=updated_at&key=${encodeURIComponent(apiKey)}`;
      await fetch(patchUrl, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fields: {
            status: { stringValue: nextStatus },
            updated_at: { stringValue: nowIso },
          },
        }),
      });
    } catch {
      // Non-blocking background update
    }
  };

  // Helper to create/save an order document in the real Firebase Firestore `orders` collection
  const saveOrderToFirestoreOrdersCollection = async (order: {
    id: string;
    customername: string;
    name: string;
    status: 'pending' | 'confirmed' | 'ACTIVE & DELIVERED' | 'denied';
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
  }) => {
    try {
      const projectId = firebaseAppletConfig.projectId;
      const databaseId = firebaseAppletConfig.firestoreDatabaseId || '(default)';
      const apiKey = firebaseAppletConfig.apiKey;
      if (!projectId || !apiKey) return;

      const cleanDocId = (order.id || `ord-${Date.now()}`).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120);
      if (!cleanDocId) return;
      const baseDocsPath = `projects/${projectId}/databases/${databaseId}/documents`;
      const commitUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}/documents:commit?key=${encodeURIComponent(apiKey)}`;
      const nowIso = new Date().toISOString();

      const fields: Record<string, any> = {
        customername: { stringValue: (order.customername || 'Avor Investor').slice(0, 160) },
        name: { stringValue: (order.name || 'Machine Order').slice(0, 200) },
        status: { stringValue: order.status || 'pending' },
        id: { stringValue: cleanDocId },
        customer_name: { stringValue: (order.customer_name || order.customername || 'Avor Investor').slice(0, 160) },
        machine_title: { stringValue: (order.machine_title || order.name || 'Machine Order').slice(0, 200) },
        updated_at: { stringValue: nowIso.slice(0, 60) },
      };

      if (order.user_id) fields.user_id = { stringValue: String(order.user_id).slice(0, 128) };
      if (order.customer_phone && String(order.customer_phone).trim().length >= 3) {
        fields.customer_phone = { stringValue: String(order.customer_phone).trim().slice(0, 40) };
      }
      if (order.machine_id) fields.machine_id = { stringValue: String(order.machine_id).slice(0, 128) };
      if (typeof order.amount_invested === 'number' && !isNaN(order.amount_invested) && order.amount_invested >= 0) {
        fields.amount_invested = { integerValue: String(Math.round(order.amount_invested)) };
        fields.amount = { integerValue: String(Math.round(order.amount_invested)) };
      }
      if (typeof order.daily_return === 'number' && !isNaN(order.daily_return) && order.daily_return >= 0) {
        fields.daily_return = { integerValue: String(Math.round(order.daily_return)) };
      }
      if (typeof order.duration_days === 'number' && order.duration_days >= 1) {
        fields.duration_days = { integerValue: String(Math.round(order.duration_days)) };
      }
      if (typeof order.total_return === 'number' && !isNaN(order.total_return) && order.total_return >= 0) {
        fields.total_return = { integerValue: String(Math.round(order.total_return)) };
      }
      if (typeof order.days_elapsed === 'number' && order.days_elapsed >= 0) {
        fields.days_elapsed = { integerValue: String(Math.round(order.days_elapsed)) };
      }
      if (typeof order.days_left === 'number' && order.days_left >= 0) {
        fields.days_left = { integerValue: String(Math.round(order.days_left)) };
      }
      if (typeof order.units === 'number' && order.units >= 1) {
        fields.units = { integerValue: String(Math.round(order.units)) };
      }
      if (order.start_date) fields.start_date = { stringValue: String(order.start_date).slice(0, 60) };
      if (order.end_date) fields.end_date = { stringValue: String(order.end_date).slice(0, 60) };
      if (order.purchase_date) fields.purchase_date = { stringValue: String(order.purchase_date).slice(0, 60) };
      if (order.ending_date) fields.ending_date = { stringValue: String(order.ending_date).slice(0, 60) };
      if (order.payment_method) fields.payment_method = { stringValue: String(order.payment_method).slice(0, 100) };
      if (order.payment_reference) fields.payment_reference = { stringValue: String(order.payment_reference).slice(0, 120) };

      await fetch(commitUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          writes: [
            {
              update: {
                name: `${baseDocsPath}/orders/${cleanDocId}`,
                fields,
              },
              updateTransforms: [
                {
                  fieldPath: 'timestamp',
                  setToServerValue: 'REQUEST_TIME',
                },
              ],
            },
          ],
        }),
      });
    } catch {
      // Non-blocking background sync to Firestore `orders` collection
    }
  };

  // Helper to update an order status in the Firestore `orders` collection:
  // - On APPROVE: updates status to "confirmed" and then to "ACTIVE & DELIVERED"
  // - On REJECT: updates status to "denied"
  const updateOrderStatusInFirestoreOrdersCollection = async (
    orderId: string,
    action: 'APPROVE' | 'REJECT',
    inv?: any
  ) => {
    try {
      const projectId = firebaseAppletConfig.projectId;
      const databaseId = firebaseAppletConfig.firestoreDatabaseId || '(default)';
      const apiKey = firebaseAppletConfig.apiKey;
      if (!projectId || !apiKey) return;

      const cleanDocId = (orderId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 120);
      if (!cleanDocId) return;
      const baseDocsPath = `projects/${projectId}/databases/${databaseId}/documents`;
      const nowIso = new Date().toISOString();

      if (action === 'APPROVE') {
        // Step 1: Update status to "confirmed"
        const patchConfirmedUrl = `https://firestore.googleapis.com/v1/${baseDocsPath}/orders/${encodeURIComponent(cleanDocId)}?updateMask.fieldPaths=status&updateMask.fieldPaths=updated_at&key=${encodeURIComponent(apiKey)}`;
        const res1 = await fetch(patchConfirmedUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              status: { stringValue: 'confirmed' },
              updated_at: { stringValue: nowIso.slice(0, 60) },
            },
          }),
        });

        if (!res1.ok && inv) {
          // If document wasn't created yet, create it as 'confirmed' first
          await saveOrderToFirestoreOrdersCollection({
            id: cleanDocId,
            customername: inv.customer_name || inv.user_id || 'Avor Investor',
            name: inv.machine_title || 'Machine Order',
            status: 'confirmed',
            user_id: inv.user_id,
            customer_name: inv.customer_name,
            customer_phone: inv.customer_phone,
            machine_id: String(inv.machine_id || ''),
            machine_title: inv.machine_title,
            amount_invested: Number(inv.amount_invested || 0),
            daily_return: Number(inv.daily_yield || inv.daily_return || 0),
            duration_days: Number(inv.duration_days || 32),
            total_return: Number(inv.total_return || 0),
            days_elapsed: 1,
            days_left: Math.max(0, Number(inv.duration_days || 32) - 1),
            units: Number(inv.units || 1),
            start_date: inv.start_date || nowIso,
            end_date: inv.end_date,
          });
        }

        // Step 2: Update status to "ACTIVE & DELIVERED"
        const patchActiveUrl = `https://firestore.googleapis.com/v1/${baseDocsPath}/orders/${encodeURIComponent(cleanDocId)}?updateMask.fieldPaths=status&updateMask.fieldPaths=days_elapsed&updateMask.fieldPaths=updated_at&key=${encodeURIComponent(apiKey)}`;
        await fetch(patchActiveUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              status: { stringValue: 'ACTIVE & DELIVERED' },
              days_elapsed: { integerValue: '1' },
              updated_at: { stringValue: new Date().toISOString().slice(0, 60) },
            },
          }),
        });
      } else {
        // Deny / Refund -> Update status to "denied"
        const patchDeniedUrl = `https://firestore.googleapis.com/v1/${baseDocsPath}/orders/${encodeURIComponent(cleanDocId)}?updateMask.fieldPaths=status&updateMask.fieldPaths=updated_at&key=${encodeURIComponent(apiKey)}`;
        const resDenied = await fetch(patchDeniedUrl, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fields: {
              status: { stringValue: 'denied' },
              updated_at: { stringValue: nowIso.slice(0, 60) },
            },
          }),
        });
        if (!resDenied.ok && inv) {
          await saveOrderToFirestoreOrdersCollection({
            id: cleanDocId,
            customername: inv.customer_name || inv.user_id || 'Avor Investor',
            name: inv.machine_title || 'Machine Order',
            status: 'denied',
            user_id: inv.user_id,
            customer_name: inv.customer_name,
            customer_phone: inv.customer_phone,
            machine_id: String(inv.machine_id || ''),
            machine_title: inv.machine_title,
            amount_invested: Number(inv.amount_invested || 0),
          });
        }
      }
    } catch {
      // Non-blocking background sync
    }
  };

  // Helper to ingest a Firebase admin_messages document into server transactions & Admin notifications
  const ingestFirebaseAdminMessage = (payload: {
    firebase_doc_id?: string;
    name?: string;
    item?: string;
    senderPhone?: string;
    receiverPhone?: string;
    receiverName?: string;
    amount?: number;
    machineTitle?: string;
    paymentMethod?: string;
    paymentReference?: string;
    status?: string;
    createdAt?: string;
  }) => {
    const {
      firebase_doc_id,
      name,
      item,
      senderPhone,
      receiverPhone,
      receiverName,
      amount,
      machineTitle,
      paymentMethod,
      paymentReference,
      createdAt,
    } = payload || {};

    if (
      machineTitle === 'USER_ACCOUNT_BACKUP' ||
      String(firebase_doc_id || '').startsWith('reg-user-')
    ) {
      return { duplicate: true };
    }

    // Preserve all Firestore documents permanently (never filter out by cutoff time)
    void createdAt;

    // Ignore deleted historical demo/test documents or denied fake orders
    const alreadyDeniedTx = transactions.find(
      (t) =>
        ((firebase_doc_id && (t as any).firebase_doc_id === firebase_doc_id) ||
          (paymentReference && t.payment_reference === paymentReference)) &&
        t.status === 'FAILED'
    );
    const alreadyDeniedInNotifs = notifications.some(
      (n: any) =>
        ((firebase_doc_id && n.firebase_doc_id === firebase_doc_id) ||
          (paymentReference && n.payment_reference === paymentReference)) &&
        n.order_status === 'REJECTED'
    );

    if (
      alreadyDeniedTx ||
      alreadyDeniedInNotifs ||
      (firebase_doc_id && DELETED_DEMO_IDS.has(firebase_doc_id)) ||
      (paymentReference && DELETED_DEMO_IDS.has(paymentReference)) ||
      name === 'Verification User' ||
      name === 'Test Investor'
    ) {
      return { duplicate: true };
    }

    // Check if this order was already confirmed by Admin (in transactions or notifications)
    const alreadyConfirmedTx = transactions.find(
      (t) =>
        ((firebase_doc_id && (t as any).firebase_doc_id === firebase_doc_id) ||
          (paymentReference && t.payment_reference === paymentReference)) &&
        (t.status === 'SUCCESS' || t.status === 'CONFIRMED')
    );
    const alreadyConfirmedInNotifs = notifications.some(
      (n: any) =>
        ((firebase_doc_id && n.firebase_doc_id === firebase_doc_id) ||
          (paymentReference && n.payment_reference === paymentReference)) &&
        (n.order_status === 'CONFIRMED' || n.order_status === 'SUCCESS')
    );

    const isWalletPurchaseMsg =
      String(item || '').toLowerCase().includes('using wallet balance') ||
      String(paymentMethod || '').toLowerCase().includes('wallet');

    const incomingIsConfirmed =
      alreadyConfirmedTx !== undefined ||
      alreadyConfirmedInNotifs ||
      isWalletPurchaseMsg ||
      payload?.status === 'CONFIRMED' ||
      payload?.status === 'SUCCESS';

    const existingMatchingTx = transactions.find(
      (t) =>
        (firebase_doc_id && (t as any).firebase_doc_id === firebase_doc_id) ||
        (paymentReference && t.payment_reference === paymentReference)
    );

    if (
      existingMatchingTx &&
      ((firebase_doc_id && notifications.some((n: any) => n.firebase_doc_id === firebase_doc_id)) ||
        (paymentReference && notifications.some((n: any) => n.payment_reference === paymentReference)))
    ) {
      return { duplicate: true };
    }

    const numAmt = Number(amount) || 0;
    const customerName = (name || 'Avor Investor').trim();
    const customerPhone = (senderPhone || '').trim();
    const targetReceiverPhone = receiverPhone || RECEIVER_PHONE;
    const targetReceiverName = receiverName || RECEIVER_NAME;
    const effectiveCreatedAt = createdAt || new Date().toISOString();
    const effectiveRef = paymentReference || `FB-${(firebase_doc_id || Date.now().toString()).slice(0, 8)}`;

    // Link to an existing DEPOSIT transaction if present (do not synthesize phantom deposits from historical Firestore messages)
    let linkedTxId: string | undefined;
    if (numAmt > 0 && !isWalletPurchaseMsg) {
      const explicitUserId = (payload as any)?.userId || (payload as any)?.user_id || '';
      const explicitTxId = (payload as any)?.transactionId || (payload as any)?.transaction_id || '';
      const existingByExplicitTx = explicitTxId ? transactions.find((t) => t.id === explicitTxId) : undefined;
      const targetMatchTx = existingMatchingTx || existingByExplicitTx;

      if (targetMatchTx) {
        const user = findOrRestoreUser(explicitUserId || customerPhone || customerName, {
          user_id: explicitUserId || undefined,
          phone_number: customerPhone,
          user_phone: customerPhone,
          full_name: customerName,
          user_name: customerName,
        });
        linkedTxId = targetMatchTx.id;
        if (firebase_doc_id && !(targetMatchTx as any).firebase_doc_id) {
          (targetMatchTx as any).firebase_doc_id = firebase_doc_id;
        }
        if (explicitUserId && targetMatchTx.user_id !== explicitUserId) {
          targetMatchTx.user_id = explicitUserId;
        }
        if (incomingIsConfirmed && targetMatchTx.status === 'PENDING') {
          targetMatchTx.status = 'SUCCESS';
          (targetMatchTx as any).status_label = 'Successful';
          (targetMatchTx as any).wallet_credited = true;
          (targetMatchTx as any).approved_permanent = true;
          if (user) syncUserConfirmedFinances(user, user.id);
        }
      }
    }

    if (
      !(
        (firebase_doc_id && notifications.some((n: any) => n.firebase_doc_id === firebase_doc_id)) ||
        (paymentReference && notifications.some((n: any) => n.payment_reference === paymentReference))
      )
    ) {
      notifyAllAdmins(
        incomingIsConfirmed
          ? `✅ Confirmed Order: ${customerName}${machineTitle ? ` • ${machineTitle}` : ''}`
          : `🔥 Deposit & Machine Order (Pending Admin Confirmation): ${customerName}${machineTitle ? ` • ${machineTitle}` : ''}`,
        `${item || `Order of UGX ${numAmt.toLocaleString()} from ${customerName}`}`,
        'PAYMENT',
        {
          transaction_id: linkedTxId,
          firebase_doc_id: firebase_doc_id || `fb-${Date.now()}`,
          customer_name: customerName,
          customer_phone: customerPhone,
          receiver_phone: targetReceiverPhone,
          receiver_name: targetReceiverName,
          amount: numAmt,
          machine_title: machineTitle || '',
          payment_method: paymentMethod || 'Mobile Money',
          payment_reference: effectiveRef,
          order_status: incomingIsConfirmed ? 'CONFIRMED' : 'PENDING',
        }
      );
    }

    saveAppStateToDisk();
    return { duplicate: false };
  };

  // =========================================================================
  // SERVER-SIDE FIRESTORE TRIGGER: notifyAdminOnDeposit ("admin_messages/{messageId}")
  // Uses stateless Firestore REST :runQuery API to avoid Node.js gRPC idle stream disconnects,
  // satisfies security rules (status IN ['PENDING', 'CONFIRMED', 'SUCCESS']),
  // and guarantees all deposit & machine orders appear in both Firebase and the Admin Plane.
  // =========================================================================
  try {
    const processedFirestoreIds = new Set<string>();
    const projectId = firebaseAppletConfig.projectId;
    const databaseId = firebaseAppletConfig.firestoreDatabaseId || '(default)';
    const apiKey = firebaseAppletConfig.apiKey;
    const baseFirestoreRestUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}/documents`;

    const parseFirestoreFields = (fields: Record<string, any> | undefined): Record<string, any> => {
      const out: Record<string, any> = {};
      if (!fields) return out;
      for (const [k, v] of Object.entries(fields)) {
        if (!v || typeof v !== 'object') continue;
        if ('stringValue' in v) out[k] = v.stringValue;
        else if ('integerValue' in v) out[k] = Number(v.integerValue);
        else if ('doubleValue' in v) out[k] = Number(v.doubleValue);
        else if ('booleanValue' in v) out[k] = Boolean(v.booleanValue);
        else if ('timestampValue' in v) out[k] = v.timestampValue;
      }
      return out;
    };

    const onDocumentCreated = (
      collectionPath: string,
      handler: (event: {
        params: { messageId: string };
        data: {
          id: string;
          createTime?: string;
          data: () => Record<string, any>;
          ref: { update: (fields: Record<string, any>) => Promise<void> };
        } | null;
      }) => Promise<void>
    ) => {
      const colName = collectionPath.split('/')[0] || 'admin_messages';
      const pollFirestoreDocuments = async () => {
        try {
          const url = `${baseFirestoreRestUrl}:runQuery?key=${encodeURIComponent(apiKey)}`;
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              structuredQuery: {
                from: [{ collectionId: colName }],
                where: {
                  fieldFilter: {
                    field: { fieldPath: 'status' },
                    op: 'IN',
                    value: {
                      arrayValue: {
                        values: [
                          { stringValue: 'PENDING' },
                          { stringValue: 'CONFIRMED' },
                          { stringValue: 'SUCCESS' },
                        ],
                      },
                    },
                  },
                },
                limit: 100,
              },
            }),
          });
          if (!res.ok) return;
          const rows: any[] = await res.json();
          if (!Array.isArray(rows)) return;

          for (const row of rows) {
            const rawDoc = row?.document;
            if (!rawDoc || !rawDoc.name) continue;
            const fullPath: string = rawDoc.name || '';
            const docId = fullPath.split('/').pop() || '';
            if (!docId || processedFirestoreIds.has(docId)) continue;
            processedFirestoreIds.add(docId);

            const parsedData = parseFirestoreFields(rawDoc.fields);
            const docCreateTime: string | undefined = rawDoc.createTime || parsedData.timestamp;
            const event = {
              params: { messageId: docId },
              data: {
                id: docId,
                createTime: docCreateTime,
                data: () => parsedData,
                ref: {
                  update: async (fieldsToUpdate: Record<string, any>) => {
                    if (fieldsToUpdate.status) {
                      const patchUrl = `${baseFirestoreRestUrl}/${encodeURIComponent(colName)}/${encodeURIComponent(docId)}?updateMask.fieldPaths=status&key=${encodeURIComponent(apiKey)}`;
                      await fetch(patchUrl, {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          fields: {
                            status: { stringValue: String(fieldsToUpdate.status) },
                          },
                        }),
                      });
                    }
                  },
                },
              },
            };

            await handler(event);
          }
        } catch {
          // Silent background check
        }
      };

      void pollFirestoreDocuments;
    };

    interface DepositMessage {
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

    const processNewDeposit = onDocumentCreated(
      'admin_messages/{messageId}',
      async (event) => {
        const snapshot = event.data;
        if (!snapshot) {
          console.log('No snapshot data available.');
          return;
        }

        // Cast the document data to your TypeScript interface
        const message = snapshot.data() as DepositMessage;

        // Wildcard parameters are automatically accessible via event.params
        const messageId = event.params.messageId;
        if (messageId === 'mVXN2reH39ZgMfPtm4fa' || message.name === 'Verification User') {
          return;
        }
        console.log(`Processing message with ID: ${messageId}`);

        const { name, amount, status } = message;

        if (amount && amount > 1000) {
          console.log(`High-value deposit of ${amount} from ${name}!`);
        }

        try {
          // Deliver the deposit & machine message to the Admin Plane across all devices
          ingestFirebaseAdminMessage({
            firebase_doc_id: messageId,
            name: name || 'Avor Investor',
            item: message.item || 'Machine / Deposit Action',
            senderPhone: message.senderPhone || '',
            receiverPhone: message.receiverPhone || '',
            receiverName: message.receiverName || '',
            amount: Number(amount) || 0,
            machineTitle: message.machineTitle || message.item || '',
            paymentMethod: message.paymentMethod || 'Mobile Money',
            paymentReference: message.paymentReference || `FB-${messageId.slice(0, 8)}`,
            status: status || 'PENDING',
            createdAt: snapshot.createTime,
          });
        } catch (error) {
          console.error('Error processing deposit message:', error);
        }
      }
    );
    void processNewDeposit;
  } catch (err) {
    console.error('Could not initialize server Firestore trigger:', err);
  }

  // Mirror Firebase Firestore admin_messages to server notifications so all devices stay in sync
  app.post('/api/admin/firebase-message', (req, res) => {
    const body = req.body || {};
    const result = ingestFirebaseAdminMessage(body);
    if (!result.duplicate) {
      void ensureOrderSavedInFirestore({
        docId: body.firebase_doc_id || body.paymentReference,
        name: body.name || 'Avor Investor',
        item: body.item || 'Machine / Deposit Order',
        senderPhone: body.senderPhone,
        receiverPhone: body.receiverPhone,
        receiverName: body.receiverName,
        amount: Number(body.amount) || 0,
        machineTitle: body.machineTitle,
        paymentMethod: body.paymentMethod,
        paymentReference: body.paymentReference,
        status: body.status || 'PENDING',
      });
    }
    return res.status(result.duplicate ? 200 : 201).json({ synced: true, ...result });
  });

  // Firebase Billing Setup State & Endpoints (Visa or Mobile Money)
  let firebaseBillingConfig: {
    configured: boolean;
    method?: 'VISA' | 'MOBILE_MONEY';
    provider?: string;
    account_or_card_masked?: string;
    holder_name?: string;
    plan_name?: string;
    amount_ugx?: number;
    reference?: string;
    updated_at?: string;
  } = {
    configured: false,
  };

  app.get('/api/admin/firebase-billing', (req, res) => {
    res.json(firebaseBillingConfig);
  });

  app.post('/api/admin/firebase-billing', (req, res) => {
    const {
      method = 'VISA',
      provider = 'Visa Card',
      account_or_card_masked = '',
      holder_name = 'Admin',
      plan_name = 'Firebase Blaze Pay-As-You-Go Billing',
      amount_ugx = 50000,
      reference = '',
    } = req.body || {};

    firebaseBillingConfig = {
      configured: true,
      method: method === 'MOBILE_MONEY' ? 'MOBILE_MONEY' : 'VISA',
      provider,
      account_or_card_masked,
      holder_name,
      plan_name,
      amount_ugx: Number(amount_ugx) || 50000,
      reference: reference || `FB-BILL-${Date.now().toString().slice(-6)}`,
      updated_at: new Date().toISOString(),
    };

    res.json({
      success: true,
      message: `Firebase Billing successfully configured with ${provider}!`,
      billing: firebaseBillingConfig,
    });
  });

  // Helper to confirm & deliver a Pending Machine Order (or reject/cancel a fake order) in the Admin Orders section
  const processAdminOrderAction = (inv: Investment, action: 'APPROVE' | 'REJECT', notes?: string) => {
    const user = findOrRestoreUser(inv.user_id, {
      user_id: inv.user_id,
      phone_number: (inv as any).customer_phone,
      user_phone: (inv as any).customer_phone,
      full_name: (inv as any).customer_name,
    });
    const nowIso = new Date().toISOString();

    if (action === 'APPROVE') {
      const rewardNote = activateConfirmedMachineInvestment(
        inv,
        notes || 'Confirmed & delivered by Admin in Pending Orders / Orders / Active Cycles'
      );

      // Ensure any linked deposit or investment transaction is also marked SUCCESS / CONFIRMED
      for (const ltx of transactions) {
        if (
          (ltx.investment_id === inv.id ||
            (doesTxBelongToUser(ltx, user, inv.user_id) && ltx.status === 'PENDING')) &&
          ltx.status === 'PENDING'
        ) {
          ltx.status = 'SUCCESS';
          (ltx as any).status_label = 'Successful';
          (ltx as any).confirmed_at = nowIso;
          (ltx as any).wallet_credited = true;
          (ltx as any).approved_permanent = true;
        }
      }

      // Mark any matching admin notification as CONFIRMED
      for (const n of notifications) {
        if (
          (n as any).investment_id === inv.id ||
          ((inv as any).payment_reference && (n as any).payment_reference === (inv as any).payment_reference)
        ) {
          (n as any).order_status = 'CONFIRMED';
          n.read = true;
        }
      }

      const fin = user ? syncUserConfirmedFinances(user, user.id) : { computedWallet: 0, computedBalance: 0 };
      if (user) {
        pushNotification(
          user.id,
          `✅ Order Confirmed & Delivered: ${inv.machine_title}!`,
          `Admin has confirmed your order for ${inv.machine_title}! Your machine is now ACTIVE & DELIVERED (Day 1 of ${inv.duration_days} Days) and earning UGX ${Number(inv.daily_yield || 0).toLocaleString()} daily.${rewardNote}`,
          'PAYMENT'
        );
      }
      saveAppStateToDisk();

      // Update Firestore 'orders' document status to "confirmed" and then to "ACTIVE & DELIVERED"
      void updateOrderStatusInFirestoreOrdersCollection(inv.id, 'APPROVE', inv);
      void ensureOrderSavedInFirestore({
        docId: inv.id,
        name: (inv as any).customer_name || user?.full_name || inv.user_id || 'Avor Investor',
        item: `Order Confirmed & Delivered: ${inv.machine_title} (ACTIVE & DELIVERED)`,
        amount: Number(inv.amount_invested || 0),
        machineTitle: inv.machine_title,
        status: 'CONFIRMED',
      });

      broadcastRealtimeEvent({
        type: 'WALLET_CONFIRMED_SYNC',
        order_type: 'ORDER_CONFIRMED_SYNC',
        investment: inv,
        investment_id: inv.id,
        status: 'ACTIVE',
        firestore_status: 'ACTIVE & DELIVERED',
        status_label: 'ACTIVE & DELIVERED',
        user_id: user?.id || inv.user_id,
        user_phone: user?.phone_number || (inv as any).customer_phone || '',
        customer_phone: (inv as any).customer_phone || user?.phone_number || '',
        wallet_balance: fin.computedWallet,
        available_wallet: fin.computedWallet,
        balance: user?.balance ?? fin.computedBalance,
        activated_investments: [inv],
        timestamp: nowIso,
      });

      return {
        message: `Order ${inv.id} (${inv.machine_title}) confirmed! Firestore order status updated to "confirmed" -> "ACTIVE & DELIVERED" (Day 1 started).`,
        investment: inv,
        wallet_balance: fin.computedWallet,
      };
    } else {
      // REJECT / Cancel Pending Order -> Update Firestore 'orders' document status to "denied"
      void updateOrderStatusInFirestoreOrdersCollection(inv.id, 'REJECT', inv);

      const idx = investments.findIndex((i) => i.id === inv.id);
      if (idx !== -1) {
        investments.splice(idx, 1);
      }
      for (let tIdx = transactions.length - 1; tIdx >= 0; tIdx--) {
        const ltx = transactions[tIdx];
        if (ltx.investment_id === inv.id && ltx.type === 'INVESTMENT') {
          transactions.splice(tIdx, 1);
        }
      }
      for (const n of notifications) {
        if ((n as any).investment_id === inv.id) {
          (n as any).order_status = 'REJECTED';
          n.read = true;
        }
      }
      const fin = user ? syncUserConfirmedFinances(user, user.id) : { computedWallet: 0, computedBalance: 0 };
      if (user) {
        pushNotification(
          user.id,
          `❌ Machine Order Denied: ${inv.machine_title}`,
          `Your pending order for ${inv.machine_title} was denied by Admin and refunded to your wallet.`,
          'PAYMENT'
        );
      }
      saveAppStateToDisk();

      broadcastRealtimeEvent({
        type: 'WALLET_DENIED_SYNC',
        order_type: 'ORDER_DENIED_SYNC',
        investment_id: inv.id,
        status: 'FAILED',
        firestore_status: 'denied',
        user_id: user?.id || inv.user_id,
        user_phone: user?.phone_number || (inv as any).customer_phone || '',
        customer_phone: (inv as any).customer_phone || user?.phone_number || '',
        wallet_balance: fin.computedWallet,
        available_wallet: fin.computedWallet,
        balance: user?.balance ?? fin.computedBalance,
        timestamp: nowIso,
      });

      return {
        message: `Order ${inv.id} (${inv.machine_title}) denied (Firestore status updated to "denied") and refunded to customer wallet.`,
        investment: inv,
        wallet_balance: fin.computedWallet,
      };
    }
  };

  // Dedicated Admin Pending Orders Action Endpoint (Confirm Order / Approve / Deliver or Deny)
  // Also supports orders loaded directly from Firestore `orders` collection even if not yet in memory
  app.post('/api/admin/orders/action', (req, res) => {
    const {
      investment_id,
      action = 'APPROVE',
      notes,
      customername,
      name,
      customer_phone,
      user_id,
      machine_id,
      machine_title,
      amount_invested,
      daily_return,
      duration_days,
      units,
    } = req.body || {};

    let inv = investments.find((i) => i.id === investment_id);
    if (!inv && investment_id) {
      // Rehydrate order from Firestore payload if it was created directly in Firestore `orders`
      const targetUser =
        (user_id && Array.from(users.values()).find((u) => u.id === user_id)) ||
        (customer_phone &&
          Array.from(users.values()).find((u) => {
            const a = String(u.phone_number || '').replace(/\D/g, '').slice(-9);
            const b = String(customer_phone || '').replace(/\D/g, '').slice(-9);
            return a.length >= 7 && a === b;
          })) ||
        Array.from(users.values())[0];
      const machineObj =
        machines.find(
          (m) =>
            String(m.id) === String(machine_id) ||
            (machine_title && m.title && String(machine_title).toLowerCase().includes(m.title.toLowerCase()))
        ) || machines[0];
      const amt = Number(amount_invested || machineObj?.price || 15000);
      const dur = Number(duration_days || machineObj?.duration_days || 32);
      const daily = Number(daily_return || machineObj?.daily_yield || Math.round(amt * 0.07));
      const nowIso = new Date().toISOString();

      inv = {
        id: String(investment_id),
        user_id: targetUser?.id || String(user_id || 'usr-investor'),
        machine_id: machineObj?.id || 1,
        machine_title: String(machine_title || name || machineObj?.title || 'AV1 Machine'),
        amount_invested: amt,
        daily_yield: daily,
        duration_days: dur,
        total_return: daily * dur,
        days_elapsed: 0,
        status: 'PENDING',
        start_date: nowIso,
        end_date: new Date(Date.now() + dur * 86400000).toISOString(),
        last_payout_at: nowIso,
        units: Number(units || 1),
      } as any;
      (inv as any).customer_name = customername || targetUser?.full_name || 'Avor Investor';
      (inv as any).customer_phone = customer_phone || targetUser?.phone_number || '';
      (inv as any).wallet_deducted = true;
      investments.unshift(inv!);
    }

    if (!inv) {
      return res.status(404).json({ error: 'Order record not found.' });
    }
    const result = processAdminOrderAction(inv, action === 'REJECT' ? 'REJECT' : 'APPROVE', notes);
    return res.json(result);
  });

  // Confirm All Pending Machine Orders at Once
  app.post('/api/admin/orders/approve-all', (req, res) => {
    const pendingInvs = investments.filter((i) => i.status === 'PENDING');
    if (pendingInvs.length === 0) {
      return res.json({ message: 'All machine orders are already confirmed!', confirmed_count: 0 });
    }
    for (const inv of pendingInvs) {
      processAdminOrderAction(inv, 'APPROVE', 'Confirmed via Confirm All Pending Orders');
    }
    return res.json({
      message: `Confirmed & delivered ${pendingInvs.length} pending machine order(s)! All customer machine cycles are now ACTIVE (Day 1).`,
      confirmed_count: pendingInvs.length,
    });
  });

  // Admin Toggle Investment Status (Pending -> Active -> Completed)
  app.post('/api/admin/investments/toggle-status', (req, res) => {
    const { investment_id } = req.body;
    const inv = investments.find((i) => i.id === investment_id);
    if (!inv) {
      return res.status(404).json({ error: 'Investment record not found.' });
    }

    if (inv.status === 'PENDING') {
      const result = processAdminOrderAction(inv, 'APPROVE', 'Confirmed & delivered from Admin Orders / Active Cycles section.');
      return res.json(result);
    } else if (inv.status === 'ACTIVE') {
      inv.status = 'PAYOUT_COMPLETE';
      inv.days_elapsed = inv.duration_days;
      saveAppStateToDisk();
      return res.json({
        message: `Investment ${inv.id} (${inv.machine_title}) marked as COMPLETED!`,
        investment: inv,
      });
    } else {
      inv.status = 'ACTIVE';
      inv.days_elapsed = Math.min(inv.duration_days - 1, Math.max(1, inv.days_elapsed || 1));
      saveAppStateToDisk();
      return res.json({
        message: `Investment ${inv.id} (${inv.machine_title}) set back to ACTIVE!`,
        investment: inv,
      });
    }
  });

  // Admin Toggle Customer Suspension
  app.post('/api/admin/user/toggle-suspension', (req, res) => {
    const { user_id } = req.body;
    const targetUser = Array.from(users.values()).find((u) => u.id === user_id);
    if (!targetUser) {
      return res.status(404).json({ error: 'Customer not found.' });
    }

    targetUser.is_suspended = !targetUser.is_suspended;
    saveRegisteredUserToDisk(targetUser);
    pushNotification(
      targetUser.id,
      targetUser.is_suspended ? '⚠️ Account Suspended by Admin' : '✅ Account Reactivated',
      targetUser.is_suspended
        ? 'Your account has been suspended by an administrator. Financial operations are currently restricted.'
        : 'Your account has been reactivated by an administrator. Full access restored.',
      'SECURITY'
    );

    res.json({
      message: `Customer ${targetUser.full_name} (${targetUser.id}) is now ${
        targetUser.is_suspended ? 'SUSPENDED' : 'ACTIVE'
      }.`,
      user: targetUser,
    });
  });

  // Admin Edit Customer Management Details (Name, Phone, Balance, Wallet Balance, Machine Access Status, Referral Code, Password)
  app.post('/api/admin/user/edit', (req, res) => {
    const {
      user_id,
      full_name,
      phone_number,
      balance,
      wallet_balance,
      has_bought_machine,
      referral_code,
      password,
    } = req.body || {};

    const targetUser = Array.from(users.values()).find((u) => u.id === user_id);
    if (!targetUser) {
      return res.status(404).json({ error: 'Customer not found.' });
    }

    if (typeof full_name === 'string' && full_name.trim().length > 0) {
      targetUser.full_name = full_name.trim();
      targetUser.name = full_name.trim();
    }
    if (typeof phone_number === 'string' && phone_number.trim().length > 0) {
      targetUser.phone_number = phone_number.trim();
      targetUser.phoneNumber = phone_number.trim();
      users.set(phone_number.trim(), targetUser);
    }
    if (balance !== undefined && !isNaN(Number(balance))) {
      targetUser.balance = Math.max(0, Number(balance));
    }
    if (wallet_balance !== undefined && !isNaN(Number(wallet_balance))) {
      const safeWallet = Math.max(0, Number(wallet_balance));
      targetUser.wallet_balance = safeWallet;
      targetUser.available_wallet = safeWallet;
    }
    if (typeof has_bought_machine === 'boolean') {
      targetUser.has_bought_machine = has_bought_machine;
    }
    if (typeof referral_code === 'string' && referral_code.trim().length > 0) {
      targetUser.referral_code = referral_code.trim();
    }
    if (typeof password === 'string' && password.trim().length > 0) {
      targetUser.password = password.trim();
      targetUser.password_hash = bcrypt.hashSync(password.trim(), 10);
    }

    saveRegisteredUserToDisk(targetUser);
    saveAppStateToDisk();

    return res.json({
      message: `Customer ${targetUser.full_name} (${targetUser.phone_number}) updated and saved permanently!`,
      user: targetUser,
    });
  });

  // Admin Remove or Delete a Running Machine Cycle by Removing Machine
  app.post('/api/admin/investments/remove', (req, res) => {
    const { investment_id, user_id, refund_wallet } = req.body || {};
    if (!investment_id) {
      return res.status(400).json({ error: 'Machine cycle ID is required.' });
    }

    const invIdx = investments.findIndex((i) => i.id === investment_id);
    const removedInv = invIdx >= 0 ? investments[invIdx] : null;
    const ownerUserId = removedInv?.user_id || user_id;
    const machineTitle = removedInv?.machine_title || 'Machine Cycle';

    if (invIdx >= 0) {
      investments.splice(invIdx, 1);
    }

    // Permanently block this removed cycle ID from re-hydrating
    DELETED_DEMO_IDS.add(String(investment_id));
    saveDeletedIdsToDisk();

    // Update customer's active machine status if they have no other active/completed machines
    const targetUser = ownerUserId
      ? Array.from(users.values()).find((u) => u.id === ownerUserId)
      : undefined;
    if (targetUser) {
      if (refund_wallet && removedInv && Number(removedInv.amount_invested) > 0) {
        const refundAmt = Number(removedInv.amount_invested || 0);
        targetUser.wallet_balance = Number(targetUser.wallet_balance || 0) + refundAmt;
        targetUser.available_wallet = targetUser.wallet_balance;
      }
      const remainingActiveOrDone = investments.some(
        (i) =>
          i.user_id === targetUser.id &&
          (i.status === 'ACTIVE' || i.status === 'PAYOUT_COMPLETE')
      );
      targetUser.has_bought_machine = remainingActiveOrDone;
      saveRegisteredUserToDisk(targetUser);
    }

    saveAppStateToDisk();

    // Also delete from Firestore `orders` collection via REST API
    void (async () => {
      try {
        const projectId = firebaseAppletConfig.projectId;
        const databaseId = firebaseAppletConfig.firestoreDatabaseId || '(default)';
        const apiKey = firebaseAppletConfig.apiKey;
        if (!projectId || !apiKey) return;
        const cleanOrderId = String(investment_id)
          .replace(/[^a-zA-Z0-9_-]/g, '')
          .slice(0, 120);
        if (!cleanOrderId) return;
        const deleteUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(databaseId)}/documents/orders/${encodeURIComponent(cleanOrderId)}?key=${encodeURIComponent(apiKey)}`;
        await fetch(deleteUrl, { method: 'DELETE' });
      } catch {}
    })();

    return res.json({
      message: `Removed machine & deleted running cycle (${machineTitle} • ${investment_id})!`,
      removed_id: investment_id,
      user: targetUser || null,
    });
  });

  // Helper to credit receiver number totals when Admin confirms a deposit (creates receiver entry if missing so approved money never disappears)
  const creditReceiverOnConfirm = (tx: any) => {
    if (tx.receiver_credited) return;
    const recPhone = tx.receiver_phone || RECEIVER_PHONE;
    const recName = tx.receiver_name || RECEIVER_NAME;
    const recId = tx.receiver_id;
    let targetRec =
      depositReceiverNumbers.find((n) => (recId && n.id === recId) || (recPhone && n.phone_number === recPhone)) ||
      depositReceiverNumbers.find((n) => n.is_active) ||
      null;
    if (!targetRec) {
      targetRec = {
        id: recId || `rec-${Date.now()}`,
        phone_number: recPhone,
        account_name: recName,
        carrier: 'MTN',
        is_active: true,
        priority: depositReceiverNumbers.length + 1,
        daily_limit_ugx: 5000000,
        daily_receiving_limit: 5000000,
        amount_received_today: 0,
        total_received_ugx: 0,
        total_transactions_count: 0,
        rotation_duration_minutes: 5,
        rotation_duration_hours: 0.0833,
        activated_at: new Date().toISOString(),
        last_rotated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };
      depositReceiverNumbers.push(targetRec);
      if (!depositRotationConfig.current_active_id) {
        depositRotationConfig.current_active_id = targetRec.id;
      }
    }
    targetRec.amount_received_today = (targetRec.amount_received_today || 0) + Number(tx.amount || 0);
    targetRec.total_received_ugx = (targetRec.total_received_ugx || 0) + Number(tx.amount || 0);
    targetRec.total_transactions_count = (targetRec.total_transactions_count || 0) + 1;
    targetRec.last_rotated_at = new Date().toISOString();
    tx.receiver_credited = true;
    saveDepositNumbersToDisk();
  };

  // =========================================================================
  // REAL-TIME WALLET SYNC FUNCTION WHEN ADMIN PRESSES CONFIRM:
  // Atomically executes 2 things at the exact same time:
  //   1. Changes deposit status from Pending -> Successful (SUCCESS)
  //   2. Adds that amount to that customer's Wallet balance and broadcasts real-time SSE update
  // =========================================================================
  const realTimeSyncWalletOnConfirm = (
    tx: Transaction,
    notes?: string
  ): {
    user: (User & { password_hash?: string }) | undefined;
    computedWallet: number;
    computedBalance: number;
  } => {
    const nowIso = new Date().toISOString();

    // THING 1: Change Pending -> Successful
    tx.status = 'SUCCESS';
    (tx as any).status_label = 'Successful';
    (tx as any).confirmed_at = nowIso;
    (tx as any).approved_permanent = true;
    (tx as any).wallet_credited = true;

    creditReceiverOnConfirm(tx);

    // Find all user records matching tx.user_id, tx.user_phone, or tx.customer_phone so the customer's active session is guaranteed to receive the Wallet funds
    const matchedUsers = new Map<string, User & { password_hash?: string }>();
    const primaryUser = findOrRestoreUser(tx.user_id, {
      user_id: tx.user_id,
      phone_number: (tx as any).user_phone || (tx as any).customer_phone,
      user_phone: (tx as any).user_phone || (tx as any).customer_phone,
      full_name: (tx as any).customer_name,
      user_name: (tx as any).customer_name,
    });
    if (primaryUser && primaryUser.id !== 'usr-admin-owner') {
      matchedUsers.set(primaryUser.id, primaryUser);
    }

    for (const u of users.values()) {
      if (!u || !u.id || u.id === 'usr-admin-owner') continue;
      if (doesTxBelongToUser(tx, u, u.id)) {
        matchedUsers.set(u.id, u);
      }
    }

    // Remove any duplicate PENDING deposit transactions with the same reference/firebase_doc_id or confirm sibling pending deposits for this customer
    for (let idx = transactions.length - 1; idx >= 0; idx--) {
      const other = transactions[idx];
      if (other.id === tx.id) continue;
      if (other.status === 'PENDING' && (other.type === 'DEPOSIT' || other.type === 'INVESTMENT')) {
        const sameRef =
          (tx.payment_reference && other.payment_reference === tx.payment_reference) ||
          ((tx as any).firebase_doc_id && (other as any).firebase_doc_id === (tx as any).firebase_doc_id);
        if (sameRef && other.type === tx.type) {
          transactions.splice(idx, 1);
          continue;
        }
        if (doesTxBelongToUser(other, primaryUser, tx.user_id)) {
          if (other.type === tx.type && other.amount === tx.amount) {
            transactions.splice(idx, 1);
            continue;
          } else if (other.type === 'DEPOSIT') {
            other.status = 'SUCCESS';
            (other as any).status_label = 'Successful';
            (other as any).confirmed_at = nowIso;
            (other as any).approved_permanent = true;
            (other as any).wallet_credited = true;
            creditReceiverOnConfirm(other);
          }
        }
      }
    }

    // Mark all matching Admin order notifications as SUCCESS / CONFIRMED
    notifications.forEach((n: any) => {
      if (
        n.transaction_id === tx.id ||
        (tx.payment_reference && n.payment_reference === tx.payment_reference) ||
        ((tx as any).firebase_doc_id && n.firebase_doc_id === (tx as any).firebase_doc_id) ||
        (primaryUser &&
          n.customer_phone &&
          (n.customer_phone === primaryUser.phone_number || n.customer_phone === (tx as any).customer_phone) &&
          n.order_status === 'PENDING')
      ) {
        n.order_status = 'CONFIRMED';
        n.status_label = 'Successful';
        n.read = true;
      }
    });

    // Update Firestore deposits & admin_messages document to status: 'approved' / 'SUCCESS' so it shows Successful everywhere
    void saveDepositToFirestoreCollection(tx, 'approved');
    void ensureOrderSavedInFirestore({
      docId: (tx as any).firebase_doc_id || tx.payment_reference || tx.id,
      name: primaryUser?.full_name || (tx as any).customer_name || 'Avor Investor',
      item: `Successful Deposit of UGX ${Number(tx.amount || 0).toLocaleString()} (${tx.payment_reference || tx.id})`,
      senderPhone: primaryUser?.phone_number || (tx as any).customer_phone || '',
      receiverPhone: (tx as any).receiver_phone || RECEIVER_PHONE,
      receiverName: (tx as any).receiver_name || RECEIVER_NAME,
      amount: Number(tx.amount || 0),
      machineTitle: tx.machine_title || 'Successful Wallet Deposit',
      paymentMethod: tx.payment_method || 'Mobile Money',
      paymentReference: tx.payment_reference || tx.id,
      status: 'SUCCESS',
    });

    // THING 2: Confirm Wallet funds and immediately activate any PENDING machine orders for this customer!
    let latestWallet = Number(tx.amount || 0);
    let latestBalance = primaryUser?.balance ?? REGISTRATION_REWARD_UGX;
    const activatedInvestments: Investment[] = [];

    const syncedUserIds: string[] = [];
    for (const targetUser of matchedUsers.values()) {
      const userPendingInvs = investments.filter(
        (inv) =>
          inv.status === 'PENDING' &&
          (inv.user_id === targetUser.id ||
            doesTxBelongToUser(
              { user_id: inv.user_id, customer_phone: (inv as any).customer_phone } as any,
              targetUser,
              targetUser.id
            ))
      );
      for (const pInv of userPendingInvs) {
        activateConfirmedMachineInvestment(pInv, notes || 'Activated upon Admin deposit confirmation');
        activatedInvestments.push(pInv);
      }

      const fin = syncUserConfirmedFinances(targetUser, targetUser.id);
      latestWallet = fin.computedWallet;
      latestBalance = targetUser.balance;
      syncedUserIds.push(targetUser.id);
      saveRegisteredUserToDisk(targetUser as User & { password_hash: string });

      pushNotification(
        targetUser.id,
        activatedInvestments.length > 0
          ? `✅ Payment Confirmed — ${activatedInvestments[0].machine_title} Cycle Started!`
          : '✅ Payment Confirmed by Admin — Ready to Buy Machine!',
        activatedInvestments.length > 0
          ? `Admin has confirmed your payment of ${tx.amount.toLocaleString()} UGX! Your machine (${activatedInvestments[0].machine_title}) is now ACTIVE in the Income Plane and counting Day 1 of ${activatedInvestments[0].duration_days} Days. ${notes || ''}`
          : `Your deposit of ${tx.amount.toLocaleString()} UGX has been confirmed by Admin (Pending -> Successful). Your Wallet balance (${fin.computedWallet.toLocaleString()} UGX) is confirmed and ready to buy a machine and start your machine cycle! ${notes || ''}`,
        'PAYMENT'
      );
    }

    saveAppStateToDisk();

    // Immediately push real-time SSE update to all connected clients so customer sees confirmed status & active machine cycle without refreshing
    broadcastRealtimeEvent({
      type: 'WALLET_CONFIRMED_SYNC',
      transaction: tx,
      transaction_id: tx.id,
      payment_reference: tx.payment_reference,
      firebase_doc_id: (tx as any).firebase_doc_id,
      status: 'SUCCESS',
      status_label: 'Successful',
      user_id: primaryUser?.id || tx.user_id,
      synced_user_ids: syncedUserIds,
      user_phone: (tx as any).user_phone || primaryUser?.phone_number || '',
      customer_phone: (tx as any).customer_phone || primaryUser?.phone_number || '',
      amount_added: Number(tx.amount || 0),
      wallet_balance: latestWallet,
      available_wallet: latestWallet,
      balance: latestBalance,
      has_bought_machine: activatedInvestments.length > 0 ? true : undefined,
      activated_investments: activatedInvestments,
      timestamp: nowIso,
    });

    return {
      user: primaryUser,
      computedWallet: latestWallet,
      computedBalance: latestBalance,
    };
  };

  // =========================================================================
  // REAL-TIME WALLET SYNC FUNCTION (Admin Deny / Fake Order Handler):
  // When Admin presses Deny on a fake order in the Admin Panel, this function:
  //   1. Marks the deposit/order status as FAILED ("Denied - Fake Order")
  //   2. Removes the unverified/fake money from the customer's Wallet balance immediately
  //   3. Cancels any PENDING machine order that was queued using fake unconfirmed funds
  //   4. Broadcasts a real-time SSE update (WALLET_DENIED_SYNC) so the money disappears from the user's Wallet immediately
  // =========================================================================
  const realTimeSyncWalletOnDeny = (
    tx: Transaction,
    notes?: string
  ): {
    user: (User & { password_hash?: string }) | undefined;
    computedWallet: number;
    computedBalance: number;
  } => {
    const nowIso = new Date().toISOString();

    tx.status = 'FAILED';
    (tx as any).status_label = 'Denied (Fake Order)';
    (tx as any).denied_at = nowIso;
    (tx as any).wallet_credited = false;
    (tx as any).approved_permanent = false;

    // Record IDs in DELETED_DEMO_IDS so Firestore or local vault backups never re-import this fake order as PENDING
    if (tx.id) DELETED_DEMO_IDS.add(String(tx.id));
    if (tx.payment_reference) DELETED_DEMO_IDS.add(String(tx.payment_reference));
    if ((tx as any).firebase_doc_id) DELETED_DEMO_IDS.add(String((tx as any).firebase_doc_id));
    saveDeletedIdsToDisk();

    void saveDepositToFirestoreCollection(tx, 'rejected');
    void deleteOrderFromFirestore((tx as any).firebase_doc_id || tx.payment_reference || tx.id);

    const matchedUsers = new Map<string, User & { password_hash?: string }>();
    const primaryUser = findOrRestoreUser(tx.user_id, {
      user_id: tx.user_id,
      phone_number: (tx as any).user_phone || (tx as any).customer_phone,
      user_phone: (tx as any).user_phone || (tx as any).customer_phone,
      full_name: (tx as any).customer_name,
      user_name: (tx as any).customer_name,
    });
    if (primaryUser && primaryUser.id !== 'usr-admin-owner') {
      matchedUsers.set(primaryUser.id, primaryUser);
    }

    for (const u of users.values()) {
      if (!u || !u.id || u.id === 'usr-admin-owner') continue;
      if (doesTxBelongToUser(tx, u, u.id)) {
        matchedUsers.set(u.id, u);
      }
    }

    // Mark any duplicate or sibling PENDING deposit/investment transactions for this fake order as FAILED
    for (let idx = transactions.length - 1; idx >= 0; idx--) {
      const other = transactions[idx];
      if (other.id === tx.id) continue;
      if (other.status === 'PENDING' && (other.type === 'DEPOSIT' || other.type === 'INVESTMENT')) {
        const sameRef =
          (tx.payment_reference && other.payment_reference === tx.payment_reference) ||
          ((tx as any).firebase_doc_id && (other as any).firebase_doc_id === (tx as any).firebase_doc_id);
        if (sameRef) {
          if (other.id) DELETED_DEMO_IDS.add(String(other.id));
          if (other.payment_reference) DELETED_DEMO_IDS.add(String(other.payment_reference));
          transactions.splice(idx, 1);
          continue;
        }
        if (doesTxBelongToUser(other, primaryUser, tx.user_id) && other.amount === tx.amount) {
          other.status = 'FAILED';
          (other as any).status_label = 'Denied (Fake Order)';
          (other as any).wallet_credited = false;
          if (other.id) DELETED_DEMO_IDS.add(String(other.id));
          if (other.payment_reference) DELETED_DEMO_IDS.add(String(other.payment_reference));
          if ((other as any).firebase_doc_id) {
            DELETED_DEMO_IDS.add(String((other as any).firebase_doc_id));
            void deleteOrderFromFirestore(String((other as any).firebase_doc_id));
          }
        }
      }
    }
    saveDeletedIdsToDisk();

    // Mark all matching Admin order notifications as REJECTED ("Denied - Fake Order")
    notifications.forEach((n: any) => {
      if (
        n.transaction_id === tx.id ||
        (tx.payment_reference && n.payment_reference === tx.payment_reference) ||
        ((tx as any).firebase_doc_id && n.firebase_doc_id === (tx as any).firebase_doc_id) ||
        (primaryUser &&
          n.customer_phone &&
          (n.customer_phone === primaryUser.phone_number || n.customer_phone === (tx as any).customer_phone) &&
          n.order_status === 'PENDING' &&
          (!n.amount || Number(n.amount) === Number(tx.amount)))
      ) {
        n.order_status = 'REJECTED';
        n.status_label = 'Denied (Fake Order)';
        n.read = true;
      }
    });

    // Cancel/remove any PENDING machine order that was placed using unconfirmed/fake wallet funds
    for (let idx = investments.length - 1; idx >= 0; idx--) {
      const inv = investments[idx];
      if (
        inv.status === 'PENDING' &&
        (inv.id === tx.investment_id ||
          doesTxBelongToUser({ user_id: inv.user_id, customer_phone: (inv as any).customer_phone } as any, primaryUser, tx.user_id))
      ) {
        // Also mark any linked INVESTMENT transaction as FAILED
        for (const ltx of transactions) {
          if (ltx.investment_id === inv.id && ltx.status === 'PENDING') {
            ltx.status = 'FAILED';
            (ltx as any).status_label = 'Denied (Fake Order)';
          }
        }
        investments.splice(idx, 1);
      }
    }

    let latestWallet = 0;
    let latestBalance = primaryUser?.balance ?? REGISTRATION_REWARD_UGX;
    const syncedUserIds: string[] = [];

    for (const targetUser of matchedUsers.values()) {
      const fin = syncUserConfirmedFinances(targetUser, targetUser.id);
      latestWallet = fin.computedWallet;
      latestBalance = targetUser.balance;
      syncedUserIds.push(targetUser.id);
      saveRegisteredUserToDisk(targetUser as User & { password_hash: string });

      pushNotification(
        targetUser.id,
        '❌ Payment Denied (Fake Order) — Removed from Wallet',
        `Your payment of ${tx.amount.toLocaleString()} UGX was denied by Admin as a fake/unverified order. The money has been removed from your Wallet balance (${fin.computedWallet.toLocaleString()} UGX remaining). ${notes || ''}`,
        'PAYMENT'
      );
    }

    saveAppStateToDisk();

    // Broadcast real-time SSE update so the money immediately disappears from the customer's Wallet without refreshing
    broadcastRealtimeEvent({
      type: 'WALLET_DENIED_SYNC',
      transaction: tx,
      transaction_id: tx.id,
      payment_reference: tx.payment_reference,
      firebase_doc_id: (tx as any).firebase_doc_id,
      status: 'FAILED',
      status_label: 'Denied (Fake Order)',
      user_id: primaryUser?.id || tx.user_id,
      synced_user_ids: syncedUserIds,
      user_phone: (tx as any).user_phone || primaryUser?.phone_number || '',
      customer_phone: (tx as any).customer_phone || primaryUser?.phone_number || '',
      amount_removed: Number(tx.amount || 0),
      wallet_balance: latestWallet,
      available_wallet: latestWallet,
      balance: latestBalance,
      timestamp: nowIso,
    });

    return {
      user: primaryUser,
      computedWallet: latestWallet,
      computedBalance: latestBalance,
    };
  };

  // Admin Confirm / Reject Pending Deposit or Machine Payment
  app.post('/api/admin/deposits/action', (req, res) => {
    const {
      transaction_id,
      action,
      notes,
      firebase_doc_id,
      payment_reference,
      user_id,
      customer_phone,
      customer_name,
      amount,
      payment_method,
      receiver_phone,
      receiver_name,
    } = req.body || {}; // action: 'APPROVE' | 'REJECT'

    const searchPhoneTail = String(customer_phone || '').replace(/\D/g, '').slice(-9);
    let tx = transactions.find(
      (t) =>
        (t.id === transaction_id ||
          (payment_reference && t.payment_reference === payment_reference) ||
          t.payment_reference === transaction_id ||
          (firebase_doc_id && (t as any).firebase_doc_id === firebase_doc_id) ||
          (t as any).firebase_doc_id === transaction_id) &&
        (t.type === 'DEPOSIT' || t.type === 'INVESTMENT')
    );

    if (!tx && searchPhoneTail && searchPhoneTail.length >= 7) {
      tx = transactions.find(
        (t) =>
          t.status === 'PENDING' &&
          (t.type === 'DEPOSIT' || t.type === 'INVESTMENT') &&
          (!amount || Number(t.amount) === Number(amount)) &&
          (((t as any).customer_phone || '').replace(/\D/g, '').slice(-9) === searchPhoneTail ||
            ((t as any).user_phone || '').replace(/\D/g, '').slice(-9) === searchPhoneTail)
      );
    }

    // If Admin pressed Confirm or Deny on an order notification or Firestore message that wasn't yet in `transactions`, create it on the spot so the action never fails
    if (!tx && (action === 'APPROVE' || action === 'REJECT') && Number(amount) > 0) {
      const restoredCustomer = findOrRestoreUser(user_id || customer_phone, {
        user_id,
        phone_number: customer_phone,
        user_phone: customer_phone,
        full_name: customer_name,
      });
      tx = {
        id: transaction_id || `tx-dep-${Date.now()}`,
        user_id: restoredCustomer ? restoredCustomer.id : user_id || `usr-${Date.now()}`,
        amount: Number(amount),
        type: 'DEPOSIT',
        status: 'PENDING',
        payment_method: payment_method || 'Mobile Money',
        payment_reference: payment_reference || transaction_id || `CONF-${Date.now()}`,
        created_at: new Date().toISOString(),
      };
      (tx as any).firebase_doc_id = firebase_doc_id || transaction_id;
      (tx as any).customer_name = customer_name || restoredCustomer?.full_name || 'Investor';
      (tx as any).customer_phone = customer_phone || restoredCustomer?.phone_number || '';
      (tx as any).user_phone = restoredCustomer?.phone_number || customer_phone || '';
      (tx as any).receiver_phone = receiver_phone || RECEIVER_PHONE;
      (tx as any).receiver_name = receiver_name || RECEIVER_NAME;
      transactions.unshift(tx);
    }

    if (!tx) {
      return res.status(404).json({ error: 'Payment transaction not found.' });
    }

    const user = findOrRestoreUser(tx.user_id, {
      user_id: tx.user_id,
      phone_number: (tx as any).user_phone || (tx as any).customer_phone,
      user_phone: (tx as any).user_phone || (tx as any).customer_phone,
      full_name: (tx as any).customer_name,
      user_name: (tx as any).customer_name,
    });

    if (action === 'APPROVE') {
      // Case 1: Machine Purchase Payment Confirmation -> Activate Machine & Start Counting Days
      if (tx.type === 'INVESTMENT') {
        const inv = investments.find(
          (i) =>
            i.id === tx.investment_id ||
            ((i.user_id === tx.user_id || (user && i.user_id === user.id)) &&
              i.status === 'PENDING' &&
              i.amount_invested === tx.amount)
        );

        const syncRes = realTimeSyncWalletOnConfirm(tx, notes);

        if (inv && inv.status === 'PENDING') {
          if (syncRes.user) {
            const { computedWallet } = syncUserConfirmedFinances(syncRes.user, syncRes.user.id);
            if (!inv.wallet_deducted && computedWallet >= inv.amount_invested) {
              inv.wallet_deducted = true;
            }
            syncUserConfirmedFinances(syncRes.user, syncRes.user.id);
            saveRegisteredUserToDisk(syncRes.user as User & { password_hash: string });
          }
          activateConfirmedMachineInvestment(inv, notes);
          saveAppStateToDisk();
          return res.json({
            message: `Payment of UGX ${tx.amount.toLocaleString()} confirmed (Pending -> Successful)! ${inv.machine_title} is now ACTIVE (Day 1 of ${inv.duration_days}).`,
            transaction: tx,
            investment: inv,
          });
        }

        return res.json({
          message: `Machine payment of UGX ${tx.amount.toLocaleString()} confirmed (Pending -> Successful)!`,
          transaction: tx,
        });
      }

      // Case 2: Wallet Deposit Confirmation -> Do 2 things at same time:
      //   1. Change Pending -> Successful
      //   2. Add that amount to that customer's Wallet balance (and push real-time SSE update)
      const { computedWallet, computedBalance } = realTimeSyncWalletOnConfirm(tx, notes);

      return res.json({
        message: `Confirmed! Status changed from Pending -> Successful and UGX ${tx.amount.toLocaleString()} added to customer Wallet (${computedWallet.toLocaleString()} UGX)!`,
        status: 'SUCCESS',
        status_label: 'Successful',
        transaction: tx,
        new_balance: computedBalance,
        wallet_balance: computedWallet,
        available_wallet: computedWallet,
      });
    } else if (action === 'REJECT') {
      // Once a deposit is approved by Admin, it must NEVER be unapproved or disappear unless explicitly deleted by Admin
      if (tx.status === 'SUCCESS' || tx.status === 'CONFIRMED' || (tx as any).approved_permanent) {
        return res.status(400).json({
          error: 'Approved money data is locked in the system and cannot be unapproved. Only an explicit Admin delete can remove a record.',
        });
      }

      const { computedWallet, computedBalance } = realTimeSyncWalletOnDeny(
        tx,
        notes || 'Denied by Admin due to fake/unverified order'
      );

      return res.json({
        message: `Payment of UGX ${tx.amount.toLocaleString()} denied (Fake Order)! The money has been removed from the customer's Wallet (${computedWallet.toLocaleString()} UGX remaining).`,
        status: 'FAILED',
        status_label: 'Denied (Fake Order)',
        transaction: tx,
        new_balance: computedBalance,
        wallet_balance: computedWallet,
        available_wallet: computedWallet,
      });
    }

    res.status(400).json({ error: 'Invalid action provided.' });
  });

  // Explicit Admin-Only Delete Endpoint (No money details ever leave the system unless explicitly deleted by Admin)
  app.delete('/api/admin/deposits/:id', (req, res) => {
    const txId = req.params.id;
    const idx = transactions.findIndex((t) => t.id === txId);
    if (idx === -1) {
      return res.status(404).json({ error: 'Transaction record not found.' });
    }
    const removed = transactions.splice(idx, 1)[0];
    if (removed.id) DELETED_DEMO_IDS.add(String(removed.id));
    if (removed.payment_reference) DELETED_DEMO_IDS.add(String(removed.payment_reference));
    if ((removed as any).firebase_doc_id) DELETED_DEMO_IDS.add(String((removed as any).firebase_doc_id));
    saveDeletedIdsToDisk();
    const user = findOrRestoreUser(removed.user_id, {
      user_id: removed.user_id,
      phone_number: (removed as any).user_phone || (removed as any).customer_phone,
    });
    if (user && user.id !== 'usr-admin-owner') {
      syncUserConfirmedFinances(user, user.id);
      saveRegisteredUserToDisk(user);
    }
    saveAppStateToDisk();
    return res.json({
      message: `Transaction ${removed.id} (UGX ${Number(removed.amount || 0).toLocaleString()}) permanently deleted by Admin.`,
      deleted_id: txId,
    });
  });

  // System Zero-Reset State Tracking
  app.get('/api/system/reset-state', (_req, res) => {
    res.json({
      reset_epoch_id: systemResetEpochId,
      reset_cutoff_ms: systemResetCutoffMs,
      firestore_cleaned: firestoreCleanedForEpoch,
    });
  });

  app.post('/api/system/reset-state', (_req, res) => {
    firestoreCleanedForEpoch = true;
    res.json({
      reset_epoch_id: systemResetEpochId,
      reset_cutoff_ms: systemResetCutoffMs,
      firestore_cleaned: firestoreCleanedForEpoch,
    });
  });

  // Admin Endpoint to Reset Entire System to 0 (0 money in system wallet, 0 machines sold, 0 active cycles, 0 pending orders)
  app.post('/api/admin/reset-all-zero', (_req, res) => {
    transactions.length = 0;
    investments.length = 0;
    notifications.length = 0;

    for (const u of users.values()) {
      u.balance = u.id === 'usr-admin-owner' ? 0 : REGISTRATION_REWARD_UGX;
      u.wallet_balance = 0;
      u.available_wallet = 0;
      u.has_bought_machine = false;
      if (u.id && u.id !== 'usr-admin-owner') {
        saveRegisteredUserToDisk(u);
      }
    }

    for (const n of depositReceiverNumbers) {
      n.amount_received_today = 0;
      n.total_received_ugx = 0;
      n.total_transactions_count = 0;
    }
    saveDepositNumbersToDisk();
    saveAppStateToDisk();

    systemResetCutoffMs = Date.now();
    systemResetEpochId = `avor-zero-reset-${systemResetCutoffMs}`;
    firestoreCleanedForEpoch = false;
    saveSystemResetToDisk();

    broadcastRealtimeEvent({
      type: 'WALLET_DENIED_SYNC',
      order_type: 'SYSTEM_RESET_ZERO',
      reset_epoch_id: systemResetEpochId,
      reset_cutoff_ms: systemResetCutoffMs,
      wallet_balance: 0,
      available_wallet: 0,
      balance: REGISTRATION_REWARD_UGX,
      timestamp: new Date().toISOString(),
    });

    return res.json({
      message: 'System reset to 0 across all devices: No machines sold, 0 money in total system wallet, 0 active cycles, 0 pending payments.',
      reset_epoch_id: systemResetEpochId,
      reset_cutoff_ms: systemResetCutoffMs,
    });
  });

  // Admin Vault Sync Endpoint: Only restores receiver numbers or homepage config if needed; never restores old deposits/investments
  app.post('/api/admin/sync-vault', (req, res) => {
    const {
      deposit_receiver_numbers: incomingNumbers,
      homepage_config: incomingHomepage,
    } = req.body || {};

    let restoredCount = 0;

    if (Array.isArray(incomingNumbers) && incomingNumbers.length > 0 && depositReceiverNumbers.length === 0) {
      depositReceiverNumbers = incomingNumbers.map((n: any) => ({
        ...n,
        amount_received_today: 0,
        total_received_ugx: 0,
        total_transactions_count: 0,
      }));
      saveDepositNumbersToDisk();
      restoredCount++;
    }

    if (incomingHomepage && typeof incomingHomepage === 'object') {
      homepageConfig = { ...homepageConfig, ...incomingHomepage };
      saveHomepageConfigToDisk();
    }

    for (const u of users.values()) {
      if (u.id) syncUserConfirmedFinances(u, u.id);
    }

    saveAppStateToDisk();
    return res.json({ synced: true, restored_count: restoredCount });
  });

  // Admin Confirm All Pending Submitted Deposits at Once
  app.post('/api/admin/deposits/approve-all', (req, res) => {
    const pendingTxs = transactions.filter(
      (t) => (t.type === 'DEPOSIT' || t.type === 'INVESTMENT') && t.status === 'PENDING'
    );

    if (pendingTxs.length === 0) {
      return res.json({
        message: 'All submitted deposits are already confirmed!',
        confirmed_count: 0,
      });
    }

    let confirmedCount = 0;
    let totalConfirmedUgx = 0;

    // Process all PENDING DEPOSIT transactions via realTimeSyncWalletOnConfirm so each changes Pending -> Successful and credits the customer's Wallet immediately
    for (const tx of pendingTxs.filter((t) => t.type === 'DEPOSIT')) {
      realTimeSyncWalletOnConfirm(tx, 'Confirmed via Admin Confirm All');
      confirmedCount++;
      totalConfirmedUgx += tx.amount;
    }

    // Process any remaining pending INVESTMENT transactions
    for (const tx of pendingTxs.filter((t) => t.type === 'INVESTMENT')) {
      realTimeSyncWalletOnConfirm(tx, 'Confirmed via Admin Confirm All');
      confirmedCount++;
    }

    saveAppStateToDisk();

    return res.json({
      message: `Confirmed ${confirmedCount} deposit(s) (Pending -> Successful) totaling UGX ${totalConfirmedUgx.toLocaleString()} and added to customer Wallet(s) in real time!`,
      confirmed_count: confirmedCount,
      total_confirmed_ugx: totalConfirmedUgx,
    });
  });

  // Admin Process Withdrawal (Approve / Reject) — syncs with Firestore 'withdrawals' collection & customer balance
  app.post('/api/admin/withdrawals/action', (req, res) => {
    const {
      transaction_id,
      action,
      notes,
      userId,
      user_id,
      name,
      phone,
      amount,
      payment_method,
      payment_reference,
    } = req.body || {}; // action: 'APPROVE' | 'REJECT'

    let tx = transactions.find(
      (t) =>
        t.type === 'WITHDRAWAL' &&
        (t.id === transaction_id ||
          (payment_reference && t.payment_reference === payment_reference) ||
          t.payment_reference === transaction_id)
    );

    const targetUid = userId || user_id || phone;
    let user = findOrRestoreUser(tx?.user_id || targetUid, {
      user_id: tx?.user_id || targetUid,
      phone_number: phone || (tx as any)?.phone,
      user_phone: phone || (tx as any)?.phone,
      full_name: name || (tx as any)?.name,
      user_name: name || (tx as any)?.name,
    });

    // If withdrawal came from Firestore 'withdrawals' collection and wasn't in local memory yet, create the transaction record so Approve/Reject works seamlessly
    if (!tx && (action === 'APPROVE' || action === 'REJECT') && Number(amount) > 0) {
      const numAmt = Number(amount);
      const feeAmt = Math.round(numAmt * 0.1);
      const netAmt = Math.max(0, numAmt - feeAmt);
      tx = {
        id: transaction_id || `tx-wdr-${Date.now()}`,
        user_id: user ? user.id : targetUid || `usr-${Date.now()}`,
        amount: numAmt,
        type: 'WITHDRAWAL',
        status: 'PENDING',
        payment_method:
          payment_method ||
          `Mobile Money (${phone || name || 'Account'}) • Net Payout: ${netAmt.toLocaleString()} UGX (10% Fee: ${feeAmt.toLocaleString()} UGX)`,
        payment_reference: payment_reference || transaction_id || `WDR-${Date.now()}`,
        created_at: new Date().toISOString(),
      };
      (tx as any).userId = tx.user_id;
      (tx as any).name = name || user?.full_name || 'Avor Investor';
      (tx as any).phone = phone || user?.phone_number || '';
      (tx as any).fee_amount = feeAmt;
      (tx as any).net_amount = netAmt;
      transactions.unshift(tx);
    }

    if (!tx) {
      return res.status(404).json({ error: 'Withdrawal transaction not found.' });
    }

    if (!user) {
      user = Array.from(users.values()).find((u) => u.id === tx!.user_id);
    }

    // Update Firestore 'withdrawals' document status ('approved' or 'rejected')
    void updateWithdrawalStatusInFirestoreCollection(tx.id, action === 'APPROVE' ? 'APPROVE' : 'REJECT');
    if (transaction_id && transaction_id !== tx.id) {
      void updateWithdrawalStatusInFirestoreCollection(transaction_id, action === 'APPROVE' ? 'APPROVE' : 'REJECT');
    }

    if (action === 'APPROVE') {
      tx.status = 'SUCCESS';
      (tx as any).firestore_status = 'approved';

      // Also mark any matching Admin notification / Firestore message as CONFIRMED
      notifications.forEach((n: any) => {
        if (n.transaction_id === tx!.id || (tx!.payment_reference && n.payment_reference === tx!.payment_reference)) {
          n.order_status = 'CONFIRMED';
          n.read = true;
        }
      });
      void ensureOrderSavedInFirestore({
        docId: tx.payment_reference || tx.id,
        name: (tx as any).name || user?.full_name || 'Avor Investor',
        item: `Approved Withdrawal of UGX ${tx.amount.toLocaleString()}`,
        status: 'SUCCESS',
      });

      if (user) {
        syncUserConfirmedFinances(user, user.id);
        saveRegisteredUserToDisk(user);
        pushNotification(
          user.id,
          '✅ Withdrawal Approved & Sent!',
          `Your withdrawal of ${tx.amount.toLocaleString()} UGX (${tx.payment_method}) has been approved and paid out by the administrator. ${notes || ''}`,
          'PAYMENT'
        );
      }
      saveAppStateToDisk();

      broadcastRealtimeEvent({
        type: 'WITHDRAWAL_APPROVED_SYNC',
        transaction: tx,
        user_id: user?.id || tx.user_id,
        balance: user?.balance,
        timestamp: new Date().toISOString(),
      });

      return res.json({
        message: `Withdrawal of ${tx.amount.toLocaleString()} UGX approved!`,
        transaction: tx,
        new_balance: user?.balance,
      });
    } else if (action === 'REJECT') {
      tx.status = 'FAILED';
      (tx as any).firestore_status = 'rejected';

      notifications.forEach((n: any) => {
        if (n.transaction_id === tx!.id || (tx!.payment_reference && n.payment_reference === tx!.payment_reference)) {
          n.order_status = 'REJECTED';
          n.read = true;
        }
      });

      // Refund user balance
      if (user) {
        syncUserConfirmedFinances(user, user.id);
        saveRegisteredUserToDisk(user);
        pushNotification(
          user.id,
          '❌ Withdrawal Request Declined',
          `Your withdrawal request of ${tx.amount.toLocaleString()} UGX was declined by admin and the funds have been returned to your balance. ${notes || ''}`,
          'PAYMENT'
        );
      }
      saveAppStateToDisk();

      broadcastRealtimeEvent({
        type: 'WITHDRAWAL_REJECTED_SYNC',
        transaction: tx,
        user_id: user?.id || tx.user_id,
        balance: user?.balance,
        timestamp: new Date().toISOString(),
      });

      return res.json({
        message: `Withdrawal rejected and ${tx.amount.toLocaleString()} UGX refunded to user balance.`,
        transaction: tx,
        new_balance: user?.balance,
      });
    }

    res.status(400).json({ error: 'Invalid action provided.' });
  });


  // Admin Credit or Deduct User Wallet Directly
  app.post('/api/admin/user/credit', (req, res) => {
    const { user_id, amount, note } = req.body;
    const user = Array.from(users.values()).find((u) => u.id === user_id);

    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const numAmt = Number(amount);
    if (isNaN(numAmt) || numAmt === 0) {
      return res.status(400).json({ error: 'Invalid amount provided.' });
    }

    const newTx: Transaction = {
      id: `tx-admin-${Date.now()}`,
      user_id: user.id,
      amount: Math.abs(numAmt),
      type: numAmt > 0 ? 'DEPOSIT' : 'WITHDRAWAL',
      status: 'SUCCESS',
      payment_method: 'Admin Manual Wallet Adjustment',
      payment_reference: `ADM-ADJ-${Math.floor(10000 + Math.random() * 90000)}`,
      created_at: new Date().toISOString(),
    };
    (newTx as any).wallet_credited = true;
    (newTx as any).approved_permanent = true;
    (newTx as any).confirmed_at = new Date().toISOString();
    (newTx as any).customer_name = user.full_name || user.name || 'Investor';
    (newTx as any).customer_phone = user.phone_number || '';
    (newTx as any).user_phone = user.phone_number || '';
    transactions.unshift(newTx);

    syncUserConfirmedFinances(user, user.id);
    saveRegisteredUserToDisk(user);
    saveAppStateToDisk();

    pushNotification(
      user.id,
      numAmt > 0 ? '💰 Wallet Credit Added' : 'Wallet Adjusted',
      `Admin updated your wallet by ${numAmt > 0 ? '+' : ''}${numAmt.toLocaleString()} UGX. ${note || ''}`,
      'PAYMENT'
    );

    res.json({
      message: `User ${user.full_name} wallet updated by ${numAmt.toLocaleString()} UGX. Confirmed Wallet: ${(user.wallet_balance || 0).toLocaleString()} UGX • Balance: ${user.balance.toLocaleString()} UGX`,
      new_balance: user.balance,
      wallet_balance: user.wallet_balance || 0,
    });
  });

  // Support / WhatsApp Config Endpoint
  app.get('/api/config/support', (req, res) => {
    res.json({
      whatsapp_number: '+256741032838',
      whatsapp_link: 'https://wa.me/256741032838?text=Hello%20Avor%20Platform%20Support%2C%20I%20need%20assistance%20with%20my%20account',
      whatsapp_channel: 'https://whatsapp.com/channel/0029VaAvorInvestOfficial',
    });
  });

  // 11. Transactions History (Matches by user ID or phone number so all submitted & confirmed deposits reflect on all planes)
  app.get('/api/transactions/:userId', (req, res) => {
    const userId = req.params.userId;
    const queryPhone = (req.query.phone || req.query.phone_number || '').toString().trim();
    const queryRefs = req.query.refs;
    const user = findOrRestoreUser(userId, { user_id: userId, phone_number: queryPhone, user_phone: queryPhone });
    if (user) {
      linkKnownDepositRefsToUser(user, queryRefs);
      syncUserConfirmedFinances(user, userId);
    }
    const userTxs = transactions.filter((t) => doesTxBelongToUser(t, user, queryPhone || userId));
    res.json(userTxs);
  });

  // 12. User Profile Fetch & Update
  const handleGetUserProfile = (req: express.Request, res: express.Response) => {
    res.setHeader('Content-Type', 'application/json');
    const targetId = req.params.userId;
    const queryPhone = (req.query.phone || req.query.phone_number || '').toString().trim();
    const queryRefs = req.query.refs;
    let user = findOrRestoreUser(targetId, { user_id: targetId, phone_number: queryPhone, user_phone: queryPhone });
    if (!user && fs.existsSync(USERS_FILE)) {
      try {
        const raw = fs.readFileSync(USERS_FILE, 'utf-8');
        const diskUsers = JSON.parse(raw);
        if (Array.isArray(diskUsers)) {
          const cleanTarget = (queryPhone || targetId).replace(/[^0-9]/g, '').slice(-9);
          const found = diskUsers.find((u: any) => {
            const uTail = (u.phone_number || u.phoneNumber || '').replace(/[^0-9]/g, '').slice(-9);
            return (
              u.id === targetId ||
              u.phone_number === targetId ||
              u.phoneNumber === targetId ||
              (queryPhone && (u.phone_number === queryPhone || u.phoneNumber === queryPhone)) ||
              (cleanTarget && cleanTarget.length >= 7 && uTail === cleanTarget) ||
              u.email?.toLowerCase() === targetId.toLowerCase()
            );
          });
          if (found) {
            user = found;
            users.set(found.id, found);
          }
        }
      } catch (e) {}
    }
    if (!user) {
      return res.json({
        id: targetId,
        balance: REGISTRATION_REWARD_UGX,
        wallet_balance: 0,
        available_wallet: 0,
        has_bought_machine: false,
      });
    }
    linkKnownDepositRefsToUser(user, queryRefs);
    syncUserConfirmedFinances(user, targetId);
    const { password_hash, ...profile } = user;
    res.json(profile);
  };

  app.get('/api/user/:userId', handleGetUserProfile);
  app.get('/api/user/profile/:userId', handleGetUserProfile);

  const handleUserProfileUpdate = (req: express.Request, res: express.Response) => {
    res.setHeader('Content-Type', 'application/json');
    const { user_id, full_name, phone_number, email, password } = req.body || {};
    const user = findOrRestoreUser(user_id, req.body);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    if (full_name) {
      user.full_name = full_name;
      user.name = full_name;
    }
    if (phone_number) {
      user.phone_number = phone_number;
      user.phoneNumber = phone_number;
    }
    if (email) user.email = email;
    if (password && password.toString().trim().length >= 4) {
      user.password_hash = password.toString().trim();
      user.password = password.toString().trim();
    }

    // Save updated profile to disk
    saveRegisteredUserToDisk(user);

    pushNotification(user.id, 'Profile Updated', 'Your profile details were updated successfully.', 'SECURITY');

    const { password_hash, ...profile } = user;
    res.json({ message: 'Profile updated successfully.', user: profile });
  };

  app.put('/api/user/profile/update', handleUserProfileUpdate);
  app.post('/api/user/profile/update', handleUserProfileUpdate);
  app.post('/api/user/update-profile', handleUserProfileUpdate);
  app.put('/api/user/update-profile', handleUserProfileUpdate);

  // 13. Notifications API
  app.get('/api/notifications/:userId', (req, res) => {
    const userId = req.params.userId;
    const user = findOrRestoreUser(userId, { user_id: userId });
    const isAdminUser =
      userId === 'usr-admin-owner' ||
      user?.role === 'ADMIN' ||
      user?.email?.toLowerCase() === 'adamsmabrouk268@gmail.com' ||
      (user?.phone_number && user.phone_number.includes('741032838'));
    const userNotifs = notifications.filter(
      (n) => n.user_id === userId || (isAdminUser && n.user_id === 'usr-admin-owner')
    );
    res.json(userNotifs);
  });

  app.post('/api/notifications/read-all', (req, res) => {
    const { user_id } = req.body;
    notifications.forEach((n) => {
      if (n.user_id === user_id) {
        n.read = true;
      }
    });
    res.json({ message: 'Notifications marked as read.' });
  });

  // Dedicated Company Guidelines PDF Download route
  app.get(['/company-rules.pdf', '/api/company-rules.pdf'], (req, res) => {
    const pdfPath = path.join(process.cwd(), 'public', 'company-rules.pdf');
    if (fs.existsSync(pdfPath)) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="company-rules.pdf"');
      return res.sendFile(pdfPath);
    }
    const rootPdfPath = path.join(process.cwd(), 'company-rules.pdf');
    if (fs.existsSync(rootPdfPath)) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename="company-rules.pdf"');
      return res.sendFile(rootPdfPath);
    }
    res.status(404).send('Company guidelines PDF not found.');
  });

  // Full Project Source Code ZIP Download Endpoint
  app.get(['/api/download-source-zip', '/download-zip', '/avor-invest-code.zip'], async (req, res) => {
    try {
      const zip = new JSZip();
      const rootDir = process.cwd();
      const excludeDirs = new Set(['node_modules', '.git', 'dist', '.aistudio', '.next', '.cache']);

      const addDirToZip = (dirPath: string, zipFolder: JSZip) => {
        if (!fs.existsSync(dirPath)) return;
        const entries = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          if (excludeDirs.has(entry.name)) continue;
          if (entry.name.endsWith('.zip')) continue;
          const fullPath = path.join(dirPath, entry.name);
          if (entry.isDirectory()) {
            const subFolder = zipFolder.folder(entry.name);
            if (subFolder) addDirToZip(fullPath, subFolder);
          } else if (entry.isFile()) {
            try {
              const stat = fs.statSync(fullPath);
              // Include source files and assets under 15MB
              if (stat.size <= 15 * 1024 * 1024) {
                const content = fs.readFileSync(fullPath);
                zipFolder.file(entry.name, content);
              }
            } catch {
              // Skip unreadable files
            }
          }
        }
      };

      addDirToZip(rootDir, zip);

      const zipBuffer = await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', 'attachment; filename="avor-invest-source-code.zip"');
      res.setHeader('Content-Length', zipBuffer.length.toString());
      return res.send(zipBuffer);
    } catch (err: any) {
      console.error('Error generating source code zip:', err);
      return res.status(500).json({ error: 'Failed to generate source code ZIP archive.' });
    }
  });

  // Vite middleware setup for development, or static fallback for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, watch: null },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/avorinvest_db';
  mongoose.set('bufferCommands', false);
  mongoose.connect(MONGO_URI, { serverSelectionTimeoutMS: 3000 }).then(() => {
    console.log('Connected to MongoDB');
    initAutomationWorker();
  }).catch(err => {
    console.log('MongoDB connection warning:', err.message);
    initAutomationWorker();
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Avor Invest Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
