import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useAppSelector } from '../../app/hooks';
import api, { unwrap } from '../../shared/services/api';
import { useSocket } from '../../shared/hooks/useSocket';
import { useToast } from '../../shared/context/ToastContext';
import { BalanceCard } from '../../shared/components/BalanceCard/BalanceCard';
import { QuickActions } from '../../shared/components/QuickActions/QuickActions';
import { TransactionList } from '../../shared/components/TransactionList/TransactionList';

export function DashboardPage() {
  const user = useAppSelector((s) => s.auth.user);
  const [balance, setBalance] = useState<number | null>(null);
  const { toast } = useToast();

  const { data: wallet } = useQuery({
    queryKey: ['wallet'],
    queryFn: async () => unwrap<{ id: string; balance: number }>(await api.get('/wallets')),
  });

  const { data: history } = useQuery({
    queryKey: ['transactions', 'recent'],
    queryFn: async () => {
      const res = await api.get('/transactions', { params: { page: 1, limit: 5 } });
      return unwrap<{ items: Array<{ _id: string; reference: string; type: string; amount: number; status: string; createdAt: string }> }>(res);
    },
  });

  useSocket(user?.id, {
    onBalanceUpdated: (b) => {
      setBalance(b);
      toast('Số dư đã cập nhật', 'success');
    },
    onNotification: (n) => {
      const note = n as { title?: string; message?: string };
      toast(note.message ?? note.title ?? 'Có thông báo mới', 'info');
    },
  });

  const displayBalance = balance ?? wallet?.balance ?? 0;

  return (
    <>
      <BalanceCard balance={displayBalance} />
      <QuickActions />
      <TransactionList items={history?.items ?? []} />
    </>
  );
}
