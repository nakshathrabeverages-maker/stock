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
import { ExpenseEntry } from '@/types';
import { parseDateInput } from '@/utils/dateUtils';

const COLLECTION = 'expenses';
const expenseChangeListeners = new Set<() => void>();
const parseExpenseDate = (value: any) => parseDateInput(value?.toDate?.() ?? value);

const notifyExpensesChanged = () => {
  expenseChangeListeners.forEach((listener) => listener());
};

export const expenseService = {
  subscribeToExpenseChanges(listener: () => void) {
    expenseChangeListeners.add(listener);
    return () => {
      expenseChangeListeners.delete(listener);
    };
  },

  async getAll(filters?: { startDate?: Date; endDate?: Date; type?: string }) {
    try {
      const constraints: any[] = [];
      if (filters?.startDate) constraints.push(where('date', '>=', Timestamp.fromDate(filters.startDate)) as any);
      if (filters?.endDate) constraints.push(where('date', '<=', Timestamp.fromDate(filters.endDate)) as any);
      if (filters?.type) constraints.push(where('type', '==', filters.type) as any);
      constraints.push(orderBy('date', 'desc') as any);

      const q = query(collection(db, COLLECTION), ...constraints);
      const querySnapshot = await getDocs(q);

      return querySnapshot.docs.map((doc) => ({
        ...doc.data(),
        id: doc.id,
        date: parseExpenseDate(doc.data().date),
        createdAt: doc.data().createdAt?.toDate?.() || new Date(),
        updatedAt: doc.data().updatedAt?.toDate?.() || new Date(),
      })) as ExpenseEntry[];
    } catch (error) {
      throw new Error(`Failed to fetch expenses: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async getById(id: string) {
    try {
      const docSnapshot = await getDoc(doc(db, COLLECTION, id));
      if (!docSnapshot.exists()) throw new Error('Expense not found');
      return {
        ...docSnapshot.data(),
        id: docSnapshot.id,
        date: parseExpenseDate(docSnapshot.data().date),
        createdAt: docSnapshot.data().createdAt?.toDate?.() || new Date(),
        updatedAt: docSnapshot.data().updatedAt?.toDate?.() || new Date(),
      } as ExpenseEntry;
    } catch (error) {
      throw new Error(`Failed to fetch expense: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async create(data: Omit<ExpenseEntry, 'id' | 'createdAt' | 'updatedAt'>, userId: string) {
    try {
      const now = Timestamp.now();
      const docRef = await addDoc(collection(db, COLLECTION), {
        ...data,
        date: Timestamp.fromDate(data.date),
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });
      notifyExpensesChanged();

      return {
        ...data,
        id: docRef.id,
        createdBy: userId,
        createdAt: now.toDate(),
        updatedAt: now.toDate(),
      } as ExpenseEntry;
    } catch (error) {
      throw new Error(`Failed to create expense: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async update(id: string, data: Partial<ExpenseEntry>) {
    try {
      const now = Timestamp.now();
      const updateData: any = { ...data, updatedAt: now };
      if (data.date) updateData.date = Timestamp.fromDate(data.date);
      await updateDoc(doc(db, COLLECTION, id), updateData);
      notifyExpensesChanged();
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to update expense: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async delete(id: string) {
    try {
      await deleteDoc(doc(db, COLLECTION, id));
      notifyExpensesChanged();
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to delete expense: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
};
