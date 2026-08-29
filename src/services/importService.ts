import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/config/firebase';

const COLLECTION = 'imports';

export const importService = {
  async exists(key: string) {
    try {
      const ref = doc(db, COLLECTION, key);
      const snap = await getDoc(ref);
      return snap.exists();
    } catch (err) {
      throw new Error(`Failed to check import existence: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  },

  async create(key: string, payload: Record<string, any>) {
    try {
      const ref = doc(db, COLLECTION, key);
      await setDoc(ref, { ...payload, createdAt: Timestamp.now() });
      return { success: true };
    } catch (err) {
      throw new Error(`Failed to create import record: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  },
};
