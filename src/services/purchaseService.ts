import {
  collection,
  addDoc,
  getDocs,
  Timestamp,
  query,
  orderBy,
  where,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { PurchaseEntry } from '@/types';
import { rawMaterialService } from './rawMaterialService';
import { expenseService } from './expenseService';

const COLLECTION = 'purchases';

export const purchaseService = {
  async getAll(filters?: { startDate?: Date; endDate?: Date }) {
    try {
      const constraints: any[] = [];
      if (filters?.startDate) {
        constraints.push(where('date', '>=', Timestamp.fromDate(filters.startDate)));
      }
      if (filters?.endDate) {
        constraints.push(where('date', '<=', Timestamp.fromDate(filters.endDate)));
      }
      constraints.push(orderBy('date', 'desc'));
      const q = query(collection(db, COLLECTION), ...constraints);
      const querySnapshot = await getDocs(q);

      return querySnapshot.docs.map((doc) => ({
        ...doc.data(),
        id: doc.id,
        price: doc.data().price ?? 0,
        date: doc.data().date?.toDate?.() || new Date(),
        createdAt: doc.data().createdAt?.toDate?.() || new Date(),
      })) as PurchaseEntry[];
    } catch (error) {
      throw new Error(`Failed to fetch purchases: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  // Create purchase and update raw material stock
  async create(data: Omit<PurchaseEntry, 'id' | 'createdAt' | 'updatedAt'>, userId: string) {
    try {
      // Get current material
      const material = await rawMaterialService.getById(data.rawMaterialId);

      const now = Timestamp.now();

      const docRef = await addDoc(collection(db, COLLECTION), {
        ...data,
        price: data.price ?? 0,
        date: Timestamp.fromDate(data.date),
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });

      // Update stock: add purchased quantity
      const newStock = (material.currentStock || 0) + data.quantity;
      await rawMaterialService.updateStock(material.id, newStock);

      // Create expense entry for this purchase (value = price * quantity)
      try {
        const expenseValue = (data.price ?? 0) * data.quantity;
        await expenseService.create({
          date: data.date,
          type: 'rawmaterial',
          subtype: material.name,
          value: expenseValue,
          remarks: `Purchase ${docRef.id}`,
        } as any, userId);
      } catch (err) {
        // non-fatal: log but don't fail the purchase creation
        console.warn('Failed to create expense for purchase:', err);
      }

      return {
        ...data,
        id: docRef.id,
        createdBy: userId,
        createdAt: now.toDate(),
        updatedAt: now.toDate(),
      } as PurchaseEntry;
    } catch (error) {
      throw new Error(`Failed to create purchase: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
};
