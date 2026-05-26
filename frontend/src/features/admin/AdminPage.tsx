import { useQuery, useQueryClient } from '@tanstack/react-query';
import api, { unwrap } from '../../shared/services/api';
import { useToast } from '../../shared/context/ToastContext';
import { AppHeader } from '../../shared/components/Layout/AppHeader';
import { Button } from '../../shared/components/ui/Button';
import { formatCurrency } from '../../shared/utils/format';
import styles from './AdminPage.module.css';

export function AdminPage() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const { data: pending } = useQuery({
    queryKey: ['admin-pending'],
    queryFn: async () =>
      unwrap<Array<{ _id: string; reference: string; amount: number; createdAt?: string }>>(
        await api.get('/admin/pending-approval'),
      ),
  });

  const { data: analytics } = useQuery({
    queryKey: ['admin-analytics'],
    queryFn: async () =>
      unwrap<{ userCount: number; txCount: number; pendingWithdraw: number }>(
        await api.get('/admin/analytics/overview'),
      ),
  });

  const approve = async (id: string, approveTx: boolean) => {
    try {
      await api.post(`/admin/transactions/${id}/approve`, { approve: approveTx });
      toast(approveTx ? 'Đã duyệt rút tiền' : 'Đã từ chối và hoàn tiền', 'success');
      qc.invalidateQueries({ queryKey: ['admin-pending'] });
      qc.invalidateQueries({ queryKey: ['admin-analytics'] });
    } catch {
      toast('Thao tác thất bại', 'error');
    }
  };

  return (
    <>
      <AppHeader variant="sub" title="Quản trị" showBack backTo="/profile" />
      <div className={styles.page}>
        {analytics && (
          <div className={styles.stats}>
            <div className={styles.statCard}>
              <span className={styles.statValue}>{analytics.userCount}</span>
              <span className={styles.statLabel}>Người dùng</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statValue}>{analytics.txCount}</span>
              <span className={styles.statLabel}>GD thành công</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statValue}>{analytics.pendingWithdraw}</span>
              <span className={styles.statLabel}>Rút chờ duyệt</span>
            </div>
          </div>
        )}

        <h3 className={styles.sectionTitle}>Yêu cầu rút tiền chờ duyệt</h3>
        <div className={styles.list}>
          {pending?.length ? (
            pending.map((tx) => (
              <div key={tx._id} className={styles.card}>
                <div className={styles.cardHeader}>
                  <strong>{formatCurrency(tx.amount)}</strong>
                  <span className={styles.badge}>PENDING</span>
                </div>
                <p className={styles.ref}>{tx.reference}</p>
                <div className={styles.actions}>
                  <Button variant="primary" size="sm" onClick={() => approve(tx._id, true)}>
                    Duyệt
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => approve(tx._id, false)}>
                    Từ chối
                  </Button>
                </div>
              </div>
            ))
          ) : (
            <p className={styles.empty}>Không có yêu cầu chờ duyệt</p>
          )}
        </div>
      </div>
    </>
  );
}
