import React, { useEffect, useMemo, useState } from 'react';
import { Layout, Card, Button, Input, Select, Alert } from '@/components';
import { customerService } from '@/services/customerService';
import { productService } from '@/services/productService';
import { salesService } from '@/services/salesService';
import { Customer, Product, SaleEntry } from '@/types';

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
    if (!amount || amount <= 0) {
      setError('Enter a valid adjustment amount.');
      return;
    }
    if (!creditRecords.length) {
      setError('No credit records available for this customer in the selected date range.');
      return;
    }

    try {
      setLoading(true);
      setError('');
      setSuccess('');
      let remainingAdjustment = amount;
      for (const record of creditRecords) {
        if (remainingAdjustment <= 0) break;
        const currentRemaining = record.remainingAmount ?? 0;
        if (currentRemaining <= 0) continue;
        const applyAmount = Math.min(currentRemaining, remainingAdjustment);
        const totalPrice = record.totalPrice ?? record.quantity * record.pricePerCase;
        const newRemaining = currentRemaining - applyAmount;
        const newPaidAmount = totalPrice - newRemaining;
        const paymentStatus = newRemaining <= 0 ? 'done' : 'pending';

        await salesService.update(record.id, {
          remainingAmount: newRemaining,
          paidAmount: newPaidAmount,
          paymentStatus,
        });

        remainingAdjustment -= applyAmount;
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
                min={0}
                step="0.01"
                value={updateAmount}
                onChange={(e) => setUpdateAmount(e.target.value)}
                placeholder="Enter amount"
              />
            </div>
            <Button variant="primary" onClick={handleAdjustCredit} loading={loading}>
              Apply Adjustment
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
