import React, { useState, useEffect } from 'react';
import { Layout, Card, Button, Input, Select, Modal, Alert, Loading } from '@/components';
import { downloadCsv } from '@/utils/csvUtils';
import { rawMaterialService } from '@/services/rawMaterialService';
import { userService } from '@/services/userService';
import { authService } from '@/services/authService';
import { usePageLock } from '@/hooks/usePageLock';
import { RawMaterial, RawMaterialCategory } from '@/types';
import { RAW_MATERIAL_CATEGORIES } from '@/constants/rawMaterial';

export const RawMaterialsPage: React.FC = () => {
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [userMap, setUserMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Omit<RawMaterial, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>>({
    name: '',
    category: 'Preforms',
    unit: '',
    currentStock: 0,
    minimumStockLevel: 0,
    dateAdded: new Date(),
    isActive: true,
  });

  useEffect(() => {
    fetchMaterials();
  }, []);

  const { lockDate, isLocked: isPageLocked } = usePageLock('rawMaterials');

  const fetchMaterials = async () => {
    try {
      setLoading(true);
      const [data, users] = await Promise.all([
        rawMaterialService.getAll({ isActive: true }),
        userService.getAll(),
      ]);
      setMaterials(data);
      setUserMap(Object.fromEntries(users.map((user) => [user.id, user.email || user.name || user.id])));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch materials');
    } finally {
      setLoading(false);
    }
  };

  const handleExportMaterials = () => {
    if (!materials.length) {
      setError('No raw material data available to export.');
      return;
    }

    const rows = materials.map((material) => ({
      Name: material.name,
      Category: material.category,
      Unit: material.unit,
      'Current Stock': material.currentStock,
      'Minimum Stock Level': material.minimumStockLevel,
      'Date Added': new Date(material.dateAdded).toLocaleDateString(),
      'Created By': userMap[material.createdBy] || material.createdBy || '-',
      Status: material.currentStock < material.minimumStockLevel ? 'Low Stock' : 'OK',
    }));

    downloadCsv(rows, [
      { label: 'Name', key: 'Name' },
      { label: 'Category', key: 'Category' },
      { label: 'Unit', key: 'Unit' },
      { label: 'Current Stock', key: 'Current Stock' },
      { label: 'Minimum Stock Level', key: 'Minimum Stock Level' },
      { label: 'Date Added', key: 'Date Added' },
      { label: 'Created By', key: 'Created By' },
      { label: 'Status', key: 'Status' },
    ], `raw-materials-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const handleAddNew = () => {
    if (isPageLocked) {
      setError(`This page is frozen until ${lockDate?.toLocaleDateString()}. Updates are disabled.`);
      return;
    }
    setEditingId(null);
    setFormData({
      name: '',
      category: 'Preforms',
      unit: '',
      currentStock: 0,
      minimumStockLevel: 0,
      dateAdded: new Date(),
      isActive: true,
    });
    setIsModalOpen(true);
  };

  const handleEdit = (material: RawMaterial) => {
    if (isPageLocked) {
      setError(`This page is frozen until ${lockDate?.toLocaleDateString()}. Updates are disabled.`);
      return;
    }
    setEditingId(material.id);
    setFormData({
      name: material.name,
      category: material.category,
      unit: material.unit,
      currentStock: material.currentStock,
      minimumStockLevel: material.minimumStockLevel,
      dateAdded: material.dateAdded,
      isActive: material.isActive,
    });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (isPageLocked) {
      setError(`This page is frozen until ${lockDate?.toLocaleDateString()}. Updates are disabled.`);
      return;
    }
    if (!formData.name || !formData.unit) {
      setError('Please fill in all required fields');
      return;
    }

    try {
      const userId = authService.getCurrentUser()?.uid;
      if (!userId) {
        setError('User not authenticated');
        return;
      }

      if (editingId) {
        await rawMaterialService.update(editingId, formData);
      } else {
        await rawMaterialService.create(formData as any, userId);
      }
      setIsModalOpen(false);
      fetchMaterials();
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save material');
    }
  };

  const handleDelete = async (id: string) => {
    if (isPageLocked) {
      setError(`This page is frozen until ${lockDate?.toLocaleDateString()}. Deletes are disabled.`);
      return;
    }
    if (confirm('Are you sure you want to delete this material?')) {
      try {
        await rawMaterialService.disable(id);
        fetchMaterials();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to delete material');
      }
    }
  };

  if (loading) return <Loading fullScreen message="Loading raw materials..." />;

  return (
    <Layout title="Raw Materials" subtitle="Manage raw materials inventory">
      {error && <Alert type="error" message={error} onClose={() => setError('')} />}

      <div className="mb-6 flex gap-4">
        <Button variant="primary" onClick={handleAddNew} disabled={isPageLocked}>
          ➕ Add New Material
        </Button>
        <Button variant="secondary" onClick={handleExportMaterials}>
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

      {/* Materials Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Name</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Category</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Current Stock</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Min Level</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Date Added</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Created By</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {materials.map((material) => (
                <tr key={material.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm text-gray-800">{material.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{material.category}</td>
                  <td className="px-6 py-4 text-sm text-gray-800">
                    {material.currentStock} {material.unit}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {material.minimumStockLevel} {material.unit}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-800">{new Date(material.dateAdded).toLocaleDateString()}</td>
                  <td className="px-6 py-4 text-sm text-gray-800">{userMap[material.createdBy] || material.createdBy || '-'}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        material.currentStock < material.minimumStockLevel
                          ? 'bg-red-100 text-red-800'
                          : 'bg-green-100 text-green-800'
                      }`}
                    >
                      {material.currentStock < material.minimumStockLevel ? 'Low Stock' : 'OK'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm space-x-2">
                    <Button variant="secondary" size="sm" onClick={() => handleEdit(material)} disabled={isPageLocked}>
                      Edit
                    </Button>
                    <Button variant="danger" size="sm" onClick={() => handleDelete(material.id)} disabled={isPageLocked}>
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal for Add/Edit */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingId ? 'Edit Raw Material' : 'Add New Raw Material'}
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
            label="Material Name"
            placeholder="e.g., 250ML Preform"
            list="raw-material-name-list"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
          <datalist id="raw-material-name-list">
            {materials.map((material) => (
              <option key={material.id} value={material.name} />
            ))}
          </datalist>

          <Select
            label="Category"
            options={RAW_MATERIAL_CATEGORIES}
            value={formData.category}
            onChange={(e) => setFormData({ ...formData, category: e.target.value as RawMaterialCategory })}
          />

          <Input
            label="Unit (e.g., kg, pieces, liters)"
            placeholder="e.g., kg"
            value={formData.unit}
            onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
          />

          <Input
            label="Current Stock"
            type="number"
            value={formData.currentStock}
            onChange={(e) => setFormData({ ...formData, currentStock: parseFloat(e.target.value) })}
          />

          <Input
            label="Minimum Stock Level"
            type="number"
            value={formData.minimumStockLevel}
            onChange={(e) => setFormData({ ...formData, minimumStockLevel: parseFloat(e.target.value) })}
          />

          <Input
            label="Date Added"
            type="date"
            value={formData.dateAdded instanceof Date ? formData.dateAdded.toISOString().split('T')[0] : ''}
            onChange={(e) => setFormData({ ...formData, dateAdded: new Date(e.target.value) })}
          />
        </div>
      </Modal>
    </Layout>
  );
};
