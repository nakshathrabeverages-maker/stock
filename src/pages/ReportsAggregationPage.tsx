import React, { useEffect, useMemo, useState } from 'react';
import { Layout, Card, Button, Input, Select, Alert } from '@/components';
import { customerService } from '@/services/customerService';
import { salesService } from '@/services/salesService';
import { Customer, SaleEntry } from '@/types';

const REPORT_SORT_OPTIONS = [
  { value: 'customerName', label: 'Customer' },
  { value: 'totalCredit', label: 'Outstanding Credit' },
  { value: 'orders', label: 'Orders' },
];

export const ReportsAggregationPage: React.FC = () => {
  const [startDate, setStartDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [creditReport, setCreditReport] = useState<
    { customerId: string; customerName: string; date: string; totalCredit: number; orders: SaleEntry[] }[]
  >([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [reportFilter, setReportFilter] = useState('');
  const [reportSortKey, setReportSortKey] = useState('totalCredit');
  const [reportSortDirection, setReportSortDirection] = useState<'asc' | 'desc'>('desc');

  const compareValues = (a: any, b: any) => {
    if (a === b) return 0;
    if (a === undefined || a === null) return -1;
    if (b === undefined || b === null) return 1;
    if (Array.isArray(a) && Array.isArray(b)) return a.length - b.length;
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b));
  };

  const sanitizeCsvValue = (value: any) => {
    const stringValue = value === undefined || value === null ? '' : String(value);
    return `"${stringValue.replace(/"/g, '""')}"`;
  };

  const downloadCsv = (rows: any[], headers: { label: string; key: string }[], filename: string) => {
    const csvRows = [headers.map((header) => sanitizeCsvValue(header.label)).join(',')];
    rows.forEach((row) => {
      csvRows.push(
        headers
          .map((header) => sanitizeCsvValue(row[header.key]))
          .join(',')
      );
    });

    const csvContent = csvRows.join('\r\n');
    const blob = new Blob(["\ufeff", csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
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
        const sortResult = compareValues(valueA, valueB);
        return reportSortDirection === 'asc' ? sortResult : -sortResult;
      });
    }

    return result;
  };

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const custs = await customerService.getAll();
        setCustomers(custs);
        await generateReport();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      }
    };

    loadInitialData();
  }, []);

  const generateReport = async () => {
    try {
      setLoading(true);
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      const sales = await salesService.getAll({ startDate: start, endDate: end });
      const pendingSales = sales.filter((entry) => (entry.remainingAmount ?? 0) > 0);

      // Group by customer + date (date part only)
      const grouped = new Map<string, { customerId: string; customerName: string; date: string; totalCredit: number; orders: SaleEntry[] }>();

      pendingSales.forEach((entry) => {
        const customer = customers.find((c) => c.id === entry.customerId);
        const customerName = customer?.name || 'Unknown';
        const dateKey = new Date(entry.date as any).toISOString().slice(0, 10); // YYYY-MM-DD
        const mapKey = `${entry.customerId}|${dateKey}`;
        const group = grouped.get(mapKey) || {
          customerId: entry.customerId,
          customerName,
          date: dateKey,
          totalCredit: 0,
          orders: [],
        };
        group.totalCredit += entry.remainingAmount ?? 0;
        group.orders.push(entry);
        grouped.set(mapKey, group);
      });

      const arr = Array.from(grouped.values()).sort((a, b) => {
        if (a.customerName !== b.customerName) return a.customerName.localeCompare(b.customerName);
        return a.date.localeCompare(b.date);
      });

      setCreditReport(arr);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate credit report');
    } finally {
      setLoading(false);
    }
  };

  const filteredCreditReport = useMemo(
    () => applyFilterAndSort(creditReport, ['customerName', 'date', 'totalCredit', 'orders']),
    [creditReport, reportFilter, reportSortKey, reportSortDirection]
  );

  const handleGenerateReport = () => {
    generateReport();
  };

  const handleExport = () => {
    const rows = filteredCreditReport.map((row) => ({
      customerName: row.customerName,
      date: row.date,
      totalCredit: row.totalCredit,
      orders: row.orders.length,
    }));

    if (!rows.length) {
      setError('No credit data available to export. Generate a report first.');
      return;
    }

    downloadCsv(rows, [
      { label: 'Customer', key: 'customerName' },
      { label: 'Date', key: 'date' },
      { label: 'Outstanding Credit', key: 'totalCredit' },
      { label: 'Orders', key: 'orders' },
    ], `credit-aggregation-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  return (
    <Layout title="Reports Aggregation" subtitle="Customer credit aggregation with date filters">
      {error && <Alert type="error" message={error} onClose={() => setError('')} />}

      <Card className="mb-6">
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
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
              <Input
                label="Filter rows"
                value={reportFilter}
                onChange={(e) => setReportFilter(e.target.value)}
                placeholder="Filter by customer or amount"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Select
                  label="Sort by"
                  options={REPORT_SORT_OPTIONS}
                  value={reportSortKey}
                  onChange={(e) => setReportSortKey(e.target.value)}
                />
              </div>
              <div>
                <Select
                  label="Sort direction"
                  options={[
                    { value: 'asc', label: 'Ascending' },
                    { value: 'desc', label: 'Descending' },
                  ]}
                  value={reportSortDirection}
                  onChange={(e) => setReportSortDirection(e.target.value as 'asc' | 'desc')}
                />
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <Button variant="primary" onClick={handleGenerateReport} loading={loading}>
              Generate Credit Report
            </Button>
            <Button variant="secondary" onClick={handleExport}>
              📥 Export as CSV
            </Button>
          </div>
        </div>
      </Card>

      <Card title="Credit Report" subtitle="Outstanding credit by customer">
        {filteredCreditReport.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold">Customer</th>
                  <th className="px-4 py-2 text-left font-semibold">Date</th>
                  <th className="px-4 py-2 text-right font-semibold">Outstanding Credit</th>
                  <th className="px-4 py-2 text-right font-semibold">Orders</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredCreditReport.map((group, idx) => (
                  <tr key={`${group.customerId}-${group.date}-${idx}`}>
                    <td className="px-4 py-2">{group.customerName}</td>
                    <td className="px-4 py-2">{group.date}</td>
                    <td className="px-4 py-2 text-right font-semibold">₹{group.totalCredit.toFixed(2)}</td>
                    <td className="px-4 py-2 text-right">{group.orders.length}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-4 text-right font-semibold">
              Total Credit: ₹{creditReport.reduce((sum, group) => sum + group.totalCredit, 0).toFixed(2)}
            </div>
          </div>
        ) : (
          <p className="text-gray-600">No credit data found for the selected period.</p>
        )}
      </Card>
    </Layout>
  );
};
