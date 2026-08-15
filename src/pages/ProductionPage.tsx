import React, { useState, useEffect } from 'react';
import { Layout, Card, Button, Input, Select, Modal, Alert, Loading } from '@/components';
import { productionService } from '@/services/productionService';
import { productService } from '@/services/productService';
import { userService } from '@/services/userService';
import { useAuthStore } from '@/store/authStore';
import { authService } from '@/services/authService';
import { usePageLock } from '@/hooks/usePageLock';
import { ProductionEntry, Product } from '@/types';

interface BulkProductionRow {
  productId: string;
  quantity: number;
  remarks: string;
}

export const ProductionPage: React.FC = () => {
  const [entries, setEntries] = useState<ProductionEntry[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [userMap, setUserMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const { user } = useAuthStore();
  const [formData, setFormData] = useState<Omit<ProductionEntry, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>>({
    date: new Date(),
    productId: '',
    quantity: 0,
    remarks: '',
  });
  const [bulkDate, setBulkDate] = useState(new Date().toISOString().split('T')[0]);
  const [bulkProductRows, setBulkProductRows] = useState<BulkProductionRow[]>([
    { productId: '', quantity: 0, remarks: '' },
  ]);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importCsvText, setImportCsvText] = useState('');
  const [importFileName, setImportFileName] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const { lockDate, isLocked: isPageLocked } = usePageLock('production');

  const fetchData = async () => {
    try {
      setLoading(true);
      const [prodData, prodList, users] = await Promise.all([
        productionService.getAll(),
        productService.getAll(),
        userService.getAll(),
      ]);
      setEntries(prodData);
      setProducts(prodList);
      setUserMap(Object.fromEntries(users.map((user) => [user.id, user.email || user.name || user.id])));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
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
      date: new Date(),
      productId: '',
      quantity: 0,
      remarks: '',
    });
    setIsModalOpen(true);
  };

  const addBulkProductRow = () => {
    setBulkProductRows([...bulkProductRows, { productId: '', quantity: 0, remarks: '' }]);
  };

  const removeBulkProductRow = (index: number) => {
    setBulkProductRows(bulkProductRows.filter((_, i) => i !== index));
  };

  const updateBulkProductRow = (index: number, field: keyof BulkProductionRow, value: string | number) => {
    const updated = [...bulkProductRows];
    updated[index] = { ...updated[index], [field]: value };
    setBulkProductRows(updated);
  };

  const handleAddBulk = () => {
    if (isPageLocked) {
      setError(`This page is frozen until ${lockDate?.toLocaleDateString()}. Updates are disabled.`);
      return;
    }
    setBulkDate(new Date().toISOString().split('T')[0]);
    setBulkProductRows([{ productId: '', quantity: 0, remarks: '' }]);
    setIsBulkModalOpen(true);
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

  const normalizeName = (value: unknown) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const normalizeHeader = (value: string) => String(value ?? '').replace(/^\uFEFF/, '').trim().toLowerCase().replace(/\s+/g, '');

  const getColumnValue = (record: Record<string, string>, aliases: string[]) => {
    const normalizedAliases = aliases.map((alias) => normalizeHeader(alias));
    for (const [key, value] of Object.entries(record)) {
      if (normalizedAliases.includes(normalizeHeader(key))) {
        return value;
      }
    }
    return '';
  };

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

  const resolveProductIdFromRow = (row: Record<string, string>, index: number, availableProducts: Product[]) => {
    const directId = getColumnValue(row, ['productId', 'product_id', 'id', 'productID']);
    if (directId) {
      const directMatch = availableProducts.find((product) => product.id === directId);
      if (directMatch) return directMatch.id;
    }

    const productName = getColumnValue(row, ['productName', 'product_name', 'product', 'name', 'itemName', 'item', 'productname', 'Product']);
    if (!productName) {
      throw new Error(`Row ${index + 2}: missing product name or ID.`);
    }

    const normalizedProductName = normalizeName(productName);
    const exactMatch = availableProducts.find((product) => normalizeName(product.name) === normalizedProductName);
    const match = exactMatch || availableProducts.find((product) => {
      const normalizedProduct = normalizeName(product.name);
      const normalizedBottleSize = normalizeName((product as any).bottleSize || '');
      return (
        normalizedProduct.includes(normalizedProductName) ||
        normalizedProductName.includes(normalizedProduct) ||
        normalizedProductName.includes(normalizedBottleSize) ||
        normalizedProduct.includes(normalizedBottleSize)
      );
    });

    if (!match) {
      throw new Error(`Row ${index + 2}: product not found for "${productName}".`);
    }

    return match.id;
  };

  const handleImportProductionCsv = async () => {
    if (isPageLocked) {
      setError(`This page is frozen until ${lockDate?.toLocaleDateString()}. Updates are disabled.`);
      return;
    }
    const trimmedText = importCsvText.trim();
    if (!trimmedText) {
      setError('Please choose a CSV file or paste CSV content first.');
      return;
    }

    setIsImporting(true);
    setError('');

    try {
      const rows = parseCsvRows(trimmedText);
      if (rows.length < 2) {
        throw new Error('CSV must include a header row and at least one data row.');
      }

      const headers = rows[0].map((header) => String(header ?? '').replace(/^\uFEFF/, '').trim());
      const dataRows = rows.slice(1).filter((row) => row.some((value) => value.trim()));

      if (!dataRows.length) {
        throw new Error('No production rows were found in the CSV.');
      }

      const latestProducts = await productService.getAll();

      const userId = (user as any)?.id || authService.getCurrentUser()?.uid;
      if (!userId) throw new Error('User not authenticated');

      for (const [index, row] of dataRows.entries()) {
        const record = Object.fromEntries(headers.map((header, headerIndex) => [header, row[headerIndex] ?? '']));
        const productId = resolveProductIdFromRow(record, index, latestProducts);
        const dateStr = getColumnValue(record, ['date', 'productionDate', 'production_date', 'createdAt']) || bulkDate;
        const date = new Date(dateStr || bulkDate);
        if (!productId) throw new Error(`Row ${index + 2}: product not resolved.`);
        const qtyStr = getColumnValue(record, ['quantity', 'qty', 'quantity_cases', 'amount']) || '';
        const quantity = Number(qtyStr || 0);
        if (!Number.isFinite(quantity) || quantity <= 0) {
          throw new Error(`Row ${index + 2}: quantity must be a valid number greater than zero.`);
        }
        const remarks = getColumnValue(record, ['remarks', 'note', 'comments']) || '';

        await productionService.create({ date, productId, quantity, remarks } as any, userId);
      }

      setIsImportModalOpen(false);
      setImportCsvText('');
      setImportFileName('');
      await fetchData();
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import production CSV');
    } finally {
      setIsImporting(false);
    }
  };

  const handleBulkSave = async () => {
    if (isPageLocked) {
      setError(`This page is frozen until ${lockDate?.toLocaleDateString()}. Updates are disabled.`);
      return;
    }
    if (!user) {
      setError('User not authenticated');
      return;
    }

    const validRows = bulkProductRows.filter((row) => row.productId && row.quantity > 0);
    if (!validRows.length) {
      setError('Please add at least one valid product row');
      return;
    }

    try {
      const userId = (user as any)?.id || authService.getCurrentUser()?.uid;
      if (!userId) {
        setError('User ID not found');
        return;
      }

      const productionDate = new Date(bulkDate);
      for (const row of validRows) {
        await productionService.create({
          date: productionDate,
          productId: row.productId,
          quantity: row.quantity,
          remarks: row.remarks,
        } as any, userId);
      }

      setIsBulkModalOpen(false);
      fetchData();
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save bulk production entries');
    }
  };

  const handleEdit = (entry: ProductionEntry) => {
    if (isPageLocked) {
      setError(`This page is frozen until ${lockDate?.toLocaleDateString()}. Updates are disabled.`);
      return;
    }
    setEditingId(entry.id);
    setFormData({
      date: entry.date,
      productId: entry.productId,
      quantity: entry.quantity,
      remarks: entry.remarks || '',
    });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (isPageLocked) {
      setError(`This page is frozen until ${lockDate?.toLocaleDateString()}. Updates are disabled.`);
      return;
    }
    if (!formData.productId || formData.quantity <= 0) {
      setError('Please select a product and enter a valid quantity');
      return;
    }

    if (!user) {
      setError('User not authenticated');
      return;
    }

    try {
      // determine userId: prefer store user.id, fall back to Firebase auth UID
      const userId = (user as any)?.id || authService.getCurrentUser()?.uid;

      if (!userId) {
        setError('User ID not found');
        return;
      }

      if (editingId) {
        await productionService.update(editingId, formData);
      } else {
        // pass form data and userId to service (service will set createdBy)
        await productionService.create(formData as any, userId);
      }

      setIsModalOpen(false);
      fetchData();
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save production entry');
    }
  };

  const handleDelete = async (id: string) => {
    if (isPageLocked) {
      setError(`This page is frozen until ${lockDate?.toLocaleDateString()}. Deletes are disabled.`);
      return;
    }
    if (confirm('Are you sure you want to delete this entry?')) {
      try {
        await productionService.delete(id);
        fetchData();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete entry');
      }
    }
  };

  if (loading) return <Loading fullScreen message="Loading production data..." />;

  const productOptions = products.map((p) => ({ value: p.id, label: p.name }));

  return (
    <Layout title="Daily Production" subtitle="Record daily production entries">
      {error && <Alert type="error" message={error} onClose={() => setError('')} />}

      <div className="mb-6 flex gap-4">
        <Button variant="primary" onClick={handleAddNew} disabled={isPageLocked}>
          ➕ Add Production Entry
        </Button>
        <Button variant="secondary" onClick={handleAddBulk} disabled={isPageLocked}>
          ➕ Add Multiple Products
        </Button>
        <Button variant="secondary" onClick={() => setIsImportModalOpen(true)} disabled={isPageLocked}>
          ⬆ Import Production CSV
        </Button>
      </div>
      {isPageLocked && lockDate && (
        <Alert
          type="warning"
          message={`This page is currently frozen for updates/deletes until ${lockDate.toLocaleDateString()}. Only read and export actions are allowed.`}
          onClose={() => {}}
        />
      )}

      {/* Productions Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Date</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Product</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Quantity</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Remarks</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Created By</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {entries.map((entry) => {
                const product = products.find((p) => p.id === entry.productId);
                return (
                  <tr key={entry.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-800">
                      {new Date(entry.date).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-800">{product?.name || 'N/A'}</td>
                    <td className="px-6 py-4 text-sm text-gray-800 font-semibold">{entry.quantity}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{entry.remarks || '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-800">{userMap[entry.createdBy] || entry.createdBy || '-'}</td>
                    <td className="px-6 py-4 text-sm space-x-2">
                      <Button variant="secondary" size="sm" onClick={() => handleEdit(entry)} disabled={isPageLocked}>
                        Edit
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => handleDelete(entry.id)} disabled={isPageLocked}>
                        Delete
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal for Add/Edit */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingId ? 'Edit Production Entry' : 'Add Production Entry'}
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
            label="Product"
            placeholder="Select a product"
            options={productOptions}
            value={formData.productId}
            onChange={(e) => setFormData({ ...formData, productId: e.target.value })}
          />

          <Input
            label="Quantity (Cases)"
            type="number"
            value={formData.quantity}
            onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) })}
          />

          <Input
            label="Remarks (Optional)"
            placeholder="Add any remarks"
            value={formData.remarks}
            onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
          />
        </div>
      </Modal>

      <Modal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        title="Import Production Entries from CSV"
        size="lg"
        footer={
          <div className="flex gap-4 justify-end">
            <Button variant="outline" onClick={() => setIsImportModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleImportProductionCsv} disabled={isImporting}>
              {isImporting ? 'Importing...' : 'Import CSV'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">Upload a CSV file or paste rows below. Expected headers: productName (or productId), quantity, date (optional), remarks (optional).</p>

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
          <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
            <p className="font-medium">Sample CSV format</p>
            <pre className="mt-2 whitespace-pre-wrap">productName,quantity,date,remarks
LAVIN,10,2026-08-15,Shift A production
WATER BOTTLE,5,2026-08-14,Evening run
SODA,20,,No remarks</pre>
          </div>
          <textarea rows={10} value={importCsvText} onChange={(e) => setImportCsvText(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
        </div>
      </Modal>

      <Modal
        isOpen={isBulkModalOpen}
        onClose={() => setIsBulkModalOpen(false)}
        title="Add Multiple Production Entries"
        size="lg"
        footer={
          <div className="flex gap-4 justify-end">
            <Button variant="outline" onClick={() => setIsBulkModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleBulkSave}>
              Save All
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input
            label="Date"
            type="date"
            value={bulkDate}
            onChange={(e) => setBulkDate(e.target.value)}
          />

          <div className="space-y-4">
            {bulkProductRows.map((row, index) => (
              <div key={index} className="p-4 bg-gray-50 rounded border border-gray-200">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <div>
                    <Select
                      label="Product"
                      placeholder="Select a product"
                      options={productOptions}
                      value={row.productId}
                      onChange={(e) => updateBulkProductRow(index, 'productId', e.target.value)}
                    />
                  </div>
                  <div>
                    <Input
                      label="Quantity"
                      type="number"
                      value={row.quantity}
                      onChange={(e) => updateBulkProductRow(index, 'quantity', parseInt(e.target.value) || 0)}
                    />
                  </div>
                  <div>
                    <Input
                      label="Remarks"
                      placeholder="Optional"
                      value={row.remarks}
                      onChange={(e) => updateBulkProductRow(index, 'remarks', e.target.value)}
                    />
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <Button variant="danger" size="sm" onClick={() => removeBulkProductRow(index)}>
                    Remove Row
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <Button variant="secondary" onClick={addBulkProductRow}>
            ➕ Add Another Product Row
          </Button>
        </div>
      </Modal>
    </Layout>
  );
};
