import { Outlet, useLocation } from 'react-router-dom';
import { AppHeader } from './AppHeader';
import { BottomNav } from './BottomNav';
import styles from './Layout.module.css';

const HOME_PATHS = ['/dashboard'];
const HIDE_NAV_PATHS = ['/transfer', '/topup', '/withdraw', '/qr-payment', '/admin'];

export function Layout() {
  const { pathname } = useLocation();
  const isHome = HOME_PATHS.includes(pathname);
  const hideNav = HIDE_NAV_PATHS.some((p) => pathname.startsWith(p));

  return (
    <div className={`${styles.shell} ${hideNav ? styles.hideNav : ''}`}>
      {isHome && <AppHeader variant="home" />}
      <main
        className={`${styles.main} ${isHome ? styles.mainHome : hideNav ? styles.mainFull : styles.mainSub}`}
      >
        <Outlet />
      </main>
      {!hideNav && <BottomNav />}
    </div>
  );
}
