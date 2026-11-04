import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  phoneNumber: string;
  name: string;
  balance: number;
  password?: string;
  age?: number;
  country?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

const userSchema = new Schema<IUser>({
  phoneNumber: { type: String, required: true, unique: true },
  name: { type: String, default: 'User' },
  balance: { type: Number, default: 0.0 },
  password: { type: String, required: true },
  age: { type: Number },
  country: { type: String, default: 'Uganda' }
}, { timestamps: true });

export const UserModel = mongoose.models.User || mongoose.model<IUser>('User', userSchema);
export default UserModel;
