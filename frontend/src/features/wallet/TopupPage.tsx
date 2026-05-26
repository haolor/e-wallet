import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api, { unwrap } from '../../shared/services/api';
import { useToast } from '../../shared/context/ToastContext';
import { SubPageShell } from '../../shared/components/Layout/SubPageShell';
import { StepBar } from '../../shared/components/ui/StepBar';
import { Button } from '../../shared/components/ui/Button';
import { IconCopy, IconCheck } from '../../shared/components/ui/Icons';
import { formatCurrency } from '../../shared/utils/format';
import styles from './FlowPages.module.css';

const MOCK_BANK = {
  bankName: 'Ngân hàng TMCP Ngoại thương (Vietcombank)',
  accountNumber: '1023456789',
  accountName: 'CONG TY HKi WALLET',
};

export function TopupPage() {
  const [step, setStep] = useState(0);
  const [amount, setAmount] = useState('');
  const [deposit, setDeposit] = useState<{ paymentCode: string; reference: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const qc = useQueryClient();
  const navigate = useNavigate();

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast(`Đã sao chép ${label}`, 'success');
  };

  const createDeposit = async () => {
    setLoading(true);
    try {
      const res = await api.post('/transactions/deposit', { amount: Number(amount) });
      const data = unwrap<{ paymentCode: string; reference: string }>(res);
      setDeposit({ paymentCode: data.paymentCode, reference: data.reference });
      setStep(1);
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { message?: string } } };
      toast(ax.response?.data?.message || 'Tạo yêu cầu thất bại', 'error');
    } finally {
      setLoading(false);
    }
  };

  const confirmTransferred = async () => {
    if (!deposit) return;
    setLoading(true);
    try {
      const secret = 'change-me-webhook-secret';
      const msg = `${deposit.reference}:${amount}`;
      const enc = new TextEncoder();
      const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const sigBuf = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
      const sig = Array.from(new Uint8Array(sigBuf)).map((b) => b.toString(16).padStart(2, '0')).join('');
      await api.post('/transactions/webhooks/payment', {
        reference: deposit.reference,
        amount: Number(amount),
      }, { headers: { 'x-webhook-signature': sig } });
      setStep(2);
      qc.invalidateQueries({ queryKey: ['wallet'] });
      toast('Nạp tiền thành công!', 'success');
    } catch {
      toast('Chưa nhận được xác nhận. Thử lại sau.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const footer =
    step === 0 ? (
      <Button onClick={createDeposit} disabled={loading || Number(amount) < 10000}>
        {loading ? '...' : 'Tạo mã nạp tiền'}
      </Button>
    ) : step === 1 ? (
      <Button onClick={confirmTransferred} disabled={loading}>
        {loading ? 'Đang kiểm tra...' : 'Tôi đã chuyển khoản'}
      </Button>
    ) : (
      <Button onClick={() => navigate('/dashboard')}>Hoàn tất</Button>
    );

  return (
    <SubPageShell title="Nạp tiền" footer={footer}>
      <StepBar steps={['Số tiền', 'Chuyển khoản', 'Kết quả']} current={step} />

      {step === 0 && (
        <div className={styles.form}>
          <div className={styles.amountSection}>
            <label className={styles.amountLabel}>Số tiền nạp (VND)</label>
            <input
              className={styles.amountInput}
              type="number"
              min={10000}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="100000"
            />
          </div>
          <p className={styles.hint}>Tối thiểu 10.000đ · Tối đa 50.000.000đ</p>
        </div>
      )}

      {step === 1 && deposit && (
        <>
          <span className={`${styles.statusBadge} ${styles.pending}`}>ĐANG CHỜ THANH TOÁN</span>
          <p className={styles.hint}>Chuyển khoản đúng số tiền và nội dung bên dưới</p>
          <div className={styles.bankCard}>
            <div className={styles.bankRow}>
              <span>Ngân hàng</span>
              <strong>{MOCK_BANK.bankName}</strong>
            </div>
            <div className={styles.bankRow}>
              <span>Số tài khoản</span>
              <button type="button" className={styles.copyBtn} onClick={() => copy(MOCK_BANK.accountNumber, 'STK')}>
                {MOCK_BANK.accountNumber} <IconCopy />
              </button>
            </div>
            <div className={styles.bankRow}>
              <span>Chủ tài khoản</span>
              <strong>{MOCK_BANK.accountName}</strong>
            </div>
            <div className={styles.bankRow}>
              <span>Số tiền</span>
              <strong>{formatCurrency(Number(amount))}</strong>
            </div>
            <div className={styles.bankRow}>
              <span>Nội dung CK</span>
              <button type="button" className={styles.copyBtn} onClick={() => copy(deposit.paymentCode, 'mã CK')}>
                {deposit.paymentCode} <IconCopy />
              </button>
            </div>
          </div>
        </>
      )}

      {step === 2 && (
        <div className={styles.success}>
          <IconCheck />
          <span className={`${styles.statusBadge} ${styles.success}`}>NẠP TIỀN THÀNH CÔNG</span>
          <h2>+{formatCurrency(Number(amount))}</h2>
          <p>Đã cộng vào ví của bạn</p>
        </div>
      )}
    </SubPageShell>
  );
}
