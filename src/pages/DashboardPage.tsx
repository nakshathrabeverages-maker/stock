import React, { useState, useEffect } from 'react';
import { Layout, Card, Alert, Loading, Button } from '@/components';
import { useAuthStore } from '@/store/authStore';
import { productionService } from '@/services/productionService';
import { productService } from '@/services/productService';
import { rawMaterialService } from '@/services/rawMaterialService';
import { salesService } from '@/services/salesService';
import { expenseService } from '@/services/expenseService';
import { settingsService } from '@/services/settingsService';
import { Product, RawMaterial } from '@/types';

export const DashboardPage: React.FC = () => {
  const [thisMonthProduction, setThisMonthProduction] = useState<number>(0);
  const [lowStockItems, setLowStockItems] = useState<RawMaterial[]>([]);
  const [totalProducts, setTotalProducts] = useState<number>(0);
  const [availableProducts, setAvailableProducts] = useState<Product[]>([]);
  const [totalSales, setTotalSales] = useState<number>(0);
  const [totalCredit, setTotalCredit] = useState<number>(0);
  const [currentMonthSales, setCurrentMonthSales] = useState<number>(0);
  const [currentMonthExpenses, setCurrentMonthExpenses] = useState<number>(0);
  const [totalExpenses, setTotalExpenses] = useState<number>(0);
  const [capital, setCapital] = useState<number>(0);
  const [capitalInput, setCapitalInput] = useState<string>('0');
  const [presentAmount, setPresentAmount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        const [productionEntries, lowStock, sales, expenses, capitalValue, products] = await Promise.all([
          productionService.getAll({ startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1), endDate: new Date() }),
          rawMaterialService.getLowStockItems(),
          salesService.getAll(),
          expenseService.getAll(),
          settingsService.getValue('capital'),
          productService.getAll(false),
        ]);
        const available = products.filter((product) => product.currentStock > 0 && product.status === 'active');

        const production = Array.isArray(productionEntries)
          ? productionEntries.reduce((sum: number, entry: any) => sum + (entry.quantity ?? 0), 0)
          : 0;

        setThisMonthProduction(production);
        setLowStockItems(lowStock);
        setTotalProducts(products.length);
        setAvailableProducts(available);
        const totalSalesVal = sales.reduce((sum, item) => sum + (item.totalPrice ?? 0), 0);
        const totalCreditVal = sales.reduce((sum, item) => sum + (item.remainingAmount ?? 0), 0);
        const totalExpensesVal = expenses.reduce((sum, item) => sum + (item.value ?? 0), 0);

        // current month calculations
        const now = new Date();
        const cmSales = sales.reduce((sum, item) => {
          const d = new Date(item.date as any);
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
            ? sum + (item.totalPrice ?? 0)
            : sum;
        }, 0);
        const cmExpenses = expenses.reduce((sum, item) => {
          const d = new Date(item.date as any);
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
            ? sum + (item.value ?? 0)
            : sum;
        }, 0);

        setTotalSales(totalSalesVal);
        setTotalCredit(totalCreditVal);
        setTotalExpenses(totalExpensesVal);
        setCurrentMonthSales(cmSales);
        setCurrentMonthExpenses(cmExpenses);
        setCapital(capitalValue);
        setCapitalInput(capitalValue.toString());
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load dashboard data');
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, []);

  useEffect(() => {
    setPresentAmount(totalSales - totalExpenses + capital);
  }, [totalSales, totalExpenses, capital]);

  const formatAmount = (value: number, fractionDigits = 2) =>
    value.toLocaleString('en-IN', {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });

  if (loading) return <Loading fullScreen message="Loading dashboard..." />;

  return (
    <Layout title="Dashboard" subtitle="Welcome to Nakshatra Stock Management System">
      {error && <Alert type="error" message={error} />}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <Card title="This Month Production">
          <div className="text-4xl font-bold text-primary">{thisMonthProduction}</div>
          <p className="text-gray-600 text-sm mt-2">Cases Produced (this month)</p>
        </Card>

        <Card title="Low Stock Items">
          <div className="text-4xl font-bold text-yellow-600">{lowStockItems.length}</div>
          <p className="text-gray-600 text-sm mt-2">Need Re-ordering</p>
        </Card>

        <Card title="Total Sales">
          <div className="text-4xl font-bold text-green-600">₹{formatAmount(totalSales)}</div>
          <p className="text-gray-600 text-sm mt-2">All sales value</p>
        </Card>

        <Card title="Total Credit">
          <div className="text-4xl font-bold text-orange-600">₹{formatAmount(totalCredit)}</div>
          <p className="text-gray-600 text-sm mt-2">Outstanding credit balance</p>
        </Card>

        <Card title="This Month Sales">
          <div className="text-4xl font-bold text-green-600">₹{formatAmount(currentMonthSales)}</div>
          <p className="text-gray-600 text-sm mt-2">Sales in current month</p>
        </Card>

        <Card title="This Month Expenses">
          <div className="text-4xl font-bold text-red-600">₹{formatAmount(currentMonthExpenses)}</div>
          <p className="text-gray-600 text-sm mt-2">Expenses in current month</p>
        </Card>

        <Card title="Total Expenses">
          <div className="text-4xl font-bold text-red-600">₹{formatAmount(totalExpenses)}</div>
          <p className="text-gray-600 text-sm mt-2">All expense value</p>
        </Card>

        <Card title="Capital">
          <div className="text-4xl font-bold text-blue-600">₹{formatAmount(capital)}</div>
          <p className="text-gray-600 text-sm mt-2">Configured capital amount</p>
        </Card>

        <Card title="Present Amount">
          <div className="text-4xl font-bold text-indigo-600">₹{formatAmount(presentAmount)}</div>
          <p className="text-gray-600 text-sm mt-2">Sales - Expenses + Capital</p>
        </Card>
      </div>

      {/* Low Stock Alert */}
      {lowStockItems.length > 0 && (
        <Card title="⚠️ Low Stock Alert" subtitle="Items requiring immediate attention" className="mb-6">
          <div className="space-y-2">
            {lowStockItems.slice(0, 5).map((item) => (
              <div key={item.id} className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-800">{item.name}</p>
                  <p className="text-xs text-gray-600">
                    {item.category} • Current: {item.currentStock} {item.unit}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-red-600">
                    Below {item.minimumStockLevel} {item.unit}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Quick Stats */}
      <Card title="Product Availability" subtitle="Live products in stock" className="mb-6">
        {availableProducts.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Product</th>
                  <th className="px-4 py-3 text-right font-semibold">Available Stock</th>
                  <th className="px-4 py-3 text-left font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y bg-white">
                {availableProducts.map((product) => (
                  <tr key={product.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">{product.name}</td>
                    <td className="px-4 py-3 text-right font-semibold">{product.currentStock}</td>
                    <td className="px-4 py-3 capitalize">{product.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-gray-600">No active products with stock available right now.</p>
        )}
      </Card>

      <Card title="Quick Stats" subtitle="System overview">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <p className="text-2xl font-bold text-green-600">{totalSales > 0 ? '₹' + formatAmount(totalSales, 0) : '₹0'}</p>
            <p className="text-xs text-gray-600 mt-1">Total Sales</p>
          </div>
          <div className="text-center p-4 bg-orange-50 rounded-lg">
            <p className="text-2xl font-bold text-orange-600">{totalCredit > 0 ? '₹' + formatAmount(totalCredit, 0) : '₹0'}</p>
            <p className="text-xs text-gray-600 mt-1">Total Credit</p>
          </div>
          <div className="text-center p-4 bg-red-50 rounded-lg">
            <p className="text-2xl font-bold text-red-600">{totalExpenses > 0 ? '₹' + formatAmount(totalExpenses, 0) : '₹0'}</p>
            <p className="text-xs text-gray-600 mt-1">Total Expenses</p>
          </div>
          <div className="text-center p-4 bg-indigo-50 rounded-lg">
            <p className="text-2xl font-bold text-indigo-600">{presentAmount !== 0 ? '₹' + formatAmount(presentAmount, 0) : '₹0'}</p>
            <p className="text-xs text-gray-600 mt-1">Present Amount</p>
          </div>
        </div>
      </Card>

      <Card title="Update Capital" subtitle="Adjust the capital amount used in present amount calculation" className="mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Capital Amount</label>
            <input
              type="number"
              className="input-field w-full"
              value={capitalInput}
              onChange={(e) => setCapitalInput(e.target.value)}
              min={0}
            />
          </div>
          <div className="md:col-span-2">
            <Button
              variant="primary"
              disabled={!isAdmin}
              onClick={async () => {
                if (!isAdmin) return;
                try {
                  setLoading(true);
                  const value = Number(capitalInput) || 0;
                  await settingsService.setValue('capital', value);
                  setCapital(value);
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Failed to save capital');
                } finally {
                  setLoading(false);
                }
              }}
            >
              Save Capital
            </Button>
            {!isAdmin && (
              <p className="text-sm text-gray-500 mt-2">Only admins can update capital.</p>
            )}
          </div>
        </div>
      </Card>
    </Layout>
  );
};
