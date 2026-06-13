import React, { useState, useEffect } from 'react';
import { Layout, Card, Alert, Loading, Button } from '@/components';
import { useAuthStore } from '@/store/authStore';
import { productionService } from '@/services/productionService';
import { productService } from '@/services/productService';
import { rawMaterialService } from '@/services/rawMaterialService';
import { salesService } from '@/services/salesService';
import { expenseService } from '@/services/expenseService';
import { settingsService } from '@/services/settingsService';
import { orderService } from '@/services/orderService';
import { customerService } from '@/services/customerService';
import { Product, RawMaterial, OrderEntry, Customer } from '@/types';

export const DashboardPage: React.FC = () => {
  const [thisMonthProduction, setThisMonthProduction] = useState<number>(0);
  const [thisMonthSalesCases, setThisMonthSalesCases] = useState<number>(0);
  const [lowStockItems, setLowStockItems] = useState<RawMaterial[]>([]);
  const [todayOrdersCount, setTodayOrdersCount] = useState<number>(0);
  const [todayOrdersDeliveredCount, setTodayOrdersDeliveredCount] = useState<number>(0);
  const [todayOrdersPendingCount, setTodayOrdersPendingCount] = useState<number>(0);
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
  const [todayOrdersByCustomer, setTodayOrdersByCustomer] = useState<{
    customerId: string;
    customerName: string;
    orderCount: number;
    totalAmount: number;
    orders: OrderEntry[];
  }[]>([]);
  const [productsMap, setProductsMap] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'admin';
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setLoading(true);
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        const [productionEntries, lowStock, sales, expenses, capitalValue, products, customers, allOrders] = await Promise.all([
          productionService.getAll({ startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1), endDate: new Date() }),
          rawMaterialService.getLowStockItems(),
          salesService.getAll(),
          expenseService.getAll(),
          settingsService.getValue('capital'),
          productService.getAll(false),
          customerService.getAll(),
          orderService.getAll(),
        ]);

        const todaysOrders = allOrders.filter((order) => {
          if (!order.deliveryDate) return false;
          const deliveryDate = new Date(order.deliveryDate);
          return deliveryDate >= todayStart && deliveryDate <= todayEnd;
        });
        const available = products.filter((product) => product.currentStock > 0 && product.status === 'active');

        const production = Array.isArray(productionEntries)
          ? productionEntries.reduce((sum: number, entry: any) => sum + (entry.quantity ?? 0), 0)
          : 0;

        setThisMonthProduction(production);
        setLowStockItems(lowStock);
        setTotalProducts(products.length);
        setAvailableProducts(available);
        setProductsMap(products);
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
        const cmSalesCases = sales.reduce((sum, item) => {
          const d = new Date(item.date as any);
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
            ? sum + (item.quantity ?? 0)
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
        setThisMonthSalesCases(cmSalesCases);
        setCurrentMonthExpenses(cmExpenses);
        setCapital(capitalValue);
        setCapitalInput(capitalValue.toString());

        const customerMap = new Map(customers.map((customer: Customer) => [customer.id, customer.name]));
        const grouped = new Map<string, {
          customerId: string;
          customerName: string;
          orderCount: number;
          totalAmount: number;
          orders: OrderEntry[];
        }>();

        todaysOrders.forEach((order) => {
          const existing = grouped.get(order.customerId);
          const total = order.totalPrice ?? order.quantity * order.pricePerCase;
          const customerName: string = (customerMap.get(order.customerId) ?? 'Unknown Customer') as string;
          if (existing) {
            existing.orderCount += 1;
            existing.totalAmount += total;
            existing.orders.push(order);
          } else {
            grouped.set(order.customerId, {
              customerId: order.customerId,
              customerName,
              orderCount: 1,
              totalAmount: total,
              orders: [order],
            });
          }
        });

        const groupedArray = Array.from(grouped.values()).sort((a, b) => {
          if (b.totalAmount !== a.totalAmount) return b.totalAmount - a.totalAmount;
          return a.customerName.localeCompare(b.customerName);
        });

        // Count distinct customer orders (each customer counts as 1)
        const distinctCount = grouped.size;
        // For each customer group, if all their orders are delivered -> delivered, else pending
        let deliveredGroups = 0;
        groupedArray.forEach((g) => {
          const allDelivered = g.orders.every((o) => (o.status as any) === 'delivered');
          if (allDelivered) deliveredGroups += 1;
        });
        const pendingGroups = distinctCount - deliveredGroups;

        setTodayOrdersByCustomer(groupedArray);
        setTodayOrdersCount(distinctCount);
        setTodayOrdersDeliveredCount(deliveredGroups);
        setTodayOrdersPendingCount(pendingGroups);
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

        <Card title="This Month Sales Cases">
          <div className="text-4xl font-bold text-green-600">{thisMonthSalesCases}</div>
          <p className="text-gray-600 text-sm mt-2">Cases Sold (this month)</p>
        </Card>

        <Card title="Low Stock Items">
          <div className="text-4xl font-bold text-yellow-600">{lowStockItems.length}</div>
          <p className="text-gray-600 text-sm mt-2">Need Re-ordering</p>
        </Card>

        <Card title="Today's Orders">
          <div className="text-4xl font-bold text-gray-800">{todayOrdersCount}</div>
          <p className="text-gray-600 text-sm mt-2">Distinct customer orders today</p>
          <div className="mt-2 text-sm">
            <span className="text-green-700">Delivered: {todayOrdersDeliveredCount}</span>
            <span className="mx-2">|</span>
            <span className="text-orange-700">Pending: {todayOrdersPendingCount}</span>
          </div>
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

      {/* Today's Orders Customer-wise */}
      <Card title="Today's Orders by Customer" subtitle="Detailed product breakdown by customer" className="mb-6">
        {todayOrdersByCustomer.length > 0 ? (
          <div className="space-y-4">
            {todayOrdersByCustomer.map((group) => (
              <div key={group.customerId} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
                <div className="flex items-center justify-between mb-3 pb-3 border-b">
                  <div>
                    <h3 className="font-semibold text-gray-900">{group.customerName}</h3>
                    <p className="text-xs text-gray-600">{group.orderCount} order{group.orderCount > 1 ? 's' : ''}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-green-600">₹{group.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  </div>
                </div>
                <div className="space-y-2">
                  {group.orders.map((order, idx) => {
                    const product = productsMap.find((p) => p.id === order.productId);
                    const orderPrice = order.totalPrice ?? order.quantity * order.pricePerCase;
                    const statusLabelMap: Record<string, string> = {
                      order_created: 'Created',
                      order_accepted: 'Accepted',
                      loading_in_progress: 'Loading',
                      vehicle_started: 'En route',
                      delivered: 'Delivered',
                    };
                    const status = order.status || 'order_created';
                    const statusLabel = statusLabelMap[status] || status;
                    const statusColorClass = status === 'delivered' ? 'bg-green-100 text-green-800' : status === 'order_accepted' ? 'bg-blue-100 text-blue-800' : status === 'loading_in_progress' || status === 'vehicle_started' ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800';

                    return (
                      <div key={idx} className="flex items-center justify-between text-sm bg-gray-50 p-2 rounded">
                        <div>
                          <p className="text-gray-800">{product?.name || 'Product'}</p>
                          <p className="text-xs text-gray-600">Qty: {order.quantity} @ ₹{order.pricePerCase.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}/case</p>
                          <div className="mt-1">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColorClass}`}>
                              {statusLabel}
                            </span>
                          </div>
                        </div>
                        <p className="font-semibold text-gray-900">₹{orderPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-600">No orders found for today.</p>
        )}
      </Card>

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
