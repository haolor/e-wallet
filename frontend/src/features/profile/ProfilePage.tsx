import { useState } from 'react';
import type { FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import api, { unwrap } from '../../shared/services/api';
import { useAppDispatch, useAppSelector } from '../../app/hooks';
import { logout } from '../auth/authSlice';
import { useToast } from '../../shared/context/ToastContext';
import { Button } from '../../shared/components/ui/Button';
import { Modal } from '../../shared/components/ui/Modal';
import { Input } from '../../shared/components/ui/Input';
import styles from './ProfilePage.module.css';

export function ProfilePage() {
  const user = useAppSelector((s) => s.auth.user);
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [pwdOpen, setPwdOpen] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);
  const [pwd, setPwd] = useState({ current: '', new: '' });
  const [bankForm, setBankForm] = useState({ bankCode: 'VCB', bankName: 'Vietcombank', accountNumber: '', accountName: '' });

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: async () =>
      unwrap<{ fullName: string; email: string; phone: string; kycStatus: string }>(await api.get('/users/profile')),
  });

  const { data: banks } = useQuery({
    queryKey: ['banks'],
    queryFn: async () =>
      unwrap<Array<{ id: string; bankName: string; accountNumberMasked: string; isVerified: boolean }>>(
        await api.get('/bank-accounts'),
      ),
  });

  const handleLogout = async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      dispatch(logout());
      navigate('/login');
    }
  };

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.put('/users/password', pwd);
      toast('Đổi mật khẩu thành công', 'success');
      setPwdOpen(false);
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { message?: string } } };
      toast(ax.response?.data?.message || 'Lỗi', 'error');
    }
  };

  const addBank = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/bank-accounts', bankForm);
      qc.invalidateQueries({ queryKey: ['banks'] });
      toast('Đã thêm tài khoản ngân hàng', 'success');
      setBankOpen(false);
    } catch (err: unknown) {
      const ax = err as { response?: { data?: { message?: string } } };
      toast(ax.response?.data?.message || 'Lỗi', 'error');
    }
  };

  const kycStatus = profile?.kycStatus ?? user?.kycStatus ?? 'none';

  return (
    <>
      <div className={styles.hero}>
        <div className={styles.avatar}>{(profile?.fullName?.[0] ?? 'U').toUpperCase()}</div>
        <h2>{profile?.fullName ?? user?.fullName}</h2>
        <p>{profile?.email ?? user?.email}</p>
        <span className={`${styles.kycBadge} ${styles[kycStatus] || ''}`}>
          KYC: {kycStatus === 'approved' ? 'Đã xác minh' : kycStatus === 'pending' ? 'Đang chờ' : 'Chưa xác minh'}
        </span>
      </div>

      <div className={styles.menu}>
        <section className={styles.section}>
          <h3>Tài khoản</h3>
          <button type="button" className={styles.menuItem} onClick={() => setPwdOpen(true)}>
            <span>🔒</span> Đổi mật khẩu <span className={styles.chevron}>›</span>
          </button>
          <button type="button" className={styles.menuItem} onClick={() => setBankOpen(true)}>
            <span>🏦</span> Liên kết ngân hàng <span className={styles.chevron}>›</span>
          </button>
        </section>

        {banks && banks.length > 0 && (
          <section className={styles.section}>
            <h3>Ngân hàng đã liên kết</h3>
            {banks.map((b) => (
              <div key={b.id} className={styles.bankItem}>
                <strong>{b.bankName}</strong>
                <span>{b.accountNumberMasked}</span>
                {b.isVerified && <span className={styles.verified}>✓ Đã xác minh</span>}
              </div>
            ))}
          </section>
        )}

        {user?.role === 'admin' && (
          <section className={styles.section}>
            <Link to="/admin" className={styles.menuItem}>
              <span>⚙️</span> Quản trị hệ thống <span className={styles.chevron}>›</span>
            </Link>
          </section>
        )}

        <Button variant="secondary" onClick={handleLogout} style={{ marginTop: 24 }}>
          Đăng xuất
        </Button>
      </div>

      <Modal open={pwdOpen} onClose={() => setPwdOpen(false)} title="Đổi mật khẩu">
        <form onSubmit={changePassword}>
          <Input label="Mật khẩu hiện tại" type="password" value={pwd.current} onChange={(e) => setPwd({ ...pwd, current: e.target.value })} />
          <Input label="Mật khẩu mới" type="password" value={pwd.new} onChange={(e) => setPwd({ ...pwd, new: e.target.value })} />
          <Button type="submit" style={{ marginTop: 16 }}>Lưu</Button>
        </form>
      </Modal>

      <Modal open={bankOpen} onClose={() => setBankOpen(false)} title="Thêm ngân hàng">
        <form onSubmit={addBank}>
          <Input label="Mã NH" value={bankForm.bankCode} onChange={(e) => setBankForm({ ...bankForm, bankCode: e.target.value })} />
          <Input label="Tên ngân hàng" value={bankForm.bankName} onChange={(e) => setBankForm({ ...bankForm, bankName: e.target.value })} />
          <Input label="Số tài khoản" value={bankForm.accountNumber} onChange={(e) => setBankForm({ ...bankForm, accountNumber: e.target.value })} />
          <Input label="Tên chủ TK" value={bankForm.accountName} onChange={(e) => setBankForm({ ...bankForm, accountName: e.target.value })} />
          <Button type="submit" style={{ marginTop: 16 }}>Thêm</Button>
        </form>
      </Modal>
    </>
  );
}
