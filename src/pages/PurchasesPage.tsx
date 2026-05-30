import React, { useEffect, useState } from 'react';
import { Layout, Card, Button, Select, Input, Modal, Alert, Loading } from '@/components';
import { purchaseService } from '@/services/purchaseService';
import { rawMaterialService } from '@/services/rawMaterialService';
import { useAuthStore } from '@/store/authStore';
import { authService } from '@/services/authService';
import { PurchaseEntry, RawMaterial } from '@/types';

export const PurchasesPage: React.FC = () => {
  const [purchases, setPurchases] = useState<PurchaseEntry[]>([]);
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { user } = useAuthStore();

  const [formData, setFormData] = useState<Omit<PurchaseEntry, 'id' | 'createdAt' | 'updatedAt'>>({
    rawMaterialId: '',
    quantity: 0,
    supplier: '',
    price: 0,
    date: new Date(),
    remarks: '',
    createdBy: '',
  } as any);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [pList, mList] = await Promise.all([purchaseService.getAll(), rawMaterialService.getAll({ isActive: true })]);
      setPurchases(pList);
      setMaterials(mList);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch purchases');
    } finally {
      setLoading(false);
    }
  };

  const handleAddNew = () => {
    setFormData({ rawMaterialId: '', quantity: 0, supplier: '', price: 0, date: new Date(), remarks: '', createdBy: '' } as any);
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.rawMaterialId || formData.quantity <= 0) {
      setError('Select material and enter positive quantity');
      return;
    }

    const userId = (user as any)?.id || authService.getCurrentUser()?.uid;
    if (!userId) {
      setError('User not authenticated');
      return;
    }

    try {
      setLoading(true);
      await purchaseService.create(formData as any, userId);
      setIsModalOpen(false);
      await fetchData();
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save purchase');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Loading fullScreen message="Loading purchases..." />;

  const materialOptions = materials.map((m) => ({ value: m.id, label: `${m.name} (${m.unit})` }));

  return (
    <Layout title="Purchases" subtitle="Record raw material purchases and update inventory">
      {error && <Alert type="error" message={error} onClose={() => setError('')} />}

      <div className="mb-6 flex gap-4">
        <Button variant="primary" onClick={handleAddNew}>➕ Add Purchase</Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Date</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Material</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Quantity</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Unit</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Price</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Supplier</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Created By</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {purchases.map((p) => {
                const material = materials.find((m) => m.id === p.rawMaterialId);
                return (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-800">{new Date(p.date).toLocaleDateString()}</td>
                    <td className="px-6 py-4 text-sm text-gray-800">{material?.name || 'N/A'}</td>
                    <td className="px-6 py-4 text-sm font-semibold text-gray-800">{p.quantity} {material?.unit}</td>
                    <td className="px-6 py-4 text-sm text-gray-800">{p.price?.toFixed(2) || '0.00'}</td>
                    <td className="px-6 py-4 text-sm text-gray-800">{p.supplier || '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-800">{p.createdBy || '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-600">{p.remarks || '-'}</td>
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
        title="Add Purchase"
        size="md"
        footer={<div className="flex gap-4 justify-end"><Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button><Button variant="primary" onClick={handleSave}>Save</Button></div>}
      >
        <div className="space-y-4">
          <Input label="Date" type="date" value={formData.date instanceof Date ? formData.date.toISOString().split('T')[0] : ''} onChange={(e) => setFormData({ ...formData, date: new Date(e.target.value) } as any)} />

          <Select
            label="Raw Material"
            placeholder="Select a material"
            options={materialOptions}
            value={formData.rawMaterialId}
            onChange={(e) => setFormData({ ...formData, rawMaterialId: e.target.value } as any)}
          />

          <Input label="Quantity" type="number" value={formData.quantity} onChange={(e) => setFormData({ ...formData, quantity: parseFloat(e.target.value) || 0 } as any)} />

          <Input label="Price" type="number" step="0.01" value={formData.price} onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 } as any)} />

          <Input label="Supplier (Optional)" value={formData.supplier} onChange={(e) => setFormData({ ...formData, supplier: e.target.value } as any)} />

          <Input label="Remarks (Optional)" value={formData.remarks} onChange={(e) => setFormData({ ...formData, remarks: e.target.value } as any)} />
        </div>
      </Modal>
    </Layout>
  );
};
