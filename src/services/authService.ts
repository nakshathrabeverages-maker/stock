import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  User as FirebaseUser,
  onAuthStateChanged,
} from 'firebase/auth';
import { auth, db } from '@/config/firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { User } from '@/types';

export const authService = {
  // Register a new user
  async register(email: string, password: string, name: string, role: 'admin' | 'operator' | 'co-admin' | 'viewer' = 'operator') {
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const firebaseUser = userCredential.user;

      // Create user document in Firestore
      const userData: User = {
        id: firebaseUser.uid,
        email,
        name,
        role,
        createdAt: new Date(),
        isActive: true,
      };

      await setDoc(doc(db, 'users', firebaseUser.uid), userData);
      return userData;
    } catch (error) {
      throw new Error(`Registration failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  // Login user
  async login(email: string, password: string) {
    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const firebaseUser = userCredential.user;

      // Get user data from Firestore
      const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
      if (!userDoc.exists()) {
        throw new Error('User document not found');
      }

      const userData = userDoc.data() as User;

      // Update last login
      await setDoc(
        doc(db, 'users', firebaseUser.uid),
        { lastLogin: new Date() },
        { merge: true }
      );

      return userData;
    } catch (error) {
      throw new Error(`Login failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  // Logout user
  async logout() {
    try {
      await signOut(auth);
    } catch (error) {
      throw new Error(`Logout failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  // Send password reset email
  async sendPasswordReset(email: string) {
    try {
      await sendPasswordResetEmail(auth, email);
      return true;
    } catch (error) {
      throw new Error(`Password reset failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  // Get current user
  getCurrentUser(): FirebaseUser | null {
    return auth.currentUser;
  },

  // Subscribe to auth state changes
  onAuthStateChanged(callback: (user: FirebaseUser | null) => void) {
    return onAuthStateChanged(auth, callback);
  },
};
