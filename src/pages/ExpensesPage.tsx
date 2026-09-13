import React, { useState, useEffect, useMemo } from 'react';
import { Layout, Card, Button, Input, Select, Modal, Alert, Loading } from '@/components';
import { downloadCsv } from '@/utils/csvUtils';
import { expenseService } from '@/services/expenseService';
import { userService } from '@/services/userService';
import { usePageLock } from '@/hooks/usePageLock';
import { ExpenseEntry } from '@/types';
import { parseDateInput } from '@/utils/dateUtils';

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
  const [searchFilter, setSearchFilter] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [startDateFilter, setStartDateFilter] = useState<string>('');
  const [endDateFilter, setEndDateFilter] = useState<string>('');
  const [sortOption, setSortOption] = useState<string>('dateDesc');
  const { lockDate, isLocked: isPageLocked } = usePageLock('expenses');
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importCsvText, setImportCsvText] = useState('');
  const [importFileName, setImportFileName] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importIssues, setImportIssues] = useState<Array<{ rowNumber: number; message: string }>>([]);
  const [isImportIssueModalOpen, setIsImportIssueModalOpen] = useState(false);
  const [pendingValidRows, setPendingValidRows] = useState<any[]>([]);
  const [success, setSuccess] = useState('');
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
        const searchValue = searchFilter.trim().toLowerCase();
        const matchesSearch = !searchValue || [entry.subtype, entry.vendor, entry.remarks]
          .some((value) => value?.toLowerCase().includes(searchValue));
        const matchesType = typeFilter === 'all' || entry.type === typeFilter;
        const matchesStart = startDate ? entryDate >= startDate : true;
        const matchesEnd = endDate ? entryDate <= endDate : true;
        return matchesSearch && matchesType && matchesStart && matchesEnd;
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
  }, [entries, searchFilter, typeFilter, startDateFilter, endDateFilter, sortOption]);

  const hasActiveFilters = searchFilter || typeFilter !== 'all' || startDateFilter || endDateFilter;

  const clearFilters = () => {
    setSearchFilter('');
    setTypeFilter('all');
    setStartDateFilter('');
    setEndDateFilter('');
  };

  const asNumber = (value: string | number | undefined | null): number | undefined => {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
    const cleaned = String(value)
      .trim()
      .replace(/₹/g, '')
      .replace(/,/g, '')
      .replace(/\s+/g, '');
    if (!cleaned) return undefined;
    const num = Number(cleaned);
    return Number.isFinite(num) ? num : undefined;
  };

  const parseCsvLine = (line: string) => {
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    return values;
  };

  const parseExpenseCsv = (text: string) => {
    if (!text || !text.trim()) return [];
    const rows = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (rows.length < 2) return [];
    const headers = parseCsvLine(rows[0]).map((header) =>
      header.trim().toLowerCase().replace(/[^a-z0-9]+/g, '')
    );
    const normalizedHeaders = new Map<string, string>();
    headers.forEach((header, index) => {
      const aliasMap: Record<string, string> = {
        date: 'date',
        type: 'type',
        expensetype: 'type',
        category: 'type',
        subtype: 'subtype',
        category2: 'subtype',
        vendor: 'vendor',
        supplier: 'vendor',
        amount: 'value',
        value: 'value',
        cost: 'value',
        expense: 'value',
        remarks: 'remarks',
        notes: 'remarks',
        description: 'remarks',
      };
      normalizedHeaders.set(header, aliasMap[header] ?? header);
    });
    const parsedRows: any[] = [];
    for (let i = 1; i < rows.length; i += 1) {
      const values = parseCsvLine(rows[i]);
      if (values.every((value) => !value.trim())) continue;
      const row: Record<string, any> = {};
      for (let j = 0; j < headers.length; j += 1) {
        const key = normalizedHeaders.get(headers[j]) ?? headers[j];
        row[key] = values[j] ?? '';
      }
      const date = String(row.date ?? '').trim();
      const type = String(row.type ?? '').trim().toLowerCase();
      const subtype = String(row.subtype ?? '').trim();
      const vendor = String(row.vendor ?? '').trim();
      const value = asNumber(row.value);
      const remarks = String(row.remarks ?? '').trim();
      parsedRows.push({ date, type, subtype, vendor, value, remarks });
    }
    return parsedRows;
  };

  const validateExpenseRows = async (rows: any[]) => {
    const validRows: any[] = [];
    const issues: Array<{ rowNumber: number; message: string }> = [];
    const expenseTypeValues = EXPENSE_TYPES.map((t) => t.value);
    for (const [index, row] of rows.entries()) {
      const rowNumber = index + 2;
      const { date, type, subtype, vendor, value, remarks } = row;
      if (!date) {
        issues.push({ rowNumber, message: 'Missing date field.' });
        continue;
      }
      const parsedDate = parseDateInput(date);
      if (Number.isNaN(parsedDate.getTime())) {
        issues.push({ rowNumber, message: `Invalid date format '${date}'.` });
        continue;
      }
      if (!type) {
        issues.push({ rowNumber, message: 'Missing expense type field.' });
        continue;
      }
      const matchedType = expenseTypeValues.find((t) => t.toLowerCase() === type.toLowerCase());
      if (!matchedType) {
        issues.push({
          rowNumber,
          message: `Invalid expense type '${type}'. Valid types are: ${EXPENSE_TYPES.map((t) => t.value).join(', ')}`,
        });
        continue;
      }
      if (!Number.isFinite(value) || value <= 0) {
        issues.push({ rowNumber, message: `Invalid or missing amount. Must be a positive number.` });
        continue;
      }
      validRows.push({ date: parsedDate, type: matchedType, subtype, vendor, value, remarks });
    }
    return { validRows, issues };
  };

  const applyValidatedRows = async (rows: any[]) => {
    let count = 0;
    for (const row of rows) {
      await expenseService.create(
        {
          date: row.date,
          type: row.type,
          subtype: row.subtype || '',
          vendor: row.vendor || '',
          value: row.value,
          remarks: row.remarks || '',
        } as any,
        'system'
      );
      count += 1;
    }
    return count;
  };

  const handleCsvFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      setImportCsvText(text);
      setImportFileName(file.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read CSV file');
    } finally {
      event.target.value = '';
    }
  };

  const downloadCsvTemplate = () => {
    const headers = ['Date', 'Type', 'Subtype', 'Vendor', 'Amount', 'Remarks'];
    const rows = [
      ['2024-09-01', 'rawmaterial', 'Steel', 'ABC Inc', '5000', 'Purchase order'],
      ['2024-09-02', 'salary', 'Monthly', 'Staff', '50000', 'September salary'],
      ['2024-09-03', 'powerbill', '', 'Electric Co', '15000', 'Monthly bill'],
      ['2024-09-04', 'transport', 'Delivery', 'Transport Co', '3000', '']
    ];
    const csvContent = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\r\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `expense-template-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleApplyCsvUpdates = async () => {
    if (!importCsvText.trim()) {
      setError('Please upload or paste a CSV file first.');
      return;
    }
    try {
      const parsedRows = parseExpenseCsv(importCsvText);
      if (!parsedRows.length) {
        setError('No valid rows were found in the CSV.');
        return;
      }
      setIsImporting(true);
      setError('');
      const { validRows, issues } = await validateExpenseRows(parsedRows);
      if (issues.length > 0) {
        setImportIssues(issues);
        setPendingValidRows(validRows);
        setIsImportIssueModalOpen(true);
        setIsImporting(false);
        return;
      }
      const appliedCount = await applyValidatedRows(validRows);
      await fetchExpenses();
      setError('');
      setSuccess(`Imported ${appliedCount} expense records from the CSV.`);
      setImportCsvText('');
      setImportFileName('');
      setIsImportModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply CSV expense records');
    } finally {
      setIsImporting(false);
    }
  };

  const handleContinueAfterIssues = async () => {
    if (pendingValidRows.length === 0) {
      setImportIssues([]);
      setPendingValidRows([]);
      setIsImportIssueModalOpen(false);
      setError('No valid rows are available to continue. Please correct the CSV and try again.');
      return;
    }
    try {
      setLoading(true);
      setIsImportIssueModalOpen(false);
      const appliedCount = await applyValidatedRows(pendingValidRows);
      await fetchExpenses();
      setError('');
      setSuccess(`Skipped invalid rows and imported ${appliedCount} valid expense records.`);
      setImportCsvText('');
      setImportFileName('');
      setIsImportModalOpen(false);
      setImportIssues([]);
      setPendingValidRows([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply the valid CSV rows.');
    } finally {
      setLoading(false);
    }
  };

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
      {success && <Alert type="success" message={success} onClose={() => setSuccess('')} />}
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
          <Button variant="secondary" onClick={() => setIsImportModalOpen(true)} disabled={isPageLocked}>
            ⬆ Import CSV
          </Button>

          <div className="flex flex-wrap gap-3">
            <div className="min-w-[220px]">
              <Input
                label="Search expenses"
                type="search"
                placeholder="Subtype, vendor or remarks"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
              />
            </div>
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
            {hasActiveFilters && (
              <div className="flex items-end">
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  Clear Filters
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      <Card>
        <div className="border-b px-6 py-3 text-sm text-gray-600">
          Showing {filteredEntries.length} of {entries.length} expenses
        </div>
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

      <Modal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        title="Import Expenses from CSV"
        size="lg"
        footer={
          <div className="flex gap-4 justify-end">
            <Button variant="outline" onClick={() => setIsImportModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleApplyCsvUpdates} disabled={isImporting || !importCsvText.trim()}>
              {isImporting ? 'Importing...' : 'Import CSV'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Upload a CSV file or paste rows below. The import will create new expense records.
          </p>
          <div className="rounded-lg border border-dashed border-gray-300 p-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Choose CSV file</label>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleCsvFileUpload}
              className="block w-full text-sm text-gray-600 file:mr-4 file:rounded file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200"
            />
            {importFileName && <p className="mt-2 text-sm text-gray-500">Selected: {importFileName}</p>}
          </div>
          <label className="block text-sm font-medium text-gray-700">Or paste CSV content</label>
          <textarea
            rows={10}
            value={importCsvText}
            onChange={(e) => setImportCsvText(e.target.value)}
            placeholder="Date,Type,Subtype,Vendor,Amount,Remarks
2024-09-01,rawmaterial,Steel,ABC Inc,5000,Purchase order#123
2024-09-02,salary,Monthly,Staff,50000,September salary"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
          <div className="mb-3 flex gap-2">
            <button type="button" onClick={downloadCsvTemplate} className="px-3 py-2 bg-blue-100 text-blue-700 text-xs font-medium rounded hover:bg-blue-200">
              📥 Download Template CSV
            </button>
          </div>
          <div className="rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs text-gray-700">
            <p className="font-semibold mb-2 text-blue-900">Column Requirements:</p>
            <ul className="space-y-1 mb-2">
              <li><span className="font-medium text-red-600">Date*</span> - YYYY-MM-DD format</li>
              <li><span className="font-medium text-red-600">Type*</span> - See list below</li>
              <li><span className="font-medium text-red-600">Amount*</span> - Positive number</li>
              <li><span className="font-medium">Subtype</span> - Optional</li>
              <li><span className="font-medium">Vendor</span> - Optional</li>
              <li><span className="font-medium">Remarks</span> - Optional</li>
            </ul>
            <p className="font-medium mb-1">Valid Types:</p>
            <p className="text-xs leading-relaxed">{EXPENSE_TYPES.map((t) => t.value).join(', ')}</p>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isImportIssueModalOpen}
        onClose={() => {
          setIsImportIssueModalOpen(false);
          setImportIssues([]);
          setPendingValidRows([]);
        }}
        title="CSV validation issues"
        size="lg"
        footer={
          <div className="flex flex-col sm:flex-row gap-3 justify-end">
            <Button
              variant="secondary"
              onClick={() => {
                setIsImportIssueModalOpen(false);
                setImportIssues([]);
                setPendingValidRows([]);
              }}
            >
              Cancel
            </Button>
            <Button variant="primary" onClick={handleContinueAfterIssues} loading={loading}>
              Skip invalid rows & continue
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-700">
            Some rows in the uploaded CSV have validation issues. You can skip those records and continue with valid rows, or cancel to correct the CSV.
          </p>
          <div className="max-h-72 overflow-y-auto rounded border border-gray-200 bg-gray-50 p-3">
            {importIssues.length > 0 ? (
              <ul className="space-y-2 text-sm text-gray-700">
                {importIssues.map((issue) => (
                  <li key={`${issue.rowNumber}`} className="rounded border border-red-200 bg-white p-2">
                    <span className="font-medium text-red-700">Row {issue.rowNumber}</span>: {issue.message}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-600">No validation issues detected.</p>
            )}
          </div>
        </div>
      </Modal>
    </Layout>
  );
};
