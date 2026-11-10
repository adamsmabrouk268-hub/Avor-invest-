export type Currency = 'UGX' | 'USD' | 'KES' | 'NGN';

export type MachineCategory =
  | 'ALL'
  | 'AVS'
  | 'AVCLASSES'
  | 'AV1'
  | 'AV2'
  | 'AV_CLASS_A'
  | 'AV_CLASS_B'
  | 'AV_CLASS_C'
  | 'AV_CLASS_D'
  | 'AV_CLASS_E'
  | 'AV_CLASS_F'
  | 'AV_CLASS_G'
  | 'AV_CLASS_H'
  | 'AV_CLASS_I'
  | string;

export interface User {
  id: string;
  full_name: string;
  email: string;
  phone_number: string;
  age?: number;
  country?: string;
  country_code?: string;
  kyc_status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  role: 'INVESTOR' | 'ADMIN';
  balance: number;
  wallet_balance?: number;
  available_wallet?: number;
  referral_code: string;
  referred_by?: string;
  created_at: string;
  registered_date?: string;
  updated_at?: string;
  has_bought_machine?: boolean;
  is_suspended?: boolean;
  // Mongoose schema fields
  phoneNumber?: string;
  name?: string;
  password?: string;
  registration_data?: Record<string, any>;
  user_details?: Record<string, any>;
}

export interface Machine {
  id: string;
  title: string;
  category: MachineCategory;
  series_tag: string; // e.g. "AV1", "AV2", "A class", "B class", etc.
  description: string;
  total_cost: number; // e.g. 15000
  funded_amount: number;
  estimated_return_pct: number; // e.g. 200% profit
  daily_yield: number; // e.g. 3750 per day
  duration_days: number; // e.g. 12 days or 365 days
  total_return: number; // e.g. 45000
  status: 'FUNDING' | 'ACTIVE' | 'COMPLETED' | 'High Yield' | 'Premier Tier' | string;
  display_status?: string;
  image_url?: string;
  hashrate_or_capacity?: string; // e.g. "120 TH/s" or "32 TeraFlops"
  power_consumption?: string; // e.g. "850W"
  expected_usage?: string; // e.g. "24/7 Continuous AI Training Node (99.9% SLA)"
  vip_level_required?: number; // 0 for all
  available_units: number;
  created_at: string;
  // AVclasses and everyday running flags
  is_av_class?: boolean;
  runs_everyday?: boolean;
  runs_on_weekends?: boolean;
  wallet_only?: boolean;
  required_referral_buyers?: number; // e.g. 4 people for A class, 9 for B class
  referral_reward_ugx?: number; // e.g. 25000 for A class, 60000 for B class
  max_units_per_user?: number; // e.g. 1 unit in AV1
  only_one_unit?: boolean; // true for AV1
  running_schedule_text?: string; // e.g. "Monday to Monday (counting weekends)"
  // Mongoose schema fields for machine modeling
  name?: string;
  series?: string;
  price?: number;
  rewardAmount?: number;
  lockDurationMinutes?: number;
  imageUrl?: string;
  isActive?: boolean;
}

export interface Payment {
  id?: string;
  userId: string;
  machineId: string;
  amount: number;
  phoneNumber: string;
  receiverName?: string;
  externalTxRef?: string;
  internalRef: string;
  status: 'PENDING_ADMIN' | 'PENDING_GATEWAY' | 'CONFIRMED' | 'FAILED';
  createdAt?: string;
  updatedAt?: string;
}

export interface InvestmentLock {
  id?: string;
  userId: string;
  machineId: string;
  amountPaid: number;
  rewardAmount: number;
  startTime: string | Date;
  endTime: string | Date;
  status: 'LOCKED' | 'COMPLETED' | 'CANCELLED';
  createdAt?: string;
  updatedAt?: string;
}

export interface SystemConfig {
  key: string;
  value: any;
  createdAt?: string;
  updatedAt?: string;
}

export interface AppNotification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'PAYMENT' | 'YIELD' | 'SYSTEM' | 'SECURITY';
  read: boolean;
  created_at: string;
}

