import React, { useState, useEffect } from 'react';
import { Layout, Card, Alert, Loading, Button } from '@/components';
import { useAuthStore } from '@/store/authStore';
import { productionService } from '@/services/productionService';
import { rawMaterialService } from '@/services/rawMaterialService';
import { salesService } from '@/services/salesService';
import { expenseService } from '@/services/expenseService';
import { settingsService } from '@/services/settingsService';
import { RawMaterial } from '@/types';

export const DashboardPage: React.FC = () => {
  const [todayProduction, setTodayProduction] = useState<number>(0);
  const [lowStockItems, setLowStockItems] = useState<RawMaterial[]>([]);
  const [totalProducts, setTotalProducts] = useState<number>(0);
  const [totalSales, setTotalSales] = useState<number>(0);
  const [totalCredit, setTotalCredit] = useState<number>(0);
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
        const [production, lowStock, sales, expenses, capitalValue] = await Promise.all([
          productionService.getTodayProduction(),
          rawMaterialService.getLowStockItems(),
          salesService.getAll(),
          expenseService.getAll(),
          settingsService.getValue('capital'),
        ]);

        setTodayProduction(production);
        setLowStockItems(lowStock);
        setTotalProducts(lowStock.length);
        setTotalSales(sales.reduce((sum, item) => sum + (item.totalPrice ?? 0), 0));
        setTotalCredit(sales.reduce((sum, item) => sum + (item.remainingAmount ?? 0), 0));
        setTotalExpenses(expenses.reduce((sum, item) => sum + (item.value ?? 0), 0));
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

  if (loading) return <Loading fullScreen message="Loading dashboard..." />;

  return (
    <Layout title="Dashboard" subtitle="Welcome to Nakshatra Stock Management System">
      {error && <Alert type="error" message={error} />}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <Card title="Today's Production">
          <div className="text-4xl font-bold text-primary">{todayProduction}</div>
          <p className="text-gray-600 text-sm mt-2">Bottles Produced</p>
        </Card>

        <Card title="Low Stock Items">
          <div className="text-4xl font-bold text-yellow-600">{lowStockItems.length}</div>
          <p className="text-gray-600 text-sm mt-2">Need Re-ordering</p>
        </Card>

        <Card title="Total Sales">
          <div className="text-4xl font-bold text-green-600">₹{totalSales.toFixed(2)}</div>
          <p className="text-gray-600 text-sm mt-2">All sales value</p>
        </Card>

        <Card title="Total Credit">
          <div className="text-4xl font-bold text-orange-600">₹{totalCredit.toFixed(2)}</div>
          <p className="text-gray-600 text-sm mt-2">Outstanding credit balance</p>
        </Card>

        <Card title="Total Expenses">
          <div className="text-4xl font-bold text-red-600">₹{totalExpenses.toFixed(2)}</div>
          <p className="text-gray-600 text-sm mt-2">All expense value</p>
        </Card>

        <Card title="Capital">
          <div className="text-4xl font-bold text-blue-600">₹{capital.toFixed(2)}</div>
          <p className="text-gray-600 text-sm mt-2">Configured capital amount</p>
        </Card>

        <Card title="Present Amount">
          <div className="text-4xl font-bold text-indigo-600">₹{presentAmount.toFixed(2)}</div>
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
      <Card title="Quick Stats" subtitle="System overview">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <p className="text-2xl font-bold text-blue-600">100%</p>
            <p className="text-xs text-gray-600 mt-1">System Health</p>
          </div>
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <p className="text-2xl font-bold text-green-600">{totalSales > 0 ? '₹' + totalSales.toFixed(0) : '₹0'}</p>
            <p className="text-xs text-gray-600 mt-1">Total Sales</p>
          </div>
          <div className="text-center p-4 bg-orange-50 rounded-lg">
            <p className="text-2xl font-bold text-orange-600">{totalCredit > 0 ? '₹' + totalCredit.toFixed(0) : '₹0'}</p>
            <p className="text-xs text-gray-600 mt-1">Total Credit</p>
          </div>
          <div className="text-center p-4 bg-red-50 rounded-lg">
            <p className="text-2xl font-bold text-red-600">{totalExpenses > 0 ? '₹' + totalExpenses.toFixed(0) : '₹0'}</p>
            <p className="text-xs text-gray-600 mt-1">Total Expenses</p>
          </div>
          <div className="text-center p-4 bg-indigo-50 rounded-lg">
            <p className="text-2xl font-bold text-indigo-600">{presentAmount !== 0 ? '₹' + presentAmount.toFixed(0) : '₹0'}</p>
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
