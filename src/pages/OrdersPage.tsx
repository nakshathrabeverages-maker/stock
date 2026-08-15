import React, { useState, useEffect, useMemo } from 'react';
import { Layout, Card, Button, Input, Select, Modal, Alert, Loading } from '@/components';
import { downloadCsv } from '@/utils/csvUtils';
import { orderService } from '@/services/orderService';
import { productService } from '@/services/productService';
import { customerService } from '@/services/customerService';
import { userService } from '@/services/userService';
import { useAuthStore } from '@/store/authStore';
import { authService } from '@/services/authService';
import { usePageLock } from '@/hooks/usePageLock';
import { OrderEntry, Product, Customer } from '@/types';

interface BulkProductRow {
  productId: string;
  quantity: number;
  pricePerCase: number;
  remarks: string;
}

export const OrdersPage: React.FC = () => {
  const [entries, setEntries] = useState<OrderEntry[]>([]);
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
    { productId: '', quantity: 0, pricePerCase: 0, remarks: '' },
  ]);
  const [sortKey, setSortKey] = useState<'orderDate' | 'customer' | 'status'>('orderDate');
  const [customerFilter, setCustomerFilter] = useState('');
  const [productFilter, setProductFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
  const { user } = useAuthStore();
  const { lockDate, isLocked: isPageLocked } = usePageLock('orders');

  const [formData, setFormData] = useState<Omit<OrderEntry, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'convertedToSale'>>({
    orderDate: new Date(),
    deliveryDate: undefined,
    productId: '',
    customerId: '',
    orderedBy: '',
    quantity: 0,
    pricePerCase: 0,
    totalPrice: 0,
    status: 'order_created',
    remarks: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [ordersData, productsData, customersData, users] = await Promise.all([
        orderService.getAll(),
        productService.getAll(),
        customerService.getAll(),
        userService.getAll(),
      ]);
      setEntries(ordersData);
      setProducts(productsData);
      setCustomers(customersData);
      setUserMap(Object.fromEntries(users.map((user) => [user.id, user.email || user.name || user.id])));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch orders data');
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
      orderDate: new Date(),
      deliveryDate: undefined,
      productId: '',
      customerId: '',
      orderedBy: '',
      quantity: 0,
      pricePerCase: 0,
      totalPrice: 0,
      status: 'order_created',
      remarks: '',
    });
    setIsModalOpen(true);
  };

  const handleAddBulkOrders = () => {
    if (isPageLocked) {
      setError(`This page is frozen until ${lockDate?.toLocaleDateString()}. Updates are disabled.`);
      return;
    }
    setBulkCustomerId('');
    setBulkDate(new Date().toISOString().split('T')[0]);
    setBulkProductRows([{ productId: '', quantity: 0, pricePerCase: 0, remarks: '' }]);
    setIsBulkModalOpen(true);
  };

  const handleExportOrders = () => {
    if (!sortedEntries.length) {
      setError('No order data available to export.');
      return;
    }

    const rows = sortedEntries.map((entry) => ({
      'Order Date': new Date(entry.orderDate).toLocaleDateString(),
      'Delivery Date': entry.deliveryDate ? new Date(entry.deliveryDate).toLocaleDateString() : '',
      Product: products.find((p) => p.id === entry.productId)?.name || 'N/A',
      Customer: customers.find((c) => c.id === entry.customerId)?.name || 'N/A',
      Quantity: entry.quantity,
      'Price per Case': entry.pricePerCase.toFixed(2),
      'Total Price': entry.totalPrice.toFixed(2),
      Status: entry.status,
      Remarks: entry.remarks || '',
      'Created By': userMap[entry.orderedBy] || entry.orderedBy || '-',
    }));

    downloadCsv(rows, [
      { label: 'Order Date', key: 'Order Date' },
      { label: 'Delivery Date', key: 'Delivery Date' },
      { label: 'Product', key: 'Product' },
      { label: 'Customer', key: 'Customer' },
      { label: 'Quantity', key: 'Quantity' },
      { label: 'Price per Case', key: 'Price per Case' },
      { label: 'Total Price', key: 'Total Price' },
      { label: 'Status', key: 'Status' },
      { label: 'Remarks', key: 'Remarks' },
      { label: 'Created By', key: 'Created By' },
    ], `orders-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const addBulkProductRow = () => {
    setBulkProductRows([...bulkProductRows, { productId: '', quantity: 0, pricePerCase: 0, remarks: '' }]);
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
    if (isPageLocked) {
      setError(`This page is frozen until ${lockDate?.toLocaleDateString()}. Updates are disabled.`);
      return;
    }
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

      const orderDate = new Date(bulkDate);
      for (const row of validRows) {
        await orderService.create(
          {
            orderDate,
            deliveryDate: undefined,
            productId: row.productId,
            customerId: bulkCustomerId,
            orderedBy: '',
            quantity: row.quantity,
            pricePerCase: row.pricePerCase,
            totalPrice: row.quantity * row.pricePerCase,
            status: 'order_created',
            remarks: row.remarks,
          },
          userId
        );
      }

      setIsBulkModalOpen(false);
      fetchData();
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save orders');
    }
  };

  const handleEdit = (entry: OrderEntry) => {
    if (isPageLocked) {
      setError(`This page is frozen until ${lockDate?.toLocaleDateString()}. Updates are disabled.`);
      return;
    }
    setEditingId(entry.id);
    setFormData({
      orderDate: entry.orderDate,
      deliveryDate: entry.deliveryDate,
      productId: entry.productId,
      customerId: entry.customerId,
      orderedBy: entry.orderedBy,
      quantity: entry.quantity,
      pricePerCase: entry.pricePerCase,
      totalPrice: entry.totalPrice,
      status: entry.status,
      remarks: entry.remarks || '',
    });
    setIsModalOpen(true);
  };

  const computedTotal = useMemo(
    () => formData.quantity * formData.pricePerCase,
    [formData.quantity, formData.pricePerCase]
  );

  const missingFields = useMemo(() => {
    const missing: string[] = [];
    if (!formData.productId) missing.push('Product');
    if (!formData.customerId) missing.push('Customer');
    if (!(formData.quantity > 0)) missing.push('Quantity');
    if (!(formData.pricePerCase > 0)) missing.push('Price/Case');
    if (!formData.orderedBy) missing.push('Order By');
    return missing;
  }, [formData.productId, formData.customerId, formData.quantity, formData.pricePerCase, formData.orderedBy]);

  const isFormValid = missingFields.length === 0;

  const filteredEntries = useMemo(() => {
    const startDate = startDateFilter ? new Date(startDateFilter) : null;
    const endDate = endDateFilter ? new Date(endDateFilter) : null;
    if (endDate) {
      endDate.setHours(23, 59, 59, 999);
    }

    return entries.filter((entry) => {
      const entryDate = new Date(entry.orderDate);
      const matchesCustomer = customerFilter ? entry.customerId === customerFilter : true;
      const matchesProduct = productFilter ? entry.productId === productFilter : true;
      const matchesStatus = statusFilter ? entry.status === statusFilter : true;
      const matchesStartDate = startDate ? entryDate >= startDate : true;
      const matchesEndDate = endDate ? entryDate <= endDate : true;

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
        return a.status.localeCompare(b.status);
      }

      return new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime();
    });
  }, [filteredEntries, customers, sortKey]);

  const formatStatus = (status: OrderEntry['status']) => {
    switch (status) {
      case 'order_created':
        return 'Order Created';
      case 'order_accepted':
        return 'Order Accepted';
      case 'loading_in_progress':
        return 'Loading in Progress';
      case 'vehicle_started':
        return 'Vehicle Started';
      case 'delivered':
        return 'Delivered';
      default:
        return status;
    }
  };

  const handleSave = async () => {
    if (isPageLocked) {
      setError(`This page is frozen until ${lockDate?.toLocaleDateString()}. Updates are disabled.`);
      return;
    }
    if (!formData.productId || !formData.customerId || formData.quantity <= 0 || formData.pricePerCase <= 0) {
      setError('Please select a product, customer, and enter valid quantity and price');
      return;
    }

    if (!formData.orderedBy) {
      setError('Please enter the ordered-by name');
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
      };

      if (editingId) {
        await orderService.update(editingId, payload as Partial<OrderEntry>, userId);
      } else {
        await orderService.create(payload as any, userId);
      }

      setIsModalOpen(false);
      fetchData();
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save order');
    }
  };

  const handleDelete = async (id: string) => {
    if (isPageLocked) {
      setError(`This page is frozen until ${lockDate?.toLocaleDateString()}. Deletes are disabled.`);
      return;
    }
    if (confirm('Are you sure you want to delete this order?')) {
      try {
        await orderService.delete(id);
        fetchData();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete order');
      }
    }
  };

  if (loading) return <Loading fullScreen message="Loading orders..." />;

  const productOptions = products.map((product) => ({ value: product.id, label: product.name }));
  const customerOptions = customers.map((customer) => ({ value: customer.id, label: customer.name }));

  return (
    <Layout title="Orders" subtitle="Track order status and create sales on delivery">
      {error && <Alert type="error" message={error} onClose={() => setError('')} />}

      <div className="mb-6 space-y-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex gap-3 flex-wrap">
            <Button variant="primary" onClick={handleAddNew} disabled={isPageLocked}>
              ➕ Add Order
            </Button>
            <Button variant="secondary" onClick={handleAddBulkOrders} disabled={isPageLocked}>
              ➕ Add Multiple Orders
            </Button>
            <Button variant="secondary" onClick={handleExportOrders}>
              ⬇ Export CSV
            </Button>
          </div>
          {isPageLocked && lockDate && (
            <Alert
              type="warning"
              message={`This page is currently frozen for updates/deletes until ${lockDate.toLocaleDateString()}. Only read and export actions are allowed.`}
              onClose={() => {}}
            />
          )}
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700">Sort by:</label>
            <Select
              options={[
                { value: 'orderDate', label: 'Order Date' },
                { value: 'customer', label: 'Customer' },
                { value: 'status', label: 'Status' },
              ]}
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as 'orderDate' | 'customer' | 'status')}
            />
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Select
            label="Customer Filter"
            options={[{ value: '', label: 'All Customers' }, ...customerOptions]}
            value={customerFilter}
            onChange={(e) => setCustomerFilter(e.target.value)}
          />
          <Select
            label="Product Filter"
            options={[{ value: '', label: 'All Products' }, ...productOptions]}
            value={productFilter}
            onChange={(e) => setProductFilter(e.target.value)}
          />
          <Select
            label="Status Filter"
            options={[
              { value: '', label: 'All Statuses' },
              { value: 'order_created', label: 'Order Created' },
              { value: 'order_accepted', label: 'Order Accepted' },
              { value: 'loading_in_progress', label: 'Loading in Progress' },
              { value: 'vehicle_started', label: 'Vehicle Started' },
              { value: 'delivered', label: 'Delivered' },
            ]}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
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
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Order Date</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Delivery Date</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Product</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Customer</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Order By</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Quantity</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Price/Case</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Total</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Created By</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sortedEntries.map((entry) => (
                <tr key={entry.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm text-gray-800">{new Date(entry.orderDate).toLocaleDateString()}</td>
                  <td className="px-6 py-4 text-sm text-gray-800">{entry.deliveryDate ? new Date(entry.deliveryDate).toLocaleDateString() : '-'}</td>
                  <td className="px-6 py-4 text-sm text-gray-800">{products.find((p) => p.id === entry.productId)?.name || '-'}</td>
                  <td className="px-6 py-4 text-sm text-gray-800">{customers.find((c) => c.id === entry.customerId)?.name || '-'}</td>
                  <td className="px-6 py-4 text-sm text-gray-800">{entry.orderedBy || '-'}</td>
                  <td className="px-6 py-4 text-sm text-gray-800">{entry.quantity}</td>
                  <td className="px-6 py-4 text-sm text-gray-800">₹{entry.pricePerCase?.toFixed(2) || '0.00'}</td>
                  <td className="px-6 py-4 text-sm text-gray-800">₹{entry.totalPrice?.toFixed(2) || '0.00'}</td>
                  <td className="px-6 py-4 text-sm text-gray-800">{formatStatus(entry.status)}</td>
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
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingId ? 'Edit Order' : 'Add Order'}
        size="lg"
        footer={
          <div className="flex gap-4 justify-end">
            <Button variant="outline" onClick={() => setIsModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSave} disabled={!isFormValid}>
              Save
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="Order Date"
              type="date"
              value={formData.orderDate instanceof Date ? formData.orderDate.toISOString().split('T')[0] : ''}
              onChange={(e) => setFormData({ ...formData, orderDate: new Date(e.target.value) })}
            />
            <Input
              label="Delivery Date"
              type="date"
              value={formData.deliveryDate ? formData.deliveryDate.toISOString().split('T')[0] : ''}
              onChange={(e) => setFormData({ ...formData, deliveryDate: e.target.value ? new Date(e.target.value) : undefined })}
            />
          </div>

          <Select
            label="Product"
            options={productOptions}
            value={formData.productId}
            onChange={(e) => setFormData({ ...formData, productId: e.target.value })}
          />

          <Select
            label="Customer"
            options={customerOptions}
            value={formData.customerId}
            onChange={(e) => setFormData({ ...formData, customerId: e.target.value })}
          />

          <Input
            label="Order By"
            placeholder="Name of person who placed the order"
            value={formData.orderedBy}
            onChange={(e) => setFormData({ ...formData, orderedBy: e.target.value })}
          />

          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="Quantity"
              type="number"
              value={formData.quantity}
              onChange={(e) => setFormData({ ...formData, quantity: parseFloat(e.target.value) || 0 })}
            />
            <Input
              label="Price/Case"
              type="number"
              value={formData.pricePerCase}
              onChange={(e) => setFormData({ ...formData, pricePerCase: parseFloat(e.target.value) || 0 })}
            />
          </div>

          <Input
            label="Total"
            type="number"
            value={computedTotal}
            readOnly
          />

          <Select
            label="Status"
            options={[
              { value: 'order_created', label: 'Order Created' },
              { value: 'order_accepted', label: 'Order Accepted' },
              { value: 'loading_in_progress', label: 'Loading in Progress' },
              { value: 'vehicle_started', label: 'Vehicle Started' },
              { value: 'delivered', label: 'Delivered' },
            ]}
            value={formData.status}
            onChange={(e) => setFormData({ ...formData, status: e.target.value as OrderEntry['status'] })}
          />

          <Input
            label="Remarks (Optional)"
            placeholder="Any notes"
            value={formData.remarks}
            onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
          />
          {missingFields.length > 0 && (
            <p className="text-sm text-red-600">Missing: {missingFields.join(', ')}</p>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={isBulkModalOpen}
        onClose={() => setIsBulkModalOpen(false)}
        title="Add Multiple Orders"
        size="xl"
        footer={
          <div className="flex gap-4 justify-end">
            <Button variant="outline" onClick={() => setIsBulkModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleBulkSave}>
              Save Orders
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Select
              label="Customer"
              options={customerOptions}
              value={bulkCustomerId}
              onChange={(e) => setBulkCustomerId(e.target.value)}
            />
            <Input
              label="Order Date"
              type="date"
              value={bulkDate}
              onChange={(e) => setBulkDate(e.target.value)}
            />
          </div>

          {bulkProductRows.map((row, index) => (
            <div key={index} className="grid gap-4 md:grid-cols-5 items-end">
              <Select
                label="Product"
                options={productOptions}
                value={row.productId}
                onChange={(e) => updateBulkProductRow(index, 'productId', e.target.value)}
              />
              <Input
                label="Quantity"
                type="number"
                value={row.quantity}
                onChange={(e) => updateBulkProductRow(index, 'quantity', parseFloat(e.target.value) || 0)}
              />
              <Input
                label="Price/Case"
                type="number"
                value={row.pricePerCase}
                onChange={(e) => updateBulkProductRow(index, 'pricePerCase', parseFloat(e.target.value) || 0)}
              />
              <Input
                label="Remarks"
                placeholder="Optional notes"
                value={row.remarks}
                onChange={(e) => updateBulkProductRow(index, 'remarks', e.target.value)}
              />
              <div className="flex items-center gap-2">
                <Button variant="secondary" size="sm" onClick={() => removeBulkProductRow(index)}>
                  Remove
                </Button>
              </div>
            </div>
          ))}

          <Button variant="outline" onClick={addBulkProductRow}>
            + Add another row
          </Button>
        </div>
      </Modal>
    </Layout>
  );
};
