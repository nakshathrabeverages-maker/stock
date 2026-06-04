import React, { useState, useEffect } from 'react';
import { Layout, Card, Button, Input, Select, Modal, Alert, Loading } from '@/components';
import { productionService } from '@/services/productionService';
import { productService } from '@/services/productService';
import { userService } from '@/services/userService';
import { useAuthStore } from '@/store/authStore';
import { authService } from '@/services/authService';
import { ProductionEntry, Product } from '@/types';

export const ProductionPage: React.FC = () => {
  const [entries, setEntries] = useState<ProductionEntry[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [userMap, setUserMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const { user } = useAuthStore();
  const [formData, setFormData] = useState<Omit<ProductionEntry, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>>({
    date: new Date(),
    productId: '',
    quantity: 0,
    remarks: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

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
    setEditingId(null);
    setFormData({
      date: new Date(),
      productId: '',
      quantity: 0,
      remarks: '',
    });
    setIsModalOpen(true);
  };

  const handleEdit = (entry: ProductionEntry) => {
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
        <Button variant="primary" onClick={handleAddNew}>
          ➕ Add Production Entry
        </Button>
      </div>

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
    </Layout>
  );
};
