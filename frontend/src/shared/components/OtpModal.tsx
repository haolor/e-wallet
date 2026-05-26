import { useEffect, useState } from 'react';
import api from '../services/api';
import { extractResponseData, getApiErrorMessage } from '../utils/apiError';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import styles from './OtpModal.module.css';

interface OtpModalProps {
  open: boolean;
  onClose: () => void;
  onVerified: () => Promise<void>;
  title?: string;
  /** Gửi OTP giao dịch qua email (API backend) */
  transactionOtp?: boolean;
}

export function OtpModal({
  open,
  onClose,
  onVerified,
  title = 'Xác thực OTP',
  transactionOtp = false,
}: OtpModalProps) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [hint, setHint] = useState('Mã OTP đã được gửi tới email của bạn');

  useEffect(() => {
    if (!open || !transactionOtp) return;
    setCode('');
    setError('');
    setDevOtp(null);
    void (async () => {
      try {
        const res = await api.post('/auth/transaction-otp/send');
        const data = extractResponseData<{ devOtp?: string; emailSent?: boolean }>(res);
        if (data.devOtp) {
          setDevOtp(data.devOtp);
          setHint('Chế độ phát triển: SMTP chưa cấu hình — dùng mã OTP bên dưới');
        } else {
          setHint('Mã OTP giao dịch đã gửi tới email của bạn');
        }
      } catch (err: unknown) {
        setError(getApiErrorMessage(err, 'Không gửi được OTP'));
      }
    })();
  }, [open, transactionOtp]);

  const handleVerify = async () => {
    if (code.length !== 6) {
      setError('Nhập đủ 6 số OTP');
      return;
    }
    setLoading(true);
    setError('');
    try {
      if (transactionOtp) {
        await api.post('/auth/transaction-otp/verify', { code });
      }
      await onVerified();
      setCode('');
      setDevOtp(null);
      onClose();
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Mã OTP không đúng'));
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    if (!transactionOtp) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/auth/transaction-otp/send');
      const data = extractResponseData<{ devOtp?: string }>(res);
      setDevOtp(data.devOtp ?? null);
      setHint(data.devOtp ? 'Mã OTP dev đã được tạo lại' : 'OTP đã gửi lại qua email');
    } catch (err: unknown) {
      setError(getApiErrorMessage(err, 'Không gửi lại được OTP'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className={styles.hint}>{hint}</p>
      {devOtp && (
        <p className={styles.devOtp}>
          Mã OTP (dev): <strong>{devOtp}</strong>
        </p>
      )}
      <Input
        label="Mã OTP"
        value={code}
        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
        placeholder="000000"
        maxLength={6}
        error={error}
      />
      <div className={styles.actions}>
        {transactionOtp && (
          <Button variant="ghost" onClick={resend} disabled={loading}>
            Gửi lại
          </Button>
        )}
        <Button variant="ghost" onClick={onClose}>
          Hủy
        </Button>
        <Button onClick={handleVerify} disabled={loading}>
          {loading ? 'Đang xác minh...' : 'Xác nhận'}
        </Button>
      </div>
    </Modal>
  );
}
