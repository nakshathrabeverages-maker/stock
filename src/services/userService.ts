import {
  collection,
  doc,
  getDocs,
  getDoc,
  updateDoc,
  query,
  where,
} from 'firebase/firestore';
import { db } from '@/config/firebase';
import { User } from '@/types';

const COLLECTION = 'users';

export const userService = {
  // Get all users
  async getAll() {
    try {
      const querySnapshot = await getDocs(collection(db, COLLECTION));

      return querySnapshot.docs.map(doc => ({
        ...doc.data(),
        id: doc.id,
        createdAt: doc.data().createdAt?.toDate?.() || new Date(),
        lastLogin: doc.data().lastLogin?.toDate?.(),
      })) as User[];
    } catch (error) {
      throw new Error(`Failed to fetch users: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  // Get single user
  async getById(id: string) {
    try {
      const docSnapshot = await getDoc(doc(db, COLLECTION, id));
      if (!docSnapshot.exists()) {
        throw new Error('User not found');
      }

      return {
        ...docSnapshot.data(),
        id: docSnapshot.id,
        createdAt: docSnapshot.data().createdAt?.toDate?.() || new Date(),
        lastLogin: docSnapshot.data().lastLogin?.toDate?.(),
      } as User;
    } catch (error) {
      throw new Error(`Failed to fetch user: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  // Get user by email
  async getByEmail(email: string) {
    try {
      const q = query(collection(db, COLLECTION), where('email', '==', email));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        return null;
      }

      const docSnapshot = querySnapshot.docs[0];
      return {
        ...docSnapshot.data(),
        id: docSnapshot.id,
        createdAt: docSnapshot.data().createdAt?.toDate?.() || new Date(),
        lastLogin: docSnapshot.data().lastLogin?.toDate?.(),
      } as User;
    } catch (error) {
      throw new Error(`Failed to fetch user by email: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  // Update user
  async update(id: string, data: Partial<User>) {
    try {
      await updateDoc(doc(db, COLLECTION, id), {
        ...data,
      });

      return { success: true };
    } catch (error) {
      throw new Error(`Failed to update user: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  // Disable user
  async disable(id: string) {
    try {
      await updateDoc(doc(db, COLLECTION, id), {
        isActive: false,
      });
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to disable user: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  // Enable user
  async enable(id: string) {
    try {
      await updateDoc(doc(db, COLLECTION, id), {
        isActive: true,
      });
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to enable user: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  // Update user role
  async updateRole(id: string, role: 'admin' | 'operator' | 'co-admin' | 'viewer') {
    try {
      await updateDoc(doc(db, COLLECTION, id), {
        role,
      });
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to update user role: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
};
