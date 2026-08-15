import React, { useEffect, useState } from 'react';
import { Layout, Card, Button, Select, Input, Modal, Alert, Loading } from '@/components';
import { downloadCsv } from '@/utils/csvUtils';
import { purchaseService } from '@/services/purchaseService';
import { rawMaterialService } from '@/services/rawMaterialService';
import { userService } from '@/services/userService';
import { useAuthStore } from '@/store/authStore';
import { authService } from '@/services/authService';
import { usePageLock } from '@/hooks/usePageLock';
import { PurchaseEntry, RawMaterial, RawMaterialCategory } from '@/types';
import { RAW_MATERIAL_CATEGORIES } from '@/constants/rawMaterial';

export const PurchasesPage: React.FC = () => {
  const [purchases, setPurchases] = useState<PurchaseEntry[]>([]);
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [userMap, setUserMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const { user } = useAuthStore();

  const { lockDate, isLocked: isPageLocked } = usePageLock('purchases');
  const [formData, setFormData] = useState<Omit<PurchaseEntry, 'id' | 'createdAt' | 'updatedAt'>>({
    rawMaterialId: '',
    quantity: 0,
    supplier: '',
    price: 0,
    paidAmount: 0,
    remainingAmount: 0,
    paymentStatus: 'pending',
    category: '',
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
      const [pList, mList, users] = await Promise.all([
        purchaseService.getAll(),
        rawMaterialService.getAll({ isActive: true }),
        userService.getAll(),
      ]);
      setPurchases(pList);
      setMaterials(mList);
      setUserMap(Object.fromEntries(users.map((user) => [user.id, user.email || user.name || user.id])));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch purchases');
    } finally {
      setLoading(false);
    }
  };

  const handleExportPurchases = () => {
    if (!purchases.length) {
      setError('No purchase data available to export.');
      return;
    }

    const rows = purchases.map((purchase) => {
      const material = materials.find((m) => m.id === purchase.rawMaterialId);
      return {
        Date: new Date(purchase.date).toLocaleDateString(),
        Material: material?.name || 'N/A',
        Category: material?.category || purchase.category || '',
        Quantity: purchase.quantity,
        Price: purchase.price.toFixed(2),
        Total: (purchase.price * purchase.quantity).toFixed(2),
        'Paid Amount': purchase.paidAmount.toFixed(2),
        'Remaining Amount': purchase.remainingAmount.toFixed(2),
        Status: purchase.paymentStatus,
        Supplier: purchase.supplier || '',
        Remarks: purchase.remarks || '',
        'Created By': userMap[purchase.createdBy] || purchase.createdBy || '-',
      };
    });

    downloadCsv(rows, [
      { label: 'Date', key: 'Date' },
      { label: 'Material', key: 'Material' },
      { label: 'Category', key: 'Category' },
      { label: 'Quantity', key: 'Quantity' },
      { label: 'Price', key: 'Price' },
      { label: 'Total', key: 'Total' },
      { label: 'Paid Amount', key: 'Paid Amount' },
      { label: 'Remaining Amount', key: 'Remaining Amount' },
      { label: 'Status', key: 'Status' },
      { label: 'Supplier', key: 'Supplier' },
      { label: 'Remarks', key: 'Remarks' },
      { label: 'Created By', key: 'Created By' },
    ], `purchases-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const handleAddNew = () => {
    if (isPageLocked) {
      setError(`This page is frozen until ${lockDate?.toLocaleDateString()}. Updates are disabled.`);
      return;
    }
    setEditingId(null);
    setFormData({ rawMaterialId: '', quantity: 0, supplier: '', price: 0, paidAmount: 0, remainingAmount: 0, paymentStatus: 'pending', category: '', date: new Date(), remarks: '', createdBy: '' } as any);
    setIsModalOpen(true);
  };

  const handleEdit = (purchase: PurchaseEntry) => {
    if (isPageLocked) {
      setError(`This page is frozen until ${lockDate?.toLocaleDateString()}. Updates are disabled.`);
      return;
    }
    const selectedMaterial = materials.find((m) => m.id === purchase.rawMaterialId);
    setEditingId(purchase.id);
    setFormData({
      rawMaterialId: purchase.rawMaterialId,
      quantity: purchase.quantity,
      supplier: purchase.supplier || '',
      price: purchase.price,
      paidAmount: purchase.paidAmount,
      remainingAmount: purchase.remainingAmount,
      paymentStatus: purchase.paymentStatus,
      category: purchase.category || selectedMaterial?.category || '',
      date: purchase.date,
      remarks: purchase.remarks || '',
      createdBy: purchase.createdBy,
    } as any);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (isPageLocked) {
      setError(`This page is frozen until ${lockDate?.toLocaleDateString()}. Deletes are disabled.`);
      return;
    }
    if (!window.confirm('Delete this purchase and adjust stock?')) return;
    try {
      setLoading(true);
      await purchaseService.delete(id);
      await fetchData();
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete purchase');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (isPageLocked) {
      setError(`This page is frozen until ${lockDate?.toLocaleDateString()}. Updates are disabled.`);
      return;
    }
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
      if (editingId) {
        await purchaseService.update(editingId, formData as any);
      } else {
        await purchaseService.create(formData as any, userId);
      }
      setIsModalOpen(false);
      setEditingId(null);
      await fetchData();
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save purchase');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Loading fullScreen message="Loading purchases..." />;

  const filteredMaterials = formData.category ? materials.filter((m) => m.category === formData.category) : materials;
  const materialOptions = filteredMaterials.map((m) => ({ value: m.id, label: `${m.name} (${m.unit})` }));

  return (
    <Layout title="Purchases" subtitle="Record raw material purchases and update inventory">
      {error && <Alert type="error" message={error} onClose={() => setError('')} />}

      <div className="mb-6 flex gap-4">
        <Button variant="primary" onClick={handleAddNew} disabled={isPageLocked}>➕ Add Purchase</Button>
        <Button variant="secondary" onClick={handleExportPurchases}>⬇ Export CSV</Button>
      </div>
      {isPageLocked && lockDate && (
        <Alert
          type="warning"
          message={`This page is currently frozen for updates/deletes until ${lockDate.toLocaleDateString()}. Only read and export actions are allowed.`}
          onClose={() => {}}
        />
      )}

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Date</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Material</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Category</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Quantity</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Price</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Total</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Paid Amount</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Balance</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Supplier</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Created By</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {purchases.map((p) => {
                const material = materials.find((m) => m.id === p.rawMaterialId);
                const totalPrice = p.price * p.quantity;
                return (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm text-gray-800">{new Date(p.date).toLocaleDateString()}</td>
                    <td className="px-6 py-4 text-sm text-gray-800">{material?.name || 'N/A'}</td>
                    <td className="px-6 py-4 text-sm text-gray-800">{material?.category || p.category || '-'}</td>
                    <td className="px-6 py-4 text-sm font-semibold text-gray-800">{p.quantity} {material?.unit}</td>
                    <td className="px-6 py-4 text-sm text-gray-800">₹{p.price?.toFixed(2) || '0.00'}</td>
                    <td className="px-6 py-4 text-sm font-semibold text-gray-800">₹{totalPrice.toFixed(2)}</td>
                    <td className="px-6 py-4 text-sm text-gray-800">₹{p.paidAmount?.toFixed(2) || '0.00'}</td>
                    <td className="px-6 py-4 text-sm font-semibold text-gray-800">₹{p.remainingAmount?.toFixed(2) || '0.00'}</td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${p.paymentStatus === 'done' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                        {p.paymentStatus === 'done' ? 'Done' : 'Pending'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-800">{p.supplier || '-'}</td>
                    <td className="px-6 py-4 text-sm text-gray-800">{userMap[p.createdBy] || p.createdBy || '-'}</td>
                    <td className="px-6 py-4 text-sm space-x-2">
                      <Button variant="secondary" size="sm" onClick={() => handleEdit(p)} disabled={isPageLocked}>
                        Edit
                      </Button>
                      <Button variant="danger" size="sm" onClick={() => handleDelete(p.id)} disabled={isPageLocked}>
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
        onClose={() => {
          setIsModalOpen(false);
          setEditingId(null);
        }}
        title={editingId ? 'Edit Purchase' : 'Add Purchase'}
        size="md"
        footer={<div className="flex gap-4 justify-end"><Button variant="outline" onClick={() => { setIsModalOpen(false); setEditingId(null); }}>Cancel</Button><Button variant="primary" onClick={handleSave}>Save</Button></div>}
      >
        <div className="space-y-4">
          <Input label="Date" type="date" value={formData.date instanceof Date ? formData.date.toISOString().split('T')[0] : ''} onChange={(e) => setFormData({ ...formData, date: new Date(e.target.value) } as any)} />

          <Select
            label="Category"
            placeholder="Select a category"
            options={RAW_MATERIAL_CATEGORIES}
            value={formData.category}
            onChange={(e) => setFormData({ ...formData, category: e.target.value as RawMaterialCategory, rawMaterialId: '' } as any)}
          />

          <Select
            label="Raw Material"
            placeholder="Select a material"
            options={materialOptions}
            value={formData.rawMaterialId}
            onChange={(e) => {
              const selectedMaterial = materials.find(m => m.id === e.target.value);
              setFormData({
                ...formData,
                rawMaterialId: e.target.value,
                category: selectedMaterial?.category || formData.category,
              } as any);
            }}
          />

          <Input label="Quantity" type="number" value={formData.quantity} onChange={(e) => {
            const newQuantity = parseFloat(e.target.value) || 0;
            const totalPrice = formData.price * newQuantity;
              const rawRemaining = totalPrice - formData.paidAmount;
              const newRemaining = Math.max(Math.round(rawRemaining * 100) / 100, 0);
              const statusRemaining = newRemaining < 10 ? 0 : newRemaining;
              const newStatus = statusRemaining === 0 ? 'done' : 'pending';
              setFormData({ ...formData, quantity: newQuantity, remainingAmount: statusRemaining, paymentStatus: newStatus } as any);
            }} />

            <Input label="Price" type="number" step="0.01" value={formData.price} onChange={(e) => {
              const newPrice = parseFloat(e.target.value) || 0;
              const totalPrice = newPrice * formData.quantity;
              const rawRemaining = totalPrice - formData.paidAmount;
              const newRemaining = Math.max(Math.round(rawRemaining * 100) / 100, 0);
              const statusRemaining = newRemaining < 10 ? 0 : newRemaining;
              const newStatus = statusRemaining === 0 ? 'done' : 'pending';
              setFormData({ ...formData, price: newPrice, remainingAmount: statusRemaining, paymentStatus: newStatus } as any);
            }} />

            <Input label="Paid Amount" type="number" step="0.01" value={formData.paidAmount} onChange={(e) => {
              const newPaidAmount = parseFloat(e.target.value) || 0;
              const totalPrice = formData.price * formData.quantity;
              const rawRemaining = totalPrice - newPaidAmount;
              const newRemaining = Math.max(Math.round(rawRemaining * 100) / 100, 0);
              const statusRemaining = newRemaining < 10 ? 0 : newRemaining;
              const newStatus = statusRemaining === 0 ? 'done' : 'pending';
              setFormData({ ...formData, paidAmount: newPaidAmount, remainingAmount: statusRemaining, paymentStatus: newStatus } as any);
            }} />

          <div className="bg-blue-50 p-4 rounded border border-blue-200">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-gray-600">Total Price</p>
                <p className="text-lg font-semibold text-gray-800">₹{(formData.price * formData.quantity).toFixed(2)}</p>
              </div>
              <div>
                <p className="text-gray-600">Balance</p>
                <p className="text-lg font-semibold text-gray-800">₹{formData.remainingAmount?.toFixed(2) || '0.00'}</p>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 p-3 rounded border border-gray-200">
            <p className="text-sm text-gray-600">Payment Status</p>
            <p className="text-lg font-semibold text-gray-800">{formData.paymentStatus === 'done' ? 'Done' : 'Pending'}</p>
          </div>

          <Input label="Supplier (Optional)" value={formData.supplier} onChange={(e) => setFormData({ ...formData, supplier: e.target.value } as any)} />

          <Input label="Remarks (Optional)" value={formData.remarks} onChange={(e) => setFormData({ ...formData, remarks: e.target.value } as any)} />
        </div>
      </Modal>
    </Layout>
  );
};