export interface Investment {
  id: string;
  user_id: string;
  machine_id: string;
  machine_title: string;
  series_tag: string;
  units?: number;
  amount_invested: number;
  daily_yield: number;
  total_return: number;
  duration_days: number;
  days_elapsed: number;
  last_claim_at: string; // ISO date string
  unclaimed_earnings: number;
  total_claimed: number;
  status: 'PENDING' | 'ACTIVE' | 'PAYOUT_COMPLETE';
  start_date: string;
  end_date: string;
  machine?: Machine;
  inviter_id?: string;
  inviter_has_same_machine?: boolean;
  team_income_amount?: number;
  team_income_settled?: boolean;
  wallet_deducted?: boolean;
  payment_method?: string;
  confirmed_at?: string;
}

export interface Transaction {
  id: string;
  user_id: string;
  investment_id?: string;
  machine_title?: string;
  amount: number;
  type: 'DEPOSIT' | 'INVESTMENT' | 'DAILY_YIELD' | 'WITHDRAWAL' | 'REFERRAL_BONUS' | 'COMMISSION';
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'CONFIRMED';
  payment_reference?: string;
  payment_method?: string; // e.g., 'MTN Mobile Money', 'Airtel Money', 'USDT', 'Card'
  created_at: string;
}

export interface ReferralStat {
  code: string;
  total_referred: number;
  total_commission_earned: number;
  active_investors: number;
  level_1_commission_pct: number; // 10%
  level_2_commission_pct: number; // 3%
  level_3_commission_pct: number; // 1%
}

export interface CurrencyConfig {
  code: Currency;
  symbol: string;
  rateToUGX: number; // 1 USD = 3700 UGX, 1 KES = 28 UGX, 1 NGN = 2.4 UGX
  format: (amountInUGX: number) => string;
}

export interface HomepageConfig {
  announcement_badge: string;
  headline: string;
  subheadline: string;
  notice_text: string;
  deposit_receiver_number: string;
  deposit_receiver_name: string;
  deposit_receiver_carrier?: string;
  rotation_mode?: 'ROUND_ROBIN' | 'TIME_BASED' | 'ADMIN_MANUAL';
  active_rotation_hours?: number;
}

export type NetworkCarrier = 'MTN' | 'AIRTEL' | 'BOTH';

export interface PaymentAccount {
  id: string | number;
  network: 'MTN' | 'AIRTEL' | 'BOTH';
  mobile_money_number: string;
  receiver_name: string;
  status: 'active' | 'inactive';
  daily_receiving_limit: number;
  amount_received_today: number;
  rotation_duration_minutes?: number;
  created_at: string;
  last_rotated_at: string;
}

export interface DepositLog {
  id: string | number;
  user_id: string;
  transaction_id?: string;
  mobile_money_number: string;
  amount: number;
  status: 'pending' | 'api_sent' | 'verified' | 'failed';
  receiving_account_id?: string | number;
  receiving_phone?: string;
  receiving_name?: string;
  network: string;
  created_at: string;
  updated_at: string;
}

export interface DepositReceiverNumber {
  id: string;
  phone_number: string; // e.g. "0741032838"
  account_name: string; // e.g. "SULAINH NAKASEETA"
  carrier: NetworkCarrier; // 'MTN' | 'AIRTEL' | 'BOTH'
  is_active: boolean;
  priority: number;
  daily_limit_ugx?: number;
  daily_receiving_limit?: number;
  amount_received_today?: number;
  total_received_ugx: number;
  total_transactions_count: number;
  rotation_duration_minutes: number; // 5 minutes default
  rotation_duration_hours?: number;
  activated_at?: string; // ISO date string
  last_rotated_at?: string;
  notes?: string;
  created_at: string;
}

export interface DepositRotationConfig {
  mode: 'ROUND_ROBIN' | 'TIME_BASED' | 'ADMIN_MANUAL';
  time_interval_minutes: number; // 5 minutes default
  time_interval_hours?: number;
  auto_rotate_enabled: boolean;
  current_active_id: string;
  last_rotated_at: string;
  next_rotation_at: string;
  rotation_history?: {
    id: string;
    number_id: string;
    phone_number: string;
    account_name: string;
    reason: string;
    timestamp: string;
  }[];
}

