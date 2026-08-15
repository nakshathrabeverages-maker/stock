import React, { useState, useEffect } from 'react';
import { Layout, Card, Button, Input, Modal, Alert, Loading } from '@/components';
import { downloadCsv } from '@/utils/csvUtils';
import { customerService } from '@/services/customerService';
import { userService } from '@/services/userService';
import { authService } from '@/services/authService';
import { usePageLock } from '@/hooks/usePageLock';
import { Customer } from '@/types';

export const CustomersPage: React.FC = () => {
  const { lockDate, isLocked: isPageLocked } = usePageLock('customers');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [userMap, setUserMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importCsvText, setImportCsvText] = useState('');
  const [importFileName, setImportFileName] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [formData, setFormData] = useState<Omit<Customer, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>>({
    name: '',
    village: '',
    firmName: '',
    phone: '',
    email: '',
  });

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const [data, users] = await Promise.all([customerService.getAll(), userService.getAll()]);
      setCustomers(data);
      setUserMap(Object.fromEntries(users.map((user) => [user.id, user.email || user.name || user.id])));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch customers');
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
    setFormData({
      name: '',
      village: '',
      firmName: '',
      phone: '',
      email: '',
    });
    setIsModalOpen(true);
  };

  const handleEdit = (customer: Customer) => {
    if (isPageLocked) {
      setError(`This page is frozen until ${lockDate?.toLocaleDateString()}. Updates are disabled.`);
      return;
    }
    setEditingId(customer.id);
    setFormData({
      name: customer.name,
      village: customer.village,
      firmName: customer.firmName,
      phone: customer.phone,
      email: customer.email || '',
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (customerId: string) => {
    if (isPageLocked) {
      setError(`This page is frozen until ${lockDate?.toLocaleDateString()}. Deletes are disabled.`);
      return;
    }
    if (!window.confirm('Are you sure you want to delete this customer?')) return;
    try {
      setLoading(true);
      await customerService.delete(customerId);
      await fetchCustomers();
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete customer');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    setSearchQuery(searchTerm.trim());
  };

  const handleClearSearch = () => {
    setSearchTerm('');
    setSearchQuery('');
  };

  const handleExportCustomers = () => {
    if (!filteredCustomers.length) {
      setError('No customer data available to export.');
      return;
    }

    const rows = filteredCustomers.map((customer) => ({
      Name: customer.name,
      Village: customer.village,
      'Firm Name': customer.firmName,
      Phone: customer.phone,
      Email: customer.email || '',
      'Created By': userMap[customer.createdBy] || customer.createdBy || '-',
    }));

    downloadCsv(rows, [
      { label: 'Name', key: 'Name' },
      { label: 'Village', key: 'Village' },
      { label: 'Firm Name', key: 'Firm Name' },
      { label: 'Phone', key: 'Phone' },
      { label: 'Email', key: 'Email' },
      { label: 'Created By', key: 'Created By' },
    ], `customers-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const handleCustomerFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
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

  const normalizeHeader = (value: string) => String(value ?? '').replace(/^\uFEFF/, '').trim().toLowerCase().replace(/\s+/g, '');

  const parseCsvRows = (text: string) => {
    const rows: string[][] = [];
    const normalizedText = String(text ?? '').replace(/^\uFEFF/, '').replace(/\uFEFF/g, '');
    let currentRow: string[] = [];
    let currentValue = '';
    let inQuotes = false;

    for (let index = 0; index < normalizedText.length; index += 1) {
      const char = normalizedText[index];
      if (char === '"') {
        if (inQuotes && normalizedText[index + 1] === '"') {
          currentValue += '"';
          index += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        currentRow.push(currentValue);
        currentValue = '';
      } else if ((char === '\n' || char === '\r') && !inQuotes) {
        if (char === '\r' && normalizedText[index + 1] === '\n') {
          index += 1;
        }
        currentRow.push(currentValue);
        if (currentRow.some((value) => value.trim())) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentValue = '';
      } else {
        currentValue += char;
      }
    }

    if (currentValue.length > 0 || currentRow.length > 0) {
      currentRow.push(currentValue);
      if (currentRow.some((value) => value.trim())) {
        rows.push(currentRow);
      }
    }

    return rows;
  };

  const getColumnValue = (record: Record<string, string>, aliases: string[]) => {
    const normalizedAliases = aliases.map((a) => normalizeHeader(a));
    for (const [key, value] of Object.entries(record)) {
      if (normalizedAliases.includes(normalizeHeader(key))) return value;
    }
    return '';
  };

  const handleImportCustomersCsv = async () => {
    if (isPageLocked) {
      setError(`This page is frozen until ${lockDate?.toLocaleDateString()}. Updates are disabled.`);
      return;
    }
    const trimmed = importCsvText.trim();
    if (!trimmed) {
      setError('Please choose a CSV file or paste CSV content first.');
      return;
    }

    setIsImporting(true);
    setError('');

    try {
      const rows = parseCsvRows(trimmed);
      if (rows.length < 2) throw new Error('CSV must include a header row and at least one data row.');
      const headers = rows[0].map((h) => String(h ?? '').replace(/^\uFEFF/, '').trim());
      const dataRows = rows.slice(1).filter((r) => r.some((v) => v.trim()));
      if (!dataRows.length) throw new Error('No customer rows found in CSV');

      const userId = authService.getCurrentUser()?.uid;
      if (!userId) throw new Error('User not authenticated');

      for (const [index, row] of dataRows.entries()) {
        const record = Object.fromEntries(headers.map((h, i) => [h, row[i] ?? '']));
        const name = getColumnValue(record, ['name', 'customer', 'customerName', 'customer_name']) || '';
        const village = getColumnValue(record, ['village', 'town', 'city']) || '';
        const firmName = getColumnValue(record, ['firmName', 'firm', 'company']) || '';
        const phone = getColumnValue(record, ['phone', 'mobile', 'contact']) || '';
        const email = getColumnValue(record, ['email', 'emailAddress', 'email_address']) || '';

        if (!name) throw new Error(`Row ${index + 2}: missing customer name`);
        if (!phone) throw new Error(`Row ${index + 2}: missing phone`);

        await customerService.create({ name: name.trim(), village: village.trim(), firmName: firmName.trim(), phone: phone.trim(), email: email.trim() } as any, userId);
      }

      setIsImportModalOpen(false);
      setImportCsvText('');
      setImportFileName('');
      await fetchCustomers();
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import customers');
    } finally {
      setIsImporting(false);
    }
  };

  const filteredCustomers = customers.filter((customer) => {
    const query = searchQuery.toLowerCase();
    if (!query) return true;

    return [customer.name, customer.village, customer.firmName, customer.phone, customer.email]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });

  const handleSave = async () => {
    if (isPageLocked) {
      setError(`This page is frozen until ${lockDate?.toLocaleDateString()}. Updates are disabled.`);
      return;
    }
    if (!formData.name || !formData.village || !formData.firmName || !formData.phone) {
      setError('Please fill in all required fields');
      return;
    }

    try {
      if (editingId) {
        await customerService.update(editingId, formData);
      } else {
        const userId = authService.getCurrentUser()?.uid;
        if (!userId) {
          setError('User not authenticated');
          return;
        }
        await customerService.create(formData as any, userId);
      }
      setIsModalOpen(false);
      fetchCustomers();
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save customer');
    }
  };

  if (loading) return <Loading fullScreen message="Loading customers..." />;

  return (
    <Layout title="Customers" subtitle="Manage customer details">
      {error && <Alert type="error" message={error} onClose={() => setError('')} />}
      {isPageLocked && lockDate && (
        <Alert
          type="warning"
          message={`This page is currently frozen for updates/deletes until ${lockDate.toLocaleDateString()}. Only read and export actions are allowed.`}
          onClose={() => {}}
        />
      )}

      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end">
        <div className="flex-1">
          <Input
            label="Search customers"
            placeholder="Search by name, firm, phone or village"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Button variant="secondary" onClick={handleSearch}>
          🔎 Search
        </Button>
        <Button variant="outline" onClick={handleClearSearch}>
          Clear
        </Button>
        <Button variant="secondary" onClick={handleExportCustomers}>
          ⬇ Export CSV
        </Button>
        <Button variant="secondary" onClick={() => setIsImportModalOpen(true)}>
          ⬆ Import CSV
        </Button>
        <Button variant="primary" onClick={handleAddNew} disabled={isPageLocked}>
          ➕ Add Customer
        </Button>
      </div>

      <Modal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        title="Import Customers from CSV"
        size="lg"
        footer={
          <div className="flex gap-4 justify-end">
            <Button variant="outline" onClick={() => setIsImportModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleImportCustomersCsv} loading={isImporting}>
              Import Customers
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Upload a CSV file or paste rows below. Required headers: name, phone. Optional: village, firmName, email.</p>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Choose CSV file</span>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleCustomerFileUpload}
              className="mt-2 block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-white hover:file:bg-opacity-90"
            />
          </label>
          {importFileName && <p className="text-sm text-gray-600">Selected file: {importFileName}</p>}

          <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
            <p className="mb-2 font-semibold text-gray-700">Sample CSV</p>
            <pre className="whitespace-pre-wrap">name,phone,village,firmName,email
Ravi Kumar,9999999999,Guntur, Ravi Traders,ravi@example.com
Suresh Verma,8888888888,Vijayawada,,suresh@company.com</pre>
          </div>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Or paste CSV content</span>
            <textarea
              rows={10}
              value={importCsvText}
              onChange={(e) => setImportCsvText(e.target.value)}
              className="mt-2 w-full rounded border border-gray-300 px-3 py-2 font-mono text-sm"
              placeholder={`name,phone,village,firmName,email\nRavi Kumar,9999999999,Guntur,Ravi Traders,ravi@example.com`}
            />
          </label>
        </div>
      </Modal>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {filteredCustomers.length === 0 ? (
          <div className="lg:col-span-2 rounded-lg border border-dashed border-gray-300 p-6 text-center text-gray-600">
            No customers match your search.
          </div>
        ) : (
          filteredCustomers.map((customer) => (
            <Card key={customer.id} title={customer.name}>
              <div className="space-y-3">
                <div className="text-sm text-gray-600">
                  <p>
                    <span className="font-semibold">Village:</span> {customer.village}
                  </p>
                  <p>
                    <span className="font-semibold">Firm:</span> {customer.firmName}
                  </p>
                  <p>
                    <span className="font-semibold">Phone:</span> {customer.phone}
                  </p>
                  <p>
                    <span className="font-semibold">Email:</span> {customer.email || '-'}
                  </p>
                  <p>
                    <span className="font-semibold">Created By:</span> {userMap[customer.createdBy] || customer.createdBy || 'N/A'}
                  </p>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button variant="secondary" size="sm" onClick={() => handleEdit(customer)} className="flex-1" disabled={isPageLocked}>
                    Edit
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => handleDelete(customer.id)} disabled={isPageLocked}>
                    Delete
                  </Button>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingId ? 'Edit Customer' : 'Add Customer'}
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
            label="Customer Name"
            placeholder="e.g., Ram Kumar"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />

          <Input
            label="Village"
            placeholder="e.g., Kumbakonam"
            value={formData.village}
            onChange={(e) => setFormData({ ...formData, village: e.target.value })}
          />

          <Input
            label="Firm Name"
            placeholder="e.g., Ram Trading"
            value={formData.firmName}
            onChange={(e) => setFormData({ ...formData, firmName: e.target.value })}
          />

          <Input
            label="Phone"
            type="tel"
            placeholder="e.g., 9876543210"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          />

          <Input
            label="Email (Optional)"
            type="email"
            placeholder="e.g., ram@example.com"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          />
        </div>
      </Modal>
    </Layout>
  );
};
