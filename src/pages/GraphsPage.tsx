import React, { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Alert, Card, Layout, Loading, Select } from '@/components';
import { expenseService } from '@/services/expenseService';
import { productionService } from '@/services/productionService';
import { salesService } from '@/services/salesService';
import { productService } from '@/services/productService';
import { getEndOfDay, getISTDateParts, getStartOfDay } from '@/utils/dateUtils';
import { getSaleCaseQuantity } from '@/utils/salesUtils';

interface MonthlyData {
  month: string;
  expenses: number;
  salesValue: number;
  salesCases: number;
  productionCases: number;
  profit: number;
}

const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const formatCurrency = (value: number) => `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const formatNumber = (value: number) => value.toLocaleString('en-IN', { maximumFractionDigits: 2 });

const makeEmptyMonthlyData = (): MonthlyData[] =>
  monthNames.map((month) => ({ month, expenses: 0, salesValue: 0, salesCases: 0, productionCases: 0, profit: 0 }));

export const GraphsPage: React.FC = () => {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(String(currentYear));
  const [selectedGraph, setSelectedGraph] = useState('expenses');
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>(makeEmptyMonthlyData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const yearOptions = Array.from({ length: currentYear - 1999 }, (_, index) => {
    const year = String(currentYear - index);
    return { value: year, label: year };
  });

  useEffect(() => {
    let active = true;

    const loadYearData = async () => {
      try {
        setLoading(true);
        setError('');
        const startDate = getStartOfDay(`${selectedYear}-01-01`);
        const endDate = getEndOfDay(`${selectedYear}-12-31`);
        const [expenses, sales, production, products] = await Promise.all([
          expenseService.getAll({ startDate, endDate }),
          salesService.getAll({ startDate, endDate }),
          productionService.getAll({ startDate, endDate }),
          productService.getAll(true),
        ]);

        const totals = makeEmptyMonthlyData();
        const productsById = new Map<string, import('@/types').Product>(products.map((product) => [product.id, product]));
        const getMonthIndex = (date: Date) => {
          const parts = getISTDateParts(date);
          return parts.year === Number(selectedYear) ? parts.month - 1 : -1;
        };

        expenses.forEach((entry) => {
          const monthIndex = getMonthIndex(entry.date);
          if (monthIndex >= 0) totals[monthIndex].expenses += Number(entry.value) || 0;
        });
        sales.forEach((entry) => {
          const monthIndex = getMonthIndex(entry.date);
          if (monthIndex >= 0) {
            totals[monthIndex].salesValue += Number(entry.totalPrice) || 0;
            totals[monthIndex].salesCases += getSaleCaseQuantity(entry, productsById);
          }
        });
        production.forEach((entry) => {
          const monthIndex = getMonthIndex(entry.date);
          if (monthIndex >= 0) totals[monthIndex].productionCases += Number(entry.quantity) || 0;
        });
        totals.forEach((month) => {
          month.profit = month.salesValue - month.expenses;
        });

        if (active) setMonthlyData(totals);
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Failed to load graph data');
      } finally {
        if (active) setLoading(false);
      }
    };

    loadYearData();
    return () => {
      active = false;
    };
  }, [selectedYear]);

  const charts: Array<{
    id: string;
    title: string;
    dataKey: keyof Omit<MonthlyData, 'month'>;
    color: string;
    valueLabel: string;
    formatValue: (value: number) => string;
    axisFormatter: (value: number) => string;
  }> = [
    { id: 'expenses', title: 'Monthly Expenses', dataKey: 'expenses', color: '#dc6b48', valueLabel: 'Expenses', formatValue: formatCurrency, axisFormatter: (value) => `₹${formatNumber(value)}` },
    { id: 'salesValue', title: 'Monthly Sales Value', dataKey: 'salesValue', color: '#168b83', valueLabel: 'Sales value', formatValue: formatCurrency, axisFormatter: (value) => `₹${formatNumber(value)}` },
    { id: 'salesCases', title: 'Monthly Sales Cases', dataKey: 'salesCases', color: '#3977b8', valueLabel: 'Sales cases', formatValue: formatNumber, axisFormatter: formatNumber },
    { id: 'productionCases', title: 'Monthly Production Cases', dataKey: 'productionCases', color: '#a27829', valueLabel: 'Production cases', formatValue: formatNumber, axisFormatter: formatNumber },
    { id: 'profit', title: 'Monthly Profit (Sales - Expenses)', dataKey: 'profit', color: '#58824a', valueLabel: 'Profit', formatValue: formatCurrency, axisFormatter: (value) => `₹${formatNumber(value)}` },
  ];
  const selectedChart = charts.find((chart) => chart.id === selectedGraph) ?? charts[0];

  return (
    <Layout title="Graphs" subtitle="Monthly business totals by year">
      <div className="mb-5 grid max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
        <Select
          label="Year"
          options={yearOptions}
          value={selectedYear}
          onChange={(event) => setSelectedYear(event.target.value)}
        />
        <Select
          label="Graph"
          options={charts.map((chart) => ({ value: chart.id, label: chart.title }))}
          value={selectedGraph}
          onChange={(event) => setSelectedGraph(event.target.value)}
        />
      </div>

      {error && <Alert type="error" message={error} onClose={() => setError('')} />}
      {loading ? (
        <Loading fullScreen={false} message={`Loading ${selectedYear} graph data...`} />
      ) : (
        <Card title={selectedChart.title} subtitle={selectedYear} className="min-w-0">
          <div className="h-80 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyData} margin={{ top: 8, right: 12, left: 8, bottom: 0 }}>
                <CartesianGrid stroke="#e6e8e5" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: '#68736e', fontSize: 12 }} />
                <YAxis
                  width={72}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fill: '#68736e', fontSize: 11 }}
                  tickFormatter={selectedChart.axisFormatter}
                />
                <Tooltip
                  formatter={(value) => [selectedChart.formatValue(Number(value) || 0), selectedChart.valueLabel]}
                  contentStyle={{ borderRadius: 4, borderColor: '#d9ded9' }}
                />
                <Bar dataKey={selectedChart.dataKey} fill={selectedChart.color} radius={[3, 3, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
    </Layout>
  );
};