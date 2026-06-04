import React, { useState, useEffect, useMemo } from 'react';
import { Layout, Card, Button, Input, Select, Alert } from '@/components';
import { productionService } from '@/services/productionService';
import { materialUsageService } from '@/services/materialUsageService';
import { rawMaterialService } from '@/services/rawMaterialService';
import { productService } from '@/services/productService';
import { purchaseService } from '@/services/purchaseService';
import { salesService } from '@/services/salesService';
import { expenseService } from '@/services/expenseService';
import { customerService } from '@/services/customerService';
import {
  ProductionEntry,
  MaterialUsageEntry,
  PurchaseEntry,
  RawMaterial,
  Product,
  SaleEntry,
  ExpenseEntry,
  Customer,
} from '@/types';

const REPORT_SORT_OPTIONS: Record<string, { value: string; label: string }[]> = {
  production: [
    { value: 'date', label: 'Date' },
    { value: 'productName', label: 'Product' },
    { value: 'quantity', label: 'Quantity' },
  ],
  usage: [
    { value: 'date', label: 'Date' },
    { value: 'materialName', label: 'Material' },
    { value: 'quantity', label: 'Quantity' },
  ],
  purchases: [
    { value: 'date', label: 'Date' },
    { value: 'materialName', label: 'Material' },
    { value: 'quantity', label: 'Quantity' },
    { value: 'price', label: 'Price' },
  ],
  sales: [
    { value: 'date', label: 'Date' },
    { value: 'productName', label: 'Product' },
    { value: 'customerName', label: 'Customer' },
    { value: 'totalPrice', label: 'Total' },
    { value: 'paidAmount', label: 'Paid' },
    { value: 'remainingAmount', label: 'Remaining' },
    { value: 'paymentStatus', label: 'Status' },
  ],
  credit: [
    { value: 'customerName', label: 'Customer' },
    { value: 'totalCredit', label: 'Outstanding Credit' },
    { value: 'orders', label: 'Orders' },
  ],
  expenses: [
    { value: 'date', label: 'Date' },
    { value: 'type', label: 'Type' },
    { value: 'value', label: 'Amount' },
  ],
  stock: [
    { value: 'name', label: 'Material Name' },
    { value: 'category', label: 'Category' },
    { value: 'currentStock', label: 'Current Stock' },
    { value: 'minimumStockLevel', label: 'Min Level' },
  ],
  lowstock: [
    { value: 'name', label: 'Material Name' },
    { value: 'category', label: 'Category' },
    { value: 'currentStock', label: 'Current Stock' },
    { value: 'minimumStockLevel', label: 'Min Level' },
  ],
  productAvailability: [
    { value: 'name', label: 'Product' },
    { value: 'currentStock', label: 'Available Stock' },
    { value: 'status', label: 'Status' },
  ],
};

