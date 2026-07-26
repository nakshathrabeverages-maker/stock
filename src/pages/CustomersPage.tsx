import React, { useState, useEffect } from 'react';
import { Layout, Card, Button, Input, Modal, Alert, Loading } from '@/components';
import { customerService } from '@/services/customerService';
import { userService } from '@/services/userService';
import { authService } from '@/services/authService';
import { Customer } from '@/types';

export const CustomersPage: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [userMap, setUserMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
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
      const [data, users] = await Promise.all([customerService.getAll(), userService.getAll()]);
      setCustomers(data);
      setUserMap(Object.fromEntries(users.map((user) => [user.id, user.email || user.name || user.id])));
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

  const handleDelete = async (customerId: string) => {
    if (!window.confirm('Are you sure you want to delete this customer?')) return;
    try {
      setLoading(true);
      await customerService.delete(customerId);
      await fetchCustomers();
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete customer');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    setSearchQuery(searchTerm.trim());
  };

  const handleClearSearch = () => {
    setSearchTerm('');
    setSearchQuery('');
  };

  const filteredCustomers = customers.filter((customer) => {
    const query = searchQuery.toLowerCase();
    if (!query) return true;

    return [customer.name, customer.village, customer.firmName, customer.phone, customer.email]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  });

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

      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end">
        <div className="flex-1">
          <Input
            label="Search customers"
            placeholder="Search by name, firm, phone or village"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <Button variant="secondary" onClick={handleSearch}>
          🔎 Search
        </Button>
        <Button variant="outline" onClick={handleClearSearch}>
          Clear
        </Button>
        <Button variant="primary" onClick={handleAddNew}>
          ➕ Add Customer
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {filteredCustomers.length === 0 ? (
          <div className="lg:col-span-2 rounded-lg border border-dashed border-gray-300 p-6 text-center text-gray-600">
            No customers match your search.
          </div>
        ) : (
          filteredCustomers.map((customer) => (
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
                    <span className="font-semibold">Created By:</span> {userMap[customer.createdBy] || customer.createdBy || 'N/A'}
                  </p>
                </div>
                <div className="flex gap-2 pt-2">
                  <Button variant="secondary" size="sm" onClick={() => handleEdit(customer)} className="flex-1">
                    Edit
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => handleDelete(customer.id)}>
                    Delete
                  </Button>
                </div>
              </div>
            </Card>
          ))
        )}
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
