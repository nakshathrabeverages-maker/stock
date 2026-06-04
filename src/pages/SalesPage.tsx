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
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [bulkCustomerId, setBulkCustomerId] = useState('');
  const [bulkDate, setBulkDate] = useState(new Date().toISOString().split('T')[0]);
  const [bulkProductRows, setBulkProductRows] = useState<BulkProductRow[]>([
    { productId: '', quantity: 0, pricePerCase: 0, paidAmount: 0, paymentStatus: 'pending', remarks: '' },
  ]);
  const [sortKey, setSortKey] = useState<'date' | 'customer' | 'status'>('date');
  const [customerFilter, setCustomerFilter] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
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

  const fetchData = async () => {
    try {
      setLoading(true);
      const [salesData, productsData, customersData, users] = await Promise.all([
        salesService.getAll(),
        productService.getAll(),
        customerService.getAll(),
        userService.getAll(),
      ]);
      setEntries(salesData);
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
          paymentStatus: remainingAmount <= 0 ? 'done' : row.paymentStatus,
          remarks: row.remarks,
        };
        await salesService.create(payload as any, userId);
      }

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

  const filteredEntries = useMemo(() => {
    const startDate = startDateFilter ? new Date(startDateFilter) : null;
    const endDate = endDateFilter ? new Date(endDateFilter) : null;
    if (endDate) {
      endDate.setHours(23, 59, 59, 999);
    }

    return entries.filter((entry) => {
      const customerName = customers.find((c) => c.id === entry.customerId)?.name || '';
      const productName = products.find((p) => p.id === entry.productId)?.name || '';
      const entryDate = new Date(entry.date);

      const matchesCustomer = customerFilter ? entry.customerId === customerFilter : true;
      const matchesProduct = productFilter ? entry.productId === productFilter : true;
      const matchesStartDate = startDate ? entryDate >= startDate : true;
      const matchesEndDate = endDate ? entryDate <= endDate : true;

      return matchesCustomer && matchesProduct && matchesStartDate && matchesEndDate;
    });
  }, [entries, customers, products, customerFilter, productFilter, startDateFilter, endDateFilter]);

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
        await salesService.create(payload as any, userId);
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
        await salesService.delete(id);
        fetchData();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete sale');
      }
    }
  };

  if (loading) return <Loading fullScreen message="Loading sales..." />;

  const productOptions = products.map((product) => ({ value: product.id, label: product.name }));
  const customerOptions = customers.map((customer) => ({ value: customer.id, label: customer.name }));

  return (
    <Layout title="Sales" subtitle="Record sales by customer and product">
      {error && <Alert type="error" message={error} onClose={() => setError('')} />}

      <div className="mb-6 space-y-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex gap-3">
            <Button variant="primary" onClick={handleAddNew}>
              ➕ Add Sale
            </Button>
            <Button variant="secondary" onClick={handleAddBulkSales}>
              ➕ Add Multiple Products
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
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
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

          <Select
            label="Payment Status"
            options={[{ value: 'pending', label: 'Pending' }, { value: 'done', label: 'Done' }]}
            value={formData.paymentStatus}
            onChange={(e) => setFormData({ ...formData, paymentStatus: e.target.value as any })}
          />

          <Input
            label="Remarks (Optional)"
            placeholder="Any notes for this sale"
            value={formData.remarks}
            onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
          />
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
                        <select
                          className="w-full px-2 py-2 border border-gray-300 rounded text-sm"
                          value={row.paymentStatus}
                          onChange={(e) => updateBulkProductRow(index, 'paymentStatus', e.target.value as any)}
                        >
                          <option value="pending">Pending</option>
                          <option value="done">Done</option>
                        </select>
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
