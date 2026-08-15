import React, { useState, useEffect } from 'react';
import { Layout, Card, Button, Input, Modal, Alert, Loading } from '@/components';
import { productService } from '@/services/productService';
import { userService } from '@/services/userService';
import { authService } from '@/services/authService';
import { usePageLock } from '@/hooks/usePageLock';
import { Product } from '@/types';

export const ProductsPage: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [userMap, setUserMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [importCsvText, setImportCsvText] = useState('');
  const [importFileName, setImportFileName] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [formData, setFormData] = useState<Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>>({
    name: '',
    bottleSize: '',
    currentStock: 0,
    status: 'active',
  });

  useEffect(() => {
    fetchProducts();
  }, []);

  const { lockDate, isLocked: isPageLocked } = usePageLock('products');

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const [data, users] = await Promise.all([productService.getAll(false), userService.getAll()]);
      setProducts(data);
      setUserMap(Object.fromEntries(users.map((user) => [user.id, user.email || user.name || user.id])));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch products');
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
      name: '',
      bottleSize: '',
      currentStock: 0,
      status: 'active',
    });
    setIsModalOpen(true);
  };

  const handleEdit = (product: Product) => {
    if (isPageLocked) {
      setError(`This page is frozen until ${lockDate?.toLocaleDateString()}. Updates are disabled.`);
      return;
    }
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
    if (isPageLocked) {
      setError(`This page is frozen until ${lockDate?.toLocaleDateString()}. Updates are disabled.`);
      return;
    }
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
        const userId = authService.getCurrentUser()?.uid;
        if (!userId) {
          setError('User not authenticated');
          return;
        }
        await productService.create(formData as any, userId);
      }
      setIsModalOpen(false);
      fetchProducts();
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save product');
    }
  };

  const handleDisable = async (id: string) => {
    if (isPageLocked) {
      setError(`This page is frozen until ${lockDate?.toLocaleDateString()}. Updates are disabled.`);
      return;
    }
    if (confirm('Are you sure you want to disable this product?')) {
      try {
        await productService.disable(id);
        fetchProducts();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to disable product');
      }
    }
  };

  const normalizeName = (value: unknown) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const normalizeHeader = (value: string) => String(value ?? '').replace(/^\uFEFF/, '').trim().toLowerCase().replace(/\s+/g, '');

  const getColumnValue = (record: Record<string, string>, aliases: string[]) => {
    const normalizedAliases = aliases.map((alias) => normalizeHeader(alias));
    for (const [key, value] of Object.entries(record)) {
      if (normalizedAliases.includes(normalizeHeader(key))) {
        return value;
      }
    }
    return '';
  };

  const parseCsvRows = (text: string) => {
    const rows: string[][] = [];
    const normalizedText = String(text ?? '').replace(/^\uFEFF/, '').replace(/\uFEFF/g, '');
    let currentRow: string[] = [];
    let currentValue = '';
    let inQuotes = false;

    for (let index = 0; index < normalizedText.length; index += 1) {
      const char = normalizedText[index];
      if (char === '"') {
        if (inQuotes && normalizedText[index + 1] === '"') {
          currentValue += '"';
          index += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        currentRow.push(currentValue);
        currentValue = '';
      } else if ((char === '\n' || char === '\r') && !inQuotes) {
        if (char === '\r' && normalizedText[index + 1] === '\n') {
          index += 1;
        }
        currentRow.push(currentValue);
        if (currentRow.some((value) => value.trim())) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentValue = '';
      } else {
        currentValue += char;
      }
    }

    if (currentValue.length > 0 || currentRow.length > 0) {
      currentRow.push(currentValue);
      if (currentRow.some((value) => value.trim())) {
        rows.push(currentRow);
      }
    }

    return rows;
  };

  const resolveProductId = (row: Record<string, string>, index: number, availableProducts: Product[]) => {
    const directId = getColumnValue(row, ['productId', 'product_id', 'id', 'productID']);
    if (directId) {
      const directMatch = availableProducts.find((product) => product.id === directId);
      if (directMatch) return directMatch.id;
    }

    const productName = getColumnValue(row, ['productName', 'product_name', 'product', 'name', 'itemName', 'item', 'productname', 'Product']);
    if (!productName) {
      throw new Error(`Row ${index + 2}: missing product name or ID.`);
    }

    const normalizedProductName = normalizeName(productName);
    const exactMatch = availableProducts.find((product) => normalizeName(product.name) === normalizedProductName);
    const match = exactMatch || availableProducts.find((product) => {
      const normalizedProduct = normalizeName(product.name);
      const normalizedBottleSize = normalizeName(product.bottleSize);
      return (
        normalizedProduct.includes(normalizedProductName) ||
        normalizedProductName.includes(normalizedProduct) ||
        normalizedProductName.includes(normalizedBottleSize) ||
        normalizedProduct.includes(normalizedBottleSize)
      );
    });

    if (!match) {
      throw new Error(`Row ${index + 2}: product not found for "${productName}". Add the product first or use the exact product name already shown in the app.`);
    }

    return match.id;
  };

  const handleCsvFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      setImportCsvText(text);
      setImportFileName(file.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read CSV file');
    } finally {
      event.target.value = '';
    }
  };

  const handleImportStockCsv = async () => {
    if (isPageLocked) {
      setError(`This page is frozen until ${lockDate?.toLocaleDateString()}. Updates are disabled.`);
      return;
    }
    const trimmedText = importCsvText.trim();
    if (!trimmedText) {
      setError('Please choose a CSV file or paste CSV content first.');
      return;
    }

    setIsImporting(true);
    setError('');

    try {
      const rows = parseCsvRows(trimmedText);
      if (rows.length < 2) {
        throw new Error('CSV must include a header row and at least one data row.');
      }

      const headers = rows[0].map((header) => String(header ?? '').replace(/^\uFEFF/, '').trim());
      const dataRows = rows.slice(1).filter((row) => row.some((value) => value.trim()));

      if (!dataRows.length) {
        throw new Error('No product rows were found in the CSV.');
      }

      const latestProducts = await productService.getAll(true);
      setProducts(latestProducts.filter((product) => product.status === 'active'));

      const updates = dataRows.map(async (row, index) => {
        const record = Object.fromEntries(headers.map((header, headerIndex) => [header, row[headerIndex] ?? '']));
        const stockValue = Number(
          getColumnValue(record, ['currentStock', 'stock', 'availableStock', 'available stock', 'quantity', 'newStock', 'Current Stock', 'Available Stock']) || ''
        );
        const productId = resolveProductId(record, index, latestProducts);

        if (!Number.isFinite(stockValue) || stockValue < 0) {
          throw new Error(`Row ${index + 2}: current stock must be a valid number greater than or equal to zero.`);
        }

        return { productId, stockValue };
      });

      const results = await Promise.all(updates);
      await Promise.all(results.map(({ productId, stockValue }) => productService.update(productId, { currentStock: stockValue })));

      setProducts((prev) =>
        prev.map((product) => {
          const matched = results.find((result) => result.productId === product.id);
          return matched ? { ...product, currentStock: matched.stockValue } : product;
        })
      );
      setIsImportModalOpen(false);
      setImportCsvText('');
      setImportFileName('');
      await fetchProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update stock from CSV');
    } finally {
      setIsImporting(false);
    }
  };

  if (loading) return <Loading fullScreen message="Loading products..." />;

  return (
    <Layout title="Products" subtitle="Manage products">
      {error && <Alert type="error" message={error} onClose={() => setError('')} />}
      {isPageLocked && lockDate && (
        <Alert
          type="warning"
          message={`This page is currently frozen for updates/deletes until ${lockDate.toLocaleDateString()}. Only read and export actions are allowed.`}
          onClose={() => {}}
        />
      )}

      <div className="mb-6 flex flex-wrap gap-4">
        <Button variant="primary" onClick={handleAddNew} disabled={isPageLocked}>
          ➕ Add New Product
        </Button>
        <Button variant="secondary" onClick={() => setIsImportModalOpen(true)} disabled={isPageLocked}>
          ⬆ Update Stock via CSV
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
              <div className="flex items-center justify-between">
                <span className="text-gray-600 text-sm">Created By:</span>
                <span className="font-semibold text-gray-800">{userMap[product.createdBy] || product.createdBy || 'N/A'}</span>
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

      <Modal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        title="Update Product Stock from CSV"
        size="lg"
        footer={
          <div className="flex gap-4 justify-end">
            <Button variant="outline" onClick={() => setIsImportModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={handleImportStockCsv} disabled={isImporting}>
              {isImporting ? 'Updating...' : 'Import CSV'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Upload a CSV file or paste rows below. The import will update current stock for matching products by name or product ID.
          </p>

          <div className="rounded-lg border border-dashed border-gray-300 p-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Choose CSV file</label>
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={handleCsvFileUpload}
              className="block w-full text-sm text-gray-600 file:mr-4 file:rounded file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-gray-700 hover:file:bg-gray-200"
            />
            {importFileName && <p className="mt-2 text-sm text-gray-500">Selected: {importFileName}</p>}
          </div>

          <label className="block text-sm font-medium text-gray-700">Or paste CSV content</label>
          <textarea
            rows={10}
            value={importCsvText}
            onChange={(e) => setImportCsvText(e.target.value)}
            placeholder="productName,currentStock
LAVIN,100
WATER BOTTLE,50"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />

          <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
            <p className="font-medium">Expected CSV format</p>
            <pre className="mt-2 whitespace-pre-wrap">productName,currentStock
LAVIN,100
WATER BOTTLE,50</pre>
          </div>
        </div>
      </Modal>
    </Layout>
  );
};
