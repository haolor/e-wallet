import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private transporter: Transporter | null = null;

  constructor(private readonly config: ConfigService) {}

  private getTransporter(): Transporter | null {
    if (this.transporter) return this.transporter;

    const host = this.config.get<string>('SMTP_HOST');
    const port = Number(this.config.get<string>('SMTP_PORT') || 587);
    const user = this.config.get<string>('SMTP_USER');
    const pass = this.config.get<string>('SMTP_PASS');

    if (!host || !user || !pass) return null;

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
    return this.transporter;
  }

  async sendOtpEmail(params: {
    to: string;
    code: string;
    purpose: 'email_verify' | 'password_reset' | 'transaction';
  }) {
    const transporter = this.getTransporter();
    const from = this.config.get<string>('SMTP_FROM') || this.config.get<string>('SMTP_USER') || 'no-reply@hki-wallet.local';

    if (!transporter) {
      this.logger.warn(`SMTP not configured. Skipping email to ${params.to}.`);
      return { sent: false as const };
    }

    const subject =
      params.purpose === 'password_reset'
        ? 'Mã OTP đặt lại mật khẩu'
        : params.purpose === 'transaction'
          ? 'Mã OTP xác thực giao dịch'
          : 'Mã OTP xác minh email';
    const title =
      params.purpose === 'password_reset'
        ? 'Đặt lại mật khẩu'
        : params.purpose === 'transaction'
          ? 'Xác thực giao dịch'
          : 'Xác minh email';

    try {
      await transporter.sendMail({
        from,
        to: params.to,
        subject,
        text: `${title}\n\nMã OTP của bạn là: ${params.code}\nMã có hiệu lực trong 10 phút.\n\nNếu bạn không yêu cầu thao tác này, vui lòng bỏ qua email.`,
        html: `
          <div style="font-family:Arial,Helvetica,sans-serif;line-height:1.6;color:#111;">
            <h2 style="margin:0 0 12px;">${title}</h2>
            <p style="margin:0 0 12px;">Mã OTP của bạn là:</p>
            <div style="font-size:28px;font-weight:800;letter-spacing:6px;background:#f5f5f5;padding:14px 16px;border-radius:12px;display:inline-block;">
              ${params.code}
            </div>
            <p style="margin:12px 0 0;color:#555;">Mã có hiệu lực trong <b>10 phút</b>.</p>
            <p style="margin:16px 0 0;color:#777;font-size:13px;">Nếu bạn không yêu cầu thao tác này, vui lòng bỏ qua email.</p>
          </div>
        `,
      });
      return { sent: true as const };
    } catch (err) {
      this.logger.error(`Failed to send OTP email to ${params.to}`, err);
      return { sent: false as const };
    }
  }
}

