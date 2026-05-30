import React, { useState, useEffect } from 'react';
import { Layout, Card, Button, Input, Modal, Alert, Loading } from '@/components';
import { productService } from '@/services/productService';
import { Product } from '@/types';

export const ProductsPage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Omit<Product, 'id' | 'createdAt' | 'updatedAt'>>({
    name: '',
    bottleSize: '',
    currentStock: 0,
    status: 'active',
  });

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const data = await productService.getAll(false);
      setProducts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch products');
    } finally {
      setLoading(false);
    }
  };

  const handleAddNew = () => {
    setEditingId(null);
    setFormData({
      name: '',
      bottleSize: '',
      currentStock: 0,
      status: 'active',
    });
    setIsModalOpen(true);
  };

  const handleEdit = (product: Product) => {
    setEditingId(product.id);
    setFormData({
      name: product.name,
      bottleSize: product.bottleSize,
      currentStock: product.currentStock,
      status: product.status,
    });
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.bottleSize) {
      setError('Please fill in all required fields');
      return;
    }

    if (formData.currentStock < 0) {
      setError('Current stock must be zero or greater');
      return;
    }

    try {
      if (editingId) {
        await productService.update(editingId, formData);
      } else {
        await productService.create(formData);
      }
      setIsModalOpen(false);
      fetchProducts();
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save product');
    }
  };

  const handleDisable = async (id: string) => {
    if (confirm('Are you sure you want to disable this product?')) {
      try {
        await productService.disable(id);
        fetchProducts();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to disable product');
      }
    }
  };

  if (loading) return <Loading fullScreen message="Loading products..." />;

  return (
    <Layout title="Products" subtitle="Manage products">
      {error && <Alert type="error" message={error} onClose={() => setError('')} />}

      <div className="mb-6 flex gap-4">
        <Button variant="primary" onClick={handleAddNew}>
          ➕ Add New Product
        </Button>
      </div>

      {/* Products Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {products.map((product) => (
          <Card
            key={product.id}
            title={product.name}
          >
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-gray-600 text-sm">Bottle Size:</span>
                <span className="font-semibold text-gray-800">{product.bottleSize}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600 text-sm">Current Stock:</span>
                <span className="font-semibold text-gray-800">{product.currentStock}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray-600 text-sm">Status:</span>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-medium ${
                    product.status === 'active'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {product.status === 'active' ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="flex gap-2 pt-4">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleEdit(product)}
                  className="flex-1"
                >
                  Edit
                </Button>
                {product.status === 'active' && (
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleDisable(product.id)}
                    className="flex-1"
                  >
                    Disable
                  </Button>
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Modal for Add/Edit */}
      <Modal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title={editingId ? 'Edit Product' : 'Add New Product'}
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
            label="Product Name"
            placeholder="e.g., LAVIN"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />

          <Input
            label="Bottle Size"
            placeholder="e.g., 250ML"
            value={formData.bottleSize}
            onChange={(e) => setFormData({ ...formData, bottleSize: e.target.value })}
          />

          <Input
            label="Current Stock"
            type="number"
            placeholder="e.g., 100"
            value={formData.currentStock}
            onChange={(e) => setFormData({ ...formData, currentStock: parseInt(e.target.value) || 0 })}
          />
        </div>
      </Modal>
    </Layout>
  );
};
