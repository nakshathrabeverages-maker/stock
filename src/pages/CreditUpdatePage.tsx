import React, { useEffect, useMemo, useState } from 'react';
import { Layout, Card, Button, Input, Select, Alert, Modal } from '@/components';
import { customerService } from '@/services/customerService';
import { productService } from '@/services/productService';
import { salesService } from '@/services/salesService';
import { importService } from '@/services/importService';
import { Customer, Product, SaleEntry } from '@/types';
import { parseDateInput } from '@/utils/dateUtils';

const normalizeValue = (value: string | undefined | null) =>
  (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

const asNumber = (value: string | number | undefined | null): number | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;

  const cleaned = String(value)
    .trim()
    .replace(/₹/g, '')
    .replace(/,/g, '')
    .replace(/\s+/g, '');

  if (!cleaned) return undefined;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : undefined;
};

const parseCsvLine = (line: string) => {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  values.push(current.trim());
  return values;
};

const parseCreditUpdateCsv = (text: string) => {
  if (!text || !text.trim()) return [];

  const rows = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (rows.length < 2) return [];

  const headers = parseCsvLine(rows[0]).map((header) =>
    header
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
  );

  const normalizedHeaders = new Map<string, string>();
  headers.forEach((header, index) => {
    const aliasMap: Record<string, string> = {
      customer: 'customerName',
      cust: 'customerName',
      customername: 'customerName',
      date: 'date',
      credit: 'creditAmount',
      creditamount: 'creditAmount',
      received: 'receivedAmount',
      recived: 'receivedAmount',
      receivedamount: 'receivedAmount',
      balance: 'balanceAmount',
      balanceamount: 'balanceAmount',
      product: 'productName',
      productname: 'productName',
      qty: 'quantity',
      quantity: 'quantity',
      total: 'totalAmount',
      totalamount: 'totalAmount',
      paid: 'paidAmount',
      paidamount: 'paidAmount',
      remaining: 'remainingAmount',
      remainingamount: 'remainingAmount',
    };

    normalizedHeaders.set(header, aliasMap[header] ?? header);
  });

  const parsedRows: any[] = [];

  for (let i = 1; i < rows.length; i += 1) {
    const values = parseCsvLine(rows[i]);
    if (values.every((value) => !value.trim())) continue;

    const row: Record<string, any> = {};
    for (let j = 0; j < headers.length; j += 1) {
      const key = normalizedHeaders.get(headers[j]) ?? headers[j];
      row[key] = values[j] ?? '';
    }

    const valueMap = Object.entries(row).reduce((acc, [key, value]) => {
      acc[key] = value;
      return acc;
    }, {} as Record<string, any>);

    const customerName = String(valueMap.customerName ?? valueMap.cust ?? '').trim();
    const date = String(valueMap.date ?? '').trim();
    const creditAmount = asNumber(valueMap.creditAmount ?? valueMap.credit ?? valueMap.creditamount);
    const receivedAmount = asNumber(valueMap.receivedAmount ?? valueMap.recived ?? valueMap.received ?? valueMap.receivedamount);
    const balanceAmount = asNumber(valueMap.balanceAmount ?? valueMap.balance ?? valueMap.balanceamount);
    const productName = String(valueMap.productName ?? valueMap.product ?? '').trim();
    const totalAmount = asNumber(valueMap.totalAmount ?? valueMap.total ?? valueMap.totalamount);
    const quantity = asNumber(valueMap.quantity ?? valueMap.qty);
    const paidAmount = asNumber(valueMap.paidAmount ?? valueMap.paid ?? valueMap.paidamount);
    const remainingAmount = asNumber(valueMap.remainingAmount ?? valueMap.remaining ?? valueMap.remainingamount);

    parsedRows.push({
      customerName,
      date,
      creditAmount,
      receivedAmount,
      balanceAmount,
      productName,
      totalAmount,
      quantity,
      paidAmount,
      remainingAmount,
    });
  }

  return parsedRows;
};

