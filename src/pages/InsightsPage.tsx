import React, { useEffect, useMemo, useState } from 'react';
import { Layout, Card, Alert, Loading, Input } from '@/components';
import { customerService } from '@/services/customerService';
import { expenseService } from '@/services/expenseService';
import { productService } from '@/services/productService';
import { salesService } from '@/services/salesService';
import { Customer, ExpenseEntry, Product, SaleEntry } from '@/types';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { getEndOfDay, getStartOfDay } from '@/utils/dateUtils';
import { getSaleCaseQuantity } from '@/utils/salesUtils';

type TopInsightRow = {
  id: string;
  label: string;
  cases: number;
  amount: number;
};

const formatCurrency = (value: number) => `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const formatCases = (value: number) => `${value.toLocaleString('en-IN')} cases`;
const expenseTypeLabels: Record<string, string> = {
  rawmaterial: 'Raw Material',
  salary: 'Salary',
  powerbill: 'Power Bill',
  plant_maintenance: 'Plant Maintenance',
  machine_maintenance: 'Machine Maintenance',
  transport: 'Transport',
  company_vehicle: 'Company Vehicle',
  food: 'Food',
  loading_charges: 'Loading Charges',
  courier_charges: 'Courier Charges',
  machine_spares: 'Machine Spares',
  capital_expenditure: 'Capital Expenditure',
  sales_commission: 'Sales Commission',
  rent: 'Rent',
  lemon_soda_purchase: 'Lemon Soda Purchase',
  others: 'Others',
};
const expenseChartColors = ['#168b83', '#dc6b48', '#3977b8', '#a27829', '#705f9e', '#56804e', '#c44769', '#6f8792', '#b47739', '#498aab', '#8a715b', '#8e9b43', '#b04d38', '#6474a5', '#58937b', '#9b6684'];

const toDateInputValue = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

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
  const [periodExpenses, setPeriodExpenses] = useState<ExpenseEntry[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [expenseStartDate, setExpenseStartDate] = useState(() => toDateInputValue(new Date(new Date().getFullYear(), new Date().getMonth(), 1)));
  const [expenseEndDate, setExpenseEndDate] = useState(() => toDateInputValue(new Date()));
  const [expensesLoading, setExpensesLoading] = useState(false);
  const [expenseDateError, setExpenseDateError] = useState('');
  const [selectedYear, setSelectedYear] = useState(String(defaultMonth.getFullYear()));
  const [selectedMonth, setSelectedMonth] = useState<string>(String(defaultMonth.getMonth() + 1));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const customerLookup = useMemo(() => buildLookup(customers), [customers]);
  const productLookup = useMemo(() => buildLookup(products), [products]);
  const productsById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);

  const expenseTotalsByType = useMemo(() => {
    const totals = new Map<string, number>();
    periodExpenses.forEach((expense) => {
      totals.set(expense.type, (totals.get(expense.type) ?? 0) + (Number(expense.value) || 0));
    });
    return Array.from(totals, ([type, value]) => ({
      type,
      name: expenseTypeLabels[type] ?? type.replace(/_/g, ' '),
      value,
    })).sort((a, b) => b.value - a.value);
  }, [periodExpenses]);

  const expenseTotal = useMemo(
    () => expenseTotalsByType.reduce((total, item) => total + item.value, 0),
    [expenseTotalsByType]
  );

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

  useEffect(() => {
    let active = true;
    const loadExpenses = async () => {
      if (!expenseStartDate || !expenseEndDate) {
        setExpenseDateError('Select both dates to view expenses by type.');
        setPeriodExpenses([]);
        return;
      }

      if (expenseStartDate > expenseEndDate) {
        setExpenseDateError('Start date cannot be later than end date.');
        setPeriodExpenses([]);
        return;
      }

      try {
        setExpensesLoading(true);
        setExpenseDateError('');
        const expenses = await expenseService.getAll({
          startDate: getStartOfDay(expenseStartDate),
          endDate: getEndOfDay(expenseEndDate),
        });
        if (active) setPeriodExpenses(expenses);
      } catch (err) {
        if (active) setExpenseDateError(err instanceof Error ? err.message : 'Failed to load expenses');
      } finally {
        if (active) setExpensesLoading(false);
      }
    };

    loadExpenses();
    return () => {
      active = false;
    };
  }, [expenseStartDate, expenseEndDate]);

  const topCustomersByValue = useMemo(
    () =>
      sortAndLimit(
        aggregateTopItems(
          periodSales,
          (entry) => entry.customerId,
          (id) => customerLookup[id] ?? 'Unknown Customer',
          (entry) => entry.totalPrice,
          (entry) => getSaleCaseQuantity(entry, productsById)
        ),
        'amount'
      ),
    [periodSales, customerLookup, productsById]
  );

  const topCustomersByCases = useMemo(
    () =>
      sortAndLimit(
        aggregateTopItems(
          periodSales,
          (entry) => entry.customerId,
          (id) => customerLookup[id] ?? 'Unknown Customer',
          (entry) => entry.totalPrice,
          (entry) => getSaleCaseQuantity(entry, productsById)
        ),
        'cases'
      ),
    [periodSales, customerLookup, productsById]
  );

  const topProductsByCases = useMemo(
    () =>
      sortAndLimit(
        aggregateTopItems(
          periodSales,
          (entry) => entry.productId,
          (id) => productLookup[id] ?? 'Unknown Product',
          (entry) => entry.totalPrice,
          (entry) => getSaleCaseQuantity(entry, productsById)
        ),
        'cases'
      ),
    [periodSales, productLookup, productsById]
  );

  const topProductsByValue = useMemo(
    () =>
      sortAndLimit(
        aggregateTopItems(
          periodSales,
          (entry) => entry.productId,
          (id) => productLookup[id] ?? 'Unknown Product',
          (entry) => entry.totalPrice,
          (entry) => getSaleCaseQuantity(entry, productsById)
        ),
        'amount'
      ),
    [periodSales, productLookup, productsById]
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

        <Card title="Expenses by Type" subtitle="Expense totals for the selected date range">
          <div className="mb-5 grid max-w-xl gap-4 sm:grid-cols-2">
            <Input
              label="Start date"
              type="date"
              value={expenseStartDate}
              max={expenseEndDate || undefined}
              onChange={(event) => setExpenseStartDate(event.target.value)}
            />
            <Input
              label="End date"
              type="date"
              value={expenseEndDate}
              min={expenseStartDate || undefined}
              onChange={(event) => setExpenseEndDate(event.target.value)}
            />
          </div>

          {expenseDateError && <Alert type="error" message={expenseDateError} onClose={() => setExpenseDateError('')} />}
          {expensesLoading ? (
            <Loading fullScreen={false} message="Loading expenses..." />
          ) : expenseTotalsByType.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-600">No expenses found for this date range.</p>
          ) : (
            <div className="grid items-center gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(16rem,0.8fr)]">
              <div className="h-80 min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={expenseTotalsByType}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius="82%"
                      paddingAngle={1}
                      labelLine={false}
                    >
                      {expenseTotalsByType.map((item, index) => (
                        <Cell key={item.type} fill={expenseChartColors[index % expenseChartColors.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => formatCurrency(Number(value) || 0)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div>
                <div className="mb-3 border-b border-slate-200 pb-3">
                  <p className="text-xs font-medium uppercase text-slate-500">Total expenses</p>
                  <p className="mt-1 text-2xl font-semibold text-slate-900">{formatCurrency(expenseTotal)}</p>
                </div>
                <ul className="max-h-72 space-y-2 overflow-y-auto">
                  {expenseTotalsByType.map((item, index) => (
                    <li key={item.type} className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex min-w-0 items-center gap-2 text-slate-700">
                        <span className="h-3 w-3 shrink-0 rounded-sm" style={{ backgroundColor: expenseChartColors[index % expenseChartColors.length] }} />
                        <span className="truncate">{item.name}</span>
                      </span>
                      <span className="shrink-0 font-medium text-slate-900">{formatCurrency(item.value)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </Card>
      </div>
    </Layout>
  );
};
