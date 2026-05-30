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
import { ProductionEntry } from '@/types';
import { productService } from '@/services/productService';

const COLLECTION = 'production_entries';

export const productionService = {
  // Get all production entries
  async getAll(filters?: { startDate?: Date; endDate?: Date; productId?: string }) {
    try {
      let constraints: any[] = [];

      if (filters?.startDate) {
        constraints.push(where('date', '>=', Timestamp.fromDate(filters.startDate)) as any);
      }
      if (filters?.endDate) {
        constraints.push(where('date', '<=', Timestamp.fromDate(filters.endDate)) as any);
      }
      if (filters?.productId) {
        constraints.push(where('productId', '==', filters.productId) as any);
      }

      constraints.push(orderBy('date', 'desc') as any);

      const q = constraints.length > 0
        ? query(collection(db, COLLECTION), ...constraints)
        : query(collection(db, COLLECTION), orderBy('date', 'desc'));

      const querySnapshot = await getDocs(q);

      return querySnapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id,
        date: doc.data().date?.toDate?.() || new Date(),
        createdAt: doc.data().createdAt?.toDate?.() || new Date(),
        updatedAt: doc.data().updatedAt?.toDate?.() || new Date(),
      })) as ProductionEntry[];
    } catch (error) {
      throw new Error(`Failed to fetch production entries: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  // Get today's production
  async getTodayProduction() {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const q = query(
        collection(db, COLLECTION),
        where('date', '>=', Timestamp.fromDate(today)),
        where('date', '<', Timestamp.fromDate(tomorrow))
      );

      const querySnapshot = await getDocs(q);
      let totalQuantity = 0;

      querySnapshot.docs.forEach(doc => {
        totalQuantity += doc.data().quantity || 0;
      });

      return totalQuantity;
    } catch (error) {
      throw new Error(`Failed to fetch today's production: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  // Get single entry
  async getById(id: string) {
    try {
      const docSnapshot = await getDoc(doc(db, COLLECTION, id));
      if (!docSnapshot.exists()) {
        throw new Error('Production entry not found');
      }

      return {
        ...docSnapshot.data(),
        id: docSnapshot.id,
        date: docSnapshot.data().date?.toDate?.() || new Date(),
        createdAt: docSnapshot.data().createdAt?.toDate?.() || new Date(),
        updatedAt: docSnapshot.data().updatedAt?.toDate?.() || new Date(),
      } as ProductionEntry;
    } catch (error) {
      throw new Error(`Failed to fetch production entry: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  // Create new production entry
  async create(data: Omit<ProductionEntry, 'id' | 'createdAt' | 'updatedAt'>, userId: string) {
    try {
      const now = Timestamp.now();
      const docRef = await addDoc(collection(db, COLLECTION), {
        ...data,
        date: Timestamp.fromDate(data.date),
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });

      const product = await productService.getById(data.productId);
      await productService.update(data.productId, {
        currentStock: product.currentStock + data.quantity,
      });

      return {
        ...data,
        id: docRef.id,
        createdBy: userId,
        createdAt: now.toDate(),
        updatedAt: now.toDate(),
      } as ProductionEntry;
    } catch (error) {
      throw new Error(`Failed to create production entry: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  // Update production entry
  async update(id: string, data: Partial<ProductionEntry>) {
    try {
      const existingEntry = await this.getById(id);
      const now = Timestamp.now();
      const updateData: any = { ...data, updatedAt: now };

      if (data.date) {
        updateData.date = Timestamp.fromDate(data.date);
      }

      const newQuantity = data.quantity ?? existingEntry.quantity;
      const newProductId = data.productId ?? existingEntry.productId;

      if (newProductId !== existingEntry.productId) {
        const oldProduct = await productService.getById(existingEntry.productId);
        const newProduct = await productService.getById(newProductId);

        await productService.update(existingEntry.productId, {
          currentStock: Math.max(oldProduct.currentStock - existingEntry.quantity, 0),
        });
        await productService.update(newProductId, {
          currentStock: newProduct.currentStock + newQuantity,
        });
      } else if (newQuantity !== existingEntry.quantity) {
        const product = await productService.getById(existingEntry.productId);
        await productService.update(existingEntry.productId, {
          currentStock: product.currentStock + (newQuantity - existingEntry.quantity),
        });
      }

      await updateDoc(doc(db, COLLECTION, id), updateData);

      return { success: true };
    } catch (error) {
      throw new Error(`Failed to update production entry: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  // Delete production entry
  async delete(id: string) {
    try {
      const entry = await this.getById(id);
      const product = await productService.getById(entry.productId);

      await productService.update(entry.productId, {
        currentStock: Math.max(product.currentStock - entry.quantity, 0),
      });

      await deleteDoc(doc(db, COLLECTION, id));
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to delete production entry: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
};
