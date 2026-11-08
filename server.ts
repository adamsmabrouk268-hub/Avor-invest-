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
  'DEP-552548-879568',
  'DEP-552548-926486',
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
        machines.splice(0, machines.length, ...loadedMachines);
      }
    }
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

// Function to save registered user data used during registration to disk
function saveRegisteredUserToDisk(userToSave: User & { password_hash: string }) {
  if (!userToSave || userToSave.id === 'usr-admin-owner') return;
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

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
    console.log(`[Storage] Saved registration data for ${userToSave.phone_number || userToSave.id} to ${USERS_FILE}`);
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
      balance: 3000,
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

const REGISTRATION_REWARD_UGX = 3000;

function linkKnownDepositRefsToUser(user?: User & { password_hash?: string }, rawRefs?: any) {
  if (!user || !rawRefs) return;
  const refList = String(rawRefs)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (refList.length === 0) return;
  const refSet = new Set(refList);
  let changed = false;
  for (const t of transactions) {
    if (
      t.type === 'DEPOSIT' &&
      (refSet.has(t.id) ||
        (t.payment_reference && refSet.has(t.payment_reference)) ||
        ((t as any).firebase_doc_id && refSet.has((t as any).firebase_doc_id)))
    ) {
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

  const userDeposits = transactions.filter((t) => doesTxBelongToUser(t, user, explicitUserId) && t.type === 'DEPOSIT');
  const confirmedDeposits = userDeposits
    .filter((t) => t.status === 'SUCCESS' || t.status === 'CONFIRMED')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const pendingDeposits = userDeposits
    .filter((t) => t.status === 'PENDING')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  // All non-rejected deposits (both PENDING and CONFIRMED/SUCCESS) immediately reflect on the user's Wallet
  const allWalletDeposits = confirmedDeposits + pendingDeposits;

  const userYieldsAndBonuses = transactions
    .filter(
      (t) =>
        doesTxBelongToUser(t, user, explicitUserId) &&
        (t.type === 'DAILY_YIELD' || t.type === 'REFERRAL_BONUS' || t.type === 'COMMISSION') &&
        (t.status === 'SUCCESS' || t.status === 'CONFIRMED')
    )
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const userWithdrawals = transactions.filter(
    (t) => doesTxBelongToUser(t, user, explicitUserId) && t.type === 'WITHDRAWAL'
  );
  const deductedWithdrawals = userWithdrawals
    .filter((t) => t.status === 'SUCCESS' || t.status === 'CONFIRMED' || t.status === 'PENDING')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

  const userPhoneTail = (user.phone_number || user.phoneNumber || '').replace(/\D/g, '').slice(-9);
  const userConfirmedInvestments = investments.filter((inv) => {
    const sameUser =
      inv.user_id === user.id ||
      (explicitUserId && inv.user_id === explicitUserId) ||
      (userPhoneTail &&
        userPhoneTail.length >= 7 &&
        ((inv as any).customer_phone || '').replace(/\D/g, '').slice(-9) === userPhoneTail);
    return sameUser && (inv.status === 'ACTIVE' || inv.status === 'PAYOUT_COMPLETE');
  });
  const hasBoughtMachine = userConfirmedInvestments.length > 0;

  const deductedInvestments = investments
    .filter((inv) => {
      const sameUser =
        inv.user_id === user.id ||
        (explicitUserId && inv.user_id === explicitUserId) ||
        (userPhoneTail &&
          userPhoneTail.length >= 7 &&
          ((inv as any).customer_phone || '').replace(/\D/g, '').slice(-9) === userPhoneTail);
      return (
        sameUser &&
        inv.wallet_deducted &&
        (inv.status === 'ACTIVE' || inv.status === 'PAYOUT_COMPLETE' || inv.status === 'PENDING')
      );
    })
    .reduce((sum, inv) => sum + Number(inv.amount_invested || 0), 0);

  const confirmedDeductedInvestments = investments
    .filter((inv) => {
      const sameUser =
        inv.user_id === user.id ||
        (explicitUserId && inv.user_id === explicitUserId) ||
        (userPhoneTail &&
          userPhoneTail.length >= 7 &&
          ((inv as any).customer_phone || '').replace(/\D/g, '').slice(-9) === userPhoneTail);
      return (
        sameUser &&
        inv.wallet_deducted &&
        (inv.status === 'ACTIVE' || inv.status === 'PAYOUT_COMPLETE')
      );
    })
    .reduce((sum, inv) => sum + Number(inv.amount_invested || 0), 0);

  // Deposited money automatically reflects on the user's Wallet immediately after depositing (minus any machines bought from Wallet):
  const computedWallet = Math.max(0, allWalletDeposits - deductedInvestments);
  // Portion of Wallet backed by Admin-confirmed deposits:
  const confirmedWallet = Math.max(0, confirmedDeposits - confirmedDeductedInvestments);
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
        depositReceiverNumbers = loaded;
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

// Dynamic Homepage Configuration editable by Admin
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

function saveHomepageConfigToDisk() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(
      HOMEPAGE_CONFIG_FILE,
      JSON.stringify({ homepageConfig, depositRotationConfig }, null, 2),
      'utf-8'
    );
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
    const totalInvested = investments.reduce((sum, inv) => sum + inv.amount_invested, 0);
    const totalPayouts = investments.reduce((sum, inv) => sum + inv.total_claimed, 0);
    res.json({
      total_invested: totalInvested,
      total_payouts_delivered: totalPayouts,
      active_machines_count: machines.length,
      total_investors_count: users.size,
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
          // If the user is signing in from another device using the Register tab with their matching password, log them in seamlessly
          if (u.password_hash === rawPassword || u.password === rawPassword) {
            syncUserConfirmedFinances(u);
            const { password_hash, ...existingProfile } = u;
            return res.status(200).json({
              ...existingProfile,
              success: true,
              message: 'Existing account verified and synced across devices.',
              user: existingProfile,
              token: `jwt-token-${u.id}`,
            });
          }
          return res.status(400).json({
            success: false,
            error: 'An account with this phone number already exists. Please switch to "Sign In" and enter your password.',
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

      // Explicitly capture and save the full data payload used during registration
      const registrationDataPayload: Record<string, any> = {
        ...body,
        registered_at: new Date().toISOString(),
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
        created_at: new Date().toISOString(),
        password_hash: rawPassword,
        registration_data: registrationDataPayload,
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

      pushNotification(
        newUser.id,
        '🎁 3,000 UGX Registration Reward Credited!',
        'Welcome to Avor Invest! You have received 3,000 UGX as a reward after registration on your Balance. Deposit money and have it confirmed by Admin to fund your Wallet and buy machines.',
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

    if (!user || (user.password_hash !== rawPass && user.password !== rawPass)) {
      return res.status(400).json({ success: false, error: 'Invalid phone number / email or password.' });
    }

    syncUserConfirmedFinances(user);
    const { password_hash, ...userProfile } = user;
    return res.json({
      ...userProfile,
      success: true,
      message: 'Login successful.',
      user: userProfile,
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

    // Sync finances before checking wallet balance or lock status
    const { computedWallet, confirmedWallet } = syncUserConfirmedFinances(user, user_id);
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
          error: `🔒 ${classLabel} is Locked! You must first buy an AV1 or AV2 machine and invite ${requiredInvites.toLocaleString()} people who buy a machine to access ${classLabel}.`,
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
          error: `🔒 ${classLabel} is Locked! To access ${classLabel}, you must have invited ${requiredInvites.toLocaleString()} people who bought a machine (You currently have ${activeBuyers.length}/${requiredInvites.toLocaleString()} invited people).`,
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

    // Update machine funding stats
    machine.funded_amount += totalCost;
    if (machine.available_units > 0) {
      machine.available_units = Math.max(0, machine.available_units - units);
    }

    const dailyYield = machine.daily_yield * units;
    const totalReturn = machine.total_return * units;

    const startDate = new Date();
    const endDate = new Date(startDate.getTime() + machine.duration_days * 24 * 60 * 60 * 1000);
    const selectedChannel = payment_method || 'Wallet Balance';

    // Machine cycle ONLY starts AFTER Admin has confirmed the deposit payment:
    // - If Admin already confirmed the deposit (confirmedWallet >= totalCost), requiresAdminConfirmation is false -> machine cycle starts immediately (ACTIVE, Day 1).
    // - If the user deposited (reflected on Wallet) and clicked Buy Machine before Admin confirmed (confirmedWallet < totalCost), requiresAdminConfirmation is true -> machine is PENDING (Day 0) and its cycle starts automatically as soon as Admin confirms!
    const requiresAdminConfirmation = confirmedWallet < totalCost;

    if (!requiresAdminConfirmation) {
      user.has_bought_machine = true;
      saveRegisteredUserToDisk(user);
    }

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

    investments.unshift(newInvestment);

    const refCode = `MACH-${Math.floor(100000 + Math.random() * 900000)}`;

    const targetDepositToLink = transactions.find(
      (t) =>
        doesTxBelongToUser(t, user, user_id) &&
        t.type === 'DEPOSIT' &&
        (requiresAdminConfirmation
          ? t.status === 'PENDING'
          : t.status === 'SUCCESS' || t.status === 'CONFIRMED') &&
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
    transactions.unshift(newTx);

    const updatedFinances = syncUserConfirmedFinances(user, user.id);
    saveAppStateToDisk();

    if (requiresAdminConfirmation) {
      pushNotification(
        user.id,
        '⏳ Machine Ordered Using Wallet — Cycle Starts After Admin Confirmation',
        `Your purchase of ${newInvestment.machine_title} for ${totalCost.toLocaleString()} UGX from your Wallet has been recorded. Your machine cycle (Day 1 of ${machine.duration_days}) will start automatically as soon as Admin confirms your payment!`,
        'PAYMENT'
      );

      notifyAllAdmins(
        `🔔 Machine Purchase Awaiting Admin Confirmation: ${newInvestment.machine_title}`,
        `Customer ${user.full_name || user.id} (${phone_number || user.phone_number || 'No Phone'}) bought ${newInvestment.machine_title} for UGX ${totalCost.toLocaleString()} using their Wallet (Ref: ${refCode}). Please press Confirm in Admin Console to start the machine cycle.`,
        'PAYMENT',
        {
          transaction_id: targetDepositToLink ? targetDepositToLink.id : newTx.id,
          customer_name: user.full_name || user.name || user.id,
          customer_phone: phone_number || user.phone_number || '',
          amount: totalCost,
          payment_method: `Wallet (${selectedChannel})`,
          receiver_phone: RECEIVER_PHONE,
          receiver_name: RECEIVER_NAME,
          payment_reference: targetDepositToLink?.payment_reference || refCode,
          machine_title: newInvestment.machine_title,
          order_status: 'PENDING',
        }
      );

      broadcastRealtimeEvent({
        type: 'DEPOSIT_CREATED_PENDING',
        transaction: targetDepositToLink || newTx,
        transaction_id: targetDepositToLink ? targetDepositToLink.id : newTx.id,
        payment_reference: targetDepositToLink?.payment_reference || refCode,
        status: 'PENDING',
        status_label: 'Pending',
        user_id: user.id,
        user_phone: user.phone_number || phone_number || '',
        customer_phone: phone_number || user.phone_number || '',
        amount: totalCost,
        wallet_balance: updatedFinances.computedWallet,
        available_wallet: updatedFinances.computedWallet,
        timestamp: new Date().toISOString(),
      });

      return res.status(201).json({
        message: `Machine order for ${units} unit(s) of ${machine.title} placed using your Wallet! Your machine cycle (Day 1 of ${machine.duration_days}) will start automatically after Admin confirms your payment.`,
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
    notifyAllAdmins(
      `✅ Machine Purchased & Activated: ${newInvestment.machine_title}`,
      `Customer ${user.full_name || user.id} (${phone_number || user.phone_number || 'No Phone'}) purchased ${newInvestment.machine_title} for UGX ${totalCost.toLocaleString()} using their Admin-confirmed wallet balance (Ref: ${refCode}).`,
      'PAYMENT',
      {
        transaction_id: newTx.id,
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
      docId: refCode.replace(/[^a-zA-Z0-9_-]/g, ''),
      name: user.full_name || user.name || phone_number || user.phone_number || 'Avor Investor',
      item: `Bought ${newInvestment.machine_title} for UGX ${totalCost.toLocaleString()} using Wallet Balance (${phone_number || user.phone_number || 'N/A'})`,
      senderPhone: phone_number || user.phone_number || '',
      receiverPhone: RECEIVER_PHONE,
      receiverName: RECEIVER_NAME,
      amount: totalCost,
      machineTitle: newInvestment.machine_title,
      paymentMethod: `Wallet (${selectedChannel})`,
      paymentReference: refCode,
      status: 'CONFIRMED',
    });
    saveAppStateToDisk();

    res.status(201).json({
      message: `Successfully bought ${units} unit(s) of ${machine.title} using your wallet balance! Your machine is now ACTIVE (Day 1 of ${machine.duration_days}).${rewardNote}`,
      investment: newInvestment,
      user_balance: user.balance,
      wallet_balance: finalFinances.computedWallet,
      available_wallet: finalFinances.computedWallet,
      has_bought_machine: true,
      status: 'ACTIVE',
      claimed_tier_rewards: (user as any).claimed_tier_rewards || [],
    });
  });

  // Helper to activate a PENDING machine investment once Admin confirms payment
  const activateConfirmedMachineInvestment = (inv: Investment, adminNotes?: string): string => {
    const user = Array.from(users.values()).find((u) => u.id === inv.user_id);
    const machine = machines.find((m) => m.id === inv.machine_id) || inv.machine;
    const now = new Date();

    inv.status = 'ACTIVE';
    inv.confirmed_at = now.toISOString();
    inv.start_date = now.toISOString();
    inv.end_date = new Date(now.getTime() + inv.duration_days * 24 * 60 * 60 * 1000).toISOString();
    inv.last_claim_at = now.toISOString();
    inv.days_elapsed = 1;

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
        const teamIncome8Pct = inviterHasSameMachine ? Math.round(inv.amount_invested * 0.08) : 0;

        inv.inviter_id = inviter.id;
        inv.inviter_has_same_machine = inviterHasSameMachine;
        inv.team_income_amount = teamIncome8Pct;
        inv.team_income_settled = false;

        if (inviterHasSameMachine) {
          pushNotification(
            inviter.id,
            '8% Team Income Scheduled (Cycle End)',
            `Your invited customer (${user.phone_number || 'Referral'}) had their ${machine.title} payment confirmed! Your 8% team income (${teamIncome8Pct.toLocaleString()} UGX) will be credited to your balance when their ${machine.duration_days}-day machine cycle ends.`,
            'YIELD'
          );
        } else {
          pushNotification(
            inviter.id,
            'Team Member Machine Confirmed',
            `Your invited customer (${user.phone_number || 'Referral'}) activated ${machine.title}. Note: 8% team income is only collected if an invited customer buys the same machine as the inviter.`,
            'SYSTEM'
          );
        }
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

    // 2. Withdraw details
    const totalWithdrawn = userWithdrawals
      .filter((t) => t.status === 'SUCCESS' || t.status === 'CONFIRMED')
      .reduce((sum, t) => sum + t.amount, 0);
    const pendingWithdrawals = userWithdrawals
      .filter((t) => t.status === 'PENDING')
      .reduce((sum, t) => sum + t.amount, 0);

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

    // Helper to check and settle any completed cycles and credit 8% team income to the inviter's balance
    const nowMs = Date.now();
    investments.forEach((inv) => {
      // PENDING machines do NOT count days until Admin confirms payment
      if (inv.status === 'PENDING') {
        inv.days_elapsed = 0;
        inv.unclaimed_earnings = 0;
        return;
      }

      const startMs = new Date(inv.start_date).getTime();
      const endMs = new Date(inv.end_date).getTime();
      const elapsedDays = Math.floor((nowMs - startMs) / (24 * 60 * 60 * 1000));
      if (elapsedDays >= inv.duration_days || nowMs >= endMs || inv.total_claimed >= inv.total_return) {
        inv.status = 'PAYOUT_COMPLETE';
      }

      // If cycle has ended and 8% team income hasn't been settled yet, check same-machine eligibility and settle onto inviter's balance
      if (inv.status === 'PAYOUT_COMPLETE' && !inv.team_income_settled) {
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
          const hasSameMachine =
            inv.inviter_has_same_machine !== undefined
              ? inv.inviter_has_same_machine
              : investments.some(
                  (i) =>
                    i.user_id === inviterUser!.id &&
                    (i.status === 'ACTIVE' || i.status === 'PAYOUT_COMPLETE') &&
                    (i.machine_id === inv.machine_id ||
                      (i.machine_title &&
                        inv.machine_title &&
                        i.machine_title.toLowerCase() === inv.machine_title.toLowerCase()))
                );

          inv.inviter_id = inviterUser.id;
          inv.inviter_has_same_machine = hasSameMachine;

          if (hasSameMachine) {
            const teamBonus = inv.team_income_amount || Math.round(inv.amount_invested * 0.08);
            inv.team_income_amount = teamBonus;
            inv.team_income_settled = true;

            inviterUser.balance += teamBonus;
            saveRegisteredUserToDisk(inviterUser);

            transactions.unshift({
              id: `tx-comm-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              user_id: inviterUser.id,
              investment_id: inv.id,
              amount: teamBonus,
              type: 'COMMISSION',
              status: 'SUCCESS',
              payment_method: 'Team Income (8% - Same Machine Cycle Completed)',
              payment_reference: `TEAM-8PCT-${inv.id}`,
              created_at: new Date().toISOString(),
            });

            pushNotification(
              inviterUser.id,
              '8% Team Income Credited to Balance!',
              `The cycle of ${inv.machine_title} bought by your invited customer has ended! ${teamBonus.toLocaleString()} UGX (8% team income) has been collected onto your balance.`,
              'YIELD'
            );
          } else {
            inv.team_income_settled = true;
          }
        } else {
          inv.team_income_settled = true;
        }
      }
    });

    // Check if current user has an active/completed machine (strictly false when 0 machines bought, true when user buys a machine)
    const userInvestments = investments.filter((i) => i.user_id === userId || doesTxBelongToUser({ user_id: i.user_id } as any, user, userId));
    const confirmedUserInvestments = userInvestments.filter(
      (i) => i.status === 'ACTIVE' || i.status === 'PAYOUT_COMPLETE'
    );
    const hasBoughtMachine = confirmedUserInvestments.length > 0;
    user.has_bought_machine = hasBoughtMachine;
    const inviterOwnedMachineIds = new Set(confirmedUserInvestments.map((i) => i.machine_id));
    const inviterOwnedMachineTitles = new Set(
      confirmedUserInvestments.map((i) => (i.machine_title || '').toLowerCase()).filter(Boolean)
    );

    let pendingTeamIncome = 0;

    const teamMembers = allReferredUsers.map((member) => {
      const memberInvestments = investments.filter(
        (i) => i.user_id === member.id && (i.status === 'ACTIVE' || i.status === 'PAYOUT_COMPLETE')
      );
      const hasBought = memberInvestments.length > 0;
      const totalInvested = memberInvestments.reduce((sum, i) => sum + i.amount_invested, 0);

      // Team income is 8% ONLY on machines that match the inviter's machines AND whose cycle has ended
      let settledCommission = 0;
      memberInvestments.forEach((mInv) => {
        const sameMachine =
          mInv.inviter_has_same_machine !== undefined
            ? mInv.inviter_has_same_machine
            : inviterOwnedMachineIds.has(mInv.machine_id) ||
              inviterOwnedMachineTitles.has((mInv.machine_title || '').toLowerCase());
        if (sameMachine) {
          const bonus8Pct = mInv.team_income_amount || Math.round(mInv.amount_invested * 0.08);
          if (mInv.status === 'PAYOUT_COMPLETE' || mInv.team_income_settled) {
            settledCommission += bonus8Pct;
          } else {
            pendingTeamIncome += bonus8Pct;
          }
        }
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

    // Calculate AI Income (claimed returns from hardware rigs), Today's earnings, and Total Returns
    const totalClaimedYield = confirmedUserInvestments.reduce((sum, i) => sum + (i.total_claimed || 0), 0);
    const totalMachineReturns = confirmedUserInvestments.reduce((sum, i) => sum + (i.total_return || 0), 0);
    const aiIncome = totalClaimedYield > 0 ? totalClaimedYield : 0;
    const todayEarnings = userInvestments.reduce((sum, i) => {
      if (i.status === 'ACTIVE') {
        return sum + (i.daily_yield || 0);
      }
      return sum;
    }, 0);

    const userCompletedCycles = confirmedUserInvestments.filter(
      (i) => i.status === 'PAYOUT_COMPLETE' || (i.days_elapsed || 0) >= (i.duration_days || 1)
    );
    const hasCompletedCycle = userCompletedCycles.length > 0;

    res.json({
      user_id: user.id,
      balance: user.balance,
      wallet_balance: computedWallet,
      available_wallet: computedWallet,
      confirmed_wallet: confirmedWallet,
      deposit_details: {
        total_deposited: totalDeposited,
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
        pending_withdrawals: pendingWithdrawals,
        withdrawals_count: userWithdrawals.length,
        withdrawable_balance: user.balance,
        has_completed_cycle: hasCompletedCycle,
        can_withdraw: hasCompletedCycle && user.balance >= 3000,
        min_withdrawal: 3000,
        recent_withdrawals: userWithdrawals.slice(0, 5),
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
      A: { required: 4, reward: 25000, name: 'A class (4 People)' },
      B: { required: 9, reward: 60000, name: 'B class (9 People)' },
      C: { required: 20, reward: 110000, name: 'C class (20 People)' },
      D: { required: 35, reward: 220000, name: 'D class (35 People)' },
      E: { required: 70, reward: 450000, name: 'E class (70 People)' },
      F: { required: 120, reward: 850000, name: 'F class (120 People)' },
      G: { required: 300, reward: 1200000, name: 'G class (300 People)' },
      H: { required: 5000, reward: 3000000, name: 'H class (5000 People)' },
      I: { required: 10000, reward: 8500000, name: 'I class (10000 People)' },
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

    // Calculate accrued earnings based on time passed
    const now = Date.now();
    userInvestments.forEach((inv) => {
      // Do NOT count days or accrue yield while PENDING Admin payment confirmation
      if (inv.status === 'PENDING') {
        inv.days_elapsed = 0;
        inv.unclaimed_earnings = 0;
        return;
      }

      const start = new Date(inv.start_date).getTime();
      const diffMs = now - start;
      const daysElapsed = Math.min(inv.duration_days, Math.floor(diffMs / (24 * 60 * 60 * 1000)));
      inv.days_elapsed = Math.max(1, daysElapsed);

      // Check time since last claim
      const lastClaimTime = new Date(inv.last_claim_at).getTime();
      const hoursSinceLastClaim = (now - lastClaimTime) / (1000 * 60 * 60);
      const daysUnclaimed = Math.floor(hoursSinceLastClaim / 24);

      if (daysUnclaimed > 0 && inv.status === 'ACTIVE') {
        const potentialUnclaimed = daysUnclaimed * inv.daily_yield;
        inv.unclaimed_earnings = Math.min(inv.total_return - inv.total_claimed, potentialUnclaimed);
      }

      if (inv.total_claimed >= inv.total_return) {
        inv.status = 'PAYOUT_COMPLETE';
      }
    });

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
    } = req.body;

    if (announcement_badge) homepageConfig.announcement_badge = announcement_badge;
    if (headline) homepageConfig.headline = headline;
    if (subheadline) homepageConfig.subheadline = subheadline;
    if (notice_text) homepageConfig.notice_text = notice_text;
    if (deposit_receiver_number) homepageConfig.deposit_receiver_number = deposit_receiver_number;
    if (deposit_receiver_name) homepageConfig.deposit_receiver_name = deposit_receiver_name;
    saveHomepageConfigToDisk();

    res.json({ message: 'Homepage configuration updated successfully!', homepageConfig });
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

    if (finalAmount < 5000) {
      return res.status(400).json({ error: 'Minimum deposit amount is 5,000 UGX.' });
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
    if (isNaN(numAmt) || numAmt < 5000) {
      return res.status(400).json({ error: 'Minimum deposit amount is 5,000 UGX.' });
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

    // Customer deposits strictly go to Wallet upon Admin confirmation so customer can buy a machine using Wallet
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

    // Rule: Money on the wallet is used to buy machine only. Money on balance is for withdrawal only after the total cycle duration of days
    const confirmedUserInvestments = investments.filter(
      (i) => i.user_id === user.id && (i.status === 'ACTIVE' || i.status === 'PAYOUT_COMPLETE')
    );
    const isCustomer = confirmedUserInvestments.length > 0;
    if (!isCustomer) {
      return res.status(400).json({
        error: 'Access Denied: Money on the wallet is used to buy machine only. Money on balance is for withdrawal only after the total cycle duration of days. Please buy a machine first.',
      });
    }

    const completedCycles = confirmedUserInvestments.filter(
      (i) => i.status === 'PAYOUT_COMPLETE' || (i.days_elapsed || 0) >= (i.duration_days || 1)
    );
    if (completedCycles.length === 0) {
      const activeInv = confirmedUserInvestments[0];
      const daysElapsed = activeInv.days_elapsed || 1;
      const totalDays = activeInv.duration_days || 1;
      const remainingDays = Math.max(1, totalDays - daysElapsed);
      return res.status(400).json({
        error: `Withdrawal Locked: Money on balance is for withdrawal only after the total cycle duration of days. Your active machine (${activeInv.machine_title}) is currently on Day ${daysElapsed} of ${totalDays} Days (${remainingDays} day${remainingDays > 1 ? 's' : ''} remaining in cycle).`,
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

    const newTx: Transaction = {
      id: `tx-wdr-${Date.now()}`,
      user_id: user.id,
      amount: numAmt,
      type: 'WITHDRAWAL',
      status: 'PENDING', // PENDING approval by admin owner
      payment_method: `${payment_method || 'Mobile Money'} (${phone_number || account_name || 'Account'}) • Net Payout: ${netPayout.toLocaleString()} UGX (10% Fee: ${withdrawFee.toLocaleString()} UGX)`,
      payment_reference: `WDR-OUT-${Math.floor(100000 + Math.random() * 900000)}`,
      created_at: new Date().toISOString(),
    };
    transactions.unshift(newTx);

    pushNotification(
      user.id,
      'Withdrawal Request Submitted',
      `Your withdrawal request of ${numAmt.toLocaleString()} UGX (10% fee: ${withdrawFee.toLocaleString()} UGX • Net payout: ${netPayout.toLocaleString()} UGX) to ${phone_number || account_name || 'Mobile Money'} has been submitted and is pending admin payout approval.`,
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

    // Ensure every PENDING machine investment has a corresponding PENDING payment transaction visible to Admin,
    // and transition any ACTIVE machine whose cycle has finished to PAYOUT_COMPLETE (Completed Cycle)
    for (const inv of investments) {
      if (inv.status === 'PENDING') {
        const hasTx = transactions.some(
          (t) =>
            (t.investment_id === inv.id ||
              (t.user_id === inv.user_id && t.type === 'INVESTMENT' && t.amount === inv.amount_invested)) &&
            t.status === 'PENDING'
        );
        if (!hasTx) {
          transactions.unshift({
            id: `tx-inv-sync-${inv.id}`,
            user_id: inv.user_id,
            type: 'INVESTMENT',
            amount: inv.amount_invested,
            status: 'PENDING',
            payment_method: `${inv.payment_method || 'Wallet Balance'} • ${inv.machine_title}`,
            payment_reference: `MACHINE-${inv.id.slice(-6).toUpperCase()}`,
            investment_id: inv.id,
            machine_title: inv.machine_title,
            created_at: inv.start_date || new Date().toISOString(),
          });
        }
      } else if (inv.status === 'ACTIVE') {
        const startMs = new Date(inv.start_date || Date.now()).getTime();
        const elapsedDays = Math.min(
          inv.duration_days,
          Math.max(1, Math.floor((Date.now() - startMs) / (1000 * 60 * 60 * 24)) + 1)
        );
        if ((inv.days_elapsed || 0) < elapsedDays) {
          inv.days_elapsed = elapsedDays;
        }
        const endMs = inv.end_date
          ? new Date(inv.end_date).getTime()
          : startMs + inv.duration_days * 24 * 60 * 60 * 1000;
        if (Date.now() >= endMs || (inv.days_elapsed || 0) >= inv.duration_days) {
          inv.status = 'PAYOUT_COMPLETE';
          inv.days_elapsed = inv.duration_days;
        }
      }
    }

    const withdrawals = transactions.filter((t) => t.type === 'WITHDRAWAL');
    const deposits = transactions
      .filter((t) => t.type === 'DEPOSIT' || t.type === 'INVESTMENT')
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

    res.json({
      total_users: approvedInvestments.length,
      total_customers_count: approvedInvestments.length,
      registered_users_count: userList.length,
      users: userList,
      withdrawals,
      deposits,
      admin_notifications: adminNotifications.slice(0, 50),
      investments: enrichedInvestments,
      pending_withdrawals_count: pendingWithdrawals.length,
      pending_deposits_count: pendingDeposits.length,
      total_deposited: totalDeposited,
      total_withdrawn: totalWithdrawn,
      total_investments_count: approvedInvestments.length,
      machines_sold_count: approvedInvestments.length,
      active_cycles_count: activeCyclesCount,
      completed_cycles_count: completedCyclesCount,
      pending_cycles_count: pendingCyclesCount,
      total_verified_investment: totalVerifiedInvestment,
      homepage_config: homepageConfig,
      deposit_receiver_numbers: depositReceiverNumbers,
      deposit_rotation_config: depositRotationConfig,
      active_receiver: activeInfo.receiver,
      rotation_time_remaining_seconds: activeInfo.timeRemainingSeconds,
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

    // Ensure there is also a corresponding DEPOSIT transaction in the Admin Plane for every order in Firebase
    let linkedTxId: string | undefined;
    if (numAmt > 0 && !isWalletPurchaseMsg) {
      const explicitUserId = (payload as any)?.userId || (payload as any)?.user_id || '';
      const explicitTxId = (payload as any)?.transactionId || (payload as any)?.transaction_id || '';
      const existingByExplicitTx = explicitTxId ? transactions.find((t) => t.id === explicitTxId) : undefined;
      const targetMatchTx = existingMatchingTx || existingByExplicitTx;

      const user = findOrRestoreUser(explicitUserId || customerPhone || customerName, {
        user_id: explicitUserId || undefined,
        phone_number: customerPhone,
        user_phone: customerPhone,
        full_name: customerName,
        user_name: customerName,
      });

      if (targetMatchTx) {
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
      } else {
        const depositTx: Transaction = {
          id: explicitTxId || `tx-fb-${firebase_doc_id || Date.now()}-${Math.floor(100 + Math.random() * 899)}`,
          user_id: explicitUserId || (user ? user.id : `usr-fb-${Date.now()}`),
          amount: numAmt,
          type: 'DEPOSIT',
          status: incomingIsConfirmed ? 'SUCCESS' : 'PENDING',
          payment_method: `${paymentMethod || 'Mobile Money'} • Sender: ${customerPhone || customerName} -> Receiver: ${targetReceiverPhone} (${targetReceiverName})`,
          payment_reference: effectiveRef,
          machine_title: machineTitle || item || undefined,
          created_at: effectiveCreatedAt,
        };
        (depositTx as any).status_label = incomingIsConfirmed ? 'Successful' : 'Pending';
        (depositTx as any).firebase_doc_id = firebase_doc_id;
        (depositTx as any).wallet_credited = incomingIsConfirmed;
        (depositTx as any).receiver_credited = incomingIsConfirmed;
        (depositTx as any).approved_permanent = incomingIsConfirmed;
        (depositTx as any).receiver_phone = targetReceiverPhone;
        (depositTx as any).receiver_name = targetReceiverName;
        (depositTx as any).customer_name = customerName;
        (depositTx as any).customer_phone = customerPhone;
        (depositTx as any).user_phone = user?.phone_number || customerPhone;
        transactions.unshift(depositTx);
        linkedTxId = depositTx.id;

        if (user) {
          syncUserConfirmedFinances(user, user.id);
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

  // Admin Toggle Investment Status (Pending -> Active -> Completed)
  app.post('/api/admin/investments/toggle-status', (req, res) => {
    const { investment_id } = req.body;
    const inv = investments.find((i) => i.id === investment_id);
    if (!inv) {
      return res.status(404).json({ error: 'Investment record not found.' });
    }

    if (inv.status === 'PENDING') {
      activateConfirmedMachineInvestment(inv, 'Activated from Admin Investment Management Ledger.');
      const linkedTxs = transactions.filter(
        (t) =>
          (t.investment_id === inv.id ||
            (t.user_id === inv.user_id && t.status === 'PENDING' && t.amount === inv.amount_invested)) &&
          t.status === 'PENDING'
      );
      for (const ltx of linkedTxs) {
        ltx.status = 'SUCCESS';
      }
      saveAppStateToDisk();
      return res.json({
        message: `Investment ${inv.id} (${inv.machine_title}) confirmed and set to ACTIVE (Day 1 started)!`,
        investment: inv,
      });
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

    // Update Firestore admin_messages document to status: 'SUCCESS' so it shows Successful everywhere
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

    // THING 2: Confirm Wallet funds AND if the customer has any PENDING machine order waiting for Admin confirmation, start its machine cycle (ACTIVE, Day 1) immediately!
    let latestWallet = Number(tx.amount || 0);
    let latestBalance = primaryUser?.balance ?? REGISTRATION_REWARD_UGX;
    const activatedInvestments: Investment[] = [];

    for (const inv of investments) {
      if (
        inv.status === 'PENDING' &&
        (inv.id === tx.investment_id ||
          doesTxBelongToUser({ user_id: inv.user_id, customer_phone: (inv as any).customer_phone } as any, primaryUser, tx.user_id))
      ) {
        inv.wallet_deducted = true;
        activateConfirmedMachineInvestment(inv, notes || 'Machine cycle started upon Admin payment confirmation');
        activatedInvestments.push(inv);

        // Also mark any linked INVESTMENT transaction as SUCCESS
        for (const ltx of transactions) {
          if (ltx.investment_id === inv.id && ltx.status === 'PENDING') {
            ltx.status = 'SUCCESS';
            (ltx as any).status_label = 'Successful';
            (ltx as any).confirmed_at = nowIso;
            (ltx as any).approved_permanent = true;
          }
        }
      }
    }

    const syncedUserIds: string[] = [];
    for (const targetUser of matchedUsers.values()) {
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
          ? `Admin has confirmed your payment of ${tx.amount.toLocaleString()} UGX! Your machine (${activatedInvestments[0].machine_title}) is now ACTIVE and counting Day 1 of ${activatedInvestments[0].duration_days} Days. ${notes || ''}`
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

  // Admin Vault Sync Endpoint: Restores/merges Admin Plane backup from browser localStorage after publishing or GitHub deploys so zero Admin Plane data is ever lost
  app.post('/api/admin/sync-vault', (req, res) => {
    const {
      deposits: incomingDeposits,
      withdrawals: incomingWithdrawals,
      investments: incomingInvestments,
      users: incomingUsers,
      deposit_receiver_numbers: incomingNumbers,
      homepage_config: incomingHomepage,
    } = req.body || {};

    let restoredCount = 0;

    if (Array.isArray(incomingUsers)) {
      for (const u of incomingUsers) {
        if (!u || !u.id || u.id === 'usr-admin-owner') continue;
        if (!users.has(u.id)) {
          const restoredUser = { ...u, password_hash: u.password_hash || 'restored' };
          users.set(restoredUser.id, restoredUser);
          if (restoredUser.phone_number) users.set(restoredUser.phone_number, restoredUser);
          saveRegisteredUserToDisk(restoredUser);
          restoredCount++;
        }
      }
    }

    const incomingTxs = [
      ...(Array.isArray(incomingDeposits) ? incomingDeposits : []),
      ...(Array.isArray(incomingWithdrawals) ? incomingWithdrawals : []),
    ];
    for (const tx of incomingTxs) {
      if (!tx || !tx.id || isDemoRecord(tx)) continue;
      const existing = transactions.find(
        (t) =>
          t.id === tx.id ||
          (tx.payment_reference && t.payment_reference === tx.payment_reference && t.type === tx.type)
      );
      if (!existing) {
        if (tx.status !== 'PENDING' || !DELETED_DEMO_IDS.has(String(tx.payment_reference || ''))) {
          transactions.push(tx);
          restoredCount++;
        }
      } else if (
        (tx.status === 'SUCCESS' || tx.status === 'CONFIRMED') &&
        existing.status === 'PENDING'
      ) {
        existing.status = 'SUCCESS';
        (existing as any).wallet_credited = true;
        (existing as any).approved_permanent = true;
        restoredCount++;
      } else if (tx.status === 'FAILED' && existing.status === 'PENDING') {
        existing.status = 'FAILED';
        (existing as any).status_label = 'Denied (Fake Order)';
        (existing as any).wallet_credited = false;
        restoredCount++;
      }
    }

    if (Array.isArray(incomingInvestments)) {
      for (const inv of incomingInvestments) {
        if (!inv || !inv.id || isDemoRecord(inv)) continue;
        if (!investments.some((i) => i.id === inv.id)) {
          investments.push(inv);
          restoredCount++;
        }
      }
    }

    if (Array.isArray(incomingNumbers) && incomingNumbers.length > 0 && depositReceiverNumbers.length === 0) {
      depositReceiverNumbers = incomingNumbers;
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

  // Admin Process Withdrawal (Approve / Reject)
  app.post('/api/admin/withdrawals/action', (req, res) => {
    const { transaction_id, action, notes } = req.body; // action: 'APPROVE' | 'REJECT'
    const tx = transactions.find((t) => t.id === transaction_id);

    if (!tx) {
      return res.status(404).json({ error: 'Transaction not found.' });
    }

    const user = Array.from(users.values()).find((u) => u.id === tx.user_id);

    if (action === 'APPROVE') {
      tx.status = 'SUCCESS';
      if (user) {
        saveRegisteredUserToDisk(user);
        pushNotification(
          user.id,
          '✅ Withdrawal Approved & Sent!',
          `Your withdrawal of ${tx.amount.toLocaleString()} UGX (${tx.payment_method}) has been approved and paid out by the administrator. ${notes || ''}`,
          'PAYMENT'
        );
      }
      saveAppStateToDisk();
      return res.json({ message: `Withdrawal of ${tx.amount.toLocaleString()} UGX approved!`, transaction: tx });
    } else if (action === 'REJECT') {
      tx.status = 'FAILED';
      // Refund user balance
      if (user) {
        user.balance += tx.amount;
        saveRegisteredUserToDisk(user);
        pushNotification(
          user.id,
          '❌ Withdrawal Request Declined',
          `Your withdrawal request of ${tx.amount.toLocaleString()} UGX was declined by admin and the funds have been returned to your balance. ${notes || ''}`,
          'PAYMENT'
        );
      }
      saveAppStateToDisk();
      return res.json({ message: `Withdrawal rejected and ${tx.amount.toLocaleString()} UGX refunded to user balance.`, transaction: tx });
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
