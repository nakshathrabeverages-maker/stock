import {
  collection,
  doc,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  query,
  where,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { RawMaterial, RawMaterialCategory } from '@/types';

const COLLECTION = 'raw_materials';

async function getByName(name: string) {
  const q = query(collection(db, COLLECTION), where('name', '==', name));
  const querySnapshot = await getDocs(q);
  return querySnapshot.docs.map((doc) => ({
    ...doc.data(),
    id: doc.id,
    dateAdded: doc.data().dateAdded?.toDate?.() || new Date(),
    createdBy: doc.data().createdBy || '',
    createdAt: doc.data().createdAt?.toDate?.() || new Date(),
    updatedAt: doc.data().updatedAt?.toDate?.() || new Date(),
  })) as RawMaterial[];
}

export const rawMaterialService = {
  // Get all raw materials
  async getAll(filter?: { category?: RawMaterialCategory; isActive?: boolean }) {
    try {
      const constraints: any[] = [];
      
      if (filter?.category) {
        constraints.push(where('category', '==', filter.category));
      }
      
      if (filter?.isActive !== undefined) {
        if (filter.isActive) {
          // Treat missing isActive as active for backward compatibility with older documents.
          constraints.push(where('isActive', '!=', false));
        } else {
          constraints.push(where('isActive', '==', false));
        }
      }

      const q = constraints.length > 0 ? query(collection(db, COLLECTION), ...constraints) : collection(db, COLLECTION);
      const querySnapshot = await getDocs(q);
      
      return querySnapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id,
        dateAdded: doc.data().dateAdded?.toDate?.() || new Date(),
        createdBy: doc.data().createdBy || '',
        createdAt: doc.data().createdAt?.toDate?.() || new Date(),
        updatedAt: doc.data().updatedAt?.toDate?.() || new Date(),
      })) as RawMaterial[];
    } catch (error) {
      throw new Error(`Failed to fetch raw materials: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  // Get single raw material
  async getById(id: string) {
    try {
      const docSnapshot = await getDoc(doc(db, COLLECTION, id));
      if (!docSnapshot.exists()) {
        throw new Error('Raw material not found');
      }
      
      return {
        ...docSnapshot.data(),
        id: docSnapshot.id,
        dateAdded: docSnapshot.data().dateAdded?.toDate?.() || new Date(),
        createdBy: docSnapshot.data().createdBy || '',
        createdAt: docSnapshot.data().createdAt?.toDate?.() || new Date(),
        updatedAt: docSnapshot.data().updatedAt?.toDate?.() || new Date(),
      } as RawMaterial;
    } catch (error) {
      throw new Error(`Failed to fetch raw material: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  // Create new raw material
  async create(data: Omit<RawMaterial, 'id' | 'createdAt' | 'updatedAt' | 'createdBy'>, userId: string) {
    try {
      const existing = await getByName(data.name);
      if (existing.length > 0) {
        throw new Error('Raw material name must be unique');
      }

      const now = Timestamp.now();
      const docRef = await addDoc(collection(db, COLLECTION), {
        ...data,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });

      return {
        ...data,
        id: docRef.id,
        createdBy: userId,
        createdAt: now.toDate(),
        updatedAt: now.toDate(),
      } as RawMaterial;
    } catch (error) {
      throw new Error(`Failed to create raw material: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  // Update raw material
  async update(id: string, data: Partial<RawMaterial>) {
    try {
      if (data.name) {
        const existing = await getByName(data.name);
        if (existing.some((item) => item.id !== id)) {
          throw new Error('Raw material name must be unique');
        }
      }

      const now = Timestamp.now();
      await updateDoc(doc(db, COLLECTION, id), {
        ...data,
        updatedAt: now,
      });

      return { success: true };
    } catch (error) {
      throw new Error(`Failed to update raw material: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  // Soft delete (disable) raw material
  async disable(id: string) {
    try {
      await updateDoc(doc(db, COLLECTION, id), {
        isActive: false,
        updatedAt: Timestamp.now(),
      });
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to disable raw material: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  // Get low stock items
  async getLowStockItems() {
    try {
      // Firestore doesn't support comparing two fields in a query.
      // Query active materials and filter low-stock items client-side.
      const q = query(collection(db, COLLECTION), where('isActive', '!=', false));
      const querySnapshot = await getDocs(q);

      return querySnapshot.docs
        .map(doc => ({
          ...doc.data(),
          id: doc.id,
          createdAt: doc.data().createdAt?.toDate?.() || new Date(),
          updatedAt: doc.data().updatedAt?.toDate?.() || new Date(),
        }))
        .filter(item => (item as RawMaterial).currentStock < (item as RawMaterial).minimumStockLevel) as RawMaterial[];
    } catch (error) {
      throw new Error(`Failed to fetch low stock items: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  // Update stock quantity
  async updateStock(id: string, newStock: number) {
    try {
      await updateDoc(doc(db, COLLECTION, id), {
        currentStock: newStock,
        updatedAt: Timestamp.now(),
      });
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to update stock: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
};
