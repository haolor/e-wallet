import { Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { TransactionsService } from './transactions.service';
import { TopupDto } from '../wallets/dto/topup.dto';
import { WithdrawDto } from '../wallets/dto/withdraw.dto';
import { BankTransferDto } from './dto/bank-transfer.dto';

@ApiTags('transactions')
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get()
  history(
    @CurrentUser() user: AuthUser,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @Query('type') type?: string,
    @Query('status') status?: string,
  ) {
    return this.transactionsService.getHistory(user.userId, Number(page), Math.min(Number(limit), 100), type, status);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get(':id')
  getOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.transactionsService.getById(user.userId, id);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('deposit')
  deposit(@CurrentUser() user: AuthUser, @Body() dto: TopupDto) {
    return this.transactionsService.createTopup(user.userId, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('withdraw')
  withdraw(@CurrentUser() user: AuthUser, @Body() dto: WithdrawDto) {
    return this.transactionsService.createWithdraw(user.userId, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('bank-transfer')
  bankTransfer(@CurrentUser() user: AuthUser, @Body() dto: BankTransferDto) {
    return this.transactionsService.createBankTransfer(user.userId, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('qr-payment')
  qrPayment(
    @CurrentUser() user: AuthUser,
    @Body('walletId') walletId: string,
    @Body('qrData') qrData: string,
    @Body('amount') amount?: number,
  ) {
    return this.transactionsService.qrPayment(user.userId, walletId, qrData, amount);
  }

  @Post('webhooks/payment')
  webhook(
    @Body('reference') reference: string,
    @Body('amount') amount: number,
    @Headers('x-webhook-signature') signature?: string,
  ) {
    return this.transactionsService.processTopupWebhook(reference, amount, signature);
  }
}
