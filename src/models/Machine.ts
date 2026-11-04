import mongoose, { Schema, Document } from 'mongoose';

export interface IMachine extends Document {
  name: string;
  series: string;
  price: number;
  rewardAmount: number;
  lockDurationMinutes: number;
  imageUrl?: string;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

const machineSchema = new Schema<IMachine>({
  name: { type: String, required: true },
  series: { type: String, required: true },
  price: { type: Number, required: true },
  rewardAmount: { type: Number, required: true },
  lockDurationMinutes: { type: Number, required: true },
  imageUrl: { type: String, default: '' },
  isActive: { type: Boolean, default: true }
}, { timestamps: true });

export const MachineModel = mongoose.models.Machine || mongoose.model<IMachine>('Machine', machineSchema);
export default MachineModel;
