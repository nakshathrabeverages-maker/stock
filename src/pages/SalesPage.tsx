import React, { useState, useEffect, useMemo } from 'react';
import { Layout, Card, Button, Input, Select, Modal, Alert, Loading } from '@/components';
import { salesService } from '@/services/salesService';
import { productService } from '@/services/productService';
import { customerService } from '@/services/customerService';
import { useAuthStore } from '@/store/authStore';
import { authService } from '@/services/authService';
import { SaleEntry, Product, Customer } from '@/types';

export const SalesPage: React.FC = () => {
  const [entries, setEntries] = useState<SaleEntry[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<'date' | 'customer' | 'status'>('date');
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
      const [salesData, productsData, customersData] = await Promise.all([
        salesService.getAll(),
        productService.getAll(),
        customerService.getAll(),
      ]);
      setEntries(salesData);
      setProducts(productsData);
      setCustomers(customersData);
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

  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) => {
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
  }, [entries, customers, sortKey]);

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

      <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <Button variant="primary" onClick={handleAddNew}>
          ➕ Add Sale
        </Button>
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
                    <td className="px-6 py-4 text-sm text-gray-800">{entry.createdBy || '-'}</td>
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
    </Layout>
  );
};
