const mongoose = require('mongoose');

const machineSchema = new mongoose.Schema({
  name: { type: String, required: true },
  series: { type: String, required: true },
  price: { type: Number, required: true },
  rewardAmount: { type: Number, required: true },
  lockDurationMinutes: { type: Number, required: true },
  imageUrl: { type: String, default: '' },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Machine', machineSchema);
