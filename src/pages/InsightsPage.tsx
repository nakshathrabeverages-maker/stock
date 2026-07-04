import React, { useEffect, useMemo, useState } from 'react';
import { Layout, Card, Alert, Loading } from '@/components';
import { customerService } from '@/services/customerService';
import { productService } from '@/services/productService';
import { salesService } from '@/services/salesService';
import { Customer, Product, SaleEntry } from '@/types';

type TopInsightRow = {
  id: string;
  label: string;
  cases: number;
  amount: number;
};

const formatCurrency = (value: number) => `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const formatCases = (value: number) => `${value.toLocaleString('en-IN')} cases`;

const getPreviousMonthRange = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
  return { start, end };
};

const buildLookup = <T extends { id: string; name: string }>(items: T[]) =>
  items.reduce<Record<string, string>>((acc, item) => {
    acc[item.id] = item.name;
    return acc;
  }, {});

const aggregateTopItems = (
  sales: SaleEntry[],
  keySelector: (entry: SaleEntry) => string,
  labelSelector: (id: string) => string,
  valueSelector: (entry: SaleEntry) => number,
  casesSelector: (entry: SaleEntry) => number
) => {
  const grouped = new Map<string, TopInsightRow>();

  sales.forEach((entry) => {
    const rawKey = keySelector(entry) || 'unknown';
    const normalizedKey = rawKey.toLowerCase().trim();
    const label = labelSelector(rawKey).trim();
    const normalizedLabel = label.toLowerCase();

    if (normalizedKey === 'other' || normalizedKey === 'others' || normalizedLabel === 'other' || normalizedLabel === 'others') {
      return;
    }

    const existing = grouped.get(rawKey) || { id: rawKey, label, cases: 0, amount: 0 };
    existing.amount += Number(valueSelector(entry) ?? 0);
    existing.cases += Number(casesSelector(entry) ?? 0);
    grouped.set(rawKey, existing);
  });

  return Array.from(grouped.values());
};

const sortAndLimit = (items: TopInsightRow[], field: 'amount' | 'cases') =>
  [...items].sort((a, b) => b[field] - a[field]).slice(0, 5);

export const InsightsPage: React.FC = () => {
  const currentDate = new Date();
  const defaultMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);

  const [periodSales, setPeriodSales] = useState<SaleEntry[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedYear, setSelectedYear] = useState(String(defaultMonth.getFullYear()));
  const [selectedMonth, setSelectedMonth] = useState<string>(String(defaultMonth.getMonth() + 1));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const customerLookup = useMemo(() => buildLookup(customers), [customers]);
  const productLookup = useMemo(() => buildLookup(products), [products]);

  const monthOptions = [
    { value: 'overall', label: 'Overall' },
    { value: '1', label: 'Jan' },
    { value: '2', label: 'Feb' },
    { value: '3', label: 'Mar' },
    { value: '4', label: 'Apr' },
    { value: '5', label: 'May' },
    { value: '6', label: 'Jun' },
    { value: '7', label: 'Jul' },
    { value: '8', label: 'Aug' },
    { value: '9', label: 'Sep' },
    { value: '10', label: 'Oct' },
    { value: '11', label: 'Nov' },
    { value: '12', label: 'Dec' },
  ];

  const yearOptions = [
    { value: 'overall', label: 'Overall' },
    ...Array.from({ length: 6 }, (_, idx) => {
      const year = currentDate.getFullYear() - idx;
      return { value: String(year), label: String(year) };
    }),
  ];

  const periodLabel = (() => {
    if (selectedYear === 'overall' && selectedMonth === 'overall') {
      return 'Overall';
    }
    if (selectedYear === 'overall') {
      const monthName = new Date(2000, Number(selectedMonth) - 1, 1).toLocaleString('default', {
        month: 'long',
      });
      return `${monthName} (All Years)`;
    }
    if (selectedMonth === 'overall') {
      return `${selectedYear} (All Months)`;
    }
    return new Date(Number(selectedYear), Number(selectedMonth) - 1, 1).toLocaleString('default', {
      month: 'long',
      year: 'numeric',
    });
  })();

  useEffect(() => {
    const loadLookupData = async () => {
      try {
        const [custs, prods] = await Promise.all([customerService.getAll(), productService.getAll(true)]);
        setCustomers(custs);
        setProducts(prods);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load lookup data');
      }
    };

    loadLookupData();
  }, []);

  useEffect(() => {
    const loadSales = async () => {
      try {
        setLoading(true);
        setError('');

        if (selectedYear === 'overall' && selectedMonth === 'overall') {
          const allSales = await salesService.getAll();
          setPeriodSales(allSales);
          return;
        }

        if (selectedYear === 'overall') {
          const month = Number(selectedMonth) - 1;
          const startDate = new Date(1970, month, 1);
          const endDate = new Date(2100, month + 1, 0, 23, 59, 59, 999);
          const sales = await salesService.getAll({ startDate, endDate });
          setPeriodSales(sales.filter((sale) => sale.date.getMonth() === month));
          return;
        }

        if (selectedMonth === 'overall') {
          const year = Number(selectedYear);
          const startDate = new Date(year, 0, 1);
          const endDate = new Date(year, 11, 31, 23, 59, 59, 999);
          const sales = await salesService.getAll({ startDate, endDate });
          setPeriodSales(sales);
          return;
        }

        const year = Number(selectedYear);
        const month = Number(selectedMonth) - 1;
        const startDate = new Date(year, month, 1);
        const endDate = new Date(year, month + 1, 0, 23, 59, 59, 999);
        const sales = await salesService.getAll({ startDate, endDate });
        setPeriodSales(sales);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load sales data');
      } finally {
        setLoading(false);
      }
    };

    loadSales();
  }, [selectedYear, selectedMonth]);

  const topCustomersByValue = useMemo(
    () =>
      sortAndLimit(
        aggregateTopItems(
          periodSales,
          (entry) => entry.customerId,
          (id) => customerLookup[id] ?? 'Unknown Customer',
          (entry) => entry.totalPrice,
          (entry) => entry.quantity
        ),
        'amount'
      ),
    [periodSales, customerLookup]
  );

  const topCustomersByCases = useMemo(
    () =>
      sortAndLimit(
        aggregateTopItems(
          periodSales,
          (entry) => entry.customerId,
          (id) => customerLookup[id] ?? 'Unknown Customer',
          (entry) => entry.totalPrice,
          (entry) => entry.quantity
        ),
        'cases'
      ),
    [periodSales, customerLookup]
  );

  const topProductsByCases = useMemo(
    () =>
      sortAndLimit(
        aggregateTopItems(
          periodSales,
          (entry) => entry.productId,
          (id) => productLookup[id] ?? 'Unknown Product',
          (entry) => entry.totalPrice,
          (entry) => entry.quantity
        ),
        'cases'
      ),
    [periodSales, productLookup]
  );

  const topProductsByValue = useMemo(
    () =>
      sortAndLimit(
        aggregateTopItems(
          periodSales,
          (entry) => entry.productId,
          (id) => productLookup[id] ?? 'Unknown Product',
          (entry) => entry.totalPrice,
          (entry) => entry.quantity
        ),
        'amount'
      ),
    [periodSales, productLookup]
  );

  const renderTopList = (items: TopInsightRow[], valueField: 'amount' | 'cases') => (
    <ol className="space-y-1 text-[0.78rem] text-slate-700">
      {items.map((item, index) => {
        const accent = valueField === 'amount' ? 'border-sky-300 bg-sky-50 text-sky-700' : 'border-emerald-300 bg-emerald-50 text-emerald-700';
        return (
          <li key={item.id} className={`grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-3xl border-l-4 border-slate-200 bg-white px-2 py-2 shadow-sm ${valueField === 'amount' ? 'border-sky-300' : 'border-emerald-300'}`}>
            <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full ${accent} text-[10px] font-semibold`}>{index + 1}</span>
            <span className="font-medium text-slate-900 truncate text-[12px]">{item.label}</span>
            <span className="whitespace-nowrap text-right text-[12px] font-semibold text-slate-700">
              {valueField === 'amount' ? formatCurrency(item.amount) : formatCases(item.cases)}
            </span>
          </li>
        );
      })}
    </ol>
  );

  if (loading) {
    return (
      <Layout title="Sales Insights" subtitle="Top customer and product metrics">
        <Card className="border border-slate-200 shadow-xl">
          <Loading fullScreen={false} message="Loading insights..." />
        </Card>
      </Layout>
    );
  }

  return (
    <Layout title="Top 5 Sales Insights" subtitle="Top 5 Customers by Sales | Top 5 Products by Cases | Prev month trends">
      {error && <Alert type="error" message={error} onClose={() => setError('')} />}

      <div className="space-y-4 pb-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] items-end">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">{periodLabel} Sales Insights</h2>
            <p className="mt-1 text-[0.8rem] text-slate-600">Select year and month, or choose Overall to view the top customers and products.</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-[1.25rem] border border-slate-200 bg-white p-3">
              <label className="block text-[0.72rem] font-semibold text-slate-600 mb-2">Year</label>
              <select
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                value={selectedYear}
                onChange={(event) => setSelectedYear(event.target.value)}
              >
                {yearOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="rounded-[1.25rem] border border-slate-200 bg-white p-3">
              <label className="block text-[0.72rem] font-semibold text-slate-600 mb-2">Month</label>
              <select
                className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-900"
                value={selectedMonth}
                onChange={(event) => setSelectedMonth(event.target.value)}
              >
                {monthOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <section className="rounded-[1.5rem] border border-slate-200 bg-slate-50 p-3 shadow-sm">
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-[1.25rem] border border-slate-200 bg-white p-3 shadow-sm">
              <div className="mb-2">
                <h3 className="text-base font-semibold text-slate-900">Customers by Cases</h3>
              </div>
              {renderTopList(topCustomersByCases, 'cases')}
            </div>

            <div className="rounded-[1.25rem] border border-slate-200 bg-white p-3 shadow-sm">
              <div className="mb-2">
                <h3 className="text-base font-semibold text-slate-900">Products by Cases</h3>
              </div>
              {renderTopList(topProductsByCases, 'cases')}
            </div>

            <div className="rounded-[1.25rem] border border-slate-200 bg-white p-3 shadow-sm">
              <div className="mb-2">
                <h3 className="text-base font-semibold text-slate-900">Customers by Value</h3>
              </div>
              {renderTopList(topCustomersByValue, 'amount')}
            </div>

            <div className="rounded-[1.25rem] border border-slate-200 bg-white p-3 shadow-sm">
              <div className="mb-2">
                <h3 className="text-base font-semibold text-slate-900">Products by Value</h3>
              </div>
              {renderTopList(topProductsByValue, 'amount')}
            </div>
          </div>
        </section>
      </div>
    </Layout>
  );
};
