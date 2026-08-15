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
import { getStartOfDay, getEndOfDay, parseDateInput } from '@/utils/dateUtils';
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
  expensesByType: [
    { value: 'type', label: 'Type' },
    { value: 'totalAmount', label: 'Total Amount' },
    { value: 'count', label: 'Count' },
  ],
  customers: [
    { value: 'name', label: 'Customer Name' },
    { value: 'village', label: 'Village' },
    { value: 'firmName', label: 'Firm Name' },
    { value: 'phone', label: 'Phone' },
    { value: 'email', label: 'Email' },
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

const REPORT_FILTER_COLUMNS: Record<string, { value: string; label: string }[]> = {
  production: [
    { value: 'dateLabel', label: 'Date' },
    { value: 'productName', label: 'Product' },
    { value: 'remarks', label: 'Remarks' },
  ],
  usage: [
    { value: 'dateLabel', label: 'Date' },
    { value: 'materialName', label: 'Material' },
    { value: 'remarks', label: 'Remarks' },
  ],
  purchases: [
    { value: 'dateLabel', label: 'Date' },
    { value: 'materialName', label: 'Material' },
    { value: 'supplier', label: 'Supplier' },
  ],
  sales: [
    { value: 'dateLabel', label: 'Date' },
    { value: 'productNames', label: 'Product' },
    { value: 'customerName', label: 'Customer' },
    { value: 'paymentStatus', label: 'Payment Status' },
  ],
  credit: [
    { value: 'customerName', label: 'Customer' },
  ],
  expenses: [
    { value: 'dateLabel', label: 'Date' },
    { value: 'type', label: 'Type' },
    { value: 'subtype', label: 'Subtype' },
  ],
  expensesByType: [
    { value: 'type', label: 'Type' },
    { value: 'totalAmount', label: 'Total Amount' },
    { value: 'count', label: 'Count' },
  ],
  customers: [
    { value: 'name', label: 'Customer Name' },
    { value: 'village', label: 'Village' },
    { value: 'firmName', label: 'Firm Name' },
    { value: 'phone', label: 'Phone' },
  ],
  stock: [
    { value: 'name', label: 'Material Name' },
    { value: 'category', label: 'Category' },
    { value: 'status', label: 'Status' },
  ],
  lowstock: [
    { value: 'name', label: 'Material Name' },
    { value: 'category', label: 'Category' },
    { value: 'status', label: 'Status' },
  ],
  productAvailability: [
    { value: 'name', label: 'Product' },
    { value: 'status', label: 'Status' },
  ],
};

const MONTH_ABBREVIATIONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const formatDateLabel = (value: string | number | Date | null | undefined): string => {
  const date = value instanceof Date ? value : new Date(value ?? '');
  if (Number.isNaN(date.getTime())) return '';
  const day = String(date.getDate()).padStart(2, '0');
  const month = MONTH_ABBREVIATIONS[date.getMonth()] || '';
  return `${day}-${month}-${date.getFullYear()}`;
};

interface SearchableDropdownProps {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

const SearchableDropdown: React.FC<SearchableDropdownProps> = ({
  label,
  value,
  options,
  onChange,
  placeholder,
  disabled,
}) => {
  const [open, setOpen] = useState(false);
  const filteredOptions = useMemo(
    () => options.filter((option) => option.toLowerCase().includes(value.toLowerCase())),
    [options, value]
  );

  return (
    <div
      className="relative w-full"
      tabIndex={-1}
      onFocus={() => setOpen(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) {
          setOpen(false);
        }
      }}
    >
      <Input
        label={label}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        disabled={disabled}
      />
      {open && filteredOptions.length > 0 && (
        <div className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
          {filteredOptions.map((option) => (
            <button
              key={option}
              type="button"
              onMouseDown={(event) => {
                event.preventDefault();
                onChange(option);
                setOpen(false);
              }}
              className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 focus:bg-gray-100"
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
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
  const [expenseByTypeData, setExpenseByTypeData] = useState<
    { type: string; totalAmount: number; count: number }[]
  >([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [productAvailabilityData, setProductAvailabilityData] = useState<Product[]>([]);
  const [materials, setMaterials] = useState<RawMaterial[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [reportFilter, setReportFilter] = useState('');
  const [filterColumn, setFilterColumn] = useState<string>('');
  const [filterValue, setFilterValue] = useState<string>('');
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

  const sanitizeCsvValue = (value: any) => {
    const stringValue = value === undefined || value === null ? '' : String(value);
    return `"${stringValue.replace(/"/g, '""')}"`;
  };

  const downloadCsv = (rows: any[], headers: { label: string; key: string }[], filename: string) => {
    const csvRows = [headers.map((header) => sanitizeCsvValue(header.label)).join(',')];
    rows.forEach((row) => {
      csvRows.push(
        headers
          .map((header) => {
            const value = row[header.key];
            return sanitizeCsvValue(value);
          })
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

    if (filterColumn && filterValue.trim()) {
      const filterText = filterValue.trim().toLowerCase();
      result = result.filter((item) => String(item[filterColumn] ?? '').toLowerCase().includes(filterText));
    }

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
    const unsubscribe = salesService.subscribeToSalesChanges(() => {
      if (reportType === 'sales' || reportType === 'credit' || reportType === 'revenue') {
        generateReport(reportType);
      }
    });

    return unsubscribe;
  }, [reportType]);

  useEffect(() => {
    const sortOptions = REPORT_SORT_OPTIONS[reportType] || [];
    setReportSortKey(sortOptions[0]?.value || '');
    setReportSortDirection('asc');
    setReportFilter('');
    const filterOptions = REPORT_FILTER_COLUMNS[reportType] || [];
    setFilterColumn(filterOptions[0]?.value || '');
    setFilterValue('');
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
      const start = getStartOfDay(startDate);
      const end = getEndOfDay(endDate);

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
      } else if (type === 'expensesByType') {
        const data = await expenseService.getAll({ startDate: start, endDate: end });
        const grouped = new Map<string, { totalAmount: number; count: number }>();

        data.forEach((entry) => {
          const current = grouped.get(entry.type) || { totalAmount: 0, count: 0 };
          current.totalAmount += entry.value ?? 0;
          current.count += 1;
          grouped.set(entry.type, current);
        });

        setExpenseByTypeData(
          Array.from(grouped.entries()).map(([type, summary]) => ({
            type,
            totalAmount: summary.totalAmount,
            count: summary.count,
          }))
        );
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
    let rows: any[] = [];
    let headers: { label: string; key: string }[] = [];
    const fileName = `${reportType}-report-${new Date().toISOString().slice(0, 10)}.csv`;

    switch (reportType) {
      case 'production':
        rows = filteredProductionRows;
        headers = [
          { label: 'Date', key: 'dateLabel' },
          { label: 'Product', key: 'productName' },
          { label: 'Quantity', key: 'quantity' },
          { label: 'Remarks', key: 'remarks' },
        ];
        break;
      case 'usage':
        rows = filteredUsageRows;
        headers = [
          { label: 'Date', key: 'dateLabel' },
          { label: 'Material', key: 'materialName' },
          { label: 'Quantity', key: 'quantity' },
          { label: 'Unit', key: 'unit' },
          { label: 'Remarks', key: 'remarks' },
        ];
        break;
      case 'purchases':
        rows = filteredPurchaseRows;
        headers = [
          { label: 'Date', key: 'dateLabel' },
          { label: 'Material', key: 'materialName' },
          { label: 'Quantity', key: 'quantity' },
          { label: 'Unit', key: 'unit' },
          { label: 'Price', key: 'price' },
          { label: 'Supplier', key: 'supplier' },
          { label: 'Remarks', key: 'remarks' },
        ];
        break;
      case 'sales':
        rows = filteredSalesRows;
        headers = [
          { label: 'Date', key: 'dateLabel' },
          { label: 'Product', key: 'productName' },
          { label: 'Customer', key: 'customerName' },
          { label: 'Quantity', key: 'quantity' },
          { label: 'Price per Case', key: 'pricePerCase' },
          { label: 'Total Price', key: 'totalPrice' },
          { label: 'Paid Amount', key: 'paidAmount' },
          { label: 'Remaining Amount', key: 'remainingAmount' },
          { label: 'Status', key: 'paymentStatus' },
        ];
        break;
      case 'credit':
        rows = filteredCreditReport;
        headers = [
          { label: 'Customer', key: 'customerName' },
          { label: 'Outstanding Credit', key: 'totalCredit' },
          { label: 'Orders', key: 'orders' },
        ];
        rows = rows.map((row) => ({ ...row, orders: row.orders?.length ?? 0 }));
        break;
      case 'expensesByType':
        rows = filteredExpenseByTypeRows;
        headers = [
          { label: 'Type', key: 'typeLabel' },
          { label: 'Total Amount', key: 'totalAmount' },
          { label: 'Count', key: 'count' },
        ];
        break;
      case 'expenses':
        rows = filteredExpenseRows;
        headers = [
          { label: 'Date', key: 'date' },
          { label: 'Type', key: 'type' },
          { label: 'Subtype', key: 'subtype' },
          { label: 'Amount', key: 'value' },
          { label: 'Remarks', key: 'remarks' },
        ];
        break;
      case 'customers':
        rows = filteredCustomerRows;
        headers = [
          { label: 'Customer Name', key: 'name' },
          { label: 'Village', key: 'village' },
          { label: 'Firm Name', key: 'firmName' },
          { label: 'Phone', key: 'phone' },
          { label: 'Email', key: 'email' },
        ];
        break;
      case 'stock':
      case 'lowstock':
        rows = reportType === 'lowstock' ? filteredStockRows.filter((item) => item.currentStock < item.minimumStockLevel) : filteredStockRows;
        headers = [
          { label: 'Material Name', key: 'name' },
          { label: 'Category', key: 'category' },
          { label: 'Current Stock', key: 'currentStock' },
          { label: 'Minimum Stock Level', key: 'minimumStockLevel' },
          { label: 'Status', key: 'status' },
        ];
        break;
      case 'productAvailability':
        rows = filteredProductAvailabilityRows;
        headers = [
          { label: 'Product', key: 'name' },
          { label: 'Available Stock', key: 'currentStock' },
          { label: 'Status', key: 'status' },
        ];
        break;
      default:
        setError('Cannot export this report type. Please generate a report first.');
        return;
    }

    if (!rows.length) {
      setError('No data available to export. Generate a report first.');
      return;
    }

    downloadCsv(rows, headers, fileName);
  };

  const productionRows = useMemo(
    () =>
      productionData.map((entry) => ({
        ...entry,
        productName: products.find((p) => p.id === entry.productId)?.name || 'N/A',
        dateLabel: formatDateLabel(entry.date),
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
          dateLabel: formatDateLabel(entry.date),
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
          dateLabel: formatDateLabel(entry.date),
        };
      }),
    [purchaseData, materials]
  );

  const expenseRows = useMemo(
    () =>
      expenseData.map((entry) => ({
        ...entry,
        dateLabel: formatDateLabel(entry.date),
      })),
    [expenseData]
  );

  const salesRows = useMemo(() => {
    const grouped = new Map<
      string,
      {
        id: string;
        dateLabel: string;
        customerName: string;
        customerId: string;
        productNames: string;
        totalQuantity: number;
        totalPrice: number;
        paidAmount: number;
        remainingAmount: number;
        paymentStatus: 'pending' | 'done';
        remarks: string;
      }
    >();

    salesData.forEach((entry) => {
      const dateLabel = formatDateLabel(entry.date);
      const customerName = customers.find((c) => c.id === entry.customerId)?.name || 'N/A';
      const productName = products.find((p) => p.id === entry.productId)?.name || 'N/A';
      const key = `${entry.customerId}|${dateLabel}`;
      const existing = grouped.get(key);

      if (existing) {
        existing.productNames = existing.productNames.includes(productName)
          ? existing.productNames
          : `${existing.productNames}, ${productName}`;
        existing.totalQuantity += entry.quantity;
        existing.totalPrice += entry.totalPrice ?? 0;
        existing.paidAmount += entry.paidAmount ?? 0;
        existing.remainingAmount += entry.remainingAmount ?? 0;
        existing.paymentStatus = existing.paymentStatus === 'done' && entry.paymentStatus === 'done' ? 'done' : 'pending';
        if (entry.remarks) existing.remarks = existing.remarks ? `${existing.remarks}; ${entry.remarks}` : entry.remarks;
      } else {
        grouped.set(key, {
          id: key,
          dateLabel,
          customerName,
          customerId: entry.customerId,
          productNames: productName,
          totalQuantity: entry.quantity,
          totalPrice: entry.totalPrice ?? 0,
          paidAmount: entry.paidAmount ?? 0,
          remainingAmount: entry.remainingAmount ?? 0,
          paymentStatus: entry.paymentStatus,
          remarks: entry.remarks || '',
        });
      }
    });

    return Array.from(grouped.values());
  }, [salesData, products, customers]);

  const filteredProductionRows = useMemo(
    () => applyFilterAndSort(productionRows, ['dateLabel', 'productName', 'quantity', 'remarks']),
    [productionRows, reportFilter, filterColumn, filterValue, reportSortKey, reportSortDirection]
  );

  const filteredUsageRows = useMemo(
    () => applyFilterAndSort(usageRows, ['dateLabel', 'materialName', 'quantity', 'remarks']),
    [usageRows, reportFilter, filterColumn, filterValue, reportSortKey, reportSortDirection]
  );

  const filteredPurchaseRows = useMemo(
    () => applyFilterAndSort(purchaseRows, ['dateLabel', 'materialName', 'supplier', 'price']),
    [purchaseRows, reportFilter, filterColumn, filterValue, reportSortKey, reportSortDirection]
  );

  const filteredSalesRows = useMemo(
    () =>
      applyFilterAndSort(
        salesRows,
        ['dateLabel', 'productNames', 'customerName', 'paymentStatus', 'remarks']
      ),
    [salesRows, reportFilter, filterColumn, filterValue, reportSortKey, reportSortDirection]
  );

  const filteredCreditReport = useMemo(
    () => applyFilterAndSort(creditReport, ['customerName', 'totalCredit', 'orders']),
    [creditReport, reportFilter, filterColumn, filterValue, reportSortKey, reportSortDirection]
  );

  const filteredExpenseRows = useMemo(
    () => applyFilterAndSort(expenseRows, ['dateLabel', 'type', 'subtype', 'value', 'remarks']),
    [expenseRows, reportFilter, filterColumn, filterValue, reportSortKey, reportSortDirection]
  );

  const expenseByTypeRows = useMemo(
    () =>
      expenseByTypeData.map((entry) => ({
        ...entry,
        typeLabel: entry.type.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()),
      })),
    [expenseByTypeData]
  );

  const filteredExpenseByTypeRows = useMemo(
    () => applyFilterAndSort(expenseByTypeRows, ['typeLabel', 'totalAmount', 'count']),
    [expenseByTypeRows, reportFilter, filterColumn, filterValue, reportSortKey, reportSortDirection]
  );

  const customerRows = useMemo(
    () => customers.map((customer) => ({ ...customer })),
    [customers]
  );

  const filteredCustomerRows = useMemo(
    () => applyFilterAndSort(customerRows, ['name', 'village', 'firmName', 'phone', 'email']),
    [customerRows, reportFilter, filterColumn, filterValue, reportSortKey, reportSortDirection]
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
    [stockRows, reportFilter, filterColumn, filterValue, reportSortKey, reportSortDirection]
  );

  const productAvailabilityRows = useMemo(
    () =>
      productAvailabilityData.map((product) => ({
        ...product,
        currentStock: product.currentStock,
      })),
    [productAvailabilityData]
  );

  const currentReportRows = useMemo(() => {
    switch (reportType) {
      case 'production':
        return productionRows;
      case 'usage':
        return usageRows;
      case 'purchases':
        return purchaseRows;
      case 'sales':
        return salesRows;
      case 'credit':
        return creditReport;
      case 'expenses':
        return expenseRows;
      case 'customers':
        return customerRows;
      case 'expensesByType':
        return expenseByTypeRows;
      case 'stock':
      case 'lowstock':
        return stockRows;
      case 'productAvailability':
        return productAvailabilityRows;
      default:
        return [];
    }
  }, [reportType, productionRows, usageRows, purchaseRows, salesRows, creditReport, expenseRows, stockRows, productAvailabilityRows]);

  const distinctFilterValues = useMemo(() => {
    if (!filterColumn) return [];
    return Array.from(
      new Set(
        currentReportRows.map((item) => String(item[filterColumn] ?? '')).filter((value) => value !== '')
      )
    ).sort((a, b) => a.localeCompare(b));
  }, [currentReportRows, filterColumn]);

  const filteredProductAvailabilityRows = useMemo(
    () => applyFilterAndSort(productAvailabilityRows, ['name', 'currentStock', 'status']),
    [productAvailabilityRows, reportFilter, filterColumn, filterValue, reportSortKey, reportSortDirection]
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
                { value: 'expensesByType', label: 'Expenses by Type' },
                { value: 'customers', label: 'Customers List' },
                { value: 'revenue', label: 'Revenue Summary' },
                { value: 'stock', label: 'Stock Report' },
                { value: 'lowstock', label: 'Low Stock Alert' },
                { value: 'productAvailability', label: 'Product Availability' },
              ]}
              value={reportType}
              onChange={(e) => setReportType(e.target.value)}
            />

            {reportType !== 'stock' && reportType !== 'lowstock' && reportType !== 'productAvailability' && reportType !== 'customers' && (
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

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <Select
                label="Filter Column"
                options={REPORT_FILTER_COLUMNS[reportType] || []}
                value={filterColumn}
                onChange={(e) => setFilterColumn(e.target.value)}
                placeholder="Select column"
              />
            </div>
            <div>
              <SearchableDropdown
                label="Filter value"
                value={filterValue}
                onChange={setFilterValue}
                options={distinctFilterValues}
                placeholder={filterColumn ? 'Type or choose a value' : 'Select a filter column first'}
                disabled={!filterColumn}
              />
            </div>
            <div>
              <Input
                label="Search all"
                value={reportFilter}
                onChange={(e) => setReportFilter(e.target.value)}
                placeholder="Search across all columns"
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

      {reportType === 'customers' && (
        <Card title="Customers List">
          {filteredCustomerRows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold">Customer Name</th>
                    <th className="px-4 py-2 text-left font-semibold">Village</th>
                    <th className="px-4 py-2 text-left font-semibold">Firm Name</th>
                    <th className="px-4 py-2 text-left font-semibold">Phone</th>
                    <th className="px-4 py-2 text-left font-semibold">Email</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredCustomerRows.map((customer) => (
                    <tr key={customer.id}>
                      <td className="px-4 py-2 font-medium">{customer.name}</td>
                      <td className="px-4 py-2">{customer.village}</td>
                      <td className="px-4 py-2">{customer.firmName}</td>
                      <td className="px-4 py-2">{customer.phone}</td>
                      <td className="px-4 py-2">{customer.email || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-600">No customer data found.</p>
          )}
        </Card>
      )}

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
                    <th className="px-4 py-2 text-left font-semibold">Customer</th>
                    <th className="px-4 py-2 text-left font-semibold">Products</th>
                    <th className="px-4 py-2 text-right font-semibold">Total Qty</th>
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
                      <td className="px-4 py-2">{entry.customerName}</td>
                      <td className="px-4 py-2">{entry.productNames}</td>
                      <td className="px-4 py-2 text-right font-semibold">{entry.totalQuantity}</td>
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
                      <td className="px-4 py-2">{entry.dateLabel}</td>
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

      {reportType === 'expensesByType' && (
        <Card title="Expenses by Type Report" subtitle="Aggregated expense totals grouped by type">
          {filteredExpenseByTypeRows.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left font-semibold">Type</th>
                    <th className="px-4 py-2 text-right font-semibold">Total Amount</th>
                    <th className="px-4 py-2 text-right font-semibold">Count</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredExpenseByTypeRows.map((entry) => (
                    <tr key={entry.type}>
                      <td className="px-4 py-2">{entry.typeLabel}</td>
                      <td className="px-4 py-2 text-right">₹{entry.totalAmount.toFixed(2)}</td>
                      <td className="px-4 py-2 text-right">{entry.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-4 text-right font-semibold">
                Total Expenses: ₹{expenseByTypeRows.reduce((sum, entry) => sum + (entry.totalAmount ?? 0), 0).toFixed(2)}
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
