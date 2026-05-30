import React, { useState, useEffect } from 'react';
import { Layout, Card, Button, Input, Modal, Alert, Loading } from '@/components';
import { customerService } from '@/services/customerService';
import { authService } from '@/services/authService';
import { Customer } from '@/types';

export const CustomersPage: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Omit<Customer, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>>({
    name: '',
    village: '',
    firmName: '',
    phone: '',
    email: '',
  });

  useEffect(() => {
    fetchCustomers();
  }, []);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const data = await customerService.getAll();
      setCustomers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch customers');
    } finally {
      setLoading(false);
    }
  };

  const handleAddNew = () => {
    setEditingId(null);
    setFormData({
      name: '',
      village: '',
      firmName: '',
      phone: '',
      email: '',
    });
    setIsModalOpen(true);
  };

  const handleEdit = (customer: Customer) => {
    setEditingId(customer.id);
    setFormData({
      name: customer.name,
      village: customer.village,
      firmName: customer.firmName,
      phone: customer.phone,
      email: customer.email || '',
    });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.village || !formData.firmName || !formData.phone) {
      setError('Please fill in all required fields');
      return;
    }

    try {
      if (editingId) {
        await customerService.update(editingId, formData);
      } else {
        const userId = authService.getCurrentUser()?.uid;
        if (!userId) {
          setError('User not authenticated');
          return;
        }
        await customerService.create(formData as any, userId);
      }
      setIsModalOpen(false);
      fetchCustomers();
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save customer');
    }
  };

  if (loading) return <Loading fullScreen message="Loading customers..." />;

  return (
    <Layout title="Customers" subtitle="Manage customer details">
      {error && <Alert type="error" message={error} onClose={() => setError('')} />}

      <div className="mb-6 flex gap-4">
        <Button variant="primary" onClick={handleAddNew}>
          ➕ Add Customer
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {customers.map((customer) => (
          <Card key={customer.id} title={customer.name}>
            <div className="space-y-3">
              <div className="text-sm text-gray-600">
                <p>
                  <span className="font-semibold">Village:</span> {customer.village}
                </p>
                <p>
                  <span className="font-semibold">Firm:</span> {customer.firmName}
                </p>
                <p>
                  <span className="font-semibold">Phone:</span> {customer.phone}
                </p>
                <p>
                  <span className="font-semibold">Email:</span> {customer.email || '-'}
                </p>
                <p>
                  <span className="font-semibold">Created By:</span> {customer.createdBy || 'N/A'}
                </p>
              </div>
              <div className="flex gap-2 pt-2">
                <Button variant="secondary" size="sm" onClick={() => handleEdit(customer)} className="flex-1">
                  Edit
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingId ? 'Edit Customer' : 'Add Customer'}
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
            label="Customer Name"
            placeholder="e.g., Ram Kumar"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />

          <Input
            label="Village"
            placeholder="e.g., Kumbakonam"
            value={formData.village}
            onChange={(e) => setFormData({ ...formData, village: e.target.value })}
          />

          <Input
            label="Firm Name"
            placeholder="e.g., Ram Trading"
            value={formData.firmName}
            onChange={(e) => setFormData({ ...formData, firmName: e.target.value })}
          />

          <Input
            label="Phone"
            type="tel"
            placeholder="e.g., 9876543210"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          />

          <Input
            label="Email (Optional)"
            type="email"
            placeholder="e.g., ram@example.com"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          />
        </div>
      </Modal>
    </Layout>
  );
};
