const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  machineId: { type: mongoose.Schema.Types.ObjectId, ref: 'Machine', required: true },
  amount: { type: Number, required: true },
  phoneNumber: { type: String, required: true }, // Destination: 0741032838
  receiverName: { type: String, default: 'SULAINH NAKASEETA' },
  externalTxRef: { type: String, unique: true, sparse: true },
  internalRef: { type: String, required: true, unique: true },
  status: { 
    type: String, 
    enum: ['PENDING_ADMIN', 'PENDING_GATEWAY', 'CONFIRMED', 'FAILED'], 
    default: 'PENDING_ADMIN' 
  }
}, { timestamps: true });

module.exports = mongoose.model('Payment', paymentSchema);
