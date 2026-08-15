import React, { useEffect, useMemo, useState } from 'react';
import { Layout, Card, Button, Input, Alert, Loading } from '@/components';
import { pageLockService } from '@/services/pageLockService';

const PAGE_LOCKS = [
  { key: 'sales', label: 'Sales' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'customers', label: 'Customers' },
  { key: 'orders', label: 'Orders' },
  { key: 'purchases', label: 'Purchases' },
  { key: 'rawMaterials', label: 'Raw Materials' },
  { key: 'products', label: 'Products' },
  { key: 'production', label: 'Production' },
  { key: 'materialUsage', label: 'Material Usage' },
];

const formatLockDate = (date: Date | null) => {
  if (!date) return 'Unlocked';
  return date.toLocaleDateString();
};

const toEndOfDay = (inputDate: string) => {
  const date = new Date(inputDate);
  date.setHours(23, 59, 59, 999);
  return date;
};

export const PageControlPage: React.FC = () => {
  const [lockDates, setLockDates] = useState<Record<string, Date | null>>({});
  const [inputDates, setInputDates] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const fetchLocks = async () => {
    try {
      setLoading(true);
      const entries = await Promise.all(
        PAGE_LOCKS.map(async ({ key }) => ({
          key,
          date: await pageLockService.getPageLockDate(key),
        }))
      );
      const dateMap = Object.fromEntries(entries.map((item) => [item.key, item.date]));
      const inputMap = Object.fromEntries(
        entries.map((item) => [item.key, item.date ? item.date.toISOString().slice(0, 10) : ''])
      );
      setLockDates(dateMap);
      setInputDates(inputMap);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch page lock settings');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLocks();
  }, []);

  const handleDateChange = (key: string, value: string) => {
    setInputDates((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async (key: string) => {
    const inputValue = inputDates[key];
    if (!inputValue) {
      setError('Please choose a lock date before saving.');
      return;
    }

    try {
      setSavingKey(key);
      const lockDate = toEndOfDay(inputValue);
      await pageLockService.setPageLockDate(key, lockDate);
      setSuccess(`Page lock for ${key} updated to ${lockDate.toLocaleDateString()}.`);
      await fetchLocks();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save page lock');
    } finally {
      setSavingKey(null);
    }
  };

  const handleClear = async (key: string) => {
    try {
      setSavingKey(key);
      await pageLockService.clearPageLock(key);
      setSuccess(`Page lock cleared for ${key}.`);
      await fetchLocks();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear page lock');
    } finally {
      setSavingKey(null);
    }
  };

  const rows = useMemo(
    () =>
      PAGE_LOCKS.map((page) => ({
        ...page,
        lockDate: lockDates[page.key] || null,
        isLocked: Boolean(lockDates[page.key] && lockDates[page.key]!.getTime() > Date.now()),
      })),
    [lockDates]
  );

  if (loading) {
    return <Loading fullScreen message="Loading page freeze controls..." />;
  }

  return (
    <Layout title="Page Control" subtitle="Freeze or relax updates on application pages">
      {error && <Alert type="error" message={error} onClose={() => setError('')} />}
      {success && <Alert type="success" message={success} onClose={() => setSuccess('')} />}

      <Card>
        <div className="mb-4 text-gray-700">
          Use these settings to freeze updates and deletes on specific pages until a selected date. CSV export and read-only access remain available.
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse border border-gray-200">
            <thead className="bg-gray-100">
              <tr>
                <th className="px-4 py-3 border border-gray-200">Page</th>
                <th className="px-4 py-3 border border-gray-200">Current Lock Until</th>
                <th className="px-4 py-3 border border-gray-200">Choose Date</th>
                <th className="px-4 py-3 border border-gray-200">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key} className="hover:bg-gray-50">
                  <td className="px-4 py-3 border border-gray-200 font-medium">{row.label}</td>
                  <td className="px-4 py-3 border border-gray-200">
                    {row.isLocked ? (`Locked until ${formatLockDate(row.lockDate)}`) : 'Unlocked'}
                  </td>
                  <td className="px-4 py-3 border border-gray-200">
                    <Input
                      type="date"
                      value={inputDates[row.key] || ''}
                      onChange={(e) => handleDateChange(row.key, e.target.value)}
                    />
                  </td>
                  <td className="px-4 py-3 border border-gray-200 space-y-2">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleSave(row.key)}
                      disabled={!inputDates[row.key] || savingKey === row.key}
                    >
                      Save Lock
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleClear(row.key)}
                      disabled={savingKey === row.key || !row.isLocked}
                    >
                      Clear Lock
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </Layout>
  );
};
