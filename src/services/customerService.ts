import {
  collection,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  doc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { Customer } from '@/types';

const COLLECTION = 'customers';

export const customerService = {
  async getAll() {
    try {
      const querySnapshot = await getDocs(collection(db, COLLECTION));
      return querySnapshot.docs.map((doc) => ({
        ...doc.data(),
        id: doc.id,
        createdAt: doc.data().createdAt?.toDate?.() || new Date(),
        updatedAt: doc.data().updatedAt?.toDate?.() || new Date(),
      })) as Customer[];
    } catch (error) {
      throw new Error(`Failed to fetch customers: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async getById(id: string) {
    try {
      const docSnapshot = await getDoc(doc(db, COLLECTION, id));
      if (!docSnapshot.exists()) {
        throw new Error('Customer not found');
      }

      return {
        ...docSnapshot.data(),
        id: docSnapshot.id,
        createdAt: docSnapshot.data().createdAt?.toDate?.() || new Date(),
        updatedAt: docSnapshot.data().updatedAt?.toDate?.() || new Date(),
      } as Customer;
    } catch (error) {
      throw new Error(`Failed to fetch customer: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async create(data: Omit<Customer, 'id' | 'createdAt' | 'updatedAt'>) {
    try {
      const now = Timestamp.now();
      const docRef = await addDoc(collection(db, COLLECTION), {
        ...data,
        createdAt: now,
        updatedAt: now,
      });

      return {
        ...data,
        id: docRef.id,
        createdAt: now.toDate(),
        updatedAt: now.toDate(),
      } as Customer;
    } catch (error) {
      throw new Error(`Failed to create customer: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async update(id: string, data: Partial<Customer>) {
    try {
      const now = Timestamp.now();
      await updateDoc(doc(db, COLLECTION, id), {
        ...data,
        updatedAt: now,
      });

      return { success: true };
    } catch (error) {
      throw new Error(`Failed to update customer: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
};
