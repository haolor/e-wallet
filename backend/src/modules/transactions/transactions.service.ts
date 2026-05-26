import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, Model, Types } from 'mongoose';
import { createHmac } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { BusinessException } from '../../common/exceptions/business.exception';
import { ErrorCodes } from '../../common/constants/error-codes';
import { RedisService } from '../../common/redis/redis.service';
import { Wallet, WalletDocument } from '../wallets/schemas/wallet.schema';
import { User, UserDocument } from '../users/schemas/user.schema';
import {
  Transaction,
  TransactionDocument,
  TransactionStatus,
  TransactionType,
} from './schemas/transaction.schema';
import { TopupDto } from '../wallets/dto/topup.dto';
import { WithdrawDto } from '../wallets/dto/withdraw.dto';
import { BankTransferDto } from './dto/bank-transfer.dto';
import { NotificationGateway } from '../../gateways/notification.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditLog, AuditLogDocument } from '../../common/schemas/audit-log.schema';
import { BankService } from '../bank/bank.service';
import { AuthService } from '../auth/auth.service';

@Injectable()
export class TransactionsService {
  constructor(
    @InjectModel(Transaction.name) private transactionModel: Model<TransactionDocument>,
    @InjectModel(Wallet.name) private walletModel: Model<WalletDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(AuditLog.name) private auditModel: Model<AuditLogDocument>,
    @InjectConnection() private connection: Connection,
    private redisService: RedisService,
    private notificationGateway: NotificationGateway,
    private notificationsService: NotificationsService,
    private bankService: BankService,
    private authService: AuthService,
  ) {}

