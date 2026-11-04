import mongoose, { Schema, Document } from 'mongoose';

export interface ISystemConfig extends Document {
  key: string;
  value: any;
  createdAt?: Date;
  updatedAt?: Date;
}

const systemConfigSchema = new Schema<ISystemConfig>({
  key: { type: String, required: true, unique: true },
  value: { type: Schema.Types.Mixed, required: true }
}, { timestamps: true });

export const SystemConfigModel = mongoose.models.SystemConfig || mongoose.model<ISystemConfig>('SystemConfig', systemConfigSchema);
export default SystemConfigModel;
