import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import api, { unwrap } from '../../shared/services/api';
import { AppHeader } from '../../shared/components/Layout/AppHeader';
import { TransactionList, type TransactionItem } from '../../shared/components/TransactionList/TransactionList';
import { Modal } from '../../shared/components/ui/Modal';
import { Button } from '../../shared/components/ui/Button';
import { TX_TYPE_LABELS, TX_STATUS_LABELS, formatCurrency, formatDate } from '../../shared/utils/format';
import styles from './HistoryPage.module.css';

const FILTERS = [
  { value: '', label: 'Tất cả' },
  { value: 'TRANSFER', label: 'Chuyển' },
  { value: 'DEPOSIT', label: 'Nạp' },
  { value: 'WITHDRAW', label: 'Rút' },
  { value: 'PAYMENT', label: 'QR' },
];

export function HistoryPage() {
  const [page, setPage] = useState(1);
  const [type, setType] = useState('');
  const [selected, setSelected] = useState<TransactionItem | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['transactions', page, type],
    queryFn: async () => {
      const res = await api.get('/transactions', {
        params: { page, limit: 20, ...(type && { type }) },
      });
      return unwrap<{
        items: TransactionItem[];
        total: number;
      }>(res);
    },
  });

  return (
    <>
      <AppHeader variant="sub" title="Lịch sử giao dịch" />
      <div className={styles.page}>
        <div className={styles.filters}>
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              className={`${styles.chip} ${type === f.value ? styles.chipActive : ''}`}
              onClick={() => { setType(f.value); setPage(1); }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {isLoading && <p className={styles.loading}>Đang tải...</p>}
        <TransactionList
          items={data?.items ?? []}
          showViewAll={false}
          onItemClick={setSelected}
        />

        <div className={styles.pagination}>
          <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Trước
          </Button>
          <span>Trang {page}</span>
          <Button variant="ghost" size="sm" disabled={(data?.items.length ?? 0) < 20} onClick={() => setPage((p) => p + 1)}>
            Sau
          </Button>
        </div>
      </div>

      <Modal open={!!selected} onClose={() => setSelected(null)} title="Chi tiết giao dịch">
        {selected && (
          <div className={styles.detail}>
            <div className={styles.detailRow}>
              <span>Loại</span>
              <strong>{TX_TYPE_LABELS[selected.type] ?? selected.type}</strong>
            </div>
            <div className={styles.detailRow}>
              <span>Số tiền</span>
              <strong>{formatCurrency(selected.amount)}</strong>
            </div>
            <div className={styles.detailRow}>
              <span>Trạng thái</span>
              <strong>{TX_STATUS_LABELS[selected.status] ?? selected.status}</strong>
            </div>
            <div className={styles.detailRow}>
              <span>Mã GD</span>
              <code>{selected.reference}</code>
            </div>
            <div className={styles.detailRow}>
              <span>Thời gian</span>
              <strong>{formatDate(selected.createdAt)}</strong>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
