import React, { useState, useEffect, useMemo } from 'react';
import { Layout, Card, Button, Input, Select, Modal, Alert, Loading } from '@/components';
import { downloadCsv } from '@/utils/csvUtils';
import { expenseService } from '@/services/expenseService';
import { userService } from '@/services/userService';
import { usePageLock } from '@/hooks/usePageLock';
import { ExpenseEntry } from '@/types';

const EXPENSE_TYPES = [
  { value: 'rawmaterial', label: 'Raw Material' },
  { value: 'salary', label: 'Salary' },
  { value: 'powerbill', label: 'Power Bill' },
  { value: 'plant_maintenance', label: 'Plant Maintenance' },
  { value: 'machine_maintenance', label: 'Machine Maintenance' },
  { value: 'transport', label: 'Transport' },
  { value: 'food', label: 'Food' },
  { value: 'loading_charges', label: 'Loading Charges' },
  { value: 'courier_charges', label: 'Courier Charges' },
  { value: 'machine_spares', label: 'Machine Spares' },
  { value: 'capital_expenditure', label: 'Capital Expenditure' },
  { value: 'sales_commission', label: 'Sales Commission' },
  { value: 'rent', label: 'Rent' },
  { value: 'lemon_soda_purchase', label: 'Lemon Soda Purchase' },
  { value: 'others', label: 'Others' },
];