export const ReportsPage: React.FC = () => {
  const [reportType, setReportType] = useState<string>('production');
  const [startDate, setStartDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [productionData, setProductionData] = useState<ProductionEntry[]>([]);
  const [usageData, setUsageData] = useState<MaterialUsageEntry[]>([]);
  const [purchaseData, setPurchaseData] = useState<PurchaseEntry[]>([]);
  const [salesData, setSalesData] = useState<SaleEntry[]>([]);
  const [creditReport, setCreditReport] = useState<
    { customerId: string; customerName: string; totalCredit: number; orders: SaleEntry[] }[]
  >([]);
  const [expenseData, setExpenseData] = useState<ExpenseEntry[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productAvailabilityData, setProductAvailabilityData] = useState<Product[]>([]);
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [reportFilter, setReportFilter] = useState('');
  const [reportSortKey, setReportSortKey] = useState('date');
  const [reportSortDirection, setReportSortDirection] = useState<'asc' | 'desc'>('asc');
  const [revenueSummary, setRevenueSummary] = useState({ totalSales: 0, totalExpenses: 0, netRevenue: 0 });

  const compareValues = (a: any, b: any) => {
    if (a === b) return 0;
    if (a === undefined || a === null) return -1;
    if (b === undefined || b === null) return 1;
    if (Array.isArray(a) && Array.isArray(b)) return a.length - b.length;
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
        const sortResult = compareValues(valueA, valueB);
        return reportSortDirection === 'asc' ? sortResult : -sortResult;
      });
    }

    return result;
  };

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    const options = REPORT_SORT_OPTIONS[reportType] || [];
    setReportSortKey(options[0]?.value || '');
    setReportSortDirection('asc');
    setReportFilter('');
  }, [reportType]);

  const loadInitialData = async () => {
    try {
      const [prods, mats, custs] = await Promise.all([
        productService.getAll(true),
        rawMaterialService.getAll({ isActive: true }),
        customerService.getAll(),
      ]);
      setProducts(prods);
      setMaterials(mats);
      setCustomers(custs);
      generateReport('production');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    }
  };

  const generateReport = async (type: string) => {
    try {
      setLoading(true);
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      if (type === 'production') {
        const data = await productionService.getAll({ startDate: start, endDate: end });
        setProductionData(data);
      } else if (type === 'usage') {
        const data = await materialUsageService.getAll({ startDate: start, endDate: end });
        setUsageData(data);
      } else if (type === 'purchases') {
        const data = await purchaseService.getAll({ startDate: start, endDate: end });
        setPurchaseData(data);
      } else if (type === 'sales') {
        const data = await salesService.getAll({ startDate: start, endDate: end });
        setSalesData(data);
      } else if (type === 'credit') {
        const data = await salesService.getAll({ startDate: start, endDate: end });
        const pendingSales = data.filter((entry) => (entry.remainingAmount ?? 0) > 0);
        const grouped = new Map<string, { customerId: string; customerName: string; totalCredit: number; orders: SaleEntry[] }>();

        pendingSales.forEach((entry) => {
          const customer = customers.find((c) => c.id === entry.customerId);
          const customerName = customer?.name || 'Unknown';
          const group = grouped.get(entry.customerId) || {
            customerId: entry.customerId,
            customerName,
            totalCredit: 0,
            orders: [],
          };
          group.totalCredit += entry.remainingAmount ?? 0;
          group.orders.push(entry);
          grouped.set(entry.customerId, group);
        });

        setCreditReport(Array.from(grouped.values()).sort((a, b) => a.customerName.localeCompare(b.customerName)));
      } else if (type === 'expenses') {
        const data = await expenseService.getAll({ startDate: start, endDate: end });
        setExpenseData(data);
      } else if (type === 'revenue') {
        const [sales, expenses] = await Promise.all([
          salesService.getAll({ startDate: start, endDate: end }),
          expenseService.getAll({ startDate: start, endDate: end }),
        ]);
        setRevenueSummary({
          totalSales: sales.reduce((sum, item) => sum + (item.totalPrice ?? 0), 0),
          totalExpenses: expenses.reduce((sum, item) => sum + (item.value ?? 0), 0),
          netRevenue: sales.reduce((sum, item) => sum + (item.totalPrice ?? 0), 0) - expenses.reduce((sum, item) => sum + (item.value ?? 0), 0),
        });
      } else if (type === 'stock') {
        const data = await rawMaterialService.getAll({ isActive: true });
        // setLowStockData(data);
      } else if (type === 'productAvailability') {
        const data = await productService.getAll(false);
        const activeProducts = data.filter((product) => product.status === 'active');
        setProductAvailabilityData(activeProducts);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate report');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateReport = () => {
    generateReport(reportType);
  };

  const handleExport = () => {
    alert('Export functionality will be implemented soon!');
  };

  const productionRows = useMemo(
    () =>
      productionData.map((entry) => ({
        ...entry,
        productName: products.find((p) => p.id === entry.productId)?.name || 'N/A',
        dateLabel: new Date(entry.date).toLocaleDateString(),
      })),
    [productionData, products]
  );

  const usageRows = useMemo(
    () =>
      usageData.map((entry) => {
        const material = materials.find((m) => m.id === entry.rawMaterialId);
        return {
          ...entry,
          materialName: material?.name || 'N/A',
          unit: material?.unit || '-',
          dateLabel: new Date(entry.date).toLocaleDateString(),
        };
      }),
    [usageData, materials]
  );

  const purchaseRows = useMemo(
    () =>
      purchaseData.map((entry) => {
        const material = materials.find((m) => m.id === entry.rawMaterialId);
        return {
          ...entry,
          materialName: material?.name || 'N/A',
          unit: material?.unit || '-',
          dateLabel: new Date(entry.date).toLocaleDateString(),
        };
      }),
    [purchaseData, materials]
  );

  const salesRows = useMemo(
    () =>
      salesData.map((entry) => ({
        ...entry,
        productName: products.find((p) => p.id === entry.productId)?.name || 'N/A',
        customerName: customers.find((c) => c.id === entry.customerId)?.name || 'N/A',
        dateLabel: new Date(entry.date).toLocaleDateString(),
      })),
    [salesData, products, customers]
  );

  const filteredProductionRows = useMemo(
    () => applyFilterAndSort(productionRows, ['dateLabel', 'productName', 'quantity', 'remarks']),
    [productionRows, reportFilter, reportSortKey, reportSortDirection]
  );

  const filteredUsageRows = useMemo(
    () => applyFilterAndSort(usageRows, ['dateLabel', 'materialName', 'quantity', 'remarks']),
    [usageRows, reportFilter, reportSortKey, reportSortDirection]
  );

  const filteredPurchaseRows = useMemo(
    () => applyFilterAndSort(purchaseRows, ['dateLabel', 'materialName', 'supplier', 'price']),
    [purchaseRows, reportFilter, reportSortKey, reportSortDirection]
  );

  const filteredSalesRows = useMemo(
    () =>
      applyFilterAndSort(
        salesRows,
        ['dateLabel', 'productName', 'customerName', 'paymentStatus', 'remarks']
      ),
    [salesRows, reportFilter, reportSortKey, reportSortDirection]
  );

  const filteredCreditReport = useMemo(
    () => applyFilterAndSort(creditReport, ['customerName', 'totalCredit', 'orders']),
    [creditReport, reportFilter, reportSortKey, reportSortDirection]
  );

  const filteredExpenseRows = useMemo(
    () => applyFilterAndSort(expenseData, ['date', 'type', 'subtype', 'value', 'remarks']),
    [expenseData, reportFilter, reportSortKey, reportSortDirection]
  );

  const stockRows = useMemo(
    () =>
      materials.map((material) => ({
        ...material,
        status: material.currentStock < material.minimumStockLevel ? 'Low' : 'OK',
      })),
    [materials]
  );

  const filteredStockRows = useMemo(
    () => applyFilterAndSort(stockRows, ['name', 'category', 'currentStock', 'minimumStockLevel', 'status']),
    [stockRows, reportFilter, reportSortKey, reportSortDirection]
  );

  const productAvailabilityRows = useMemo(
    () =>
      productAvailabilityData.map((product) => ({
        ...product,
        currentStock: product.currentStock,
      })),
    [productAvailabilityData]
  );

  const filteredProductAvailabilityRows = useMemo(
    () => applyFilterAndSort(productAvailabilityRows, ['name', 'currentStock', 'status']),
    [productAvailabilityRows, reportFilter, reportSortKey, reportSortDirection]
  );

  return (
    <Layout title="Reports" subtitle="View and generate reports">
      {error && <Alert type="error" message={error} onClose={() => setError('')} />}

      {/* Report Filters */}
      <Card className="mb-6">
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Select
              label="Report Type"
              options={[
                { value: 'production', label: 'Daily Production' },
                { value: 'usage', label: 'Material Usage' },
                { value: 'purchases', label: 'Raw Material Purchases' },
                { value: 'sales', label: 'Sales' },
                { value: 'credit', label: 'Credit Report' },
                { value: 'expenses', label: 'Expenses' },
                { value: 'revenue', label: 'Revenue Summary' },
                { value: 'stock', label: 'Stock Report' },
                { value: 'lowstock', label: 'Low Stock Alert' },
                { value: 'productAvailability', label: 'Product Availability' },
              ]}
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
            />

            {reportType !== 'stock' && reportType !== 'lowstock' && reportType !== 'productAvailability' && (
              <>
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
              </>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Input
                label="Filter rows"
                value={reportFilter}
                onChange={(e) => setReportFilter(e.target.value)}
                placeholder="Filter by any value"
              />
            </div>
            <div>
              <Select
                label="Sort by"
                options={REPORT_SORT_OPTIONS[reportType] || []}
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

          <div className="flex gap-3">
            <Button variant="primary" onClick={handleGenerateReport} loading={loading}>
              Generate Report
            </Button>
            <Button variant="secondary" onClick={handleExport}>
              📥 Export as CSV
            </Button>
          </div>
        </div>
      </Card>

      {reportType === 'revenue' && (
        <Card title="Revenue Summary Report" className="mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div className="p-4 bg-green-50 rounded-lg">
              <p className="text-sm text-gray-500">Total Sales</p>
              <p className="text-3xl font-bold text-green-700">₹{revenueSummary.totalSales.toFixed(2)}</p>
            </div>
            <div className="p-4 bg-red-50 rounded-lg">
              <p className="text-sm text-gray-500">Total Expenses</p>
              <p className="text-3xl font-bold text-red-700">₹{revenueSummary.totalExpenses.toFixed(2)}</p>
            </div>
            <div className="p-4 bg-indigo-50 rounded-lg">
              <p className="text-sm text-gray-500">Net Revenue</p>
              <p className="text-3xl font-bold text-indigo-700">₹{revenueSummary.netRevenue.toFixed(2)}</p>
            </div>
          </div>
          <p className="text-sm text-gray-600">Net revenue is calculated as total sales minus expenses.</p>
        </Card>
      )}

      {/* Production Report */}
      {reportType === 'production' && (
        <Card title="Daily Production Report">
          {filteredProductionRows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold">Date</th>
                    <th className="px-4 py-2 text-left font-semibold">Product</th>
                    <th className="px-4 py-2 text-right font-semibold">Quantity</th>
                    <th className="px-4 py-2 text-left font-semibold">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredProductionRows.map((entry) => (
                    <tr key={entry.id}>
                      <td className="px-4 py-2">{entry.dateLabel}</td>
                      <td className="px-4 py-2">{entry.productName}</td>
                      <td className="px-4 py-2 text-right font-semibold">{entry.quantity}</td>
                      <td className="px-4 py-2 text-gray-600">{entry.remarks || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-4 text-right font-semibold">
                Total: {filteredProductionRows.reduce((sum, entry) => sum + entry.quantity, 0)} units
              </div>
            </div>
          ) : (
            <p className="text-gray-600">No production data found for the selected period.</p>
          )}
        </Card>
      )}

      {/* Usage Report */}
      {reportType === 'productAvailability' && (
        <Card title="Product Availability Report">
          {filteredProductAvailabilityRows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold">Product</th>
                    <th className="px-4 py-2 text-right font-semibold">Available Stock</th>
                    <th className="px-4 py-2 text-left font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y bg-white">
                  {filteredProductAvailabilityRows.map((product) => (
                    <tr key={product.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2">{product.name}</td>
                      <td className="px-4 py-2 text-right font-semibold">{product.currentStock}</td>
                      <td className="px-4 py-2 capitalize">{product.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-600">No product availability data found.</p>
          )}
        </Card>
      )}

      {reportType === 'usage' && (
        <Card title="Raw Material Usage Report">
          {filteredUsageRows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold">Date</th>
                    <th className="px-4 py-2 text-left font-semibold">Material</th>
                    <th className="px-4 py-2 text-right font-semibold">Quantity</th>
                    <th className="px-4 py-2 text-left font-semibold">Unit</th>
                    <th className="px-4 py-2 text-left font-semibold">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredUsageRows.map((entry) => (
                    <tr key={entry.id}>
                      <td className="px-4 py-2">{entry.dateLabel}</td>
                      <td className="px-4 py-2">{entry.materialName}</td>
                      <td className="px-4 py-2 text-right font-semibold">{entry.quantity}</td>
                      <td className="px-4 py-2">{entry.unit || '-'}</td>
                      <td className="px-4 py-2 text-gray-600">{entry.remarks || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-600">No usage data found for the selected period.</p>
          )}
        </Card>
      )}

      {reportType === 'sales' && (
        <Card title="Sales Report">
          {filteredSalesRows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold">Date</th>
                    <th className="px-4 py-2 text-left font-semibold">Product</th>
                    <th className="px-4 py-2 text-left font-semibold">Customer</th>
                    <th className="px-4 py-2 text-right font-semibold">Qty</th>
                    <th className="px-4 py-2 text-right font-semibold">Price / Case</th>
                    <th className="px-4 py-2 text-right font-semibold">Total</th>
                    <th className="px-4 py-2 text-right font-semibold">Paid</th>
                    <th className="px-4 py-2 text-right font-semibold">Remaining</th>
                    <th className="px-4 py-2 text-left font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredSalesRows.map((entry) => (
                    <tr key={entry.id}>
                      <td className="px-4 py-2">{entry.dateLabel}</td>
                      <td className="px-4 py-2">{entry.productName}</td>
                      <td className="px-4 py-2">{entry.customerName}</td>
                      <td className="px-4 py-2 text-right font-semibold">{entry.quantity}</td>
                      <td className="px-4 py-2 text-right">₹{entry.pricePerCase.toFixed(2)}</td>
                      <td className="px-4 py-2 text-right">₹{entry.totalPrice.toFixed(2)}</td>
                      <td className="px-4 py-2 text-right">₹{entry.paidAmount.toFixed(2)}</td>
                      <td className="px-4 py-2 text-right">₹{entry.remainingAmount.toFixed(2)}</td>
                      <td className="px-4 py-2">{entry.paymentStatus}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-4 text-right font-semibold">
                Total Sales: ₹{filteredSalesRows.reduce((sum, entry) => sum + (entry.totalPrice ?? 0), 0).toFixed(2)}
              </div>
            </div>
          ) : (
            <p className="text-gray-600">No sales data found for the selected period.</p>
          )}
        </Card>
      )}

      {reportType === 'credit' && (
        <Card title="Credit Report" subtitle="Outstanding balance sorted by customer">
          {filteredCreditReport.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold">Customer</th>
                    <th className="px-4 py-2 text-right font-semibold">Outstanding Credit</th>
                    <th className="px-4 py-2 text-right font-semibold">Orders</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredCreditReport.map((group) => (
                    <tr key={group.customerId}>
                      <td className="px-4 py-2">{group.customerName}</td>
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
      )}

      {reportType === 'expenses' && (
        <Card title="Expenses Report">
          {filteredExpenseRows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold">Date</th>
                    <th className="px-4 py-2 text-left font-semibold">Type</th>
                    <th className="px-4 py-2 text-left font-semibold">Subtype</th>
                    <th className="px-4 py-2 text-right font-semibold">Amount</th>
                    <th className="px-4 py-2 text-left font-semibold">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredExpenseRows.map((entry) => (
                    <tr key={entry.id}>
                      <td className="px-4 py-2">{new Date(entry.date).toLocaleDateString()}</td>
                      <td className="px-4 py-2 capitalize">{entry.type.replace('_', ' ')}</td>
                      <td className="px-4 py-2">{entry.subtype || '-'}</td>
                      <td className="px-4 py-2 text-right">₹{entry.value.toFixed(2)}</td>
                      <td className="px-4 py-2 text-gray-600">{entry.remarks || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-4 text-right font-semibold">
                Total Expenses: ₹{expenseData.reduce((sum, entry) => sum + (entry.value ?? 0), 0).toFixed(2)}
              </div>
            </div>
          ) : (
            <p className="text-gray-600">No expense data found for the selected period.</p>
          )}
        </Card>
      )}

      {reportType === 'purchases' && (
        <Card title="Raw Material Purchase Report">
          {filteredPurchaseRows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold">Date</th>
                    <th className="px-4 py-2 text-left font-semibold">Material</th>
                    <th className="px-4 py-2 text-right font-semibold">Quantity</th>
                    <th className="px-4 py-2 text-left font-semibold">Unit</th>
                    <th className="px-4 py-2 text-right font-semibold">Price</th>
                    <th className="px-4 py-2 text-left font-semibold">Supplier</th>
                    <th className="px-4 py-2 text-left font-semibold">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredPurchaseRows.map((entry) => (
                    <tr key={entry.id}>
                      <td className="px-4 py-2">{entry.dateLabel}</td>
                      <td className="px-4 py-2">{entry.materialName}</td>
                      <td className="px-4 py-2 text-right font-semibold">{entry.quantity}</td>
                      <td className="px-4 py-2">{entry.unit || '-'}</td>
                      <td className="px-4 py-2 text-right">{entry.price?.toFixed(2) || '0.00'}</td>
                      <td className="px-4 py-2">{entry.supplier || '-'}</td>
                      <td className="px-4 py-2 text-gray-600">{entry.remarks || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-600">No purchase data found for the selected period.</p>
          )}
        </Card>
      )}

      {/* Stock Report */}
      {(reportType === 'stock' || reportType === 'lowstock') && (
        <Card title="Current Stock Report">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold">Material Name</th>
                  <th className="px-4 py-2 text-left font-semibold">Category</th>
                  <th className="px-4 py-2 text-right font-semibold">Current Stock</th>
                  <th className="px-4 py-2 text-right font-semibold">Min Level</th>
                  <th className="px-4 py-2 text-left font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredStockRows
                  .filter((m) => reportType === 'stock' || m.currentStock < m.minimumStockLevel)
                  .map((material) => (
                    <tr key={material.id}>
                      <td className="px-4 py-2">{material.name}</td>
                      <td className="px-4 py-2">{material.category}</td>
                      <td className="px-4 py-2 text-right font-semibold">
                        {material.currentStock} {material.unit}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {material.minimumStockLevel} {material.unit}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            material.currentStock < material.minimumStockLevel
                              ? 'bg-red-100 text-red-800'
                              : 'bg-green-100 text-green-800'
                          }`}
                        >
                          {material.currentStock < material.minimumStockLevel ? '🔴 Low' : '🟢 OK'}
                        </span>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </Layout>
  );
};