  async getHistory(userId: string, page = 1, limit = 20, type?: string, status?: string) {
    const filter: Record<string, unknown> = { userId: new Types.ObjectId(userId) };
    if (type) filter.type = type;
    if (status) filter.status = status;
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.transactionModel.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      this.transactionModel.countDocuments(filter),
    ]);
    return { items, total, page, limit };
  }

  async getById(userId: string, id: string) {
    const tx = await this.transactionModel.findOne({
      _id: id,
      userId: new Types.ObjectId(userId),
    });
    if (!tx) {
      throw new BusinessException('Giao dịch không tồn tại', ErrorCodes.TRANSACTION_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    return tx;
  }

  async createTopup(userId: string, dto: TopupDto) {
    const wallet = await this.walletModel.findOne({ userId: new Types.ObjectId(userId), isActive: true });
    if (!wallet) {
      throw new BusinessException('Không tìm thấy ví', ErrorCodes.WALLET_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    const reference = `TOP-${uuidv4()}`;
    const tx = await this.transactionModel.create({
      reference,
      type: TransactionType.DEPOSIT,
      status: TransactionStatus.PENDING,
      userId: wallet.userId,
      toWalletId: wallet._id,
      amount: dto.amount,
      metadata: { paymentCode: reference },
    });
    return {
      transactionId: tx._id,
      reference,
      amount: dto.amount,
      paymentCode: reference,
      message: 'Vui lòng chuyển khoản với mã tham chiếu trên. Số dư sẽ cập nhật sau khi xác nhận.',
    };
  }

  async processTopupWebhook(reference: string, amount: number, signature?: string) {
    const secret = process.env.WEBHOOK_SECRET || 'dev-webhook';
    if (signature) {
      const expected = createHmac('sha256', secret).update(`${reference}:${amount}`).digest('hex');
      if (signature !== expected) {
        throw new BusinessException('Chữ ký webhook không hợp lệ', ErrorCodes.FORBIDDEN, HttpStatus.FORBIDDEN);
      }
    }

    const idemKey = `webhook:${reference}`;
    if (await this.redisService.exists(idemKey)) {
      return { message: 'Webhook đã xử lý' };
    }

    const tx = await this.transactionModel.findOne({ reference, type: TransactionType.DEPOSIT });
    if (!tx || tx.status === TransactionStatus.SUCCESS) {
      return { message: 'Giao dịch không tồn tại hoặc đã xử lý' };
    }

    const session = await this.connection.startSession();
    session.startTransaction();
    try {
      await this.walletModel.findByIdAndUpdate(
        tx.toWalletId,
        { $inc: { balance: amount } },
        { session },
      );
      tx.status = TransactionStatus.SUCCESS;
      tx.amount = amount;
      await tx.save({ session });
      await session.commitTransaction();
      await this.redisService.set(idemKey, '1', 86400);

      const wallet = await this.walletModel.findById(tx.toWalletId);
      const userId = tx.userId.toString();
      this.notificationGateway.emitBalanceUpdated(userId, wallet?.balance ?? 0);
      await this.notificationsService.create(userId, 'Nạp tiền thành công', `Số dư +${amount.toLocaleString('vi-VN')}đ`, 'topup');
      await this.auditModel.create({ userId: tx.userId, action: 'TOPUP_SUCCESS', resource: 'transaction', metadata: { reference } });
      return { message: 'Nạp tiền thành công', reference };
    } catch (e) {
      await session.abortTransaction();
      throw e;
    } finally {
      session.endSession();
    }
  }

  async createBankTransfer(userId: string, dto: BankTransferDto) {
    await this.authService.assertTransactionOtp(userId, dto.amount, dto.otpCode);

    const wallet = await this.walletModel.findOne({ userId: new Types.ObjectId(userId), isActive: true });
    if (!wallet) {
      throw new BusinessException('Không tìm thấy ví', ErrorCodes.WALLET_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    if (wallet.balance < dto.amount) {
      throw new BusinessException('Số dư không đủ', ErrorCodes.INSUFFICIENT_BALANCE, HttpStatus.BAD_REQUEST);
    }

    const bank = await this.bankService.resolveTransferAccount(userId, dto);
    const reference = `BTX-${uuidv4()}`;
    const session = await this.connection.startSession();
    session.startTransaction();
    try {
      await this.walletModel.findByIdAndUpdate(wallet._id, { $inc: { balance: -dto.amount } }, { session });
      const [tx] = await this.transactionModel.create(
        [
          {
            reference,
            type: TransactionType.BANK_TRANSFER,
            status: TransactionStatus.PROCESSING,
            userId: wallet.userId,
            fromWalletId: wallet._id,
            amount: dto.amount,
            description: dto.description,
            metadata: {
              bankCode: bank.bankCode,
              bankName: bank.bankName,
              accountNumber: `****${bank.accountNumber.slice(-4)}`,
              accountName: bank.accountName,
              ...(bank.bankAccountId ? { bankAccountId: bank.bankAccountId } : {}),
            },
          },
        ],
        { session },
      );
      await session.commitTransaction();
      const updated = await this.walletModel.findById(wallet._id);
      this.notificationGateway.emitBalanceUpdated(userId, updated?.balance ?? 0);
      await this.notificationsService.create(
        userId,
        'Chuyển ngân hàng đã gửi',
        `Đang xử lý chuyển ${dto.amount.toLocaleString('vi-VN')}đ tới ${bank.bankName}`,
        'transfer',
      );
      return {
        transactionId: tx._id,
        reference,
        amount: dto.amount,
        status: 'PROCESSING',
        bankName: bank.bankName,
        accountNumberMasked: `****${bank.accountNumber.slice(-4)}`,
        newBalance: updated?.balance,
      };
    } catch (e) {
      await session.abortTransaction();
      throw e;
    } finally {
      session.endSession();
    }
  }

  async createWithdraw(userId: string, dto: WithdrawDto) {
    const wallet = await this.walletModel.findOne({ userId: new Types.ObjectId(userId), isActive: true });
    if (!wallet) {
      throw new BusinessException('Không tìm thấy ví', ErrorCodes.WALLET_NOT_FOUND, HttpStatus.NOT_FOUND);
    }
    if (wallet.balance < dto.amount) {
      throw new BusinessException('Số dư không đủ', ErrorCodes.INSUFFICIENT_BALANCE, HttpStatus.BAD_REQUEST);
    }

    const reference = `WDR-${uuidv4()}`;
    const session = await this.connection.startSession();
    session.startTransaction();
    try {
      await this.walletModel.findByIdAndUpdate(wallet._id, { $inc: { balance: -dto.amount } }, { session });
      const [tx] = await this.transactionModel.create(
        [
          {
            reference,
            type: TransactionType.WITHDRAW,
            status: TransactionStatus.PENDING,
            userId: wallet.userId,
            fromWalletId: wallet._id,
            amount: dto.amount,
            metadata: { bankAccountId: dto.bankAccountId },
          },
        ],
        { session },
      );
      await session.commitTransaction();
      await this.auditModel.create({ userId: wallet.userId, action: 'WITHDRAW_REQUEST', resource: 'transaction', metadata: { reference } });
      return { transactionId: tx._id, reference, amount: dto.amount, status: 'PENDING' };
    } catch (e) {
      await session.abortTransaction();
      throw e;
    } finally {
      session.endSession();
    }
  }

  async approveWithdraw(transactionId: string, approve: boolean, adminId: string) {
    const tx = await this.transactionModel.findById(transactionId);
    if (!tx || tx.type !== TransactionType.WITHDRAW || tx.status !== TransactionStatus.PENDING) {
      throw new BusinessException('Giao dịch không hợp lệ', ErrorCodes.NOT_FOUND, HttpStatus.NOT_FOUND);
    }

    if (approve) {
      tx.status = TransactionStatus.SUCCESS;
      await tx.save();
      await this.notificationsService.create(
        tx.userId.toString(),
        'Rút tiền thành công',
        `Yêu cầu rút ${tx.amount.toLocaleString('vi-VN')}đ đã được duyệt`,
        'withdraw',
      );
    } else {
      const session = await this.connection.startSession();
      session.startTransaction();
      try {
        await this.walletModel.findByIdAndUpdate(tx.fromWalletId, { $inc: { balance: tx.amount } }, { session });
        tx.status = TransactionStatus.CANCELLED;
        await tx.save({ session });
        await session.commitTransaction();
        const wallet = await this.walletModel.findById(tx.fromWalletId);
        this.notificationGateway.emitBalanceUpdated(tx.userId.toString(), wallet?.balance ?? 0);
        await this.notificationsService.create(
          tx.userId.toString(),
          'Rút tiền bị từ chối',
          `Yêu cầu rút ${tx.amount.toLocaleString('vi-VN')}đ đã bị từ chối, tiền đã hoàn vào ví`,
          'withdraw',
        );
      } catch (e) {
        await session.abortTransaction();
        throw e;
      } finally {
        session.endSession();
      }
    }
    await this.auditModel.create({
      userId: new Types.ObjectId(adminId),
      action: approve ? 'WITHDRAW_APPROVE' : 'WITHDRAW_REJECT',
      resource: 'transaction',
      metadata: { transactionId },
    });
    return { message: approve ? 'Đã duyệt rút tiền' : 'Đã từ chối và hoàn tiền' };
  }

  async qrPayment(userId: string, walletId: string, qrData: string, amount?: number) {
    const parsed = this.parseQr(qrData);
    const payAmount = amount ?? parsed.amount;
    if (!payAmount || payAmount < 1000) {
      throw new BusinessException('Số tiền không hợp lệ', ErrorCodes.VALIDATION_ERROR);
    }

    const fromWallet = await this.walletModel.findOne({ _id: walletId, userId: new Types.ObjectId(userId) });
    if (!fromWallet) throw new BusinessException('Không tìm thấy ví', ErrorCodes.WALLET_NOT_FOUND, HttpStatus.NOT_FOUND);

    const recipient = await this.userModel.findOne({ email: parsed.merchantEmail?.toLowerCase() });
    if (!recipient) throw new BusinessException('QR không hợp lệ', ErrorCodes.INVALID_QR);

    const toWallet = await this.walletModel.findOne({ userId: recipient._id });
    if (!toWallet) throw new BusinessException('Ví merchant không tồn tại', ErrorCodes.WALLET_NOT_FOUND, HttpStatus.NOT_FOUND);
    if (fromWallet.balance < payAmount) {
      throw new BusinessException('Số dư không đủ', ErrorCodes.INSUFFICIENT_BALANCE);
    }

    const reference = `QR-${uuidv4()}`;
    const session = await this.connection.startSession();
    session.startTransaction();
    try {
      await this.walletModel.findByIdAndUpdate(fromWallet._id, { $inc: { balance: -payAmount } }, { session });
      await this.walletModel.findByIdAndUpdate(toWallet._id, { $inc: { balance: payAmount } }, { session });
      const [tx] = await this.transactionModel.create(
        [
          {
            reference,
            type: TransactionType.PAYMENT,
            status: TransactionStatus.SUCCESS,
            userId: fromWallet.userId,
            fromWalletId: fromWallet._id,
            toWalletId: toWallet._id,
            amount: payAmount,
            metadata: { qrMerchant: parsed.merchantEmail },
          },
        ],
        { session },
      );
      await session.commitTransaction();
      const updated = await this.walletModel.findById(fromWallet._id);
      this.notificationGateway.emitBalanceUpdated(userId, updated?.balance ?? 0);
      return { transactionId: tx._id, reference, amount: payAmount, newBalance: updated?.balance };
    } catch (e) {
      await session.abortTransaction();
      throw e;
    } finally {
      session.endSession();
    }
  }

  generateQr(userId: string, amount?: number) {
    const user = this.userModel.findById(userId);
    return user.then((u) => {
      if (!u) throw new BusinessException('User không tồn tại', ErrorCodes.NOT_FOUND, HttpStatus.NOT_FOUND);
      const payload = JSON.stringify({ merchantEmail: u.email, amount: amount ?? null });
      const sig = createHmac('sha256', process.env.QR_HMAC_SECRET || 'dev-qr').update(payload).digest('hex');
      return { qrData: Buffer.from(JSON.stringify({ payload, sig })).toString('base64') };
    });
  }

  private parseQr(qrData: string) {
    try {
      const decoded = JSON.parse(Buffer.from(qrData, 'base64').toString());
      const inner = JSON.parse(decoded.payload);
      const expected = createHmac('sha256', process.env.QR_HMAC_SECRET || 'dev-qr')
        .update(decoded.payload)
        .digest('hex');
      if (decoded.sig !== expected) {
        throw new BusinessException('QR không hợp lệ', ErrorCodes.INVALID_QR);
      }
      return inner as { merchantEmail: string; amount?: number };
    } catch {
      throw new BusinessException('QR không hợp lệ', ErrorCodes.INVALID_QR);
    }
  }
}
