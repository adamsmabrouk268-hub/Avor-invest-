const mongoose = require('mongoose');

const investmentLockSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  machineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Machine', required: true },
  amountPaid: { type: Number, required: true },
  rewardAmount: { type: Number, required: true },
  startTime: { type: Date, required: true },
  endTime: { type: Date, required: true },
  status: { type: String, enum: ['LOCKED', 'COMPLETED', 'CANCELLED'], default: 'LOCKED' }
}, { timestamps: true });

module.exports = mongoose.model('InvestmentLock', investmentLockSchema);
