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
import { Product, RawMaterial, OrderEntry, Customer, SaleEntry } from '@/types';

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
  const [thisMonthCredit, setThisMonthCredit] = useState<number>(0);
  const [currentMonthSales, setCurrentMonthSales] = useState<number>(0);
  const [currentMonthExpenses, setCurrentMonthExpenses] = useState<number>(0);
  const [totalExpenses, setTotalExpenses] = useState<number>(0);
  const [capital, setCapital] = useState<number>(0);
  const [capitalInput, setCapitalInput] = useState<string>('0');
  const [presentAmount, setPresentAmount] = useState<number>(0);
  const [topPrevMonthCustomer, setTopPrevMonthCustomer] = useState<{
    customerId: string;
    customerName: string;
    totalSales: number;
    avgPricePerCase: number;
    salePercentage: number;
    creditRatio: number;
    priceRatio: number;
    avgCasesPerOrder: number;
    score: number;
  } | null>(null);
  const [topOverallCustomer, setTopOverallCustomer] = useState<{
    customerId: string;
    customerName: string;
    totalSales: number;
    avgPricePerCase: number;
    salePercentage: number;
    creditRatio: number;
    priceRatio: number;
    avgCasesPerOrder: number;
    score: number;
  } | null>(null);
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

  const getPreviousMonthRange = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    return { start, end };
  };

  const computeTopCustomer = (
    sales: SaleEntry[],
    customers: Customer[],
    products: Product[],
    creditReferenceSales?: SaleEntry[],
    excludeOther = false,
  ) => {
    const customerMap = new Map(customers.map((customer) => [customer.id, customer.name]));
    const productMap = new Map(products.map((product) => [product.id, product]));

    const getBasePrice = (product?: Product) => {
      const size = (product?.bottleSize || '').toLowerCase().trim();
      if (size.includes('500')) return 110;
      if (size.includes('1ltr') || size.includes('1 ltr') || size.includes('1l') || size.includes('1 l')) return 100;
      if (size.includes('250')) return 140;
      if (size.includes('soda')) return 165;
      return 100;
    };

    const creditSales = Array.isArray(creditReferenceSales) ? creditReferenceSales : sales;
    const customerCreditMap = new Map<string, number>();
    creditSales.forEach((sale) => {
      const current = customerCreditMap.get(sale.customerId) ?? 0;
      customerCreditMap.set(sale.customerId, current + (sale.remainingAmount ?? 0));
    });
    const totalCreditValue = Array.from(customerCreditMap.values()).reduce((sum, credit) => sum + credit, 0);

    const grouped = new Map<
      string,
      {
        customerId: string;
        customerName: string;
        totalSales: number;
        totalCredit: number;
        totalQuantity: number;
        weightedPriceRatio: number;
        orderCount: number;
      }
    >();

    sales.forEach((sale) => {
      const customerId = sale.customerId;
      const customerName = customerMap.get(customerId) ?? 'Unknown Customer';
      const normalizedCustomer = customerName.toLowerCase().trim();
      if (excludeOther && (normalizedCustomer === 'other' || normalizedCustomer === 'others')) {
        return;
      }

      const totalPrice = sale.totalPrice ?? sale.quantity * sale.pricePerCase;
      const product = productMap.get(sale.productId);
      const basePrice = getBasePrice(product);
      const priceRatio = basePrice > 0 ? (sale.pricePerCase ?? 0) / basePrice : 0;
      const existing = grouped.get(customerId);
      const customerOutstandingCredit = customerCreditMap.get(customerId) ?? 0;

      if (existing) {
        existing.totalSales += totalPrice;
        existing.totalCredit = customerOutstandingCredit;
        existing.totalQuantity += sale.quantity;
        existing.weightedPriceRatio += (sale.quantity ?? 0) * priceRatio;
        existing.orderCount += 1;
      } else {
        grouped.set(customerId, {
          customerId,
          customerName,
          totalSales: totalPrice,
          totalCredit: customerOutstandingCredit,
          totalQuantity: sale.quantity,
          weightedPriceRatio: (sale.quantity ?? 0) * priceRatio,
          orderCount: 1,
        });
      }
    });

    const totalSalesValue = sales.reduce((sum, sale) => sum + (sale.totalPrice ?? sale.quantity * sale.pricePerCase), 0);

    const eligible = Array.from(grouped.values()).filter((item) => item.totalSales >= 50000);
    if (!eligible.length) return null;

    const scored = eligible.map((item) => {
      const saleRatio = totalSalesValue ? item.totalSales / totalSalesValue : 0;
      const creditRatio = totalCreditValue ? item.totalCredit / totalCreditValue : 0;
      const priceRatio = item.totalQuantity ? item.weightedPriceRatio / item.totalQuantity : 0;
      const avgPricePerCase = item.totalQuantity ? item.totalSales / item.totalQuantity : 0;
      const avgCasesPerOrder = item.orderCount ? item.totalQuantity / item.orderCount : 0;
      const score = saleRatio * 6 + (1 - creditRatio) * 2 + priceRatio * 1 + avgCasesPerOrder / 1000;
      return {
        customerId: item.customerId,
        customerName: item.customerName,
        totalSales: item.totalSales,
        avgPricePerCase,
        salePercentage: saleRatio * 100,
        creditRatio,
        priceRatio,
        avgCasesPerOrder,
        score,
      };
    });

    scored.sort((a, b) => b.score - a.score || b.totalSales - a.totalSales);
    return scored[0] ?? null;
  };

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

        const now = new Date();
        const thisMonthCreditVal = sales.reduce((sum, item) => {
          const d = new Date(item.date as any);
          return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
            ? sum + (item.remainingAmount ?? 0)
            : sum;
        }, 0);

        const prevRange = getPreviousMonthRange();
        const prevMonthSales = sales.filter((item) => {
          const saleDate = new Date(item.date as any);
          return saleDate >= prevRange.start && saleDate <= prevRange.end;
        });

        const topPrev = computeTopCustomer(prevMonthSales, customers, products, sales);
        const topOverall = computeTopCustomer(sales, customers, products, sales, true);

        setTopPrevMonthCustomer(topPrev);
        setTopOverallCustomer(topOverall);

        // current month calculations
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
        setThisMonthCredit(thisMonthCreditVal);
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

        setTopPrevMonthCustomer(topPrev);
        setTopOverallCustomer(topOverall);
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

  const formatAmount = (value: number, fractionDigits?: number) => {
    if (typeof value !== 'number' || Number.isNaN(value)) return '0';
    const useFraction = typeof fractionDigits === 'number' ? fractionDigits : 0;
    return value.toLocaleString('en-IN', {
      minimumFractionDigits: useFraction,
      maximumFractionDigits: useFraction,
    });
  };

  if (loading) return <Loading fullScreen message="Loading dashboard..." />;

  return (
    <Layout title="Dashboard" subtitle="Welcome to Nakshatra Stock Management System">
      {error && <Alert type="error" message={error} />}

      {/* Top Snapshot Section */}
      <section className="mb-6 rounded-3xl overflow-hidden border border-slate-200 bg-slate-50 shadow-sm">
        <div className="bg-gradient-to-r from-sky-600 via-cyan-500 to-teal-500 px-6 py-5">
          <h2 className="text-xl font-semibold text-white">Dashboard Snapshot</h2>
          <p className="mt-1 text-sm text-cyan-100">A quick overview of your overall totals and monthly metrics.</p>
        </div>
        <div className="p-5">
          <div className="text-sm font-semibold text-slate-700 mb-4">Monthly Metrics</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            <div className="rounded-2xl bg-white p-5 shadow-sm border border-slate-200">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">This Month Sales</p>
              <div className="mt-3 text-3xl font-bold text-green-600">₹{formatAmount(currentMonthSales)}</div>
              <p className="mt-2 text-sm text-slate-500">Current month sales</p>
            </div>

            <div className="rounded-2xl bg-white p-5 shadow-sm border border-slate-200">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">This Month Production</p>
              <div className="mt-3 text-3xl font-bold text-primary">{thisMonthProduction}</div>
              <p className="mt-2 text-sm text-slate-500">Cases produced this month</p>
            </div>

            <div className="rounded-2xl bg-white p-5 shadow-sm border border-slate-200">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">This Month Expenses</p>
              <div className="mt-3 text-3xl font-bold text-red-600">₹{formatAmount(currentMonthExpenses)}</div>
              <p className="mt-2 text-sm text-slate-500">Expenses in current month</p>
            </div>

            <div className="rounded-2xl bg-white p-5 shadow-sm border border-slate-200">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">This Month Credit</p>
              <div className="mt-3 text-3xl font-bold text-amber-600">₹{formatAmount(thisMonthCredit)}</div>
              <p className="mt-2 text-sm text-slate-500">Credit created this month</p>
            </div>

            <div className="rounded-2xl bg-white p-5 shadow-sm border border-slate-200">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">This Month Sales Cases</p>
              <div className="mt-3 text-3xl font-bold text-green-700">{thisMonthSalesCases}</div>
              <p className="mt-2 text-sm text-slate-500">Cases sold this month</p>
            </div>
          </div>

          <div className="text-sm font-semibold text-slate-700 mt-6 mb-4">Total Parameters</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            <div className="rounded-2xl bg-white p-5 shadow-sm border border-slate-200">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Total Sales</p>
              <div className="mt-3 text-3xl font-bold text-emerald-700">₹{formatAmount(totalSales)}</div>
              <p className="mt-2 text-sm text-slate-500">All sales value</p>
            </div>

            <div className="rounded-2xl bg-white p-5 shadow-sm border border-slate-200">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Total Expenses</p>
              <div className="mt-3 text-3xl font-bold text-red-600">₹{formatAmount(totalExpenses)}</div>
              <p className="mt-2 text-sm text-slate-500">All expense value</p>
            </div>

            <div className="rounded-2xl bg-white p-5 shadow-sm border border-slate-200">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Capital</p>
              <div className="mt-3 text-3xl font-bold text-blue-600">₹{formatAmount(capital)}</div>
              <p className="mt-2 text-sm text-slate-500">Configured capital amount</p>
            </div>

            <div className="rounded-2xl bg-white p-5 shadow-sm border border-slate-200">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Present Amount</p>
              <div className="mt-3 text-3xl font-bold text-indigo-700">₹{formatAmount(presentAmount)}</div>
              <p className="mt-2 text-sm text-slate-500">Sales - Expenses + Capital</p>
            </div>
          </div>
        </div>
      </section>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <Card title="Low Stock Items">
          <div className="text-3xl font-bold text-yellow-600">{lowStockItems.length}</div>
          <p className="text-gray-600 text-sm mt-2">Need Re-ordering</p>
        </Card>

        <Card title="Today's Orders">
          <div className="text-3xl font-bold text-gray-800">{todayOrdersCount}</div>
          <p className="text-gray-600 text-sm mt-2">Distinct customer orders today</p>
          <div className="mt-2 text-sm">
            <span className="text-green-700">Delivered: {todayOrdersDeliveredCount}</span>
            <span className="mx-2">|</span>
            <span className="text-orange-700">Pending: {todayOrdersPendingCount}</span>
          </div>
        </Card>

        <Card title="Total Credit">
          <div className="text-3xl font-bold text-orange-600">₹{formatAmount(totalCredit)}</div>
          <p className="text-gray-600 text-sm mt-2">Outstanding credit balance</p>
        </Card>
      </div>

      {/* Best Customer Highlights */}
      <section className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        <div className="rounded-3xl overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-700 to-cyan-600 text-white shadow-xl">
          <div className="p-6">
            <div className="text-xs uppercase tracking-[0.2em] text-cyan-200">Top Customer</div>
            <div className="mt-2 text-sm text-cyan-100">Previous Month</div>
            {topPrevMonthCustomer ? (
              <div className="mt-5 space-y-3">
                <div className="text-2xl font-semibold">{topPrevMonthCustomer.customerName}</div>
                <div className="text-sm text-cyan-100">₹{formatAmount(topPrevMonthCustomer.totalSales)} sales</div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-2xl bg-white/10 p-3">
                    <div className="text-xs uppercase tracking-[0.15em] text-cyan-200">Sale %</div>
                    <div className="mt-2 text-lg font-semibold">{topPrevMonthCustomer.salePercentage.toFixed(2)}%</div>
                  </div>
                  <div className="rounded-2xl bg-white/10 p-3">
                    <div className="text-xs uppercase tracking-[0.15em] text-cyan-200">Credit ratio</div>
                    <div className="mt-2 text-lg font-semibold">{(topPrevMonthCustomer.creditRatio * 100).toFixed(1)}%</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-2xl bg-white/10 p-3">
                    <div className="text-xs uppercase tracking-[0.15em] text-cyan-200">Avg price/case</div>
                    <div className="mt-2 text-lg font-semibold">₹{formatAmount(topPrevMonthCustomer.avgPricePerCase, 0)}</div>
                  </div>
                  <div className="rounded-2xl bg-white/10 p-3">
                    <div className="text-xs uppercase tracking-[0.15em] text-cyan-200">Avg cases/order</div>
                    <div className="mt-2 text-lg font-semibold">{topPrevMonthCustomer.avgCasesPerOrder.toFixed(1)}</div>
                  </div>
                </div>
                <p className="text-xs text-cyan-100/80">Score formula: 6×sale % + 2×(1-credit ratio) + 1×price ratio + avg cases/order ÷ 1000</p>
              </div>
            ) : (
              <p className="mt-5 text-sm text-cyan-100/80">No customer qualified for the previous month.</p>
            )}
          </div>
        </div>

        <div className="rounded-3xl overflow-hidden bg-gradient-to-br from-amber-500 via-orange-500 to-rose-600 text-white shadow-xl">
          <div className="p-6">
            <div className="text-xs uppercase tracking-[0.2em] text-amber-100">Top Customer</div>
            <div className="mt-2 text-sm text-amber-100">Overall</div>
            {topOverallCustomer ? (
              <div className="mt-5 space-y-3">
                <div className="text-2xl font-semibold">{topOverallCustomer.customerName}</div>
                <div className="text-sm text-amber-100">₹{formatAmount(topOverallCustomer.totalSales)} sales</div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-2xl bg-white/10 p-3">
                    <div className="text-xs uppercase tracking-[0.15em] text-amber-100">Sale %</div>
                    <div className="mt-2 text-lg font-semibold">{topOverallCustomer.salePercentage.toFixed(2)}%</div>
                  </div>
                  <div className="rounded-2xl bg-white/10 p-3">
                    <div className="text-xs uppercase tracking-[0.15em] text-amber-100">Credit ratio</div>
                    <div className="mt-2 text-lg font-semibold">{(topOverallCustomer.creditRatio * 100).toFixed(1)}%</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-2xl bg-white/10 p-3">
                    <div className="text-xs uppercase tracking-[0.15em] text-amber-100">Avg price/case</div>
                    <div className="mt-2 text-lg font-semibold">₹{formatAmount(topOverallCustomer.avgPricePerCase, 0)}</div>
                  </div>
                  <div className="rounded-2xl bg-white/10 p-3">
                    <div className="text-xs uppercase tracking-[0.15em] text-amber-100">Avg cases/order</div>
                    <div className="mt-2 text-lg font-semibold">{topOverallCustomer.avgCasesPerOrder.toFixed(1)}</div>
                  </div>
                </div>
                <p className="text-xs text-amber-100/80">Score formula: 6×sale % + 2×(1-credit ratio) + 1×price ratio + avg cases/order ÷ 1000</p>
              </div>
            ) : (
              <p className="mt-5 text-sm text-amber-100/80">No customer qualified overall.</p>
            )}
          </div>
        </div>
      </section>

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
                  <div className="text-right max-w-40">
                    <p className="text-lg font-bold text-green-600 truncate">₹{formatAmount(group.totalAmount)}</p>
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
                          <p className="text-xs text-gray-600">Qty: {order.quantity} @ ₹{formatAmount(order.pricePerCase)}/case</p>
                          <div className="mt-1">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColorClass}`}>
                              {statusLabel}
                            </span>
                          </div>
                        </div>
                        <p className="font-semibold text-gray-900 truncate">₹{formatAmount(orderPrice)}</p>
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
            <p className="text-xl font-bold text-green-600">{totalSales > 0 ? '₹' + formatAmount(totalSales, 0) : '₹0'}</p>
            <p className="text-xs text-gray-600 mt-1">Total Sales</p>
          </div>
          <div className="text-center p-4 bg-orange-50 rounded-lg">
            <p className="text-xl font-bold text-orange-600">{totalCredit > 0 ? '₹' + formatAmount(totalCredit, 0) : '₹0'}</p>
            <p className="text-xs text-gray-600 mt-1">Total Credit</p>
          </div>
          <div className="text-center p-4 bg-red-50 rounded-lg">
            <p className="text-xl font-bold text-red-600">{totalExpenses > 0 ? '₹' + formatAmount(totalExpenses, 0) : '₹0'}</p>
            <p className="text-xs text-gray-600 mt-1">Total Expenses</p>
          </div>
          <div className="text-center p-4 bg-indigo-50 rounded-lg">
            <p className="text-xl font-bold text-indigo-600">{presentAmount !== 0 ? '₹' + formatAmount(presentAmount, 0) : '₹0'}</p>
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
