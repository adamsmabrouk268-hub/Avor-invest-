import mongoose, { Schema, Document } from 'mongoose';

export type PaymentStatus = 'PENDING_ADMIN' | 'PENDING_GATEWAY' | 'CONFIRMED' | 'FAILED';

export interface IPayment extends Document {
  userId: mongoose.Types.ObjectId | string;
  machineId: mongoose.Types.ObjectId | string;
  amount: number;
  phoneNumber: string;
  receiverName: string;
  externalTxRef?: string;
  internalRef: string;
  status: PaymentStatus;
  createdAt?: Date;
  updatedAt?: Date;
}

const paymentSchema = new Schema<IPayment>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  machineId: { type: Schema.Types.ObjectId, ref: 'Machine', required: true },
  amount: { type: Number, required: true },
  phoneNumber: { type: String, required: true },
  receiverName: { type: String, default: 'SULAINH NAKASEETA' },
  externalTxRef: { type: String, unique: true, sparse: true },
  internalRef: { type: String, required: true, unique: true },
  status: { 
    type: String, 
    enum: ['PENDING_ADMIN', 'PENDING_GATEWAY', 'CONFIRMED', 'FAILED'], 
    default: 'PENDING_ADMIN' 
  }
}, { timestamps: true });

export const PaymentModel = mongoose.models.Payment || mongoose.model<IPayment>('Payment', paymentSchema);
export default PaymentModel;
