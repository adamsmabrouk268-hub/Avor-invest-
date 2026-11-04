const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  phoneNumber: { type: String, required: true, unique: true }, // e.g. 256741032838
  name: { type: String, default: 'User' },
  balance: { type: Number, default: 0.0 },
  password: { type: String, required: true }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
