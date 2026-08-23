import React, { useEffect, useMemo, useState } from 'react';
import { Layout, Card, Button, Input, Select, Alert } from '@/components';
import { customerService } from '@/services/customerService';
import { productService } from '@/services/productService';
import { salesService } from '@/services/salesService';
import { Customer, Product, SaleEntry } from '@/types';
import { parseDateInput } from '@/utils/dateUtils';

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
      const creditSales = sales
        .filter((entry) => entry.customerId === selectedCustomerId && (entry.remainingAmount ?? 0) > 0)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      setCreditRecords(creditSales);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCustomerId, startDate, endDate]);

  const totalOutstanding = useMemo(
    () => creditRecords.reduce((sum, record) => sum + (record.remainingAmount ?? 0), 0),
    [creditRecords]
  );

  const handleAdjustCredit = async () => {
    const amount = Number(updateAmount);
    if (!selectedCustomerId) {
      setError('Please select a customer.');
      return;
    }
    if (!Number.isFinite(amount) || amount === 0) {
      setError('Enter a valid non-zero adjustment amount.');
      return;
    }
    if (!creditRecords.length) {
      setError(
        amount > 0
          ? 'No credit records available for this customer in the selected date range.'
          : 'No credit records are available to increase outstanding balance for this customer in the selected date range.'
      );
      return;
    }

    try {
      setLoading(true);
      setError('');
      setSuccess('');
      let remainingAdjustment = amount;
      for (const record of creditRecords) {
        if (remainingAdjustment === 0) break;
        const currentRemaining = record.remainingAmount ?? 0;
        if (currentRemaining < 0) continue;

        const totalPrice = record.totalPrice ?? record.quantity * record.pricePerCase;
        if (amount > 0) {
          const applyAmount = Math.min(currentRemaining, remainingAdjustment);
          if (applyAmount <= 0) continue;

          const newRemaining = currentRemaining - applyAmount;
          const newPaidAmount = totalPrice - newRemaining;
          const paymentStatus = newRemaining <= 0 ? 'done' : 'pending';

          await salesService.update(record.id, {
            remainingAmount: newRemaining,
            paidAmount: newPaidAmount,
            paymentStatus,
          });

          remainingAdjustment -= applyAmount;
        } else {
          const increaseAmount = Math.min(Math.abs(remainingAdjustment), Math.max(totalPrice - currentRemaining, 0));
          if (increaseAmount <= 0) continue;

          const newRemaining = currentRemaining + increaseAmount;
          const newPaidAmount = totalPrice - newRemaining;
          const paymentStatus = newRemaining === 0 ? 'done' : 'pending';

          await salesService.update(record.id, {
            remainingAmount: newRemaining,
            paidAmount: newPaidAmount,
            paymentStatus,
          });

          remainingAdjustment += increaseAmount;
        }
      }

      await fetchRecords();
      setSuccess(`Applied ₹${amount.toFixed(2)} across credit records.`);
      setUpdateAmount('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update credit records');
    } finally {
      setLoading(false);
    }
  };

  const parseCsvRows = (text: string) => {
    const rows: string[][] = [];
    let currentRow: string[] = [];
    let currentValue = '';
    let inQuotes = false;

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];

      if (char === '"') {
        if (inQuotes && text[index + 1] === '"') {
          currentValue += '"';
          index += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        currentRow.push(currentValue);
        currentValue = '';
      } else if ((char === '\n' || char === '\r') && !inQuotes) {
        if (char === '\r' && text[index + 1] === '\n') {
          index += 1;
        }
        currentRow.push(currentValue);
        if (currentRow.some((cell) => cell.trim())) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentValue = '';
      } else {
        currentValue += char;
      }
    }

    if (currentValue.length > 0 || currentRow.length > 0) {
      currentRow.push(currentValue);
      if (currentRow.some((cell) => cell.trim())) {
        rows.push(currentRow);
      }
    }

    return rows;
  };

  const parseCreditUpdateCsv = (text: string) => {
    const trimmedText = text.trim();
    if (!trimmedText) {
      throw new Error('Please select a CSV file to upload.');
    }

    const rows = parseCsvRows(trimmedText);
    if (rows.length < 2) {
      throw new Error('CSV must include a header row and at least one data row.');
    }

    const [headers, ...dataRows] = rows;
    const normalizedHeaders = headers.map((header) => header.trim().toLowerCase().replace(/[^a-z0-9]+/g, ''));

    return dataRows
      .filter((row) => row.some((cell) => cell.trim()))
      .map((row) => {
        const record: Record<string, string> = {};
        normalizedHeaders.forEach((header, index) => {
          record[header] = row[index] ?? '';
        });

        const pickValue = (...keys: string[]) => {
          for (const key of keys) {
            const value = record[key];
            if (value !== undefined && String(value).trim() !== '') {
              return String(value).trim();
            }
          }
          return '';
        };

        const parseNumber = (val: string) => {
          if (!val) return NaN;
          const n = Number(String(val).replace(/[^0-9.-]+/g, ''));
          return Number.isFinite(n) ? n : NaN;
        };

        return {
          customerName: pickValue('customer', 'customername', 'party', 'partyname', 'name'),
          date: pickValue('date', 'transactiondate', 'paiddate'),
          productName: pickValue('product', 'productname', 'item', 'itemname', 'name'),
          quantity: parseNumber(pickValue('quantity', 'qty', 'quantity')),
          totalAmount: parseNumber(pickValue('total', 'totalamount', 'invoiceamount', 'amount')),
          paidAmount: parseNumber(pickValue('paid', 'paidamount', 'received', 'receivedamount')),
          remainingAmount: parseNumber(pickValue('balance', 'balanceamount', 'remaining', 'remainingamount', 'balance_amount')),
          creditAmount: parseNumber(pickValue('credit', 'creditamount', 'credit_amount')),
          receivedAmount: parseNumber(pickValue('received', 'receivedamount', 'received_amount')),
          balanceAmount: parseNumber(pickValue('balance', 'balanceamount', 'balance_amount')),
        };
      });
  };

  const handleCsvFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    setError('');
    setSuccess('');
    const file = event.target.files?.[0];
    if (!file) {
      setImportCsvText('');
      setImportFileName('');
      return;
    }

    setImportFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      setImportCsvText(reader.result as string);
    };
    reader.onerror = () => {
      setError('Failed to read CSV file.');
    };
    reader.readAsText(file);
  };

  const normalizeValue = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

  const handleApplyCsvUpdates = async () => {
    if (!importCsvText) {
      setError('Please upload a CSV file first.');
      return;
    }

    let parsedRows;
    try {
      parsedRows = parseCreditUpdateCsv(importCsvText);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid CSV format.');
      return;
    }

    if (!parsedRows.length) {
      setError('No valid rows were found in the uploaded CSV.');
      return;
    }

    const perSaleBatch: Array<{
      rowIndex: number;
      customerId: string;
      customerName: string;
      date: Date;
      productName: string;
      quantity?: number;
      totalAmount?: number;
      paidAmount?: number;
      remainingAmount?: number;
      sales: SaleEntry[];
    }> = [];

    const perCustomerBatch: Array<{
      rowIndex: number;
      customerId: string;
      customerName: string;
      date: Date;
      amount: number;
      sales: SaleEntry[];
    }> = [];
    const validationErrors: string[] = [];

    for (const [rowIndex, row] of parsedRows.entries()) {
      const customerName = normalizeValue(row.customerName);
      if (!customerName) {
        validationErrors.push(`Row ${rowIndex + 2}: missing customer name.`);
        continue;
      }

      const customer = customers.find(
        (cust) => normalizeValue(cust.name) === customerName || normalizeValue(cust.firmName) === customerName
      );
      if (!customer) {
        validationErrors.push(`Row ${rowIndex + 2}: customer '${row.customerName}' not found.`);
        continue;
      }

      const creditAmount = Number.isFinite(row.creditAmount) ? row.creditAmount : NaN;
      const receivedAmount = Number.isFinite(row.receivedAmount) ? row.receivedAmount : NaN;
      const balanceAmount = Number.isFinite(row.balanceAmount) ? row.balanceAmount : NaN;

      if (Number.isNaN(balanceAmount) && (Number.isNaN(creditAmount) || Number.isNaN(receivedAmount))) {
        validationErrors.push(`Row ${rowIndex + 2}: provide either 'balance' or both 'credit' and 'received' amounts.`);
        continue;
      }

      const parsedDate = row.date ? parseDateInput(row.date) : null;
      if (!parsedDate || Number.isNaN(parsedDate.getTime())) {
        validationErrors.push(`Row ${rowIndex + 2}: invalid or missing date '${row.date || ''}'.`);
        continue;
      }

      // search sales for that day
      const dayStart = new Date(parsedDate);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(parsedDate);
      dayEnd.setHours(23, 59, 59, 999);

      const salesForDay = await salesService.getAll({ startDate: dayStart, endDate: dayEnd });
      const matchedSales = salesForDay
        .filter((entry) => entry.customerId === customer.id && entry.date && new Date(entry.date).getTime() >= dayStart.getTime() && new Date(entry.date).getTime() <= dayEnd.getTime())
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      if (!matchedSales.length) {
        validationErrors.push(`Row ${rowIndex + 2}: no sale records found for ${row.customerName} on ${row.date}.`);
        continue;
      }

      // If CSV provided 'credit' amount, ensure it matches the sum of sales totalPrice for that date
      const salesTotal = matchedSales.reduce((s, r) => s + (r.totalPrice ?? (r.quantity * r.pricePerCase || 0)), 0);
      const creditAmountProvided = Number.isFinite(row.creditAmount) ? row.creditAmount : NaN;
      if (!Number.isNaN(creditAmountProvided)) {
        // allow small rounding tolerance
        if (Math.abs(creditAmountProvided - salesTotal) > 0.5) {
          validationErrors.push(
            `Row ${rowIndex + 2}: CSV credit amount ₹${creditAmountProvided.toFixed(2)} does not match total sale amount ₹${salesTotal.toFixed(2)} for that date.`
          );
          continue;
        }
      }

      // If CSV row contains productName or remainingAmount, treat as per-sale update
      const hasPerSale = String(row.productName ?? '').trim() !== '' || Number.isFinite(row.remainingAmount);
      if (hasPerSale) {
        perSaleBatch.push({
          rowIndex,
          customerId: customer.id,
          customerName: row.customerName,
          date: parsedDate,
          productName: row.productName,
          quantity: Number.isFinite(row.quantity) ? row.quantity : undefined,
          totalAmount: Number.isFinite(row.totalAmount) ? row.totalAmount : undefined,
          paidAmount: Number.isFinite(row.paidAmount) ? row.paidAmount : undefined,
          remainingAmount: Number.isFinite(row.remainingAmount) ? row.remainingAmount : undefined,
          sales: matchedSales,
        });
      } else {
        const desiredBalance = !Number.isNaN(balanceAmount) ? balanceAmount : creditAmount - receivedAmount;
        perCustomerBatch.push({
          rowIndex,
          customerId: customer.id,
          customerName: row.customerName,
          date: parsedDate,
          amount: desiredBalance,
          sales: matchedSales,
        });
      }
    }

    if (validationErrors.length) {
      setError(validationErrors.join(' '));
      return;
    }

    if (!perSaleBatch.length && !perCustomerBatch.length) {
      setError('No valid CSV rows were found to apply.');
      return;
    }

    try {
      setLoading(true);
      setError('');
      setSuccess('');


      let totalApplied = 0;
      let rowCount = 0;

      // First process per-sale exact updates
      for (const batch of perSaleBatch) {
        rowCount += 1;
        // match specific sale by product if possible
        let matchedSale: SaleEntry | undefined;
        if (batch.productName) {
          const normalizedProduct = String(batch.productName).toLowerCase().replace(/[^a-z0-9]+/g, '');
          matchedSale = batch.sales.find((s) => {
            const prod = products.find((p) => p.id === s.productId);
            const prodName = (prod?.name || s.productId || '').toString().toLowerCase();
            const norm = prodName.replace(/[^a-z0-9]+/g, '');
            return norm.includes(normalizedProduct) || normalizedProduct.includes(norm);
          });
        }
        // if no product match, but only one sale exists, use it
        if (!matchedSale && batch.sales.length === 1) matchedSale = batch.sales[0];

        if (!matchedSale) {
          throw new Error(`Row ${batch.rowIndex + 2}: could not match sale by product for ${batch.customerName} on ${batch.date.toISOString().slice(0,10)}.`);
        }

        const totalPrice = matchedSale.totalPrice ?? matchedSale.quantity * matchedSale.pricePerCase;
        // If CSV provides paidAmount, honor it and compute remaining; otherwise use remainingAmount if provided
        let desiredRemainingNum = NaN;
        let finalPaidAmount: number | undefined;
        if (Number.isFinite(batch.paidAmount)) {
          finalPaidAmount = batch.paidAmount as number;
          desiredRemainingNum = totalPrice - finalPaidAmount;
        } else if (Number.isFinite(batch.remainingAmount)) {
          desiredRemainingNum = batch.remainingAmount as number;
          finalPaidAmount = totalPrice - desiredRemainingNum;
        } else if (Number.isFinite(batch.totalAmount) && Number.isFinite(batch.paidAmount)) {
          // handled above, but keep for completeness
          finalPaidAmount = batch.paidAmount as number;
          desiredRemainingNum = totalPrice - finalPaidAmount;
        }

        if (!Number.isFinite(desiredRemainingNum) || !Number.isFinite(finalPaidAmount)) {
          throw new Error(`Row ${batch.rowIndex + 2}: missing remaining/total/paid information for per-sale update.`);
        }

        const paid = finalPaidAmount as number;
        if (paid < -0.5 || paid > totalPrice + 0.5) {
          throw new Error(`Row ${batch.rowIndex + 2}: provided paid amount ₹${paid.toFixed(2)} is invalid for sale total ₹${totalPrice.toFixed(2)}.`);
        }

        const newRemaining = Math.max(Math.round(desiredRemainingNum * 100) / 100, 0);
        const normalizedRemaining = newRemaining < 10 ? 0 : newRemaining;
        const newPaidAmount = Math.max(Math.round(paid * 100) / 100, 0);
        const paymentStatus = normalizedRemaining === 0 ? 'done' : 'pending';

        await salesService.update(matchedSale.id, {
          remainingAmount: normalizedRemaining,
          paidAmount: newPaidAmount,
          paymentStatus,
        });

        totalApplied += Math.abs((matchedSale.remainingAmount ?? 0) - normalizedRemaining);
      }

      // Then process per-customer aggregated rows (unchanged logic)
      for (const batch of perCustomerBatch) {
        rowCount += 1;
        const sales = batch.sales;

        const currentTotalRemaining = sales.reduce((s, r) => s + (r.remainingAmount ?? 0), 0);
        let desiredTotalRemaining = Number.isFinite(batch.amount) && batch.amount >= 0 ? batch.amount : 0;

        // compute total capacity (sum of totalPrice) to validate increases
        const totalCapacity = sales.reduce((s, r) => s + (r.totalPrice ?? (r.quantity * r.pricePerCase || 0)), 0);
        if (desiredTotalRemaining > totalCapacity) {
          throw new Error(`Row ${batch.rowIndex + 2}: desired amount ${desiredTotalRemaining} exceeds total possible outstanding (${totalCapacity.toFixed(2)}) for that date.`);
        }

        // If we need to reduce outstanding (current > desired), apply payments across sales oldest-first
        let diff = currentTotalRemaining - desiredTotalRemaining;
        if (diff > 0) {
          for (const record of sales) {
            if (diff <= 0) break;
            const currentRemaining = record.remainingAmount ?? 0;
            if (currentRemaining <= 0) continue;
            const applyAmount = Math.min(currentRemaining, diff);
            const totalPrice = record.totalPrice ?? record.quantity * record.pricePerCase;
            const newRemainingRaw = currentRemaining - applyAmount;
            const newRemaining = Math.max(Math.round(newRemainingRaw * 100) / 100, 0);
            const normalizedRemaining = newRemaining < 10 ? 0 : newRemaining;
            const newPaidAmount = Math.max(Math.round((totalPrice - normalizedRemaining) * 100) / 100, 0);
            const paymentStatus = normalizedRemaining === 0 ? 'done' : 'pending';

            await salesService.update(record.id, {
              remainingAmount: normalizedRemaining,
              paidAmount: newPaidAmount,
              paymentStatus,
            });

            diff -= applyAmount;
            totalApplied += applyAmount;
          }
        } else if (diff < 0) {
          // need to increase outstanding by |diff|, distribute across sales up to their capacity
          let needed = Math.abs(diff);
          for (const record of sales) {
            if (needed <= 0) break;
            const currentRemaining = record.remainingAmount ?? 0;
            const totalPrice = record.totalPrice ?? record.quantity * record.pricePerCase;
            const capacity = Math.max(totalPrice - currentRemaining, 0);
            if (capacity <= 0) continue;
            const addAmount = Math.min(capacity, needed);
            const newRemainingRaw = currentRemaining + addAmount;
            const newRemaining = Math.max(Math.round(newRemainingRaw * 100) / 100, 0);
            const normalizedRemaining = newRemaining < 10 ? 0 : newRemaining;
            const newPaidAmount = Math.max(Math.round((totalPrice - normalizedRemaining) * 100) / 100, 0);
            const paymentStatus = normalizedRemaining === 0 ? 'done' : 'pending';

            await salesService.update(record.id, {
              remainingAmount: normalizedRemaining,
              paidAmount: newPaidAmount,
              paymentStatus,
            });

            needed -= addAmount;
            totalApplied += addAmount;
          }
          if (needed > 0) {
            throw new Error(`Row ${batch.rowIndex + 2}: unable to increase outstanding by ${Math.abs(diff)}; not enough capacity on sales for that date.`);
          }
        }
      }

      await fetchRecords();
      setSuccess(`Processed ${rowCount} CSV rows. Total applied ₹${totalApplied.toFixed(2)}.`);
      setImportCsvText('');
      setImportFileName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to apply CSV credit updates');
    } finally {
      setLoading(false);
    }
  };

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
                <p className="mt-2 text-sm text-gray-600">CSV should include customer name, date/startDate, endDate (optional), and amount.</p>
                <p className="text-sm text-gray-600">Example header: <span className="font-medium">customer,date,amount</span></p>
                <p className="text-sm text-gray-600">Optional fields: <span className="font-medium">startDate,endDate</span> for a date range.</p>
                <p className="text-sm text-gray-600">Example row: <span className="font-medium">Ravi Kumar,2026-08-01,,1500</span></p>
              </div>
            )}
          </div>
          <div className="flex items-end justify-end">
            <Button variant="secondary" onClick={handleApplyCsvUpdates} loading={loading}>
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
