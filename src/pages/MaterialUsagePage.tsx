import React, { useState, useEffect, useMemo } from 'react';
import {
  Layout,
  Card,
  Button,
  Input,
  Select,
  Modal,
  Alert,
  Loading,
} from '@/components';

import { materialUsageService } from '@/services/materialUsageService';
import { rawMaterialService } from '@/services/rawMaterialService';
import { useAuthStore } from '@/store/authStore';
import { authService } from '@/services/authService';

import {
  MaterialUsageEntry,
  RawMaterial,
} from '@/types';

export const MaterialUsagePage: React.FC = () => {
  const [entries, setEntries] = useState<MaterialUsageEntry[]>([]);
  const [materials, setMaterials] = useState<RawMaterial[]>([]);

  const [loading, setLoading] = useState(true);

  const [error, setError] = useState('');

  const [isModalOpen, setIsModalOpen] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);

  const { user } = useAuthStore();

  const [formData, setFormData] = useState<
    Omit<
      MaterialUsageEntry,
      'id' | 'createdAt' | 'updatedAt' | 'createdBy'
    >
  >({
    date: new Date(),
    rawMaterialId: '',
    quantity: 0,
    remarks: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);

      const usageData = await materialUsageService.getAll();

      const materialList = await rawMaterialService.getAll({
        isActive: true,
      });

      setEntries(usageData);
      setMaterials(materialList);

    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to fetch data'
      );
    } finally {
      setLoading(false);
    }
  };

  // Faster lookup map
  const materialMap = useMemo(
    () =>
      Object.fromEntries(
        materials.map((m) => [m.id, m])
      ),
    [materials]
  );

  const handleAddNew = () => {
    setEditingId(null);

    setFormData({
      date: new Date(),
      rawMaterialId: '',
      quantity: 0,
      remarks: '',
    });

    setIsModalOpen(true);
  };

  const handleEdit = (entry: MaterialUsageEntry) => {
    setEditingId(entry.id);

    setFormData({
      date: new Date(entry.date),
      rawMaterialId: entry.rawMaterialId,
      quantity: entry.quantity,
      remarks: entry.remarks || '',
    });

    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.rawMaterialId || formData.quantity <= 0) {
      setError(
        'Please select a material and enter a valid quantity'
      );
      return;
    }

    if (!user) {
      setError('User not authenticated');
      return;
    }

    try {
      setLoading(true);

      // Get valid user ID: prefer store `user.id`, fall back to Firebase auth UID
      const userId =
        (user as any)?.id || authService.getCurrentUser()?.uid;

      if (!userId) {
        throw new Error('User ID not found');
      }

      if (editingId) {
        await materialUsageService.update(
          editingId,
          formData
        );
      } else {
        const dataWithCreatedBy = {
          ...formData,
          createdBy: userId,
        };

        await materialUsageService.create(
          dataWithCreatedBy as any,
          userId
        );
      }

      // Refresh
      await fetchData();

      // Close modal
      setIsModalOpen(false);

      // Reset form
      setFormData({
        date: new Date(),
        rawMaterialId: '',
        quantity: 0,
        remarks: '',
      });

      // Clear error
      setError('');

    } catch (err) {
      console.error(err);

      setError(
        err instanceof Error
          ? err.message
          : 'Failed to save usage entry'
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = window.confirm(
      'Are you sure you want to delete this entry?'
    );

    if (!confirmed) return;

    try {
      setLoading(true);

      await materialUsageService.delete(id);

      await fetchData();

    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to delete entry'
      );
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Loading
        fullScreen
        message="Loading material usage data..."
      />
    );
  }

  const materialOptions = materials.map((m) => ({
    value: m.id,
    label: `${m.name} (${m.unit})`,
  }));

  return (
    <Layout
      title="Material Usage"
      subtitle="Record raw material usage"
    >
      {error && (
        <Alert
          type="error"
          message={error}
          onClose={() => setError('')}
        />
      )}

      {/* Header Actions */}
      <div className="mb-6 flex gap-4">
        <Button
          variant="primary"
          onClick={handleAddNew}
        >
          ➕ Add Usage Entry
        </Button>
      </div>

      {/* Usage Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                  Date
                </th>

                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                  Material
                </th>

                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                  Quantity
                </th>

                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                  Remarks
                </th>

                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody className="divide-y">
              {entries.length > 0 ? (
                entries.map((entry) => {
                  const material =
                    materialMap[entry.rawMaterialId];

                  return (
                    <tr
                      key={entry.id}
                      className="hover:bg-gray-50"
                    >
                      <td className="px-6 py-4 text-sm text-gray-800">
                        {new Date(
                          entry.date
                        ).toLocaleDateString()}
                      </td>

                      <td className="px-6 py-4 text-sm text-gray-800">
                        {material?.name || 'N/A'}
                      </td>

                      <td className="px-6 py-4 text-sm font-semibold text-gray-800">
                        {entry.quantity}{' '}
                        {material?.unit || ''}
                      </td>

                      <td className="px-6 py-4 text-sm text-gray-600">
                        {entry.remarks || '-'}
                      </td>

                      <td className="px-6 py-4 text-sm space-x-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            handleEdit(entry)
                          }
                        >
                          Edit
                        </Button>

                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() =>
                            handleDelete(entry.id)
                          }
                        >
                          Delete
                        </Button>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-10 text-center text-gray-500"
                  >
                    No material usage entries found
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Add/Edit Modal */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={
          editingId
            ? 'Edit Usage Entry'
            : 'Add Usage Entry'
        }
        size="lg"
        footer={
          <div className="flex justify-end gap-4">
            <Button
              variant="outline"
              onClick={() =>
                setIsModalOpen(false)
              }
            >
              Cancel
            </Button>

            <Button
              variant="primary"
              onClick={handleSave}
            >
              Save
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input
            label="Date"
            type="date"
            value={
              formData.date instanceof Date
                ? formData.date
                    .toISOString()
                    .split('T')[0]
                : ''
            }
            onChange={(e) =>
              setFormData({
                ...formData,
                date: new Date(e.target.value),
              })
            }
          />

          <Select
            label="Raw Material"
            placeholder="Select a material"
            options={materialOptions}
            value={formData.rawMaterialId}
            onChange={(e) =>
              setFormData({
                ...formData,
                rawMaterialId: e.target.value,
              })
            }
          />

          <Input
            label="Quantity"
            type="number"
            value={formData.quantity}
            onChange={(e) =>
              setFormData({
                ...formData,
                quantity: parseFloat(e.target.value) || 0,
              })
            }
          />

          <Input
            label="Remarks (Optional)"
            placeholder="Add any remarks"
            value={formData.remarks}
            onChange={(e) =>
              setFormData({
                ...formData,
                remarks: e.target.value,
              })
            }
          />
        </div>
      </Modal>
    </Layout>
  );
};