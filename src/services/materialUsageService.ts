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
import { MaterialUsageEntry } from '@/types';
import { rawMaterialService } from './rawMaterialService';

const COLLECTION = 'material_usage';

export const materialUsageService = {
  // Get all material usage entries
  async getAll(filters?: { startDate?: Date; endDate?: Date; rawMaterialId?: string }) {
    try {
      let constraints: any[] = [];

      if (filters?.startDate) {
        constraints.push(where('date', '>=', Timestamp.fromDate(filters.startDate)) as any);
      }
      if (filters?.endDate) {
        constraints.push(where('date', '<=', Timestamp.fromDate(filters.endDate)) as any);
      }
      if (filters?.rawMaterialId) {
        constraints.push(where('rawMaterialId', '==', filters.rawMaterialId) as any);
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
      })) as MaterialUsageEntry[];
    } catch (error) {
      throw new Error(`Failed to fetch material usage entries: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  // Get single entry
  async getById(id: string) {
    try {
      const docSnapshot = await getDoc(doc(db, COLLECTION, id));
      if (!docSnapshot.exists()) {
        throw new Error('Material usage entry not found');
      }

      return {
        ...docSnapshot.data(),
        id: docSnapshot.id,
        date: docSnapshot.data().date?.toDate?.() || new Date(),
        createdAt: docSnapshot.data().createdAt?.toDate?.() || new Date(),
        updatedAt: docSnapshot.data().updatedAt?.toDate?.() || new Date(),
      } as MaterialUsageEntry;
    } catch (error) {
      throw new Error(`Failed to fetch material usage entry: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  // Create new material usage entry
  async create(data: Omit<MaterialUsageEntry, 'id' | 'createdAt' | 'updatedAt'>, userId: string) {
    try {
      const material = await rawMaterialService.getById(data.rawMaterialId);
      const now = Timestamp.now();
      const docRef = await addDoc(collection(db, COLLECTION), {
        ...data,
        date: Timestamp.fromDate(data.date),
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });

      await rawMaterialService.updateStock(material.id, material.currentStock - data.quantity);

      return {
        ...data,
        id: docRef.id,
        createdBy: userId,
        createdAt: now.toDate(),
        updatedAt: now.toDate(),
      } as MaterialUsageEntry;
    } catch (error) {
      throw new Error(`Failed to create material usage entry: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  // Update material usage entry
  async update(id: string, data: Partial<MaterialUsageEntry>) {
    try {
      const previous = await this.getById(id);
      const now = Timestamp.now();
      const updateData: any = { ...data, updatedAt: now };

      if (data.date) {
        updateData.date = Timestamp.fromDate(data.date);
      }

      await updateDoc(doc(db, COLLECTION, id), updateData);

      if (data.quantity !== undefined || data.rawMaterialId) {
        const oldMaterial = await rawMaterialService.getById(previous.rawMaterialId);
        await rawMaterialService.updateStock(oldMaterial.id, oldMaterial.currentStock + previous.quantity);

        const adjustedMaterialId = data.rawMaterialId || previous.rawMaterialId;
        const quantityToSubtract = data.quantity !== undefined ? data.quantity : previous.quantity;
        const newMaterial = await rawMaterialService.getById(adjustedMaterialId);
        await rawMaterialService.updateStock(newMaterial.id, newMaterial.currentStock - quantityToSubtract);
      }

      return { success: true };
    } catch (error) {
      throw new Error(`Failed to update material usage entry: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  // Delete material usage entry
  async delete(id: string) {
    try {
      const previous = await this.getById(id);
      const material = await rawMaterialService.getById(previous.rawMaterialId);
      await rawMaterialService.updateStock(material.id, material.currentStock + previous.quantity);
      await deleteDoc(doc(db, COLLECTION, id));
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to delete material usage entry: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  // Get total usage for a material on a date
  async getTotalUsageForMaterial(rawMaterialId: string, date: Date) {
    try {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const q = query(
        collection(db, COLLECTION),
        where('rawMaterialId', '==', rawMaterialId),
        where('date', '>=', Timestamp.fromDate(startOfDay)),
        where('date', '<=', Timestamp.fromDate(endOfDay))
      );

      const querySnapshot = await getDocs(q);
      let totalUsage = 0;

      querySnapshot.docs.forEach(doc => {
        totalUsage += doc.data().quantity || 0;
      });

      return totalUsage;
    } catch (error) {
      throw new Error(`Failed to fetch material usage total: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
};