export const CreditUpdatePage: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [startDate, setStartDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [creditRecords, setCreditRecords] = useState<SaleEntry[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [updateAmount, setUpdateAmount] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [importCsvText, setImportCsvText] = useState('');
  const [importFileName, setImportFileName] = useState('');
  const [parsedPreviewRows, setParsedPreviewRows] = useState<any[] | null>(null);
  const [parsePreviewError, setParsePreviewError] = useState('');
  const [isImportIssueModalOpen, setIsImportIssueModalOpen] = useState(false);
  const [importIssues, setImportIssues] = useState<Array<{ rowNumber: number; message: string; customerName: string }>>([]);
  const [pendingValidRows, setPendingValidRows] = useState<any[]>([]);

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        const [custs, prods] = await Promise.all([customerService.getAll(), productService.getAll(false)]);
        setCustomers(custs);
        setProducts(prods);
        if (custs.length > 0) {
          setSelectedCustomerId(custs[0].id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load initial data');
      }
    };

    loadInitialData();
  }, []);

  const fetchRecords = async () => {
    if (!selectedCustomerId) {
      setCreditRecords([]);
      return;
    }

    try {
      setLoading(true);
      setError('');
      setSuccess('');
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      const sales = await salesService.getAll({ startDate: start, endDate: end });
      const filtered = sales
        .filter((entry) => entry.customerId === selectedCustomerId && (entry.remainingAmount ?? 0) > 0)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      setCreditRecords(filtered);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load credit records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedCustomerId) {
      fetchRecords();
    }
  }, [selectedCustomerId, startDate, endDate]);

  useEffect(() => {
    if (!importCsvText.trim()) {
      setParsedPreviewRows(null);
      setParsePreviewError('');
      return;
    }

    try {
      const parsed = parseCreditUpdateCsv(importCsvText);
      setParsedPreviewRows(parsed);
      setParsePreviewError('');
    } catch (e) {
      setParsedPreviewRows(null);
      setParsePreviewError(e instanceof Error ? e.message : 'Invalid CSV');
    }
  }, [importCsvText]);

  const totalOutstanding = useMemo(
    () => creditRecords.reduce((sum, record) => sum + (record.remainingAmount ?? 0), 0),
    [creditRecords]
  );

  const handleAdjustCredit = async () => {
    if (!selectedCustomerId) {
      setError('Please select a customer first.');
      return;
    }

    const parsedAmount = Number(updateAmount);
    if (!Number.isFinite(parsedAmount)) {
      setError('Please enter a valid adjustment amount.');
      return;
    }

    try {
      setLoading(true);
      setError('');
      setSuccess('');

      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);

      const sales = await salesService.getAll({ startDate: start, endDate: end });
      const matchingSales = sales.filter((entry) => entry.customerId === selectedCustomerId && (entry.remainingAmount ?? 0) > 0);

      if (!matchingSales.length) {
        setError('No outstanding credit sales were found for this customer in the selected period.');
        return;
      }

      const updates: Array<{ id: string; data: Partial<SaleEntry> }> = matchingSales
        .slice()
        .sort((a, b) => (a.remainingAmount ?? 0) - (b.remainingAmount ?? 0))
        .map((sale) => {
          const currentRemaining = sale.remainingAmount ?? 0;
          const total = sale.totalPrice ?? sale.quantity * sale.pricePerCase;
          const delta = Math.min(Math.abs(parsedAmount), currentRemaining);
          const newPaid = parsedAmount >= 0 ? (sale.paidAmount ?? 0) + delta : (sale.paidAmount ?? 0) - delta;
          const safePaid = Math.min(Math.max(newPaid, 0), total);
          const safeRemaining = Math.max(total - safePaid, 0);
          const paymentStatus: 'pending' | 'done' = safeRemaining <= 0 ? 'done' : 'pending';

          return {
            id: sale.id,
            data: {
              paidAmount: safePaid,
              remainingAmount: safeRemaining,
              paymentStatus,
            },
          };
        });

      await salesService.batchUpdateSales(updates);
      await fetchRecords();
      setSuccess(`Adjusted ${matchesPlurals(matchingSales.length, 'record')} by ₹${Math.abs(parsedAmount).toFixed(2)}.`);
      setUpdateAmount('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply adjustment');
    } finally {
      setLoading(false);
    }
  };

  const handleCsvFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      setImportFileName(file.name);
      setImportCsvText(text);
    } catch {
      setError('Failed to read the selected CSV file.');
    }
  };

  const validateCsvRowsForImport = async (rows: any[]) => {
    const validRows: any[] = [];
    const issues: Array<{ rowNumber: number; message: string; customerName: string }> = [];

    for (const [index, row] of rows.entries()) {
      const rowNumber = index + 2;
      const customer = customers.find(
        (entry) =>
          normalizeValue(entry.name) === normalizeValue(row.customerName) ||
          normalizeValue(entry.firmName) === normalizeValue(row.customerName)
      );

      if (!customer) {
        issues.push({
          rowNumber,
          customerName: row.customerName || 'Unknown customer',
          message: `customer '${row.customerName || ''}' not found.`,
        });
        continue;
      }

      const rowDate = row.date ? parseDateInput(row.date) : null;
      if (!rowDate || Number.isNaN(rowDate.getTime())) {
        issues.push({
          rowNumber,
          customerName: customer.name,
          message: `invalid date '${row.date || ''}'.`,
        });
        continue;
      }

      const startOfDay = new Date(rowDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(rowDate);
      endOfDay.setHours(23, 59, 59, 999);

      const salesForDay = await salesService.getAll({ startDate: startOfDay, endDate: endOfDay });
      const customerSales = salesForDay.filter((sale) => sale.customerId === customer.id);

      if (!customerSales.length) {
        issues.push({
          rowNumber,
          customerName: customer.name,
          message: `no sale records found for ${customer.name} on ${row.date}.`,
        });
        continue;
      }

      const credit = asNumber(row.creditAmount);
      const received = asNumber(row.receivedAmount);
      const balance = asNumber(row.balanceAmount);
      const daySalesTotal = customerSales.reduce((sum, sale) => sum + (sale.totalPrice ?? sale.quantity * sale.pricePerCase), 0);

      if (!Number.isFinite(credit) || credit! < 0) {
        issues.push({ rowNumber, customerName: customer.name, message: 'CSV credit amount is invalid.' });
        continue;
      }

      if (Math.abs(credit! - daySalesTotal) > 0.5) {
        issues.push({
          rowNumber,
          customerName: customer.name,
          message: `CSV credit amount ₹${credit!.toFixed(2)} does not match the total sales amount ₹${daySalesTotal.toFixed(2)} for this customer/date.`,
        });
        continue;
      }

      if (!Number.isFinite(received) || received! < 0) {
        issues.push({ rowNumber, customerName: customer.name, message: 'CSV received amount is invalid.' });
        continue;
      }

      if (received! > credit! + 0.01) {
        issues.push({
          rowNumber,
          customerName: customer.name,
          message: `received amount ₹${received!.toFixed(2)} cannot be greater than credit amount ₹${credit!.toFixed(2)}.`,
        });
        continue;
      }

      if (Number.isFinite(balance) && Math.abs((credit! - received!) - balance!) > 0.5) {
        issues.push({
          rowNumber,
          customerName: customer.name,
          message: `CSV balance ₹${(balance ?? 0).toFixed(2)} does not match credit minus received ₹${(credit! - received!).toFixed(2)}.`,
        });
        continue;
      }

      validRows.push({ ...row, customer, customerId: customer.id, rowDate, rowNumber, customerSales, credit, received, balance });
    }

    return { validRows, issues };
  };

  const applyValidatedRows = async (rows: any[]) => {
    const updates: Array<{ id: string; data: Partial<SaleEntry> }> = [];
    const importRecords: Array<{ key: string; payload: any }> = [];

    for (const row of rows) {
      const { customer, rowDate, customerSales, credit, received, balance } = row;
      const amountToApply = received!;

      if (amountToApply <= 0) {
        for (const sale of customerSales) {
          const total = sale.totalPrice ?? sale.quantity * sale.pricePerCase;
          updates.push({
            id: sale.id,
            data: {
              paidAmount: 0,
              remainingAmount: total,
              paymentStatus: 'pending',
            } as Partial<SaleEntry>,
          });
        }
      } else {
        let remainingToApply = amountToApply;
        const sortedSales = customerSales
          .slice()
          .sort((a, b) => (a.totalPrice ?? a.quantity * a.pricePerCase) - (b.totalPrice ?? b.quantity * b.pricePerCase));

        for (const sale of sortedSales) {
          if (remainingToApply <= 0) {
            const total = sale.totalPrice ?? sale.quantity * sale.pricePerCase;
            updates.push({
              id: sale.id,
              data: {
                paidAmount: 0,
                remainingAmount: total,
                paymentStatus: 'pending',
              } as Partial<SaleEntry>,
            });
            continue;
          }

          const total = sale.totalPrice ?? sale.quantity * sale.pricePerCase;
          const allocated = Math.min(remainingToApply, total);
          const updatedPaid = allocated;
          const updatedRemaining = Math.max(total - updatedPaid, 0);

          updates.push({
            id: sale.id,
            data: {
              paidAmount: updatedPaid,
              remainingAmount: updatedRemaining,
              paymentStatus: updatedRemaining <= 0 ? 'done' : 'pending',
            } as Partial<SaleEntry>,
          });

          remainingToApply -= allocated;
        }

        const totalAllocated = updates
          .filter((up) => customerSales.some((sale) => sale.id === up.id))
          .reduce((sum, up) => sum + ((up.data.paidAmount ?? 0) as number), 0);

        if (Math.abs(totalAllocated - amountToApply) > 0.5) {
          throw new Error(`Row ${row.rowNumber}: received amount ₹${amountToApply.toFixed(2)} could not be fully allocated across the matching sales.`);
        }
      }

      const importKey = `${customer.id}_${rowDate.toISOString().slice(0, 10)}_${amountToApply.toFixed(2)}_${(balance ?? (credit! - received!)).toFixed(2)}`;
      const exists = await importService.exists(importKey);
      if (exists) {
        throw new Error(`Row ${row.rowNumber}: this payment import already exists.`);
      }

      importRecords.push({
        key: importKey,
        payload: {
          customerId: customer.id,
          customerName: customer.name,
          date: rowDate.toISOString(),
          receivedAmount: received ?? 0,
          balanceAmount: balance ?? 0,
          creditAmount: credit ?? 0,
        },
      });
    }

    if (updates.length > 0) {
      await salesService.batchUpdateSales(updates);
    }

    for (const record of importRecords) {
      await importService.create(record.key, record.payload);
    }

    return updates.length;
  };

  const handleApplyCsvUpdates = async () => {
    if (!importCsvText.trim()) {
      setError('Please upload or paste a CSV file first.');
      return;
    }

    try {
      const parsedRows = parseCreditUpdateCsv(importCsvText);
      if (!parsedRows.length) {
        setError('No valid rows were found in the CSV.');
        return;
      }

      setLoading(true);
      setError('');
      setSuccess('');

      const { validRows, issues } = await validateCsvRowsForImport(parsedRows);

      if (issues.length > 0) {
        setImportIssues(issues);
        setPendingValidRows(validRows);
        setIsImportIssueModalOpen(true);
        setLoading(false);
        return;
      }

      const appliedCount = await applyValidatedRows(validRows);
      await fetchRecords();
      setSuccess(`Applied ${appliedCount} sale updates from the CSV.`);
      setImportCsvText('');
      setImportFileName('');
      setParsedPreviewRows(null);
      setParsePreviewError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply CSV credit updates');
    } finally {
      setLoading(false);
    }
  };

  const handleContinueAfterIssues = async () => {
    if (pendingValidRows.length === 0) {
      setImportIssues([]);
      setPendingValidRows([]);
      setIsImportIssueModalOpen(false);
      setError('No valid rows are available to continue. Please correct the CSV and try again.');
      return;
    }

    try {
      setLoading(true);
      setIsImportIssueModalOpen(false);
      const appliedCount = await applyValidatedRows(pendingValidRows);
      await fetchRecords();
      setSuccess(`Skipped the invalid rows and applied ${appliedCount} valid record updates.`);
      setImportCsvText('');
      setImportFileName('');
      setParsedPreviewRows(null);
      setParsePreviewError('');
      setImportIssues([]);
      setPendingValidRows([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply the valid CSV rows after skipping invalid entries.');
    } finally {
      setLoading(false);
    }
  };

  const matchesPlurals = (count: number, singular: string) => `${count} ${count === 1 ? singular : `${singular}s`}`;

  return (
    <Layout title="Credit Update" subtitle="Adjust outstanding credit records by customer and date range">
      {error && <Alert type="error" message={error} onClose={() => setError('')} />}
      {success && <Alert type="success" message={success} onClose={() => setSuccess('')} />}

      <Card className="mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Select
            label="Customer"
            options={customers.map((customer) => ({ value: customer.id, label: customer.name }))}
            value={selectedCustomerId}
            onChange={(e) => setSelectedCustomerId(e.target.value)}
            placeholder="Select customer"
          />

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

          <div className="space-y-3">
            <div>
              <Input
                label="Adjustment Amount"
                type="number"
                step="0.01"
                value={updateAmount}
                onChange={(e) => setUpdateAmount(e.target.value)}
                placeholder="Enter amount"
              />
            </div>
            <p className="text-sm text-gray-600">Use a positive value to reduce balance, or a negative value to increase outstanding balance.</p>
            <Button variant="primary" onClick={handleAdjustCredit} loading={loading}>
              Apply Adjustment
            </Button>
          </div>
        </div>
      </Card>

      <Modal
        isOpen={isImportIssueModalOpen}
        onClose={() => {
          setIsImportIssueModalOpen(false);
          setImportIssues([]);
          setPendingValidRows([]);
        }}
        title="CSV validation issues"
        size="lg"
        footer={
          <div className="flex flex-col sm:flex-row gap-3 justify-end">
            <Button variant="secondary" onClick={() => {
              setIsImportIssueModalOpen(false);
              setImportIssues([]);
              setPendingValidRows([]);
            }}>
              Cancel
            </Button>
            <Button variant="secondary" onClick={() => {
              setIsImportIssueModalOpen(false);
            }}>
              Correct CSV
            </Button>
            <Button variant="primary" onClick={handleContinueAfterIssues} loading={loading}>
              Skip invalid rows & continue
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-gray-700">
            Some rows in the uploaded CSV do not match the expected customer/date totals. You can skip those records and continue with the valid rows, correct the CSV and try again, or cancel the import.
          </p>

          <div className="max-h-72 overflow-y-auto rounded border border-gray-200 bg-gray-50 p-3">
            {importIssues.length > 0 ? (
              <ul className="space-y-2 text-sm text-gray-700">
                {importIssues.map((issue) => (
                  <li key={`${issue.rowNumber}-${issue.customerName}`} className="rounded border border-red-200 bg-white p-2">
                    <span className="font-medium text-red-700">Row {issue.rowNumber}</span> - {issue.customerName}: {issue.message}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-600">No import issues detected.</p>
            )}
          </div>
        </div>
      </Modal>

      <Card className="mb-6">
        <div className="grid grid-cols-1 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Upload CSV for batch credit updates</label>
            <input
              type="file"
              accept=".csv,text/csv"
              className="w-full rounded border border-gray-300 bg-white px-3 py-2"
              onChange={handleCsvFileUpload}
            />
            {importFileName ? (
              <p className="mt-2 text-sm text-gray-600">Selected file: {importFileName}</p>
            ) : (
              <div className="space-y-1">
                <p className="mt-2 text-sm text-gray-600">CSV should accept: <span className="font-medium">cust,date,credit amount,recived amount,balance amount</span></p>
                <p className="text-sm text-gray-600">Example header: <span className="font-medium">cust,date,credit amount,recived amount,balance amount</span></p>
                <p className="text-sm text-gray-600">Notes: provide either <span className="font-medium">balance</span> or both <span className="font-medium">credit</span> and <span className="font-medium">recived/received</span>.</p>
                <p className="text-sm text-gray-600">Example row: <span className="font-medium">Ravi Kumar,2026-08-01,1500,0,1500</span></p>
              </div>
            )}
          </div>

          <div className="mt-3">
            <label className="block text-sm font-medium text-gray-700 mb-2">Or paste CSV content</label>
            <textarea
              rows={6}
              className="w-full rounded border border-gray-300 bg-white px-3 py-2"
              placeholder={`cust,date,credit amount,recived amount,balance amount\nRavi Kumar,2026-08-01,1500,0,1500`}
              value={importCsvText}
              onChange={(e) => setImportCsvText(e.target.value)}
            />
          </div>

          {parsePreviewError ? (
            <p className="mt-2 text-sm text-red-600">Preview parse error: {parsePreviewError}</p>
          ) : parsedPreviewRows && parsedPreviewRows.length > 0 ? (
            <div className="mt-4">
              <p className="text-sm font-medium">Preview ({parsedPreviewRows.length} rows)</p>
              <div className="overflow-x-auto mt-2">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-3 py-2 text-left">Customer</th>
                      <th className="px-3 py-2 text-left">Date</th>
                      <th className="px-3 py-2 text-right">Credit</th>
                      <th className="px-3 py-2 text-right">Recived</th>
                      <th className="px-3 py-2 text-right">Balance</th>
                      <th className="px-3 py-2 text-left">Product</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {parsedPreviewRows.map((row, index) => (
                      <tr key={`${row.customerName}-${row.date}-${index}`}>
                        <td className="px-3 py-2">{row.customerName || ''}</td>
                        <td className="px-3 py-2">{row.date || ''}</td>
                        <td className="px-3 py-2 text-right">{Number.isFinite(row.creditAmount) ? row.creditAmount : ''}</td>
                        <td className="px-3 py-2 text-right">{Number.isFinite(row.receivedAmount) ? row.receivedAmount : ''}</td>
                        <td className="px-3 py-2 text-right">{Number.isFinite(row.balanceAmount) ? row.balanceAmount : ''}</td>
                        <td className="px-3 py-2">{row.productName || ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <div className="flex items-end justify-end mt-3">
            <Button variant="secondary" onClick={handleApplyCsvUpdates} loading={loading} disabled={!parsedPreviewRows || parsedPreviewRows.length === 0}>
              Apply CSV Updates
            </Button>
          </div>
        </div>
      </Card>

      <Card title="Credit Records" subtitle={`Total outstanding: ₹${totalOutstanding.toFixed(2)}`}>
        {creditRecords.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold">Date</th>
                  <th className="px-4 py-2 text-left font-semibold">Product</th>
                  <th className="px-4 py-2 text-right font-semibold">Qty</th>
                  <th className="px-4 py-2 text-right font-semibold">Total</th>
                  <th className="px-4 py-2 text-right font-semibold">Paid</th>
                  <th className="px-4 py-2 text-right font-semibold">Remaining</th>
                  <th className="px-4 py-2 text-left font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {creditRecords.map((record) => (
                  <tr key={record.id}>
                    <td className="px-4 py-2">{new Date(record.date).toLocaleDateString()}</td>
                    <td className="px-4 py-2">{products.find((product) => product.id === record.productId)?.name || record.productId}</td>
                    <td className="px-4 py-2 text-right">{record.quantity}</td>
                    <td className="px-4 py-2 text-right">₹{record.totalPrice?.toFixed(2) ?? '0.00'}</td>
                    <td className="px-4 py-2 text-right">₹{record.paidAmount?.toFixed(2) ?? '0.00'}</td>
                    <td className="px-4 py-2 text-right">₹{record.remainingAmount?.toFixed(2) ?? '0.00'}</td>
                    <td className="px-4 py-2">{record.paymentStatus}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-gray-600">No outstanding credit records found for the selected customer and date range.</p>
        )}
      </Card>
    </Layout>
  );
};
