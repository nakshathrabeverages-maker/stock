import React, { useEffect, useMemo, useState } from 'react';
import { Layout, Card, Button, Input, Select, Alert } from '@/components';
import { productService } from '@/services/productService';
import { salesService } from '@/services/salesService';
import { customerService } from '@/services/customerService';
import { Product, SaleEntry, Customer } from '@/types';

const REPORT_SUBTYPE_OPTIONS = [
  { value: 'customerByAmount', label: 'Sales by Customer - Amount' },
  { value: 'customerByCases', label: 'Sales by Customer - Cases' },
  { value: 'orderByCustomerDate', label: 'Orders by Customer & Date' },
  { value: 'productByCount', label: 'Sales by Product - Count' },
  { value: 'productByValue', label: 'Sales by Product - Value' },
];

const SORT_OPTIONS = [
  { value: 'displayName', label: 'Name' },
  { value: 'quantity', label: 'Cases' },
  { value: 'totalAmount', label: 'Amount' },
  { value: 'creditPercentage', label: 'Credit %' },
];

const formatCurrency = (value: number) => `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export const ReportsAggregationPage: React.FC = () => {
  const [startDate, setStartDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [reportSubtype, setReportSubtype] = useState('customerByAmount');
  const [reportFilter, setReportFilter] = useState('');
  const [reportSortKey, setReportSortKey] = useState('totalAmount');
  const [reportSortDirection, setReportSortDirection] = useState<'asc' | 'desc'>('desc');
  const [reportRows, setReportRows] = useState<any[]>([]);
  const [reportColumns, setReportColumns] = useState<{ label: string; key: string }[]>([]);
  const [reportTitle, setReportTitle] = useState('Sales by Customer - Amount');
  const [reportSubtitle, setReportSubtitle] = useState('Aggregated sales performance by customer');

  const compareValues = (a: any, b: any) => {
    if (a === b) return 0;
    if (a === undefined || a === null) return -1;
    if (b === undefined || b === null) return 1;
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b));
  };

  const applyFilterAndSort = <T extends Record<string, any>>(items: T[], searchableKeys: string[]) => {
    let result = items;

    if (reportFilter.trim()) {
      const search = reportFilter.trim().toLowerCase();
      result = result.filter((item) =>
        searchableKeys.some((key) => String(item[key] ?? '').toLowerCase().includes(search))
      );
    }

    if (reportSortKey) {
      result = [...result].sort((a, b) => {
        const valueA = a[reportSortKey];
        const valueB = b[reportSortKey];
        return reportSortDirection === 'asc'
          ? compareValues(valueA, valueB)
          : compareValues(valueB, valueA);
      });
    }

    return result;
  };

  const filteredRows = useMemo(
    () => applyFilterAndSort(reportRows, reportColumns.map((column) => column.key)),
    [reportRows, reportFilter, reportSortKey, reportSortDirection, reportColumns]
  );

  const reportSummary = useMemo(() => {
    const totalRows = filteredRows.length;
    const totalCases = filteredRows.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
    const totalAmount = filteredRows.reduce((sum, row) => sum + Number(row.totalAmount || 0), 0);

    return { totalRows, totalCases, totalAmount };
  }, [filteredRows]);

  useEffect(() => {
    const loadLookups = async () => {
      try {
        const [custs, prods] = await Promise.all([customerService.getAll(), productService.getAll(true)]);
        setCustomers(custs);
        setProducts(prods);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load lookup data');
      }
    };

    loadLookups();
  }, []);

  useEffect(() => {
    const selectedOption = REPORT_SUBTYPE_OPTIONS.find((option) => option.value === reportSubtype);
    setReportTitle(selectedOption?.label || 'Sales Report');
    setReportSubtitle('Aggregated sales view for the selected period');
    setReportSortKey(reportSubtype === 'customerByCases' ? 'quantity' : 'totalAmount');
  }, [reportSubtype]);

  useEffect(() => {
    generateReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportSubtype, startDate, endDate]);

  const generateReport = async () => {
    try {
      setLoading(true);
      setError('');

      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      const sales = await salesService.getAll({ startDate: start, endDate: end });
      const grouped = new Map<
        string,
        {
          displayName: string;
          quantity: number;
          totalAmount: number;
          creditAmount: number;
          orders: number;
          orderKeys: Set<string>;
        }
      >();

      sales.forEach((entry) => {
        const orderDateKey = new Date(entry.date as any).toISOString().slice(0, 10);
        const orderKey = `${entry.customerId}|${orderDateKey}`;

        if (reportSubtype === 'customerByAmount' || reportSubtype === 'customerByCases') {
          const customer = customers.find((c) => c.id === entry.customerId);
          const customerName = customer?.name || 'Unknown Customer';
          const key = entry.customerId || customerName;
          const current = grouped.get(key) || {
            displayName: customerName,
            quantity: 0,
            totalAmount: 0,
            creditAmount: 0,
            orders: 0,
            orderKeys: new Set<string>(),
          };

          current.quantity += Number(entry.quantity ?? 0);
          current.totalAmount += Number(entry.totalPrice ?? 0);
          current.creditAmount += Number(entry.remainingAmount ?? 0);
          if (!current.orderKeys.has(orderKey)) {
            current.orderKeys.add(orderKey);
            current.orders += 1;
          }
          grouped.set(key, current);
        } else {
          const product = products.find((p) => p.id === entry.productId);
          const productName = product?.name || 'Unknown Product';
          const key = entry.productId || productName;
          const current = grouped.get(key) || {
            displayName: productName,
            quantity: 0,
            totalAmount: 0,
            creditAmount: 0,
            orders: 0,
            orderKeys: new Set<string>(),
          };

          current.quantity += Number(entry.quantity ?? 0);
          current.totalAmount += Number(entry.totalPrice ?? 0);
          current.creditAmount += Number(entry.remainingAmount ?? 0);
          if (!current.orderKeys.has(orderKey)) {
            current.orderKeys.add(orderKey);
            current.orders += 1;
          }
          grouped.set(key, current);
        }
      });

      const rows = Array.from(grouped.values()).map((entry) => ({
        displayName: entry.displayName,
        quantity: entry.quantity,
        totalAmount: entry.totalAmount,
        creditAmount: entry.creditAmount,
        creditPercentage: entry.totalAmount ? Number(((entry.creditAmount / entry.totalAmount) * 100).toFixed(1)) : 0,
        orders: entry.orders,
      }));
      const columns = [
        { label: reportSubtype.includes('customer') ? 'Customer' : 'Product', key: 'displayName' },
        { label: 'Total Cases', key: 'quantity' },
        { label: 'Total Amount', key: 'totalAmount' },
        { label: 'Credit %', key: 'creditPercentage' },
        { label: 'Order Count', key: 'orders' },
      ];

      const sortedRows = rows.sort((a, b) => {
        if (reportSubtype === 'customerByCases') {
          return b.quantity - a.quantity;
        }
        if (reportSubtype === 'productByCount') {
          return b.quantity - a.quantity;
        }
        return b.totalAmount - a.totalAmount;
      });

      setReportRows(sortedRows);
      setReportColumns(columns);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate report');
      setReportRows([]);
      setReportColumns([]);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    if (!filteredRows.length) {
      setError('No rows to export. Generate a report first.');
      return;
    }

    const csvRows = [reportColumns.map((col) => col.label).join(',')];
    filteredRows.forEach((row) => {
      csvRows.push(reportColumns.map((col) => String(row[col.key] ?? '')).join(','));
    });

    const blob = new Blob([`\uFEFF${csvRows.join('\r\n')}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sales-report-${reportSubtype}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <Layout title="Sales Aggregation" subtitle="Sales by customer and product">
      {error && <Alert type="error" message={error} onClose={() => setError('')} />}

      <Card className="mb-6 border border-slate-200 shadow-xl">
        <div className="space-y-6">
          <div className="rounded-2xl bg-gradient-to-r from-primary to-secondary p-5 text-white">
            <h2 className="text-2xl font-semibold">Sales Aggregation</h2>
            <p className="mt-1 text-sm opacity-90">Choose one of the four sales reports and export the results.</p>
          </div>

          <div className="grid gap-4 lg:grid-cols-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Report View</label>
              <Select
                value={reportSubtype}
                onChange={(e) => setReportSubtype(e.target.value)}
                options={REPORT_SUBTYPE_OPTIONS}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Start Date</label>
              <input
                type="date"
                className="input-field"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">End Date</label>
              <input
                type="date"
                className="input-field"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
              <Input
                value={reportFilter}
                onChange={(e) => setReportFilter(e.target.value)}
                placeholder="Filter by customer or product"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
            <div className="rounded-2xl bg-slate-50 p-4 shadow-sm">
              <p className="text-sm text-slate-500">Rows</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{reportSummary.totalRows}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4 shadow-sm">
              <p className="text-sm text-slate-500">Total Cases</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{reportSummary.totalCases}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4 shadow-sm">
              <p className="text-sm text-slate-500">Total Amount</p>
              <p className="mt-2 text-2xl font-semibold text-slate-900">{formatCurrency(reportSummary.totalAmount)}</p>
            </div>
            <div className="rounded-2xl bg-slate-50 p-4 shadow-sm flex items-end">
              <Button variant="primary" onClick={handleExport} fullWidth>
                Export CSV
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <Card title={reportTitle} subtitle={reportSubtitle} className="border border-slate-200 shadow-xl">
        {filteredRows.length > 0 ? (
          <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-100 text-slate-700">
                <tr>
                  {reportColumns.map((column) => (
                    <th key={column.key} className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.15em] text-slate-600">
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 bg-white">
                {filteredRows.map((row, idx) => (
                  <tr key={`${reportSubtype}-${idx}`} className="hover:bg-slate-50 transition-colors">
                    {reportColumns.map((column) => (
                      <td key={column.key} className={`px-4 py-3 align-top ${column.key !== 'displayName' ? 'text-right font-semibold' : ''}`}>
                        {column.key === 'totalAmount'
                          ? formatCurrency(Number(row[column.key] ?? 0))
                          : column.key === 'creditPercentage'
                          ? `${Number(row[column.key] ?? 0).toFixed(1)}%`
                          : row[column.key] ?? '-'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-slate-600">
            No sales data found for the selected range.
          </div>
        )}
      </Card>
    </Layout>
  );
};
