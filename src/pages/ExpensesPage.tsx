import React, { useState, useEffect } from 'react';
import { Layout, Card, Button, Input, Select, Modal, Alert, Loading } from '@/components';
import { expenseService } from '@/services/expenseService';
import { ExpenseEntry } from '@/types';

const EXPENSE_TYPES = [
  { value: 'rawmaterial', label: 'Raw Material' },
  { value: 'salary', label: 'Salary' },
  { value: 'powerbill', label: 'Power Bill' },
  { value: 'plant_maintenance', label: 'Plant Maintenance' },
  { value: 'machine_maintenance', label: 'Machine Maintenance' },
  { value: 'transport', label: 'Transport' },
  { value: 'machine_spares', label: 'Machine Spares' },
  { value: 'capital_expenditure', label: 'Capital Expenditure' },
];

export const ExpensesPage: React.FC = () => {
  const [entries, setEntries] = useState<ExpenseEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Omit<ExpenseEntry, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>>({
    date: new Date(),
    type: 'rawmaterial',
    subtype: '',
    value: 0,
    remarks: '',
  });

  useEffect(() => {
    fetchExpenses();
  }, []);

  const fetchExpenses = async () => {
    try {
      setLoading(true);
      const data = await expenseService.getAll();
      setEntries(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch expenses');
    } finally {
      setLoading(false);
    }
  };

  const handleAddNew = () => {
    setEditingId(null);
    setFormData({ date: new Date(), type: 'rawmaterial', subtype: '', value: 0, remarks: '' });
    setIsModalOpen(true);
  };

  const handleEdit = (entry: ExpenseEntry) => {
    setEditingId(entry.id);
    setFormData({ date: entry.date, type: entry.type, subtype: entry.subtype || '', value: entry.value, remarks: entry.remarks || '' });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
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

  return (
    <Layout title="Expenses" subtitle="Track company expenses">
      {error && <Alert type="error" message={error} onClose={() => setError('')} />}

      <div className="mb-6 flex gap-4">
        <Button variant="primary" onClick={handleAddNew}>
          ➕ Add Expense
        </Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Date</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Type</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Subtype</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Value</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Created By</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {entries.map((e) => (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm text-gray-800">{new Date(e.date).toLocaleDateString()}</td>
                  <td className="px-6 py-4 text-sm text-gray-800">{e.type}</td>
                  <td className="px-6 py-4 text-sm text-gray-800">{e.subtype || '-'}</td>
                  <td className="px-6 py-4 text-sm text-gray-800">{e.value}</td>
                  <td className="px-6 py-4 text-sm text-gray-800">{e.createdBy || '-'}</td>
                  <td className="px-6 py-4 text-sm text-gray-800">{e.remarks || '-'}</td>
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
