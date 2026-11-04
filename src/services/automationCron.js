const mongoose = require('mongoose');
const InvestmentLock = require('../models/InvestmentLock');
const User = require('../models/User');

function initAutomationWorker() {
  console.log('[Automation Worker] Started power rig lock monitor service');
  
  // Interval check every 30 seconds
  setInterval(async () => {
    try {
      if (mongoose.connection.readyState !== 1) {
        // Skip check cycle if database is not actively connected
        return;
      }
      if (!InvestmentLock || typeof InvestmentLock.find !== 'function') return;
      const now = new Date();
      const expiredLocks = await InvestmentLock.find({
        status: 'LOCKED',
        endTime: { $lte: now }
      });

      for (const lock of expiredLocks) {
        lock.status = 'COMPLETED';
        await lock.save();

        if (User && typeof User.findById === 'function') {
          const user = await User.findById(lock.userId);
          if (user) {
            user.balance = (user.balance || 0) + lock.amountPaid + lock.rewardAmount;
            await user.save();
            console.log(`[Automation Worker] Unlocked and credited ${lock.amountPaid + lock.rewardAmount} UGX for user ${user._id}`);
          }
        }
      }
    } catch (err) {
      console.error('[Automation Worker] Error in check cycle:', err.message);
    }
  }, 30000);
}

module.exports = initAutomationWorker;
