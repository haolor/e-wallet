import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import api, { unwrap } from '../../shared/services/api';
import { useToast } from '../../shared/context/ToastContext';
import { SubPageShell } from '../../shared/components/Layout/SubPageShell';
import { StepBar } from '../../shared/components/ui/StepBar';
import { Button } from '../../shared/components/ui/Button';
import { IconCheck } from '../../shared/components/ui/Icons';
import { formatCurrency } from '../../shared/utils/format';
import styles from './FlowPages.module.css';

export function WithdrawPage() {
  const [step, setStep] = useState(0);
  const [amount, setAmount] = useState('');
  const [bankId, setBankId] = useState('');
  const [reference, setReference] = useState('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const { data: wallet } = useQuery({
    queryKey: ['wallet'],
    queryFn: async () => unwrap<{ balance: number }>(await api.get('/wallets')),
  });

  const { data: banks } = useQuery({
    queryKey: ['banks'],
    queryFn: async () =>
      unwrap<Array<{ id: string; bankName: string; accountNumberMasked: string; isVerified: boolean }>>(
        await api.get('/bank-accounts'),
      ),
  });

  const submit = async () => {
    setLoading(true);
    try {
      const res = await api.post('/transactions/withdraw', {
        amount: Number(amount),
        bankAccountId: bankId || undefined,
      });
      const data = unwrap<{ reference: string }>(res);
      setReference(data.reference);
      setStep(2);
      toast('Yêu cầu rút tiền đã gửi', 'success');
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { message?: string } } };
      toast(ax.response?.data?.message || 'Rút tiền thất bại', 'error');
    } finally {
      setLoading(false);
    }
  };

  const footer =
    step === 0 ? (
      <Button onClick={() => setStep(1)} disabled={!amount || Number(amount) < 10000}>
        Tiếp tục
      </Button>
    ) : step === 1 ? (
      <Button onClick={submit} disabled={loading}>
        {loading ? '...' : 'Xác nhận rút tiền'}
      </Button>
    ) : null;

  return (
    <SubPageShell title="Rút tiền" footer={footer}>
      <StepBar steps={['Thông tin', 'Xác nhận', 'Hoàn tất']} current={step} />

      {step === 0 && (
        <div className={styles.form}>
          <div className={styles.amountSection}>
            <label className={styles.amountLabel}>Số tiền rút</label>
            <input
              className={styles.amountInput}
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min={10000}
            />
          </div>
          <p className={styles.hint}>Khả dụng: {formatCurrency(wallet?.balance ?? 0)}</p>
          <label className={styles.amountLabel}>Tài khoản nhận</label>
          {banks?.length ? (
            banks.map((b) => (
              <button
                key={b.id}
                type="button"
                className={`${styles.chip} ${bankId === b.id ? styles.tabActive : ''}`}
                style={{ width: '100%', marginBottom: 8, textAlign: 'left', padding: 12 }}
                onClick={() => setBankId(b.id)}
              >
                {b.bankName} · {b.accountNumberMasked}
              </button>
            ))
          ) : (
            <p className={styles.hint}>
              Chưa liên kết ngân hàng. <Link to="/profile">Thêm tài khoản</Link>
            </p>
          )}
          <p className={styles.hint}>Thời gian xử lý dự kiến: 1–2 ngày làm việc (cần admin duyệt)</p>
        </div>
      )}

      {step === 1 && (
        <div className={styles.confirmCard}>
          <div className={styles.confirmRow}>
            <span>Số tiền rút</span>
            <strong className={styles.amountHighlight}>{formatCurrency(Number(amount))}</strong>
          </div>
          <div className={styles.confirmRow}>
            <span>Phí</span>
            <strong>0đ</strong>
          </div>
          <div className={styles.confirmRow}>
            <span>Trạng thái</span>
            <strong>Chờ duyệt</strong>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className={styles.success}>
          <IconCheck />
          <span className={`${styles.statusBadge} ${styles.pending}`}>CHỜ DUYỆT</span>
          <h2>Yêu cầu đã gửi</h2>
          <code className={styles.refCode}>{reference}</code>
          <p className={styles.hint}>Admin sẽ duyệt trong thời gian sớm nhất. Bạn sẽ nhận thông báo khi hoàn tất.</p>
        </div>
      )}
    </SubPageShell>
  );
}
