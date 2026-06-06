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
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { productService } from '@/services/productService';
import { SaleEntry } from '@/types';

const COLLECTION = 'sales_entries';

export const salesService = {
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

  async create(data: Omit<SaleEntry, 'id' | 'createdAt' | 'updatedAt'>, userId: string) {
    try {
      const product = await productService.getById(data.productId);
      if (product.currentStock < data.quantity) {
        throw new Error('Insufficient product stock for this sale');
      }

      const total = data.totalPrice ?? (data.quantity * data.pricePerCase);
      const paid = data.paidAmount ?? 0;
      const remaining = Math.max(total - paid, 0);
      const paymentStatus = remaining <= 0 ? 'done' : 'pending';

      const now = Timestamp.now();
      const docRef = await addDoc(collection(db, COLLECTION), {
        ...data,
        totalPrice: total,
        paidAmount: paid,
        remainingAmount: remaining,
        paymentStatus,
        date: Timestamp.fromDate(data.date),
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });

      await productService.update(data.productId, {
        currentStock: Math.max(product.currentStock - data.quantity, 0),
      });

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
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to update sale: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to delete sale: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
};
