import mongoose from 'mongoose';
import InvestmentLockModel from '../models/InvestmentLock';
import UserModel from '../models/User';

export function initAutomationWorker() {
  console.log('[Automation Worker] Started power rig lock monitor service');
  
  // Interval check every 30 seconds
  setInterval(async () => {
    try {
      if (mongoose.connection.readyState !== 1) {
        // Skip check cycle if database is not actively connected
        return;
      }
      if (!InvestmentLockModel || typeof InvestmentLockModel.find !== 'function') return;
      const now = new Date();
      const expiredLocks = await (InvestmentLockModel as any).find({
        status: 'LOCKED',
        endTime: { $lte: now }
      });

      for (const lock of expiredLocks) {
        lock.status = 'COMPLETED';
        await lock.save();

        if (UserModel && typeof UserModel.findById === 'function') {
          const user = await (UserModel as any).findById(lock.userId);
          if (user) {
            user.balance = (user.balance || 0) + lock.amountPaid + lock.rewardAmount;
            await user.save();
            console.log(`[Automation Worker] Unlocked and credited ${lock.amountPaid + lock.rewardAmount} UGX for user ${user._id}`);
          }
        }
      }
    } catch (err) {
      console.error('[Automation Worker] Error in check cycle:', (err as Error).message);
    }
  }, 30000);
}

export default initAutomationWorker;
