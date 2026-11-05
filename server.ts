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

function loadAppStateFromDisk() {
  try {
    if (fs.existsSync(TRANSACTIONS_FILE)) {
      const loadedTx = JSON.parse(fs.readFileSync(TRANSACTIONS_FILE, 'utf-8'));
      if (Array.isArray(loadedTx)) {
        transactions.splice(0, transactions.length, ...loadedTx);
      }
    }
    if (fs.existsSync(INVESTMENTS_FILE)) {
      const loadedInv = JSON.parse(fs.readFileSync(INVESTMENTS_FILE, 'utf-8'));
      if (Array.isArray(loadedInv)) {
        investments.splice(0, investments.length, ...loadedInv);
      }
    }
    if (fs.existsSync(NOTIFICATIONS_FILE)) {
      const loadedNotif = JSON.parse(fs.readFileSync(NOTIFICATIONS_FILE, 'utf-8'));
      if (Array.isArray(loadedNotif)) {
        notifications.splice(0, notifications.length, ...loadedNotif);
      }
    }
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

  // 4. If still not found but client sent a valid user_id, restore user session in memory
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
      balance: 0,
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

function syncUserConfirmedFinances(user: User & { password_hash?: string }, explicitUserId?: string) {
  let userDeposits = transactions.filter((t) => doesTxBelongToUser(t, user, explicitUserId) && t.type === 'DEPOSIT');
  let confirmedDeposits = userDeposits
    .filter((t) => t.status === 'SUCCESS' || t.status === 'CONFIRMED')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const pendingDeposits = userDeposits
    .filter((t) => t.status === 'PENDING')
    .reduce((sum, t) => sum + Number(t.amount || 0), 0);

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

  let computedBalance = Math.max(
    0,
    confirmedDeposits + userYieldsAndBonuses - deductedInvestments - deductedWithdrawals
  );

  // GUARANTEE: Approved money in user.balance must NEVER disappear if not deleted by Admin.
  // If user.balance on disk is higher than computedBalance (e.g., approved credit without a matching tx),
  // preserve it and create a permanent confirmed deposit record so it never disappears.
  const currentSavedBalance = Number(user.balance || 0);
  if (currentSavedBalance > computedBalance && user.id !== 'usr-admin-owner') {
    const missingApprovedAmt = currentSavedBalance - computedBalance;
    const preservedTx: Transaction = {
      id: `tx-dep-approved-${user.id}-${Date.now()}`,
      user_id: user.id,
      amount: missingApprovedAmt,
      type: 'DEPOSIT',
      status: 'SUCCESS',
      payment_method: 'Admin Approved Wallet Deposit',
      payment_reference: `APPROVED-${Date.now().toString().slice(-6)}`,
      created_at: new Date().toISOString(),
    };
    (preservedTx as any).wallet_credited = true;
    (preservedTx as any).confirmed_at = new Date().toISOString();
    (preservedTx as any).customer_name = user.full_name || user.name || 'Investor';
    (preservedTx as any).customer_phone = user.phone_number || user.phoneNumber || '';
    (preservedTx as any).user_phone = user.phone_number || user.phoneNumber || '';
    transactions.unshift(preservedTx);
    saveAppStateToDisk();

    userDeposits = transactions.filter((t) => doesTxBelongToUser(t, user, explicitUserId) && t.type === 'DEPOSIT');
    confirmedDeposits += missingApprovedAmt;
    computedBalance = currentSavedBalance;
  }

  let balanceChanged = false;
  for (const u of users.values()) {
    if (u.id === 'usr-admin-owner') continue;
    const uPhoneTail = (u.phone_number || u.phoneNumber || '').replace(/\D/g, '').slice(-9);
    if (
      u.id === user.id ||
      (explicitUserId && u.id === explicitUserId) ||
      (userPhoneTail && userPhoneTail.length >= 7 && uPhoneTail === userPhoneTail)
    ) {
      if (u.balance !== computedBalance) {
        u.balance = computedBalance;
        balanceChanged = true;
      }
    }
  }
  if (user.balance !== computedBalance) {
    user.balance = computedBalance;
    balanceChanged = true;
  }
  if (balanceChanged && user.id !== 'usr-admin-owner') {
    saveRegisteredUserToDisk(user as User & { password_hash: string });
  }

  return {
    userDeposits,
    confirmedDeposits,
    pendingDeposits,
    userWithdrawals,
    computedBalance,
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

// Helper to seed a demo default user (0 balance)
const demoUserId = 'usr-demo-123';
const demoUser: User & { password_hash: string } = {
  id: demoUserId,
  full_name: 'Alex Johnson',
  email: 'investor@avorinvest.com',
  phone_number: '+256700123456',
  age: 28,
  country: 'Uganda',
  kyc_status: 'VERIFIED',
  role: 'INVESTOR',
  balance: 0,
  referral_code: 'AVOR-7789',
  created_at: new Date().toISOString(),
  password_hash: 'demo123',
};
users.set(demoUser.id, demoUser);
users.set(demoUser.email, demoUser);
users.set(demoUser.phone_number, demoUser);
users.set('usr_demo', demoUser);

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

  // 1. Platform Global Stats Overview
  app.get('/api/stats/overview', (req, res) => {
    const totalInvested = investments.reduce((sum, inv) => sum + inv.amount_invested, 0) + 148500000;
    const totalPayouts = investments.reduce((sum, inv) => sum + inv.total_claimed, 0) + 212000000;
    res.json({
      total_invested: totalInvested,
      total_payouts_delivered: totalPayouts,
      active_machines_count: machines.length,
      total_investors_count: users.size + 1420,
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
      const initialBalance = 0;
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
              balance: 0,
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

    res.json({ message: `Machine "${machine.title}" updated successfully!`, machine });
  });

  // 5c. Admin: Reset Catalog to Official 2:3 Ratio Machines
  app.post('/api/admin/machines/reset-ratio-catalog', (req, res) => {
    machines.length = 0;
    DEFAULT_MACHINES.forEach((m) => {
      machines.push({ ...m });
    });
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

    // Sync confirmed finances before checking balance or lock status
    const finSummary = syncUserConfirmedFinances(user, user_id);
    const userConfirmedInvs = investments.filter(
      (i) => i.user_id === user.id && (i.status === 'ACTIVE' || i.status === 'PAYOUT_COMPLETE')
    );
    const hasUnlockedAllPlanes =
      userConfirmedInvs.length > 0 ||
      finSummary.confirmedDeposits > 0 ||
      user.balance > 0 ||
      !!user.has_bought_machine;

    // Verify locked plane access: once someone deposits money on the given number, all locked things open automatically
    if ((machine.is_av_class || (machine.required_referral_buyers && machine.required_referral_buyers > 0)) && user.role !== 'ADMIN') {
      if (!hasUnlockedAllPlanes) {
        return res.status(400).json({
          error: `Access Denied: ${machine.title} is a locked plane. Deposit money on the given number first so your machine starts running and all locked planes open.`,
        });
      }
    }

    // If this exact machine was already auto-started by the user's recent deposit, return success immediately
    const recentAutoStartedInv = investments.find(
      (i) =>
        i.user_id === user.id &&
        i.machine_id === machine.id &&
        i.status === 'ACTIVE' &&
        !i.wallet_deducted
    );
    if (recentAutoStartedInv && user.balance < totalCost) {
      recentAutoStartedInv.wallet_deducted = true;
      syncUserConfirmedFinances(user, user_id);
      saveRegisteredUserToDisk(user);
      saveAppStateToDisk();
      return res.status(200).json({
        message: `Your ${machine.title} is ACTIVE and running (Day ${recentAutoStartedInv.days_elapsed || 1} of ${machine.duration_days})! All locked planes are open.`,
        investment: recentAutoStartedInv,
        user_balance: user.balance,
        has_bought_machine: true,
        status: 'ACTIVE',
        claimed_tier_rewards: (user as any).claimed_tier_rewards || [],
      });
    }

    // Every buyer must deposit money on their wallet (via MTN Mobile Money or Airtel Money)
    if (user.balance < totalCost) {
      const pendingDeposits = transactions.filter(
        (t) => doesTxBelongToUser(t, user, user_id) && t.type === 'DEPOSIT' && t.status === 'PENDING'
      );
      const pendingTotal = pendingDeposits.reduce((sum, t) => sum + t.amount, 0);

      pushNotification(
        user.id,
        '⚠️ Wallet Balance Not Enough',
        `Wallet balance is not enough to access machine (${machine.title}). Required: ${totalCost.toLocaleString()} UGX • Your Wallet Balance: ${user.balance.toLocaleString()} UGX. Please deposit money on the given number first.`,
        'PAYMENT'
      );

      return res.status(400).json({
        error: `Wallet balance is not enough to access machine (${totalCost.toLocaleString()} UGX required • Available Wallet Balance: ${user.balance.toLocaleString()} UGX). Please deposit money on the given number via MTN Mobile Money or Airtel Money.`,
        requires_deposit: true,
        requires_deposit_approval: pendingTotal > 0,
      });
    }

    // Deduct from the user's wallet balance
    user.balance -= totalCost;
    user.has_bought_machine = true;
    saveRegisteredUserToDisk(user);

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

    // Since user.balance is only funded from Admin-confirmed deposits, this purchase from Wallet Balance is already backed by Admin-confirmed funds
    const requiresAdminConfirmation = false;

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

    investments.unshift(newInvestment);

    const refCode = `MACH-${Math.floor(100000 + Math.random() * 900000)}`;

    const recentConfirmedDep = transactions.find(
      (t) =>
        doesTxBelongToUser(t, user, user_id) &&
        t.type === 'DEPOSIT' &&
        (t.status === 'SUCCESS' || t.status === 'CONFIRMED') &&
        !t.investment_id
    );
    if (recentConfirmedDep) {
      recentConfirmedDep.investment_id = newInvestment.id;
      if (!recentConfirmedDep.machine_title) {
        recentConfirmedDep.machine_title = newInvestment.machine_title;
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
    (newTx as any).wallet_credited = true;
    transactions.unshift(newTx);

    saveAppStateToDisk();

    if (requiresAdminConfirmation) {
      pushNotification(
        user.id,
        '⏳ Machine Order Submitted for Admin Confirmation',
        `Your purchase of ${newInvestment.machine_title} for ${totalCost.toLocaleString()} UGX from your wallet has been recorded and a confirmation message has been sent to Admin. Once Admin confirms your payment, your machine will start running (Day 1 of ${machine.duration_days}).`,
        'PAYMENT'
      );

      notifyAllAdmins(
        `🔔 Machine Purchase Confirmation: ${newInvestment.machine_title}`,
        `Customer ${user.full_name || user.id} (${phone_number || user.phone_number || 'No Phone'}) bought ${newInvestment.machine_title} for UGX ${totalCost.toLocaleString()} using their wallet (Ref: ${refCode}). Please confirm payment in Admin Console to start the machine.`,
        'PAYMENT'
      );

      return res.status(201).json({
        message: `Machine order for ${units} unit(s) of ${machine.title} placed using your wallet! Confirmation message has been sent to Admin. Your machine will start counting days as soon as Admin confirms your payment.`,
        investment: newInvestment,
        user_balance: user.balance,
        has_bought_machine: true,
        status: 'PENDING',
        claimed_tier_rewards: (user as any).claimed_tier_rewards || [],
      });
    }

    const rewardNote = activateConfirmedMachineInvestment(newInvestment, 'Activated via Admin-approved wallet balance');
    notifyAllAdmins(
      `✅ Machine Purchased & Activated: ${newInvestment.machine_title}`,
      `Customer ${user.full_name || user.id} (${phone_number || user.phone_number || 'No Phone'}) purchased ${newInvestment.machine_title} for UGX ${totalCost.toLocaleString()} using their Admin-confirmed wallet balance (Ref: ${refCode}).`,
      'PAYMENT'
    );
    saveAppStateToDisk();

    res.status(201).json({
      message: `Successfully bought ${units} unit(s) of ${machine.title} using your wallet balance! Your machine is now ACTIVE (Day 1 of ${machine.duration_days}).${rewardNote}`,
      investment: newInvestment,
      user_balance: user.balance,
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

    // Comprehensive user lookup: map index, clean digits, full search, or disk file
    let user = users.get(userId);
    if (!user) {
      const cleanDigits = userId.replace(/[^0-9]/g, '');
      if (cleanDigits && users.has(cleanDigits)) {
        user = users.get(cleanDigits);
      }
    }
    if (!user) {
      user = Array.from(users.values()).find(
        (u) =>
          u.id === userId ||
          u.phone_number === userId ||
          u.phoneNumber === userId ||
          u.email?.toLowerCase() === userId.toLowerCase()
      );
    }
    if (!user && fs.existsSync(USERS_FILE)) {
      try {
        const raw = fs.readFileSync(USERS_FILE, 'utf-8');
        const diskUsers = JSON.parse(raw);
        if (Array.isArray(diskUsers)) {
          const found = diskUsers.find(
            (u: any) =>
              u.id === userId ||
              u.phone_number === userId ||
              u.phoneNumber === userId ||
              u.email?.toLowerCase() === userId.toLowerCase()
          );
          if (found) {
            user = found;
            users.set(found.id, found);
          }
        }
      } catch (e) {}
    }

    // Safe fallback if user is not in database: return 200 with 0 balance so UI never crashes
    if (!user) {
      return res.json({
        user_id: userId,
        balance: 0,
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
          withdrawable_balance: 0,
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

    // 1. Sync & compute Deposit details (reflects across Homepage Deposit Details, AccountView Wallet, WalletModal, InvestModal, etc.)
    const {
      userDeposits,
      confirmedDeposits: totalDeposited,
      pendingDeposits,
      userWithdrawals,
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

    // Check if current user has an active/completed machine or has deposited money on the given number
    const userInvestments = investments.filter((i) => i.user_id === userId || doesTxBelongToUser({ user_id: i.user_id } as any, user, userId));
    const confirmedUserInvestments = userInvestments.filter(
      (i) => i.status === 'ACTIVE' || i.status === 'PAYOUT_COMPLETE'
    );
    const hasBoughtMachine =
      confirmedUserInvestments.length > 0 ||
      totalDeposited > 0 ||
      user.balance > 0 ||
      !!user.has_bought_machine;
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
      deposit_details: {
        total_deposited: totalDeposited,
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
    const user = findOrRestoreUser(userId, { user_id: userId });
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

  // Reconcile any previously submitted PENDING deposits on server startup so they are confirmed & running
  for (const existingPendingTx of transactions.filter((t) => t.type === 'DEPOSIT' && t.status === 'PENDING')) {
    const u = findOrRestoreUser(existingPendingTx.user_id, {
      user_id: existingPendingTx.user_id,
      phone_number: (existingPendingTx as any).user_phone || (existingPendingTx as any).customer_phone,
    });
    processAutomaticDepositAndStartMachine(
      u,
      existingPendingTx,
      (existingPendingTx as any).machine_id,
      existingPendingTx.machine_title
    );
  }

  // =========================================================================
  // MoMo API GATEWAY INTEGRATION MVP ENDPOINT (Per Technical Spec)
  // Flow: Customer App -> Deposit on Given Number -> Automatically Goes to Admin, Reflects on Wallet, Starts Machine & Unlocks All Planes
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
        status: 'SUCCESS',
        payment_method: `${network} Mobile Money (From: ${finalPhone} -> To: ${receivingAccount.phone_number} ${receivingAccount.account_name})`,
        payment_reference: transactionIdFromApi,
        machine_title: machine_title || undefined,
        created_at: new Date().toISOString(),
      };
      (newTx as any).wallet_credited = true;
      (newTx as any).receiver_credited = false;
      (newTx as any).approved_permanent = true;
      (newTx as any).confirmed_at = new Date().toISOString();
      (newTx as any).receiver_id = receivingAccount.id;
      (newTx as any).receiver_phone = receivingAccount.phone_number;
      (newTx as any).receiver_name = receivingAccount.account_name;
      (newTx as any).customer_name = user?.full_name || 'Investor';
      (newTx as any).customer_phone = finalPhone;
      (newTx as any).user_phone = user?.phone_number || finalPhone;
      (newTx as any).machine_id = machine_id || undefined;
      transactions.unshift(newTx);

      const startedInv = processAutomaticDepositAndStartMachine(user, newTx, machine_id, machine_title);

      if (user) {
        pushNotification(
          user.id,
          `✅ Deposit Credited (${finalAmount.toLocaleString()} UGX) & Machine Running!`,
          `Your deposit of ${finalAmount.toLocaleString()} UGX to ${receivingAccount.account_name} (${receivingAccount.phone_number}) has automatically gone to Admin, reflected on your Wallet, started ${startedInv?.machine_title || 'your machine'} (Day 1), and unlocked all locked planes!`,
          'PAYMENT'
        );
      }

      notifyAllAdmins(
        `✅ Deposit Received & Credited to Admin: UGX ${finalAmount.toLocaleString()}`,
        `Customer ${user?.full_name || finalUserId} (Sender Phone: ${finalPhone}) deposited UGX ${finalAmount.toLocaleString()} via ${network} Mobile Money to Receiver ${receivingAccount.phone_number} (${receivingAccount.account_name}). Automatically credited to Admin & customer wallet, and started ${startedInv?.machine_title || 'machine'}. Ref: ${transactionIdFromApi}.`,
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
          machine_title: startedInv?.machine_title || machine_title || 'Wallet Deposit Order (Buy Machine)',
          order_status: 'CONFIRMED',
        }
      );

      return res.status(200).json({
        message: `Deposit of ${finalAmount.toLocaleString()} UGX sent to Admin and reflected on your Wallet! ${startedInv ? `${startedInv.machine_title} is now ACTIVE and running (Day 1)` : 'Your machine is now running'} and all locked planes are open!`,
        depositId: newTx.id,
        transactionId: transactionIdFromApi,
        status: 'confirmed',
        new_balance: user ? user.balance : finalAmount,
        has_bought_machine: true,
        activated_investment: startedInv,
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

  // 9. Deposit Funds (Automatically goes to Admin, reflects on customer Wallet, starts machine running & unlocks all locked planes)
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
      status: 'SUCCESS',
      payment_method: `${payment_method || 'Mobile Money'} • Sender: ${senderPhone || 'N/A'} -> Receiver: ${effectiveReceiver.phone_number} (${effectiveReceiver.account_name})`,
      payment_reference: refCode,
      machine_title: machine_title || undefined,
      created_at: new Date().toISOString(),
    };
    (newTx as any).wallet_credited = true;
    (newTx as any).receiver_credited = false;
    (newTx as any).approved_permanent = true;
    (newTx as any).confirmed_at = new Date().toISOString();
    (newTx as any).receiver_id = effectiveReceiver.id;
    (newTx as any).receiver_phone = effectiveReceiver.phone_number;
    (newTx as any).receiver_name = effectiveReceiver.account_name;
    (newTx as any).customer_name = user.full_name || user.name || 'Investor';
    (newTx as any).customer_phone = senderPhone;
    (newTx as any).user_phone = user.phone_number || senderPhone;
    (newTx as any).machine_id = machine_id || undefined;
    transactions.unshift(newTx);

    const startedInv = processAutomaticDepositAndStartMachine(user, newTx, machine_id, machine_title);

    pushNotification(
      user.id,
      '✅ Deposit Credited, Machine Running & All Planes Open!',
      `Your deposit of ${numAmt.toLocaleString()} UGX to ${effectiveReceiver.phone_number} (${effectiveReceiver.account_name}) has automatically gone to Admin, reflected on your Wallet, started ${startedInv?.machine_title || 'your machine'} (Day 1), and unlocked all locked planes!`,
      'PAYMENT'
    );

    notifyAllAdmins(
      `✅ Deposit Received & Credited: UGX ${numAmt.toLocaleString()}${startedInv ? ` (${startedInv.machine_title})` : ''}`,
      `Customer ${user.full_name || user.id} (Sender Phone: ${senderPhone}) deposited UGX ${numAmt.toLocaleString()} via ${payment_method || 'Mobile Money'} to Receiver ${effectiveReceiver.phone_number} (${effectiveReceiver.account_name}). Money automatically went to Admin, reflected on customer Wallet, started ${startedInv?.machine_title || 'machine'}, and opened all locked planes! Ref: ${refCode}.`,
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
        machine_title: startedInv?.machine_title || machine_title || 'Wallet Deposit Order (Buy Machine)',
        order_status: 'CONFIRMED',
      }
    );

    res.json({
      message: `Deposit of ${numAmt.toLocaleString()} UGX automatically sent to Admin and reflected on your Wallet! ${startedInv ? `${startedInv.machine_title} has started running (Day 1 of ${startedInv.duration_days})` : 'Your machine is now running'} and all locked planes are open!`,
      new_balance: user.balance,
      has_bought_machine: true,
      transaction: newTx,
      activated_investment: startedInv,
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

  // Mirror Firebase Firestore admin_messages to server notifications so all devices stay in sync
  app.post('/api/admin/firebase-message', (req, res) => {
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
      status,
    } = req.body || {};

    if (firebase_doc_id && notifications.some((n: any) => n.firebase_doc_id === firebase_doc_id)) {
      return res.json({ synced: true, duplicate: true });
    }

    const numAmt = Number(amount) || 0;
    notifyAllAdmins(
      `🔥 Firebase Admin Message: ${name || 'Avor Investor'}${machineTitle ? ` • ${machineTitle}` : ''}`,
      `${item || 'Customer submitted a deposit / machine action.'}`,
      'PAYMENT',
      {
        firebase_doc_id: firebase_doc_id || `fb-${Date.now()}`,
        customer_name: name || 'Avor Investor',
        customer_phone: senderPhone || '',
        receiver_phone: receiverPhone || RECEIVER_PHONE,
        receiver_name: receiverName || RECEIVER_NAME,
        amount: numAmt,
        machine_title: machineTitle || '',
        payment_method: paymentMethod || 'Mobile Money',
        payment_reference: paymentReference || '',
        order_status: status || 'CONFIRMED',
      }
    );

    saveAppStateToDisk();
    return res.status(201).json({ synced: true });
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

  // Admin Confirm / Reject Pending Deposit or Machine Payment
  app.post('/api/admin/deposits/action', (req, res) => {
    const { transaction_id, action, notes } = req.body; // action: 'APPROVE' | 'REJECT'
    const tx = transactions.find(
      (t) => t.id === transaction_id && (t.type === 'DEPOSIT' || t.type === 'INVESTMENT')
    );

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

    if (user && user.id !== 'usr-admin-owner' && tx.user_id !== user.id) {
      tx.user_id = user.id;
    }

    if (action === 'APPROVE') {
      tx.status = 'SUCCESS';
      (tx as any).confirmed_at = new Date().toISOString();
      (tx as any).approved_permanent = true;

      // Case 1: Machine Purchase Payment Confirmation -> Activate Machine & Start Counting Days
      if (tx.type === 'INVESTMENT') {
        const inv = investments.find(
          (i) =>
            i.id === tx.investment_id ||
            ((i.user_id === tx.user_id || (user && i.user_id === user.id)) &&
              i.status === 'PENDING' &&
              i.amount_invested === tx.amount)
        );

        // Also mark any matching pending DEPOSIT transaction for this user/investment as SUCCESS
        const relatedPendingDeposits = transactions.filter(
          (t) =>
            (t.user_id === tx.user_id || (user && t.user_id === user.id)) &&
            t.type === 'DEPOSIT' &&
            t.status === 'PENDING' &&
            (t.investment_id === inv?.id || t.amount === tx.amount)
        );
        for (const rDep of relatedPendingDeposits) {
          rDep.status = 'SUCCESS';
          (rDep as any).confirmed_at = new Date().toISOString();
          (rDep as any).approved_permanent = true;
          creditReceiverOnConfirm(rDep);
          if (user && !(rDep as any).wallet_credited) {
            user.balance = (user.balance || 0) + rDep.amount;
            (rDep as any).wallet_credited = true;
          }
        }

        // If no separate DEPOSIT record existed for this confirmed machine payment, create a confirmed DEPOSIT record so it reflects across all deposit planes
        const hasAnyDepositRecord =
          relatedPendingDeposits.length > 0 ||
          transactions.some(
            (t) =>
              (t.user_id === tx.user_id || (user && t.user_id === user.id)) &&
              t.type === 'DEPOSIT' &&
              (t.investment_id === inv?.id || (t.amount === tx.amount && t.status === 'SUCCESS'))
          );
        if (!hasAnyDepositRecord && user) {
          const mirrorDep: Transaction = {
            id: `tx-dep-mirror-${Date.now()}`,
            user_id: user.id,
            investment_id: inv?.id,
            amount: tx.amount,
            type: 'DEPOSIT',
            status: 'SUCCESS',
            payment_method: tx.payment_method,
            payment_reference: tx.payment_reference,
            machine_title: tx.machine_title || inv?.machine_title,
            created_at: tx.created_at,
          };
          (mirrorDep as any).wallet_credited = true;
          (mirrorDep as any).approved_permanent = true;
          (mirrorDep as any).confirmed_at = new Date().toISOString();
          (mirrorDep as any).customer_name = user.full_name || (tx as any).customer_name || 'Investor';
          (mirrorDep as any).customer_phone = user.phone_number || (tx as any).customer_phone || '';
          (mirrorDep as any).user_phone = user.phone_number || (tx as any).user_phone || '';
          creditReceiverOnConfirm(mirrorDep);
          transactions.unshift(mirrorDep);
        }

        if (inv && inv.status === 'PENDING') {
          if (user) {
            syncUserConfirmedFinances(user, user.id);
            if (!inv.wallet_deducted && user.balance >= inv.amount_invested) {
              user.balance -= inv.amount_invested;
              inv.wallet_deducted = true;
            }
            syncUserConfirmedFinances(user, user.id);
            saveRegisteredUserToDisk(user);
          }
          activateConfirmedMachineInvestment(inv, notes);
          saveAppStateToDisk();
          return res.json({
            message: `Payment of UGX ${tx.amount.toLocaleString()} confirmed and permanently saved across all deposit planes! ${inv.machine_title} is now ACTIVE (Day 1 of ${inv.duration_days}).`,
            transaction: tx,
            investment: inv,
          });
        }

        if (user) {
          syncUserConfirmedFinances(user, user.id);
          saveRegisteredUserToDisk(user);
        }
        saveAppStateToDisk();
        return res.json({
          message: `Machine payment of UGX ${tx.amount.toLocaleString()} confirmed and permanently saved across all deposit planes!`,
          transaction: tx,
        });
      }

      // Case 2: Wallet Deposit Confirmation -> Credit Balance, Update Receiver Totals & Activate Pending Machines
      creditReceiverOnConfirm(tx);

      if (user) {
        (tx as any).wallet_credited = true;
        syncUserConfirmedFinances(user, user.id);
        saveRegisteredUserToDisk(user);

        // Check if this user has any PENDING machine waiting for payment confirmation
        const pendingUserInvs = investments.filter((i) => doesTxBelongToUser({ user_id: i.user_id } as any, user, user.id) && i.status === 'PENDING');
        const activatedTitles: string[] = [];

        for (const pendingInv of pendingUserInvs) {
          if (pendingInv.wallet_deducted || user.balance >= pendingInv.amount_invested) {
            if (!pendingInv.wallet_deducted) {
              pendingInv.wallet_deducted = true;
            }
            activateConfirmedMachineInvestment(pendingInv, notes);
            activatedTitles.push(pendingInv.machine_title);

            // Also mark the corresponding pending INVESTMENT transaction as SUCCESS
            const linkedInvTx = transactions.find(
              (t) => t.investment_id === pendingInv.id && t.status === 'PENDING'
            );
            if (linkedInvTx) {
              linkedInvTx.status = 'SUCCESS';
              (linkedInvTx as any).confirmed_at = new Date().toISOString();
              (linkedInvTx as any).approved_permanent = true;
            }
          }
        }
        syncUserConfirmedFinances(user, user.id);
        saveRegisteredUserToDisk(user);
        saveAppStateToDisk();

        pushNotification(
          user.id,
          '✅ Deposit Confirmed by Admin & Permanently Credited!',
          `Your deposit of ${tx.amount.toLocaleString()} UGX sent to ${(tx as any).receiver_phone || homepageConfig.deposit_receiver_number} (${(tx as any).receiver_name || homepageConfig.deposit_receiver_name}) has been confirmed by Admin and permanently credited to your wallet and deposit planes.${
            activatedTitles.length > 0
              ? ` Your machine(s) (${activatedTitles.join(', ')}) are now ACTIVE and have started counting days (Day 1)!`
              : ' Your wallet balance is now funded and ready to buy compute machines!'
          } ${notes || ''}`,
          'PAYMENT'
        );

        return res.json({
          message:
            activatedTitles.length > 0
              ? `Deposit of ${tx.amount.toLocaleString()} UGX confirmed, permanently saved across all deposit planes, and ${activatedTitles.join(', ')} started counting days!`
              : `Deposit of ${tx.amount.toLocaleString()} UGX confirmed and permanently saved across all deposit planes!`,
          transaction: tx,
          new_balance: user.balance,
        });
      }

      saveAppStateToDisk();
      return res.json({
        message: `Deposit of ${tx.amount.toLocaleString()} UGX confirmed and permanently saved across all deposit planes!`,
        transaction: tx,
      });
    } else if (action === 'REJECT') {
      // Once a deposit is approved by Admin, it must NEVER be unapproved or disappear unless explicitly deleted by Admin
      if (tx.status === 'SUCCESS' || tx.status === 'CONFIRMED' || (tx as any).approved_permanent) {
        return res.status(400).json({
          error: 'Approved money data is locked in the system and cannot be unapproved. Only an explicit Admin delete can remove a record.',
        });
      }

      tx.status = 'FAILED';

      if (tx.type === 'INVESTMENT') {
        const inv = investments.find(
          (i) =>
            i.id === tx.investment_id ||
            (i.user_id === tx.user_id && i.status === 'PENDING' && i.amount_invested === tx.amount)
        );
        if (inv) {
          if (user && inv.wallet_deducted) {
            inv.wallet_deducted = false;
            syncUserConfirmedFinances(user, user.id);
            saveRegisteredUserToDisk(user);
          }
          if (user) {
            pushNotification(
              user.id,
              '❌ Machine Payment Not Confirmed',
              `Your payment for ${inv.machine_title} (${tx.amount.toLocaleString()} UGX) was declined by Admin.${
                inv.wallet_deducted ? ' Your wallet balance has been refunded.' : ''
              } ${notes || ''}`,
              'PAYMENT'
            );
          }
        }
        saveAppStateToDisk();
        return res.json({ message: `Machine order marked as declined.`, transaction: tx });
      }

      if (user) {
        (tx as any).wallet_credited = false;
        syncUserConfirmedFinances(user, user.id);
        saveRegisteredUserToDisk(user);
        pushNotification(
          user.id,
          '❌ Deposit Request Declined',
          `Your deposit request of ${tx.amount.toLocaleString()} UGX was declined by Admin. ${notes || ''}`,
          'PAYMENT'
        );
      }
      saveAppStateToDisk();
      return res.json({ message: `Deposit request marked as failed.`, transaction: tx });
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
    const user = findOrRestoreUser(removed.user_id, {
      user_id: removed.user_id,
      phone_number: (removed as any).user_phone || (removed as any).customer_phone,
    });
    if (user && user.id !== 'usr-admin-owner') {
      // Recalculate from remaining transactions
      const remainingConfirmed = transactions
        .filter((t) => doesTxBelongToUser(t, user, user.id) && t.type === 'DEPOSIT' && (t.status === 'SUCCESS' || t.status === 'CONFIRMED'))
        .reduce((s, t) => s + Number(t.amount || 0), 0);
      const remainingYields = transactions
        .filter(
          (t) =>
            doesTxBelongToUser(t, user, user.id) &&
            (t.type === 'DAILY_YIELD' || t.type === 'REFERRAL_BONUS' || t.type === 'COMMISSION') &&
            (t.status === 'SUCCESS' || t.status === 'CONFIRMED')
        )
        .reduce((s, t) => s + Number(t.amount || 0), 0);
      const deductedInvs = investments
        .filter((inv) => inv.user_id === user.id && inv.wallet_deducted && (inv.status === 'ACTIVE' || inv.status === 'PAYOUT_COMPLETE' || inv.status === 'PENDING'))
        .reduce((s, inv) => s + Number(inv.amount_invested || 0), 0);
      const deductedWdrs = transactions
        .filter((t) => doesTxBelongToUser(t, user, user.id) && t.type === 'WITHDRAWAL' && (t.status === 'SUCCESS' || t.status === 'CONFIRMED' || t.status === 'PENDING'))
        .reduce((s, t) => s + Number(t.amount || 0), 0);
      user.balance = Math.max(0, remainingConfirmed + remainingYields - deductedInvs - deductedWdrs);
      saveRegisteredUserToDisk(user);
    }
    saveAppStateToDisk();
    return res.json({
      message: `Transaction ${removed.id} (UGX ${Number(removed.amount || 0).toLocaleString()}) permanently deleted by Admin.`,
      deleted_id: txId,
    });
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

    // First process DEPOSIT transactions so wallet balances are credited
    for (const tx of pendingTxs.filter((t) => t.type === 'DEPOSIT')) {
      const user = findOrRestoreUser(tx.user_id, {
        user_id: tx.user_id,
        phone_number: (tx as any).user_phone || (tx as any).customer_phone,
        user_phone: (tx as any).user_phone || (tx as any).customer_phone,
        full_name: (tx as any).customer_name,
        user_name: (tx as any).customer_name,
      });
      if (user && user.id !== 'usr-admin-owner' && tx.user_id !== user.id) {
        tx.user_id = user.id;
      }
      tx.status = 'SUCCESS';
      (tx as any).confirmed_at = new Date().toISOString();
      (tx as any).approved_permanent = true;
      creditReceiverOnConfirm(tx);

      if (user) {
        (tx as any).wallet_credited = true;
        syncUserConfirmedFinances(user, user.id);
        saveRegisteredUserToDisk(user);
        pushNotification(
          user.id,
          '✅ Deposit Confirmed by Admin & Permanently Credited!',
          `Your submitted deposit of ${tx.amount.toLocaleString()} UGX has been confirmed by Admin and permanently credited across all your deposit planes and wallet balance!`,
          'PAYMENT'
        );
      }
      confirmedCount++;
      totalConfirmedUgx += tx.amount;
    }

    // Next process any remaining pending INVESTMENT transactions and pending machine orders
    for (const tx of pendingTxs.filter((t) => t.type === 'INVESTMENT')) {
      const user = findOrRestoreUser(tx.user_id, {
        user_id: tx.user_id,
        phone_number: (tx as any).user_phone || (tx as any).customer_phone,
        user_phone: (tx as any).user_phone || (tx as any).customer_phone,
        full_name: (tx as any).customer_name,
        user_name: (tx as any).customer_name,
      });
      tx.status = 'SUCCESS';
      (tx as any).confirmed_at = new Date().toISOString();
      (tx as any).approved_permanent = true;
      const inv = investments.find(
        (i) =>
          i.id === tx.investment_id ||
          ((i.user_id === tx.user_id || (user && i.user_id === user.id)) && i.status === 'PENDING')
      );
      if (inv && inv.status === 'PENDING') {
        if (user) {
          syncUserConfirmedFinances(user, user.id);
          if (!inv.wallet_deducted && user.balance >= inv.amount_invested) {
            inv.wallet_deducted = true;
          }
          syncUserConfirmedFinances(user, user.id);
          saveRegisteredUserToDisk(user);
        }
        activateConfirmedMachineInvestment(inv, 'Confirmed via Bulk Admin Deposit Approval');
      }
      confirmedCount++;
    }

    // Also activate any remaining PENDING investments for users whose deposits were just confirmed
    for (const inv of investments.filter((i) => i.status === 'PENDING')) {
      const user = Array.from(users.values()).find((u) => u.id === inv.user_id);
      if (user) {
        syncUserConfirmedFinances(user, user.id);
        if (inv.wallet_deducted || user.balance >= inv.amount_invested) {
          if (!inv.wallet_deducted) {
            inv.wallet_deducted = true;
          }
          syncUserConfirmedFinances(user, user.id);
          saveRegisteredUserToDisk(user);
          activateConfirmedMachineInvestment(inv, 'Activated upon Admin deposit confirmation');
        }
      }
    }

    saveAppStateToDisk();

    return res.json({
      message: `Confirmed ${confirmedCount} submitted deposit(s) totaling UGX ${totalConfirmedUgx.toLocaleString()} and permanently saved across all deposit planes!`,
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
          `Your withdrawal request of ${tx.amount.toLocaleString()} UGX was declined by admin and the funds have been returned to your wallet. ${notes || ''}`,
          'PAYMENT'
        );
      }
      saveAppStateToDisk();
      return res.json({ message: `Withdrawal rejected and ${tx.amount.toLocaleString()} UGX refunded to user wallet.`, transaction: tx });
    }

    res.status(400).json({ error: 'Invalid action provided.' });
  });


  // Admin Credit or Deduct User Balance Directly
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
      numAmt > 0 ? '💰 Wallet Credit Added' : ' Wallet Balance Adjusted',
      `Admin updated your wallet by ${numAmt > 0 ? '+' : ''}${numAmt.toLocaleString()} UGX. ${note || ''}`,
      'PAYMENT'
    );

    res.json({
      message: `User ${user.full_name} balance updated by ${numAmt.toLocaleString()} UGX. New balance: ${user.balance.toLocaleString()} UGX`,
      new_balance: user.balance,
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
    const user = findOrRestoreUser(userId, { user_id: userId });
    if (user) {
      syncUserConfirmedFinances(user, userId);
    }
    const userTxs = transactions.filter((t) => doesTxBelongToUser(t, user, userId));
    res.json(userTxs);
  });

  // 12. User Profile Fetch & Update
  const handleGetUserProfile = (req: express.Request, res: express.Response) => {
    res.setHeader('Content-Type', 'application/json');
    const targetId = req.params.userId;
    let user = users.get(targetId);
    if (!user) {
      const cleanDigits = targetId.replace(/[^0-9]/g, '');
      if (cleanDigits && users.has(cleanDigits)) {
        user = users.get(cleanDigits);
      }
    }
    if (!user) {
      user = Array.from(users.values()).find(
        (u) =>
          u.id === targetId ||
          u.phone_number === targetId ||
          u.phoneNumber === targetId ||
          u.email?.toLowerCase() === targetId.toLowerCase()
      );
    }
    if (!user && fs.existsSync(USERS_FILE)) {
      try {
        const raw = fs.readFileSync(USERS_FILE, 'utf-8');
        const diskUsers = JSON.parse(raw);
        if (Array.isArray(diskUsers)) {
          const found = diskUsers.find(
            (u: any) =>
              u.id === targetId ||
              u.phone_number === targetId ||
              u.phoneNumber === targetId ||
              u.email?.toLowerCase() === targetId.toLowerCase()
          );
          if (found) {
            user = found;
            users.set(found.id, found);
          }
        }
      } catch (e) {}
    }
    if (!user) return res.status(404).json({ error: 'User not found.' });
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
