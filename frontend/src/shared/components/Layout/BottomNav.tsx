import { NavLink } from 'react-router-dom';
import { IconHome, IconHistory, IconQr, IconUser, IconBell } from '../ui/Icons';
import styles from './BottomNav.module.css';

export function BottomNav() {
  return (
    <nav className={styles.nav}>
      <NavLink to="/dashboard" className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}>
        <IconHome size={22} />
        Trang chủ
      </NavLink>
      <NavLink to="/transactions" className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}>
        <IconHistory size={22} />
        Lịch sử
      </NavLink>
      <NavLink to="/qr-payment" className={({ isActive }) => `${styles.qrFab} ${isActive ? styles.active : ''}`}>
        <IconQr size={26} />
      </NavLink>
      <NavLink to="/notifications" className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}>
        <IconBell size={22} />
        Thông báo
      </NavLink>
      <NavLink to="/profile" className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}>
        <IconUser size={22} />
        Tài khoản
      </NavLink>
    </nav>
  );
}
