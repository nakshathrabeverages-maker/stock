import React, { useState, useEffect, useMemo } from 'react';
import { Layout, Card, Button, Input, Select, Modal, Alert, Loading } from '@/components';
import { salesService } from '@/services/salesService';
import { productService } from '@/services/productService';
import { customerService } from '@/services/customerService';
import { userService } from '@/services/userService';
import { useAuthStore } from '@/store/authStore';
import { authService } from '@/services/authService';
import { SaleEntry, Product, Customer } from '@/types';

interface BulkProductRow {
  productId: string;
  quantity: number;
  pricePerCase: number;
  paidAmount: number;
  paymentStatus: 'pending' | 'done';
  remarks: string;
}

export const SalesPage: React.FC = () => {
  const [entries, setEntries] = useState<SaleEntry[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [userMap, setUserMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [importJsonText, setImportJsonText] = useState('');
  const [importFileName, setImportFileName] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [bulkCustomerId, setBulkCustomerId] = useState('');
  const [bulkDate, setBulkDate] = useState(new Date().toISOString().split('T')[0]);
  const [bulkProductRows, setBulkProductRows] = useState<BulkProductRow[]>([
    { productId: '', quantity: 0, pricePerCase: 0, paidAmount: 0, paymentStatus: 'pending', remarks: '' },
  ]);
  const [sortKey, setSortKey] = useState<'date' | 'customer' | 'status'>('date');
  const [customerFilter, setCustomerFilter] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
  const [selectedEntryIds, setSelectedEntryIds] = useState<string[]>([]);
  const { user } = useAuthStore();

  const [formData, setFormData] = useState<Omit<SaleEntry, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>>({
    date: new Date(),
    productId: '',
    customerId: '',
    quantity: 0,
    pricePerCase: 0,
    totalPrice: 0,
    paidAmount: 0,
    remainingAmount: 0,
    paymentStatus: 'pending',
    remarks: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

  const parseImportDate = (value: string | Date | undefined) => {
    if (value instanceof Date) return value;
    if (!value) return new Date();

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        const [year, month, day] = trimmed.split('-').map(Number);
        return new Date(year, month - 1, day);
      }

      const parsed = new Date(trimmed);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }

    return new Date();
  };

  const normalizeName = (value: unknown) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');

  const resolveProductId = (row: any) => {
    const explicitId = row.productId || row.product_id;
    if (explicitId) return explicitId;

    const candidateNames = [
      row.productName,
      row.product_name,
      row.product,
      row.itemName,
      row.item,
      row.name,
      row.productname,
      row.itemname,
      row.productid,
    ];
    const productName = candidateNames.find((value) => typeof value === 'string' && value.trim());
    if (!productName) return '';

    const normalizedProductName = normalizeName(productName);
    const match = products.find((product) => {
      const normalizedProduct = normalizeName(product.name);
      return (
        normalizedProduct === normalizedProductName ||
        normalizedProduct.includes(normalizedProductName) ||
        normalizedProductName.includes(normalizedProduct) ||
        normalizedProductName.includes(normalizeName(product.name.replace(/\s+/g, '')))
      );
    });

    return match?.id || '';
  };

  const resolveCustomerId = (row: any) => {
    const explicitId = row.customerId || row.customer_id;
    if (explicitId) return explicitId;

    const candidateNames = [
      row.customerName,
      row.customer_name,
      row.customer,
      row.partyName,
      row.party,
      row.customername,
      row.partyname,
    ];
    const customerName = candidateNames.find((value) => typeof value === 'string' && value.trim());
    if (!customerName) return '';

    const normalizedCustomerName = normalizeName(customerName);
    const match = customers.find((customer) => {
      const normalizedCustomer = normalizeName(customer.name);
      return (
        normalizedCustomer === normalizedCustomerName ||
        normalizedCustomer.includes(normalizedCustomerName) ||
        normalizedCustomerName.includes(normalizedCustomer)
      );
    });

    return match?.id || '';
  };

  const buildImportedSalePayload = (row: any, index: number) => {
    const productId = resolveProductId(row);
    const customerId = resolveCustomerId(row);
    const quantity = Number(row.quantity ?? row.qty ?? 0);
    const pricePerCase = Number(row.pricePerCase ?? row.price_per_case ?? row.price ?? row.rate ?? 0);
    const paidAmount = Number(row.paidAmount ?? row.paid ?? row.amountPaid ?? row.advanceAmount ?? 0);

    if (!productId) {
      throw new Error(`Row ${index + 1}: product not found. Use a valid product name or ID.`);
    }

    if (!customerId) {
      throw new Error(`Row ${index + 1}: customer not found. Use a valid customer name or ID.`);
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      throw new Error(`Row ${index + 1}: quantity must be greater than zero.`);
    }

    if (!Number.isFinite(pricePerCase) || pricePerCase <= 0) {
      throw new Error(`Row ${index + 1}: price per case must be greater than zero.`);
    }

    const totalPrice = quantity * pricePerCase;
    const remainingAmount = Math.max(totalPrice - paidAmount, 0);

    return {
      date: parseImportDate(row.date ?? row.saleDate ?? row.createdAt),
      productId,
      customerId,
      quantity,
      pricePerCase,
      totalPrice,
      paidAmount,
      remainingAmount,
      paymentStatus: remainingAmount <= 0 ? 'done' : 'pending',
      remarks: row.remarks ?? row.note ?? '',
    } as Omit<SaleEntry, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>;
  };

  const applyProductStockDelta = (productId: string, delta: number) => {
    setProducts((prev) =>
      prev.map((product) =>
        product.id === productId
          ? { ...product, currentStock: Math.max(product.currentStock + delta, 0) }
          : product
      )
    );
  };

  const fetchData = async () => {
    try {
      setLoading(true);
      const [salesData, productsData, customersData, users] = await Promise.all([
        salesService.getAll(),
        productService.getAll(),
        customerService.getAll(),
        userService.getAll(),
      ]);

      const sortedSales = [...salesData].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setEntries(sortedSales);
      setProducts(productsData);
      setCustomers(customersData);
      setUserMap(Object.fromEntries(users.map((user) => [user.id, user.email || user.name || user.id])));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch sales data');
    } finally {
      setLoading(false);
    }
  };

  const handleAddNew = () => {
    setEditingId(null);
    setFormData({
      date: new Date(),
      productId: '',
      customerId: '',
      quantity: 0,
      pricePerCase: 0,
      totalPrice: 0,
      paidAmount: 0,
      remainingAmount: 0,
      paymentStatus: 'pending',
      remarks: '',
    });
    setIsModalOpen(true);
  };

  const handleAddBulkSales = () => {
    setBulkCustomerId('');
    setBulkDate(new Date().toISOString().split('T')[0]);
    setBulkProductRows([{ productId: '', quantity: 0, pricePerCase: 0, paidAmount: 0, paymentStatus: 'pending', remarks: '' }]);
    setIsBulkModalOpen(true);
  };

  const handleOpenImportModal = () => {
    setImportJsonText('');
    setImportFileName('');
    setSuccessMessage('');
    setError('');
    setIsImportModalOpen(true);
  };

  const parseCsvRows = (text: string) => {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentValue = '';
    let inQuotes = false;

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];

      if (char === '"') {
        if (inQuotes && text[index + 1] === '"') {
          currentValue += '"';
          index += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        currentRow.push(currentValue);
        currentValue = '';
      } else if ((char === '\n' || char === '\r') && !inQuotes) {
        if (char === '\r' && text[index + 1] === '\n') {
          index += 1;
        }
        currentRow.push(currentValue);
        if (currentRow.some((cell) => cell.trim())) {
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
      if (currentRow.some((cell) => cell.trim())) {
        rows.push(currentRow);
      }
    }

    return rows;
  };

  const parseImportedSalesRecords = (text: string, fileName: string) => {
    const trimmedText = text.trim();
    if (!trimmedText) {
      throw new Error('Please choose a JSON/CSV file or paste JSON/CSV content first.');
    }

    const lowerFileName = fileName.toLowerCase();
    if (lowerFileName.endsWith('.json')) {
      const parsed = JSON.parse(trimmedText);
      const records = Array.isArray(parsed) ? parsed : parsed?.sales;
      if (!Array.isArray(records)) {
        throw new Error('JSON must be an array of sales records or an object with a sales array.');
      }
      return records;
    }

    if (lowerFileName.endsWith('.csv')) {
      const rows = parseCsvRows(trimmedText);
      if (rows.length < 2) {
        throw new Error('CSV must include a header row and at least one data row.');
      }

      const [headers, ...dataRows] = rows;
      const normalizedHeaders = headers.map((header) => header.trim().toLowerCase().replace(/[^a-z0-9]+/g, ''));

      return dataRows
        .filter((row) => row.some((cell) => cell.trim()))
        .map((row) => {
          const record: Record<string, string> = {};
          normalizedHeaders.forEach((header, index) => {
            record[header] = row[index] ?? '';
          });

          const pickValue = (...keys: string[]) => {
            for (const key of keys) {
              const value = record[key];
              if (value !== undefined && String(value).trim() !== '') {
                return String(value).trim();
              }
            }
            return '';
          };

          return {
            date: pickValue('date', 'saledate', 'createdat'),
            customer: pickValue('customer', 'customername', 'customer', 'party', 'partyname'),
            product: pickValue('product', 'productname', 'item', 'itemname', 'name'),
            quantity: pickValue('quantity', 'qty', 'qtysold'),
            pricePerCase: pickValue('pricepercase', 'price', 'rate', 'pricepercase', 'percaseprice'),
            paidAmount: pickValue('paidamount', 'paid', 'amountpaid', 'advanceamount'),
            remarks: pickValue('remarks', 'note', 'description'),
          };
        });
    }

    try {
      const parsed = JSON.parse(trimmedText);
      const records = Array.isArray(parsed) ? parsed : parsed?.sales;
      if (Array.isArray(records)) {
        return records;
      }
    } catch {
      // Fall back to CSV parsing for pasted CSV content.
    }

    const rows = parseCsvRows(trimmedText);
    if (rows.length < 2) {
      throw new Error('Unable to parse the entered content. Use JSON or CSV format.');
    }

    const [headers, ...dataRows] = rows;
    const normalizedHeaders = headers.map((header) => header.trim().toLowerCase().replace(/[^a-z0-9]+/g, ''));

    return dataRows
      .filter((row) => row.some((cell) => cell.trim()))
      .map((row) => {
        const record: Record<string, string> = {};
        normalizedHeaders.forEach((header, index) => {
          record[header] = row[index] ?? '';
        });

        const pickValue = (...keys: string[]) => {
          for (const key of keys) {
            const value = record[key];
            if (value !== undefined && String(value).trim() !== '') {
              return String(value).trim();
            }
          }
          return '';
        };

        return {
          date: pickValue('date', 'saledate', 'createdat'),
          customer: pickValue('customer', 'customername', 'customer', 'party', 'partyname'),
          product: pickValue('product', 'productname', 'item', 'itemname', 'name'),
          quantity: pickValue('quantity', 'qty', 'qtysold'),
          pricePerCase: pickValue('pricepercase', 'price', 'rate', 'percaseprice'),
          paidAmount: pickValue('paidamount', 'paid', 'amountpaid', 'advanceamount'),
          remarks: pickValue('remarks', 'note', 'description'),
        };
      });
  };

  const handleImportFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      setImportJsonText(text);
      setImportFileName(file.name);
      setError('');
      setSuccessMessage('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read JSON file');
    } finally {
      event.target.value = '';
    }
  };

  const handleImportSubmit = async () => {
    if (!importJsonText.trim()) {
      setError('Please choose a JSON/CSV file or paste JSON/CSV content first.');
      return;
    }

    if (!user) {
      setError('User not authenticated');
      return;
    }

    try {
      setIsImporting(true);
      const records = parseImportedSalesRecords(importJsonText, importFileName);

      const userId = (user as any)?.id || authService.getCurrentUser()?.uid;
      if (!userId) {
        throw new Error('User ID not found');
      }

      const payloads = records.map((row, index) => buildImportedSalePayload(row, index));
      const createdEntries: SaleEntry[] = [];
      for (const payload of payloads) {
        const createdEntry = await salesService.create(payload as any, userId, { skipStockValidation: true });
        createdEntries.push(createdEntry as SaleEntry);
        applyProductStockDelta(payload.productId, -payload.quantity);
      }

      setEntries((prev) => [...createdEntries, ...prev]);
      setIsImportModalOpen(false);
      setImportJsonText('');
      setImportFileName('');
      setSuccessMessage(`Imported ${payloads.length} sales successfully.`);
      setError('');
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import sales');
    } finally {
      setIsImporting(false);
    }
  };

  const addBulkProductRow = () => {
    setBulkProductRows([...bulkProductRows, { productId: '', quantity: 0, pricePerCase: 0, paidAmount: 0, paymentStatus: 'pending', remarks: '' }]);
  };

  const removeBulkProductRow = (index: number) => {
    setBulkProductRows(bulkProductRows.filter((_, i) => i !== index));
  };

  const updateBulkProductRow = (index: number, field: keyof BulkProductRow, value: any) => {
    const updated = [...bulkProductRows];
    updated[index] = { ...updated[index], [field]: value };
    setBulkProductRows(updated);
  };

  const handleBulkSave = async () => {
    if (!bulkCustomerId) {
      setError('Please select a customer');
      return;
    }

    const validRows = bulkProductRows.filter((row) => row.productId && row.quantity > 0 && row.pricePerCase > 0);
    if (!validRows.length) {
      setError('Please add at least one product with valid quantity and price');
      return;
    }

    if (!user) {
      setError('User not authenticated');
      return;
    }

    try {
      const userId = (user as any)?.id || authService.getCurrentUser()?.uid;
      if (!userId) {
        setError('User ID not found');
        return;
      }

      const saleDate = new Date(bulkDate);
      const createdEntries: SaleEntry[] = [];
      for (const row of validRows) {
        const totalPrice = row.quantity * row.pricePerCase;
        const remainingAmount = Math.max(totalPrice - row.paidAmount, 0);
        const payload = {
          date: saleDate,
          productId: row.productId,
          customerId: bulkCustomerId,
          quantity: row.quantity,
          pricePerCase: row.pricePerCase,
          totalPrice: totalPrice,
          paidAmount: row.paidAmount,
          remainingAmount: remainingAmount,
          paymentStatus: remainingAmount <= 0 ? 'done' : 'pending',
          remarks: row.remarks,
        };
        const createdEntry = await salesService.create(payload as any, userId);
        createdEntries.push(createdEntry as SaleEntry);
        applyProductStockDelta(payload.productId, -payload.quantity);
      }

      setEntries((prev) => [...createdEntries, ...prev]);
      setIsBulkModalOpen(false);
      fetchData();
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save sales');
    }
  };

  const handleEdit = (entry: SaleEntry) => {
    setEditingId(entry.id);
    setFormData({
      date: entry.date,
      productId: entry.productId,
      customerId: entry.customerId,
      quantity: entry.quantity,
      pricePerCase: entry.pricePerCase,
      totalPrice: entry.totalPrice,
      paidAmount: entry.paidAmount ?? 0,
      remainingAmount: entry.remainingAmount ?? Math.max(entry.totalPrice - (entry.paidAmount ?? 0), 0),
      paymentStatus: entry.paymentStatus || 'pending',
      remarks: entry.remarks || '',
    });
    setIsModalOpen(true);
  };

  const computedTotal = useMemo(
    () => formData.quantity * formData.pricePerCase,
    [formData.quantity, formData.pricePerCase]
  );

  const toDateOnly = (value: Date | string | undefined) => {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return null;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const filteredEntries = useMemo(() => {
    const startDateValue = startDateFilter ? toDateOnly(startDateFilter) : null;
    const endDateValue = endDateFilter ? toDateOnly(endDateFilter) : null;

    return entries.filter((entry) => {
      const entryDateValue = toDateOnly(entry.date);
      const matchesCustomer = customerFilter ? entry.customerId === customerFilter : true;
      const matchesProduct = productFilter ? entry.productId === productFilter : true;
      const matchesStatus = statusFilter
        ? (entry.paymentStatus ?? '').toLowerCase() === statusFilter.toLowerCase()
        : true;
      const matchesStartDate = startDateValue ? (entryDateValue ?? '') >= startDateValue : true;
      const matchesEndDate = endDateValue ? (entryDateValue ?? '') <= endDateValue : true;

      return matchesCustomer && matchesProduct && matchesStatus && matchesStartDate && matchesEndDate;
    });
  }, [entries, customerFilter, productFilter, statusFilter, startDateFilter, endDateFilter]);

  const sortedEntries = useMemo(() => {
    return [...filteredEntries].sort((a, b) => {
      if (sortKey === 'customer') {
        const customerA = customers.find((c) => c.id === a.customerId)?.name || '';
        const customerB = customers.find((c) => c.id === b.customerId)?.name || '';
        return customerA.localeCompare(customerB);
      }

      if (sortKey === 'status') {
        return a.paymentStatus.localeCompare(b.paymentStatus);
      }

      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
  }, [filteredEntries, customers, sortKey]);

  const computedRemaining = useMemo(() => {
    const rem = computedTotal - (formData.paidAmount || 0);
    return rem;
  }, [computedTotal, formData.paidAmount]);

  // Auto-update payment status when remaining becomes zero
  useEffect(() => {
    if (computedRemaining <= 0 && formData.paymentStatus !== 'done') {
      setFormData((f) => ({ ...f, paymentStatus: 'done', remainingAmount: 0 }));
    } else if (computedRemaining > 0 && formData.paymentStatus === 'done') {
      setFormData((f) => ({ ...f, paymentStatus: 'pending', remainingAmount: computedRemaining }));
    } else {
      setFormData((f) => ({ ...f, remainingAmount: computedRemaining }));
    }
  }, [computedRemaining]);

  const handleSave = async () => {
    if (!formData.productId || !formData.customerId || formData.quantity <= 0 || formData.pricePerCase <= 0) {
      setError('Please select a product, customer, and enter valid quantity and price');
      return;
    }

    if (!user) {
      setError('User not authenticated');
      return;
    }

    try {
      const userId = (user as any)?.id || authService.getCurrentUser()?.uid;
      if (!userId) {
        setError('User ID not found');
        return;
      }

      const payload = {
        ...formData,
        totalPrice: computedTotal,
        remainingAmount: computedTotal - (formData.paidAmount || 0),
        paymentStatus: formData.paymentStatus,
      };

      if (editingId) {
        await salesService.update(editingId, payload as any);
      } else {
        const createdEntry = await salesService.create(payload as any, userId);
        setEntries((prev) => [createdEntry as SaleEntry, ...prev]);
        applyProductStockDelta(payload.productId, -payload.quantity);
      }

      setIsModalOpen(false);
      fetchData();
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save sale');
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this sale?')) {
      try {
        const entryToDelete = await salesService.getById(id);
        await salesService.delete(id);
        applyProductStockDelta(entryToDelete.productId, entryToDelete.quantity);
        setSelectedEntryIds((prev) => prev.filter((entryId) => entryId !== id));
        await fetchData();
        setError('');
        setSuccessMessage('Sale deleted successfully.');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete sale');
      }
    }
  };

  const handleBulkDelete = async () => {
    if (!selectedEntryIds.length) {
      setError('Please select at least one sale to delete.');
      return;
    }

    if (!confirm(`Delete ${selectedEntryIds.length} selected sale(s)?`)) {
      return;
    }

    try {
      const entriesToDelete = await Promise.all(selectedEntryIds.map((id) => salesService.getById(id)));
      await salesService.deleteMany(selectedEntryIds);
      entriesToDelete.forEach((entry) => applyProductStockDelta(entry.productId, entry.quantity));
      setSelectedEntryIds([]);
      await fetchData();
      setError('');
      setSuccessMessage('Selected sales deleted successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete selected sales');
    }
  };

  const toggleEntrySelection = (id: string) => {
    setSelectedEntryIds((prev) => (prev.includes(id) ? prev.filter((entryId) => entryId !== id) : [...prev, id]));
  };

  const toggleSelectAll = () => {
    if (selectedEntryIds.length === sortedEntries.length) {
      setSelectedEntryIds([]);
    } else {
      setSelectedEntryIds(sortedEntries.map((entry) => entry.id));
    }
  };

  if (loading) return <Loading fullScreen message="Loading sales..." />;

  const productOptions = products.map((product) => ({ value: product.id, label: product.name }));
  const customerOptions = customers.map((customer) => ({ value: customer.id, label: customer.name }));

  return (
    <Layout title="Sales" subtitle="Record sales by customer and product">
      {error && <Alert type="error" message={error} onClose={() => setError('')} />}
      {successMessage && <Alert type="success" message={successMessage} onClose={() => setSuccessMessage('')} />}

      <div className="mb-6 space-y-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-wrap gap-3">
            <Button variant="primary" onClick={handleAddNew}>
              ➕ Add Sale
            </Button>
            <Button variant="secondary" onClick={handleAddBulkSales}>
              ➕ Add Multiple Products
            </Button>
            <Button variant="outline" onClick={handleOpenImportModal}>
              ⬆ Upload JSON
            </Button>
            <Button variant="danger" onClick={handleBulkDelete} disabled={!selectedEntryIds.length}>
              🗑 Delete Selected
            </Button>
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700">Sort by:</label>
            <Select
              options={[
                { value: 'date', label: 'Date' },
                { value: 'customer', label: 'Customer' },
                { value: 'status', label: 'Payment Status' },
              ]}
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as 'date' | 'customer' | 'status')}
            />
          </div>
        </div>

        <Card className="p-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
            <Select
              label="Filter by Customer"
              placeholder="All customers"
              options={[{ value: '', label: 'All customers' }, ...customerOptions]}
              value={customerFilter}
              onChange={(e) => setCustomerFilter(e.target.value)}
            />
            <Select
              label="Filter by Product"
              placeholder="All products"
              options={[{ value: '', label: 'All products' }, ...productOptions]}
              value={productFilter}
              onChange={(e) => setProductFilter(e.target.value)}
            />
            <Select
              label="Filter by Status"
              placeholder="All statuses"
              options={[
                { value: '', label: 'All statuses' },
                { value: 'pending', label: 'Pending' },
                { value: 'done', label: 'Done' },
              ]}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            />
            <Input
              label="Start Date"
              type="date"
              value={startDateFilter}
              onChange={(e) => setStartDateFilter(e.target.value)}
            />
            <Input
              label="End Date"
              type="date"
              value={endDateFilter}
              onChange={(e) => setEndDateFilter(e.target.value)}
            />
          </div>
        </Card>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-3 text-left text-sm font-semibold text-gray-700">
                  <input
                    type="checkbox"
                    checked={sortedEntries.length > 0 && selectedEntryIds.length === sortedEntries.length}
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                </th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Date</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Product</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Customer</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Quantity</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Price/Case</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Total</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Paid</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Remaining</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Created By</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sortedEntries.map((entry) => {
                const product = products.find((p) => p.id === entry.productId);
                const customer = customers.find((c) => c.id === entry.customerId);
                return (
                  <tr key={entry.id} className="hover:bg-gray-50">
                    <td className="px-3 py-4">
                      <input
                        type="checkbox"
                        checked={selectedEntryIds.includes(entry.id)}
                        onChange={() => toggleEntrySelection(entry.id)}
                        className="h-4 w-4 rounded border-gray-300"
                      />
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-800">{new Date(entry.date).toLocaleDateString()}</td>
                    <td className="px-6 py-4 text-sm text-gray-800">{product?.name || 'N/A'}</td>
                    <td className="px-6 py-4 text-sm text-gray-800">{customer?.name || 'N/A'}</td>
                    <td className="px-6 py-4 text-sm text-gray-800">{entry.quantity}</td>
                    <td className="px-6 py-4 text-sm text-gray-800">₹{entry.pricePerCase.toFixed(2)}</td>
                    <td className="px-6 py-4 text-sm text-gray-800">₹{entry.totalPrice.toFixed(2)}</td>
                    <td className="px-6 py-4 text-sm text-gray-800">₹{(entry.paidAmount ?? 0).toFixed(2)}</td>
                    <td className="px-6 py-4 text-sm text-gray-800">₹{(entry.remainingAmount ?? 0).toFixed(2)}</td>
                    <td className="px-6 py-4 text-sm text-gray-800">{entry.paymentStatus}</td>
                    <td className="px-6 py-4 text-sm text-gray-800">{userMap[entry.createdBy] || entry.createdBy || '-'}</td>
                    <td className="px-6 py-4 text-sm space-x-2">
                      <Button variant="secondary" size="sm" onClick={() => handleEdit(entry)}>
                        Edit
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => handleDelete(entry.id)}>
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

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingId ? 'Edit Sale' : 'Add Sale'}
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

          <Select
            label="Customer"
            placeholder="Select a customer"
            options={customerOptions}
            value={formData.customerId}
            onChange={(e) => setFormData({ ...formData, customerId: e.target.value })}
          />

          <Input
            label="Quantity"
            type="number"
            value={formData.quantity}
            onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })}
          />

          <Input
            label="Price per Case"
            type="number"
            value={formData.pricePerCase}
            onChange={(e) => setFormData({ ...formData, pricePerCase: parseFloat(e.target.value) || 0 })}
          />

          <Input
            label="Total Price"
            type="number"
            value={computedTotal}
            readOnly
          />

          <Input
            label="Paid Amount"
            type="number"
            value={formData.paidAmount}
            onChange={(e) => setFormData({ ...formData, paidAmount: parseFloat(e.target.value) || 0 })}
          />

          <Input
            label="Remaining Amount"
            type="number"
            value={formData.remainingAmount}
            readOnly
          />

          <div className="bg-gray-50 p-3 rounded border border-gray-200">
            <p className="text-sm text-gray-600">Payment Status</p>
            <p className="text-lg font-semibold text-gray-800">{formData.paymentStatus === 'done' ? 'Done' : 'Pending'}</p>
          </div>

          <Input
            label="Remarks (Optional)"
            placeholder="Any notes for this sale"
            value={formData.remarks}
            onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
          />
        </div>
      </Modal>

      <Modal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        title="Upload Sales JSON"
        size="lg"
        footer={
          <div className="flex gap-4 justify-end">
            <Button variant="outline" onClick={() => setIsImportModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleImportSubmit} loading={isImporting}>
              Import Sales
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Upload a JSON or CSV file containing sales records. Product and customer can be provided by name or ID.
          </p>

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Choose JSON or CSV file</span>
            <input
              type="file"
              accept=".json,application/json,.csv,text/csv"
              onChange={handleImportFileChange}
              className="mt-2 block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-white hover:file:bg-opacity-90"
            />
          </label>

          {importFileName && <p className="text-sm text-gray-600">Selected file: {importFileName}</p>}

          <label className="block">
            <span className="text-sm font-medium text-gray-700">Or paste JSON/CSV directly</span>
            <textarea
              rows={10}
              value={importJsonText}
              onChange={(e) => setImportJsonText(e.target.value)}
              className="mt-2 w-full rounded border border-gray-300 px-3 py-2 font-mono text-sm"
              placeholder='[{"date":"2026-07-26","customer":"Ravi Kumar","product":"Water Bottle","quantity":10,"pricePerCase":120,"paidAmount":600}]'
            />
          </label>

          <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
            <p className="mb-2 font-semibold text-gray-700">Example format</p>
            <pre className="whitespace-pre-wrap break-words">{`JSON example:
[
  {
    "date": "2026-07-26",
    "customer": "Ravi Kumar",
    "product": "Water Bottle",
    "quantity": 10,
    "pricePerCase": 120,
    "paidAmount": 600,
    "remarks": "Imported from JSON"
  }
]

CSV example:
date,customer,product,quantity,pricePerCase,paidAmount,remarks
2026-07-26,Ravi Kumar,Water Bottle,10,120,600,Imported from CSV`}</pre>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={isBulkModalOpen}
        onClose={() => setIsBulkModalOpen(false)}
        title="Add Multiple Products for Customer"
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
          <Select
            label="Customer"
            placeholder="Select a customer"
            options={customerOptions}
            value={bulkCustomerId}
            onChange={(e) => setBulkCustomerId(e.target.value)}
          />

          <Input
            label="Date"
            type="date"
            value={bulkDate}
            onChange={(e) => setBulkDate(e.target.value)}
          />

          <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-700">Products</h3>
              <Button variant="secondary" size="sm" onClick={addBulkProductRow}>
                ➕ Add Row
              </Button>
            </div>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {bulkProductRows.map((row, index) => {
                const totalPrice = row.quantity * row.pricePerCase;
                const remainingAmount = Math.max(totalPrice - row.paidAmount, 0);
                return (
                  <div key={index} className="p-3 bg-gray-50 rounded border border-gray-200">
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div>
                        <label className="text-xs text-gray-600 mb-1 block font-medium">Product</label>
                        <select
                          className="w-full px-2 py-2 border border-gray-300 rounded text-sm"
                          value={row.productId}
                          onChange={(e) => updateBulkProductRow(index, 'productId', e.target.value)}
                        >
                          <option value="">Select product</option>
                          {products.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-gray-600 mb-1 block font-medium">Quantity</label>
                        <input
                          type="number"
                          className="w-full px-2 py-2 border border-gray-300 rounded text-sm"
                          value={row.quantity}
                          onChange={(e) => updateBulkProductRow(index, 'quantity', parseInt(e.target.value) || 0)}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-600 mb-1 block font-medium">Price per Case</label>
                        <input
                          type="number"
                          className="w-full px-2 py-2 border border-gray-300 rounded text-sm"
                          value={row.pricePerCase}
                          onChange={(e) => updateBulkProductRow(index, 'pricePerCase', parseFloat(e.target.value) || 0)}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-600 mb-1 block font-medium">Total Price</label>
                        <div className="px-2 py-2 text-sm font-semibold text-gray-700 bg-white rounded border border-gray-200">
                          ₹{totalPrice.toFixed(2)}
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-gray-600 mb-1 block font-medium">Paid Amount</label>
                        <input
                          type="number"
                          className="w-full px-2 py-2 border border-gray-300 rounded text-sm"
                          value={row.paidAmount}
                          onChange={(e) => updateBulkProductRow(index, 'paidAmount', parseFloat(e.target.value) || 0)}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-gray-600 mb-1 block font-medium">Remaining Amount</label>
                        <div className="px-2 py-2 text-sm font-semibold text-gray-700 bg-white rounded border border-gray-200">
                          ₹{remainingAmount.toFixed(2)}
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-gray-600 mb-1 block font-medium">Payment Status</label>
                        <div className="px-2 py-2 text-sm font-semibold text-gray-700 bg-white rounded border border-gray-200">
                          {remainingAmount <= 0 ? 'Done' : 'Pending'}
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-gray-600 mb-1 block font-medium">Remarks</label>
                        <input
                          type="text"
                          placeholder="Optional"
                          className="w-full px-2 py-2 border border-gray-300 rounded text-sm"
                          value={row.remarks}
                          onChange={(e) => updateBulkProductRow(index, 'remarks', e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => removeBulkProductRow(index)}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Modal>
    </Layout>
  );
};
