import { useEffect, useState } from 'react';
import { pageLockService } from '@/services/pageLockService';

export function usePageLock(pageKey: string) {
  const [lockDate, setLockDate] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadLock = async () => {
    try {
      setLoading(true);
      const date = await pageLockService.getPageLockDate(pageKey);
      setLockDate(date);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load page lock state');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLock();
  }, [pageKey]);

  return {
    lockDate,
    isLocked: Boolean(lockDate && lockDate.getTime() > Date.now()),
    loading,
    error,
    refreshLock: loadLock,
  };
}
