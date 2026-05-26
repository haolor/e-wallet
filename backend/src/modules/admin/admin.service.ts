import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../users/schemas/user.schema';
import {
  Transaction,
  TransactionDocument,
  TransactionStatus,
  TransactionType,
} from '../transactions/schemas/transaction.schema';
import { TransactionsService } from '../transactions/transactions.service';

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Transaction.name) private transactionModel: Model<TransactionDocument>,
    private transactionsService: TransactionsService,
  ) {}

  async listUsers(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.userModel.find().select('-passwordHash').skip(skip).limit(limit).lean(),
      this.userModel.countDocuments(),
    ]);
    return { items, total, page, limit };
  }

  async banUser(userId: string) {
    await this.userModel.findByIdAndUpdate(userId, { isActive: false });
    return { message: 'Đã khóa tài khoản' };
  }

  async pendingApprovals() {
    return this.transactionModel
      .find({ type: TransactionType.WITHDRAW, status: TransactionStatus.PENDING })
      .sort({ createdAt: -1 })
      .lean();
  }

  async approveTransaction(transactionId: string, approve: boolean, adminId: string) {
    return this.transactionsService.approveWithdraw(transactionId, approve, adminId);
  }

  async analytics() {
    const [userCount, txCount, pendingWithdraw] = await Promise.all([
      this.userModel.countDocuments({ isActive: true }),
      this.transactionModel.countDocuments({ status: TransactionStatus.SUCCESS }),
      this.transactionModel.countDocuments({
        type: TransactionType.WITHDRAW,
        status: TransactionStatus.PENDING,
      }),
    ]);
    return { userCount, txCount, pendingWithdraw };
  }
}
