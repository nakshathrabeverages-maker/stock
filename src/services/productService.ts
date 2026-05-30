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
import { Product } from '@/types';

const COLLECTION = 'products';

export const productService = {
  // Get all products
  async getAll(includeInactive = false) {
    try {
      let q = collection(db, COLLECTION);
      
      if (!includeInactive) {
        q = query(collection(db, COLLECTION), where('status', '==', 'active'));
      }
      
      const querySnapshot = await getDocs(q);
      
      return querySnapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id,
        currentStock: doc.data().currentStock ?? 0,
        createdAt: doc.data().createdAt?.toDate?.() || new Date(),
        updatedAt: doc.data().updatedAt?.toDate?.() || new Date(),
      })) as Product[];
    } catch (error) {
      throw new Error(`Failed to fetch products: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  // Get single product
  async getById(id: string) {
    try {
      const docSnapshot = await getDoc(doc(db, COLLECTION, id));
      if (!docSnapshot.exists()) {
        throw new Error('Product not found');
      }
      
      return {
        ...docSnapshot.data(),
        id: docSnapshot.id,
        currentStock: docSnapshot.data().currentStock ?? 0,
        createdAt: docSnapshot.data().createdAt?.toDate?.() || new Date(),
        updatedAt: docSnapshot.data().updatedAt?.toDate?.() || new Date(),
      } as Product;
    } catch (error) {
      throw new Error(`Failed to fetch product: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  // Create new product
  async create(data: Omit<Product, 'id' | 'createdAt' | 'updatedAt'>) {
    try {
      const now = Timestamp.now();
      const docRef = await addDoc(collection(db, COLLECTION), {
        ...data,
        currentStock: data.currentStock ?? 0,
        createdAt: now,
        updatedAt: now,
      });

      return {
        ...data,
        id: docRef.id,
        createdAt: now.toDate(),
        updatedAt: now.toDate(),
      } as Product;
    } catch (error) {
      throw new Error(`Failed to create product: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  // Update product
  async update(id: string, data: Partial<Product>) {
    try {
      const now = Timestamp.now();
      await updateDoc(doc(db, COLLECTION, id), {
        ...data,
        updatedAt: now,
      });

      return { success: true };
    } catch (error) {
      throw new Error(`Failed to update product: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  // Disable product
  async disable(id: string) {
    try {
      await updateDoc(doc(db, COLLECTION, id), {
        status: 'inactive',
        updatedAt: Timestamp.now(),
      });
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to disable product: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
};
