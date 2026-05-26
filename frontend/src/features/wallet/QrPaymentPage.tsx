import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { QRCodeSVG } from 'qrcode.react';
import api, { unwrap } from '../../shared/services/api';
import { useToast } from '../../shared/context/ToastContext';
import { getApiErrorMessage } from '../../shared/utils/apiError';
import { SubPageShell } from '../../shared/components/Layout/SubPageShell';
import { Button } from '../../shared/components/ui/Button';
import { Input } from '../../shared/components/ui/Input';
import { QrScanner } from '../../shared/components/QrScanner';
import { formatCurrency } from '../../shared/utils/format';
import styles from './FlowPages.module.css';

export function QrPaymentPage() {
  const [tab, setTab] = useState<'pay' | 'receive'>('pay');
  const [qrData, setQrData] = useState('');
  const [amount, setAmount] = useState('');
  const [generatedQr, setGeneratedQr] = useState('');
  const [paying, setPaying] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: wallet } = useQuery({
    queryKey: ['wallet'],
    queryFn: async () => unwrap<{ id: string }>(await api.get('/wallets')),
  });

  const generateQr = async () => {
    const res = await api.get('/qr/generate', { params: amount ? { amount } : {} });
    const data = unwrap<{ qrData: string }>(res);
    setGeneratedQr(data.qrData);
    toast('Đã tạo mã QR nhận tiền', 'success');
  };

  const pay = async () => {
    if (!wallet?.id || !qrData.trim()) {
      toast('Vui lòng quét hoặc dán mã QR', 'error');
      return;
    }
    setPaying(true);
    try {
      const res = await api.post('/transactions/qr-payment', {
        walletId: wallet.id,
        qrData: qrData.trim(),
        amount: amount ? Number(amount) : undefined,
      });
      const data = unwrap<{ newBalance: number; reference: string }>(res);
      toast(`Thanh toán thành công! Số dư: ${formatCurrency(data.newBalance)}`, 'success');
      qc.invalidateQueries({ queryKey: ['wallet'] });
      setQrData('');
      setAmount('');
    } catch (err: unknown) {
      toast(getApiErrorMessage(err, 'QR không hợp lệ'), 'error');
    } finally {
      setPaying(false);
    }
  };

  const downloadQr = () => {
    const svg = qrRef.current?.querySelector('svg');
    if (!svg || !generatedQr) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'hki-qr-payment.svg';
    a.click();
    URL.revokeObjectURL(url);
  };

  const shareQrText = async () => {
    if (!generatedQr) return;
    if (navigator.share) {
      await navigator.share({ title: 'QR thanh toán HKi', text: generatedQr });
    } else {
      await navigator.clipboard.writeText(generatedQr);
      toast('Đã sao chép mã QR', 'success');
    }
  };

  return (
    <SubPageShell title="Thanh toán QR" backTo="/dashboard">
      <div className={styles.tabs}>
        <button type="button" className={`${styles.tab} ${tab === 'pay' ? styles.tabActive : ''}`} onClick={() => setTab('pay')}>
          Quét & Thanh toán
        </button>
        <button type="button" className={`${styles.tab} ${tab === 'receive' ? styles.tabActive : ''}`} onClick={() => setTab('receive')}>
          Tạo QR nhận tiền
        </button>
      </div>

      {tab === 'pay' ? (
        <div className={styles.form}>
          <p className={styles.hint}>Quét QR bằng camera điện thoại hoặc tải ảnh QR lên</p>
          <QrScanner
            onScan={(text) => {
              setQrData(text);
              toast('Đã quét mã QR', 'success');
            }}
            onError={(msg) => toast(msg, 'error')}
          />
          <label className={styles.amountLabel}>Hoặc dán mã QR</label>
          <textarea
            className={styles.select}
            style={{ minHeight: 88, resize: 'vertical' }}
            value={qrData}
            onChange={(e) => setQrData(e.target.value)}
            placeholder="Dán chuỗi QR tại đây..."
          />
          <Input
            label="Số tiền (nếu QR không cố định)"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="VD: 50000"
          />
          <Button onClick={pay} disabled={paying}>
            {paying ? 'Đang thanh toán...' : 'Thanh toán'}
          </Button>
        </div>
      ) : (
        <div className={styles.form}>
          <Input
            label="Số tiền cố định (tùy chọn)"
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Để trống = người trả tự nhập"
          />
          <Button variant="secondary" onClick={generateQr}>
            Tạo mã QR
          </Button>
          {generatedQr && (
            <div className={styles.qrPreview} ref={qrRef}>
              <QRCodeSVG value={generatedQr} size={220} level="M" includeMargin />
              <p className={styles.hint}>Cho người khác quét để chuyển tiền vào ví của bạn</p>
              <div className={styles.quickAmounts}>
                <Button type="button" variant="ghost" onClick={shareQrText}>
                  Sao chép / Chia sẻ
                </Button>
                <Button type="button" variant="ghost" onClick={downloadQr}>
                  Tải ảnh QR
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </SubPageShell>
  );
}
