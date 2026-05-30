import React, { useState, useEffect } from 'react';
import { Layout, Card, Button, Input, Select, Modal, Alert, Loading } from '@/components';
import { userService } from '@/services/userService';
import { authService } from '@/services/authService';
import { User } from '@/types';

export const UsersPage: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    name: '',
    role: 'operator' as 'admin' | 'operator' | 'co-admin' | 'viewer',
  });

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const data = await userService.getAll();
      setUsers(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch users');
    } finally {
      setLoading(false);
    }
  };

  const handleAddUser = () => {
    setEditingUser(null);
    setFormData({
      email: '',
      password: '',
      name: '',
      role: 'operator',
    });
    setIsModalOpen(true);
  };

  const handleEditUser = (user: User) => {
    setEditingUser(user);
    setFormData({
      email: user.email,
      password: '',
      name: user.name,
      role: user.role,
    });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (editingUser) {
      try {
        await userService.updateRole(editingUser.id, formData.role);
        setIsModalOpen(false);
        setEditingUser(null);
        fetchUsers();
        setError('');
        setInfoMessage('User role updated successfully.');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to update user role');
      }
      return;
    }

    if (!formData.email || !formData.password || !formData.name) {
      setError('Please fill in all required fields');
      return;
    }

    try {
      await authService.register(formData.email, formData.password, formData.name, formData.role);
      setIsModalOpen(false);
      fetchUsers();
      setError('');
      setInfoMessage('User created successfully. You can send a password reset email from the action menu.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create user');
    }
  };

  const handleDisableUser = async (id: string) => {
    if (confirm('Are you sure you want to disable this user?')) {
      try {
        await userService.disable(id);
        fetchUsers();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to disable user');
      }
    }
  };

  const handleEnableUser = async (id: string) => {
    try {
      await userService.enable(id);
      fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to enable user');
    }
  };

  const handleSendReset = async (email: string) => {
    try {
      await authService.sendPasswordReset(email);
      setInfoMessage('Password reset email sent successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reset email');
    }
  };

  if (loading) return <Loading fullScreen message="Loading users..." />;

  return (
    <Layout title="Users Management" subtitle="Manage system users and roles">
      {error && <Alert type="error" message={error} onClose={() => setError('')} />}
      {infoMessage && <Alert type="success" message={infoMessage} onClose={() => setInfoMessage('')} />}

      <div className="mb-6 flex gap-4">
        <Button variant="primary" onClick={handleAddUser}>
          ➕ Add New User
        </Button>
      </div>

      {/* Users Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Name</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Email</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Role</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Last Login</th>
                <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-800">{user.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{user.email}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        user.role === 'admin'
                          ? 'bg-red-100 text-red-800'
                          : user.role === 'operator'
                            ? 'bg-blue-100 text-blue-800'
                            : user.role === 'co-admin'
                              ? 'bg-violet-100 text-violet-800'
                              : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-medium ${
                        user.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {user.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : 'Never'}
                  </td>
                  <td className="px-6 py-4 text-sm space-x-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleEditUser(user)}
                    >
                      Edit Role
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleSendReset(user.email)}
                    >
                      Reset Password
                    </Button>
                    {user.isActive ? (
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleDisableUser(user.id)}
                      >
                        Disable
                      </Button>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleEnableUser(user.id)}
                      >
                        Enable
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Modal for Add User */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditingUser(null);
        }}
        title={editingUser ? 'Edit User Role' : 'Add New User'}
        size="lg"
        footer={
          <div className="flex gap-4 justify-end">
            <Button variant="outline" onClick={() => {
              setIsModalOpen(false);
              setEditingUser(null);
            }}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleSave}>
              {editingUser ? 'Save Role' : 'Create User'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Input
            label="Full Name"
            placeholder="e.g., John Doe"
            value={formData.name}
            disabled={Boolean(editingUser)}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />

          <Input
            label="Email"
            type="email"
            placeholder="e.g., john@example.com"
            value={formData.email}
            disabled={Boolean(editingUser)}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          />

          {!editingUser && (
            <Input
              label="Password"
              type="password"
              placeholder="Enter a strong password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            />
          )}

          <Select
            label="Role"
            options={[
              { value: 'admin', label: 'Admin' },
              { value: 'operator', label: 'Operator' },
              { value: 'co-admin', label: 'Co-Admin' },
              { value: 'viewer', label: 'Viewer' },
            ]}
            value={formData.role}
            onChange={(e) => setFormData({ ...formData, role: e.target.value as 'admin' | 'operator' | 'co-admin' | 'viewer' })}
          />
        </div>
      </Modal>
    </Layout>
  );
};