export const ExpensesPage: React.FC = () => {
  const [entries, setEntries] = useState<ExpenseEntry[]>([]);
  const [userMap, setUserMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [startDateFilter, setStartDateFilter] = useState<string>('');
  const [endDateFilter, setEndDateFilter] = useState<string>('');
  const [sortOption, setSortOption] = useState<string>('dateDesc');
  const { lockDate, isLocked: isPageLocked } = usePageLock('expenses');
  const [formData, setFormData] = useState<Omit<ExpenseEntry, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>>({
    date: new Date(),
    type: 'rawmaterial',
    subtype: '',
    vendor: '',
    value: 0,
    remarks: '',
  });

  useEffect(() => {
    fetchExpenses();
  }, []);

  const fetchExpenses = async () => {
    try {
      setLoading(true);
      const [data, users] = await Promise.all([expenseService.getAll(), userService.getAll()]);
      setEntries(data);
      setUserMap(Object.fromEntries(users.map((user) => [user.id, user.email || user.name || user.id])));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch expenses');
    } finally {
      setLoading(false);
    }
  };

  const handleAddNew = () => {
    if (isPageLocked) {
      setError(`This page is frozen until ${lockDate?.toLocaleDateString()}. Updates are disabled.`);
      return;
    }
    setEditingId(null);
    setFormData({ date: new Date(), type: 'rawmaterial', subtype: '', vendor: '', value: 0, remarks: '' });
    setIsModalOpen(true);
  };

  const handleEdit = (entry: ExpenseEntry) => {
    if (isPageLocked) {
      setError(`This page is frozen until ${lockDate?.toLocaleDateString()}. Updates are disabled.`);
      return;
    }
    setEditingId(entry.id);
    setFormData({ date: entry.date, type: entry.type, subtype: entry.subtype || '', vendor: entry.vendor || '', value: entry.value, remarks: entry.remarks || '' });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (isPageLocked) {
      setError(`This page is frozen until ${lockDate?.toLocaleDateString()}. Updates are disabled.`);
      return;
    }
    if (!formData.type || !formData.date || formData.value <= 0) {
      setError('Please select type, date and enter a valid value');
      return;
    }

    try {
      if (editingId) {
        await expenseService.update(editingId, formData as any);
      } else {
        // user id not attached here; expenseService will set createdBy when called from server flows
        await expenseService.create(formData as any, 'system');
      }
      setIsModalOpen(false);
      fetchExpenses();
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save expense');
    }
  };

  const handleDelete = async (id: string) => {
    if (isPageLocked) {
      setError(`This page is frozen until ${lockDate?.toLocaleDateString()}. Deletes are disabled.`);
      return;
    }
    if (!window.confirm('Are you sure you want to delete this expense?')) return;
    try {
      setLoading(true);
      await expenseService.delete(id);
      await fetchExpenses();
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete expense');
    } finally {
      setLoading(false);
    }
  };

  const filteredEntries = useMemo(() => {
    const startDate = startDateFilter ? new Date(startDateFilter) : null;
    const endDate = endDateFilter ? new Date(endDateFilter) : null;
    if (endDate) {
      endDate.setHours(23, 59, 59, 999);
    }

    return entries
      .filter((entry) => {
        const entryDate = new Date(entry.date);
        const matchesType = typeFilter === 'all' || entry.type === typeFilter;
        const matchesStart = startDate ? entryDate >= startDate : true;
        const matchesEnd = endDate ? entryDate <= endDate : true;
        return matchesType && matchesStart && matchesEnd;
      })
      .sort((a, b) => {
        const aDate = new Date(a.date).getTime();
        const bDate = new Date(b.date).getTime();
        const aValue = a.value ?? 0;
        const bValue = b.value ?? 0;
        const aType = a.type.toLowerCase();
        const bType = b.type.toLowerCase();

        switch (sortOption) {
          case 'dateAsc':
            return aDate - bDate;
          case 'dateDesc':
            return bDate - aDate;
          case 'valueAsc':
            return aValue - bValue;
          case 'valueDesc':
            return bValue - aValue;
          case 'typeAsc':
            return aType.localeCompare(bType);
          case 'typeDesc':
            return bType.localeCompare(aType);
          default:
            return bDate - aDate;
        }
      });
  }, [entries, typeFilter, startDateFilter, endDateFilter, sortOption]);

  const handleExportExpenses = () => {
    if (!filteredEntries.length) {
      setError('No expense data available to export.');
      return;
    }

    const rows = filteredEntries.map((entry) => ({
      Date: new Date(entry.date).toLocaleDateString(),
      Type: entry.type.replace(/_/g, ' '),
      Subtype: entry.subtype || '',
      Vendor: entry.vendor || '',
      Amount: (entry.value ?? 0).toFixed(2),
      Remarks: entry.remarks || '',
      'Created By': userMap[entry.createdBy] || entry.createdBy || '-',
    }));

    downloadCsv(rows, [
      { label: 'Date', key: 'Date' },
      { label: 'Type', key: 'Type' },
      { label: 'Subtype', key: 'Subtype' },
      { label: 'Vendor', key: 'Vendor' },
      { label: 'Amount', key: 'Amount' },
      { label: 'Remarks', key: 'Remarks' },
      { label: 'Created By', key: 'Created By' },
    ], `expenses-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  return (
    <Layout title="Expenses" subtitle="Track company expenses">
      {error && <Alert type="error" message={error} onClose={() => setError('')} />}
      {isPageLocked && lockDate && (
        <Alert
          type="warning"
          message={`This page is currently frozen for updates/deletes until ${lockDate.toLocaleDateString()}. Only read and export actions are allowed.`}
          onClose={() => {}}
        />
      )}

      <div className="mb-6 flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-4">
<Button variant="primary" onClick={handleAddNew} disabled={isPageLocked}>
            ➕ Add Expense
          </Button>
          <Button variant="secondary" onClick={handleExportExpenses}>
            ⬇ Export CSV
          </Button>

          <div className="flex flex-wrap gap-3">
            <div className="min-w-[180px]">
              <Select
                label="Expense Type"
                options={[{ value: 'all', label: 'All Types' }, ...EXPENSE_TYPES]}
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              />
            </div>
            <div className="min-w-[180px]">
              <Input
                label="Start Date"
                type="date"
                value={startDateFilter}
                onChange={(e) => setStartDateFilter(e.target.value)}
              />
            </div>
            <div className="min-w-[180px]">
              <Input
                label="End Date"
                type="date"
                value={endDateFilter}
                onChange={(e) => setEndDateFilter(e.target.value)}
              />
            </div>
            <div className="min-w-[180px]">
              <Select
                label="Sort by"
                options={[
                  { value: 'dateDesc', label: 'Date Desc' },
                  { value: 'dateAsc', label: 'Date Asc' },
                  { value: 'valueDesc', label: 'Value Desc' },
                  { value: 'valueAsc', label: 'Value Asc' },
                  { value: 'typeAsc', label: 'Type Asc' },
                  { value: 'typeDesc', label: 'Type Desc' },
                ]}
                value={sortOption}
                onChange={(e) => setSortOption(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Date</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Type</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Subtype</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Vendor</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Value</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Created By</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Remarks</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredEntries.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm text-gray-800">{new Date(e.date).toLocaleDateString()}</td>
                  <td className="px-6 py-4 text-sm text-gray-800">{e.type}</td>
                  <td className="px-6 py-4 text-sm text-gray-800">{e.subtype || '-'}</td>
                  <td className="px-6 py-4 text-sm text-gray-800">{e.vendor || '-'}</td>
                  <td className="px-6 py-4 text-sm text-gray-800">₹{e.value?.toFixed(2) || '0.00'}</td>
                  <td className="px-6 py-4 text-sm text-gray-800">{userMap[e.createdBy] || e.createdBy || '-'}</td>
                  <td className="px-6 py-4 text-sm text-gray-800">{e.remarks || '-'}</td>
                  <td className="px-6 py-4 text-sm space-x-2">
                    <Button variant="secondary" size="sm" onClick={() => handleEdit(e)} disabled={isPageLocked}>
                      Edit
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => handleDelete(e.id)} disabled={isPageLocked}>
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingId ? 'Edit Expense' : 'Add Expense'}
        size="lg"
        footer={
          <div className="flex gap-4 justify-end">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSave}>
              Save
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input
            label="Date"
            type="date"
            value={formData.date instanceof Date ? formData.date.toISOString().split('T')[0] : formData.date}
            onChange={(e) => setFormData({ ...formData, date: new Date(e.target.value) })}
          />

          <Select
            label="Expense Type"
            options={EXPENSE_TYPES}
            value={formData.type}
            onChange={(e) => setFormData({ ...formData, type: e.target.value as ExpenseEntry['type'] })}
          />

          <Input
            label="Subtype (Optional)"
            placeholder="e.g., Material name or payroll month"
            value={formData.subtype}
            onChange={(e) => setFormData({ ...formData, subtype: e.target.value })}
          />

          <Input
            label="Vendor (Optional)"
            placeholder="Vendor / Supplier name"
            value={(formData as any).vendor}
            onChange={(e) => setFormData({ ...formData, vendor: e.target.value })}
          />

          <Input
            label="Value"
            type="number"
            value={formData.value}
            onChange={(e) => setFormData({ ...formData, value: parseFloat(e.target.value) || 0 })}
          />

          <Input
            label="Remarks (Optional)"
            placeholder="Any notes"
            value={formData.remarks}
            onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
          />
        </div>
      </Modal>
    </Layout>
  );
};
