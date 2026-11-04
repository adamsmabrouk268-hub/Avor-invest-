import mongoose, { Schema, Document } from 'mongoose';

export type LockStatus = 'LOCKED' | 'COMPLETED' | 'CANCELLED';

export interface IInvestmentLock extends Document {
  userId: mongoose.Types.ObjectId | string;
  machineId: mongoose.Types.ObjectId | string;
  amountPaid: number;
  rewardAmount: number;
  startTime: Date;
  endTime: Date;
  status: LockStatus;
  createdAt?: Date;
  updatedAt?: Date;
}

const investmentLockSchema = new Schema<IInvestmentLock>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  machineId: { type: Schema.Types.ObjectId, ref: 'Machine', required: true },
  amountPaid: { type: Number, required: true },
  rewardAmount: { type: Number, required: true },
  startTime: { type: Date, required: true },
  endTime: { type: Date, required: true },
  status: { type: String, enum: ['LOCKED', 'COMPLETED', 'CANCELLED'], default: 'LOCKED' }
}, { timestamps: true });

export const InvestmentLockModel = mongoose.models.InvestmentLock || mongoose.model<IInvestmentLock>('InvestmentLock', investmentLockSchema);
export default InvestmentLockModel;
