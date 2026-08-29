import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  Timestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { productService } from '@/services/productService';
import { SaleEntry } from '@/types';
import { parseDateInput } from '@/utils/dateUtils';

const COLLECTION = 'sales_entries';
const salesChangeListeners = new Set<() => void>();

const notifySalesChanged = () => {
  salesChangeListeners.forEach((listener) => listener());
};

export const salesService = {
  subscribeToSalesChanges(listener: () => void) {
    salesChangeListeners.add(listener);
    return () => {
      salesChangeListeners.delete(listener);
    };
  },
  async getAll(filters?: { startDate?: Date; endDate?: Date }) {
    try {
      const constraints: any[] = [];
      if (filters?.startDate) constraints.push(where('date', '>=', Timestamp.fromDate(filters.startDate)));
      if (filters?.endDate) constraints.push(where('date', '<=', Timestamp.fromDate(filters.endDate)));
      constraints.push(orderBy('date', 'desc'));
      const q = query(collection(db, COLLECTION), ...constraints);
      const querySnapshot = await getDocs(q);

      return querySnapshot.docs.map((doc) => ({
        ...doc.data(),
        id: doc.id,
        date: doc.data().date?.toDate?.() || new Date(),
        paidAmount: doc.data().paidAmount ?? 0,
        remainingAmount: doc.data().remainingAmount ?? 0,
        paymentStatus: doc.data().paymentStatus || 'pending',
        createdAt: doc.data().createdAt?.toDate?.() || new Date(),
        updatedAt: doc.data().updatedAt?.toDate?.() || new Date(),
      })) as SaleEntry[];
    } catch (error) {
      throw new Error(`Failed to fetch sales: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async getById(id: string) {
    try {
      const docSnapshot = await getDoc(doc(db, COLLECTION, id));
      if (!docSnapshot.exists()) {
        throw new Error('Sale not found');
      }

      return {
        ...docSnapshot.data(),
        id: docSnapshot.id,
        date: docSnapshot.data().date?.toDate?.() || new Date(),
        paidAmount: docSnapshot.data().paidAmount ?? 0,
        remainingAmount: docSnapshot.data().remainingAmount ?? 0,
        paymentStatus: docSnapshot.data().paymentStatus || 'pending',
        createdAt: docSnapshot.data().createdAt?.toDate?.() || new Date(),
        updatedAt: docSnapshot.data().updatedAt?.toDate?.() || new Date(),
      } as SaleEntry;
    } catch (error) {
      throw new Error(`Failed to fetch sale: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async create(
    data: Omit<SaleEntry, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>,
    userId: string,
    options?: { skipStockValidation?: boolean }
  ) {
    try {
      const product = await productService.getById(data.productId);
      if (!options?.skipStockValidation && product.currentStock < data.quantity) {
        throw new Error('Insufficient product stock for this sale');
      }

      const total = data.totalPrice ?? (data.quantity * data.pricePerCase);
      const paid = data.paidAmount ?? 0;
      const remaining = Math.max(total - paid, 0);
      const paymentStatus = remaining <= 0 ? 'done' : 'pending';

      const normalizedDate = parseDateInput(data.date);
      const now = Timestamp.now();
      const docRef = await addDoc(collection(db, COLLECTION), {
        ...data,
        totalPrice: total,
        paidAmount: paid,
        remainingAmount: remaining,
        paymentStatus,
        date: Timestamp.fromDate(normalizedDate),
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });

      await productService.update(data.productId, {
        currentStock: Math.max(product.currentStock - data.quantity, 0),
      });

      notifySalesChanged();

      return {
        ...data,
        id: docRef.id,
        paidAmount: paid,
        remainingAmount: remaining,
        paymentStatus,
        createdBy: userId,
        createdAt: now.toDate(),
        updatedAt: now.toDate(),
      } as SaleEntry;
    } catch (error) {
      throw new Error(`Failed to create sale: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async update(id: string, data: Partial<SaleEntry>) {
    try {
      const existing = await this.getById(id);
      const now = Timestamp.now();
      const updateData: any = { ...data, updatedAt: now };

      if (data.date) {
        updateData.date = Timestamp.fromDate(data.date);
      }

      // handle stock/product changes
      const newQuantity = data.quantity ?? existing.quantity;
      const newProductId = data.productId ?? existing.productId;

      if (newProductId !== existing.productId) {
        const oldProduct = await productService.getById(existing.productId);
        const newProduct = await productService.getById(newProductId);

        if (newProduct.currentStock < newQuantity) {
          throw new Error('Insufficient product stock for the selected product');
        }

        await productService.update(existing.productId, {
          currentStock: Math.max(oldProduct.currentStock + existing.quantity, 0),
        });
        await productService.update(newProductId, {
          currentStock: Math.max(newProduct.currentStock - newQuantity, 0),
        });
      } else if (newQuantity !== existing.quantity) {
        const product = await productService.getById(existing.productId);
        const quantityDifference = newQuantity - existing.quantity;

        if (quantityDifference > 0 && product.currentStock < quantityDifference) {
          throw new Error('Insufficient product stock to increase sale quantity');
        }

        await productService.update(existing.productId, {
          currentStock: Math.max(product.currentStock - quantityDifference, 0),
        });
      }

      // handle payment updates
      if (data.paidAmount !== undefined || data.totalPrice !== undefined) {
        const total = data.totalPrice ?? existing.totalPrice;
        const paid = data.paidAmount ?? existing.paidAmount ?? 0;
        const remaining = Math.max(total - paid, 0);
        updateData.paidAmount = paid;
        updateData.remainingAmount = remaining;
        updateData.paymentStatus = remaining <= 0 ? 'done' : 'pending';
      }

      await updateDoc(doc(db, COLLECTION, id), updateData);
      notifySalesChanged();
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to update sale: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async batchUpdateSales(updates: Array<{ id: string; data: Partial<SaleEntry> }>) {
    try {
      if (!updates.length) return { success: true };
      const batch = writeBatch(db);
      const now = Timestamp.now();
      updates.forEach((u) => {
        const updateData: any = { ...u.data, updatedAt: now };
        if (u.data.date) updateData.date = Timestamp.fromDate(u.data.date as any);
        // compute payment status if paidAmount/totalPrice provided
        if (u.data.paidAmount !== undefined || u.data.totalPrice !== undefined) {
          const total = u.data.totalPrice;
          const paid = u.data.paidAmount;
          if (total !== undefined && paid !== undefined) {
            const remaining = Math.max(total - paid, 0);
            updateData.paidAmount = paid;
            updateData.remainingAmount = remaining;
            updateData.paymentStatus = remaining <= 0 ? 'done' : 'pending';
          }
        }
        batch.update(doc(db, COLLECTION, u.id), updateData);
      });
      await batch.commit();
      notifySalesChanged();
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to batch update sales: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async delete(id: string) {
    try {
      const entry = await this.getById(id);
      const product = await productService.getById(entry.productId);

      await productService.update(entry.productId, {
        currentStock: product.currentStock + entry.quantity,
      });

      await deleteDoc(doc(db, COLLECTION, id));
      notifySalesChanged();
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to delete sale: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async deleteMany(ids: string[]) {
    try {
      if (!ids.length) {
        return { success: true };
      }

      const entries = await Promise.all(ids.map((id) => this.getById(id)));
      const batch = writeBatch(db);
      const stockIncrements = new Map<string, number>();

      entries.forEach((entry) => {
        const current = stockIncrements.get(entry.productId) ?? 0;
        stockIncrements.set(entry.productId, current + entry.quantity);
      });

      for (const [productId, increment] of stockIncrements.entries()) {
        const productRef = doc(db, 'products', productId);
        const productSnapshot = await getDoc(productRef);
        const productData = productSnapshot.data() as { currentStock?: number } | undefined;
        const currentStock = productData?.currentStock ?? 0;

        batch.update(productRef, {
          currentStock: currentStock + increment,
          updatedAt: Timestamp.now(),
        });
      }

      entries.forEach((entry) => {
        batch.delete(doc(db, COLLECTION, entry.id));
      });

      await batch.commit();
      notifySalesChanged();

      return { success: true };
    } catch (error) {
      throw new Error(`Failed to delete selected sales: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
};
