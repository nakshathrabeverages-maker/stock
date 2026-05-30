import { collection, doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { SettingEntry } from '@/types';

const COLLECTION = 'settings';

export const settingsService = {
  async getValue(key: string) {
    try {
      const docRef = doc(db, COLLECTION, key);
      const snapshot = await getDoc(docRef);
      if (!snapshot.exists()) return 0;
      return snapshot.data()?.value ?? 0;
    } catch (error) {
      throw new Error(`Failed to fetch setting '${key}': ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async setValue(key: string, value: number) {
    try {
      const now = Timestamp.now();
      const docRef = doc(db, COLLECTION, key);
      await setDoc(docRef, {
        key,
        value,
        updatedAt: now,
        createdAt: now,
      }, { merge: true });
      return {
        key,
        value,
        updatedAt: now.toDate(),
        createdAt: now.toDate(),
      } as SettingEntry;
    } catch (error) {
      throw new Error(`Failed to save setting '${key}': ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
};
