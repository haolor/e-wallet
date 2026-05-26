import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import { Model, Types } from 'mongoose';
import { BusinessException } from '../../common/exceptions/business.exception';
import { ErrorCodes } from '../../common/constants/error-codes';
import { BankAccount, BankAccountDocument } from './schemas/bank-account.schema';

@Injectable()
export class BankService {
  private readonly key = scryptSync(process.env.COOKIE_SECRET || 'dev-key', 'salt', 32);

  constructor(@InjectModel(BankAccount.name) private bankModel: Model<BankAccountDocument>) {}

  private encrypt(text: string): string {
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-ctr', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(text), cipher.final()]);
    return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
  }

  private decrypt(hash: string): string {
    const [ivHex, dataHex] = hash.split(':');
    const decipher = createDecipheriv('aes-256-ctr', this.key, Buffer.from(ivHex, 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString();
  }

  async addAccount(userId: string, dto: { bankCode: string; bankName: string; accountNumber: string; accountName: string }) {
    const account = await this.bankModel.create({
      userId: new Types.ObjectId(userId),
      bankCode: dto.bankCode,
      bankName: dto.bankName,
      accountNumber: this.encrypt(dto.accountNumber),
      accountName: dto.accountName,
    });
    return { id: account._id, bankName: account.bankName, accountName: account.accountName, isVerified: false };
  }

  async list(userId: string) {
    const accounts = await this.bankModel.find({ userId: new Types.ObjectId(userId), isActive: true });
    return accounts.map((a) => ({
      id: a._id,
      bankCode: a.bankCode,
      bankName: a.bankName,
      accountName: a.accountName,
      accountNumberMasked: `****${this.decrypt(a.accountNumber).slice(-4)}`,
      isVerified: a.isVerified,
    }));
  }

  async verify(userId: string, accountId: string) {
    const account = await this.bankModel.findOne({ _id: accountId, userId: new Types.ObjectId(userId) });
    if (!account) throw new BusinessException('Tài khoản không tồn tại', ErrorCodes.NOT_FOUND, HttpStatus.NOT_FOUND);
    account.isVerified = true;
    await account.save();
    return { message: 'Xác minh tài khoản ngân hàng thành công (mock)' };
  }

  async remove(userId: string, accountId: string) {
    await this.bankModel.findOneAndUpdate(
      { _id: accountId, userId: new Types.ObjectId(userId) },
      { isActive: false },
    );
    return { message: 'Đã xóa tài khoản ngân hàng' };
  }

  async resolveTransferAccount(
    userId: string,
    dto: { bankAccountId?: string; bankCode?: string; bankName?: string; accountNumber?: string; accountName?: string },
  ) {
    if (dto.bankAccountId) {
      const account = await this.bankModel.findOne({
        _id: dto.bankAccountId,
        userId: new Types.ObjectId(userId),
        isActive: true,
      });
      if (!account) {
        throw new BusinessException('Tài khoản ngân hàng không tồn tại', ErrorCodes.NOT_FOUND, HttpStatus.NOT_FOUND);
      }
      return {
        bankCode: account.bankCode,
        bankName: account.bankName,
        accountNumber: this.decrypt(account.accountNumber),
        accountName: account.accountName,
        bankAccountId: account._id.toString(),
      };
    }
    if (!dto.bankCode || !dto.bankName || !dto.accountNumber || !dto.accountName) {
      throw new BusinessException(
        'Vui lòng chọn ngân hàng và nhập đầy đủ số tài khoản, tên chủ tài khoản',
        ErrorCodes.VALIDATION_ERROR,
      );
    }
    return {
      bankCode: dto.bankCode,
      bankName: dto.bankName,
      accountNumber: dto.accountNumber,
      accountName: dto.accountName,
    };
  }
}
