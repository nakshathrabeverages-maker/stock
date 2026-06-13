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
import { salesService } from '@/services/salesService';
import { OrderEntry } from '@/types';

const COLLECTION = 'orders_entries';

export const orderService = {
  async getAll(filters?: { startDate?: Date; endDate?: Date }) {
    try {
      const constraints: any[] = [];
      if (filters?.startDate) constraints.push(where('orderDate', '>=', Timestamp.fromDate(filters.startDate)));
      if (filters?.endDate) constraints.push(where('orderDate', '<=', Timestamp.fromDate(filters.endDate)));
      constraints.push(orderBy('orderDate', 'desc'));
      const q = query(collection(db, COLLECTION), ...constraints);
      const querySnapshot = await getDocs(q);

      return querySnapshot.docs.map((doc) => ({
        ...doc.data(),
        id: doc.id,
        orderDate: doc.data().orderDate?.toDate?.() || new Date(),
        deliveryDate: doc.data().deliveryDate?.toDate?.(),
        status: doc.data().status || 'order_created',
        convertedToSale: doc.data().convertedToSale ?? false,
        createdAt: doc.data().createdAt?.toDate?.() || new Date(),
        updatedAt: doc.data().updatedAt?.toDate?.() || new Date(),
      })) as OrderEntry[];
    } catch (error) {
      throw new Error(`Failed to fetch orders: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async getById(id: string) {
    try {
      const docSnapshot = await getDoc(doc(db, COLLECTION, id));
      if (!docSnapshot.exists()) {
        throw new Error('Order not found');
      }

      return {
        ...docSnapshot.data(),
        id: docSnapshot.id,
        orderDate: docSnapshot.data().orderDate?.toDate?.() || new Date(),
        deliveryDate: docSnapshot.data().deliveryDate?.toDate?.(),
        status: docSnapshot.data().status || 'order_created',
        convertedToSale: docSnapshot.data().convertedToSale ?? false,
        createdAt: docSnapshot.data().createdAt?.toDate?.() || new Date(),
        updatedAt: docSnapshot.data().updatedAt?.toDate?.() || new Date(),
      } as OrderEntry;
    } catch (error) {
      throw new Error(`Failed to fetch order: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async create(data: Omit<OrderEntry, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'convertedToSale'>, userId: string) {
    try {
      const total = data.totalPrice ?? data.quantity * data.pricePerCase;
      const status = data.status || 'order_created';
      const convertedToSale = status === 'delivered';
      const now = Timestamp.now();

      const docRef = await addDoc(collection(db, COLLECTION), {
        ...data,
        totalPrice: total,
        status,
        convertedToSale,
        orderDate: Timestamp.fromDate(data.orderDate),
        deliveryDate: data.deliveryDate ? Timestamp.fromDate(data.deliveryDate) : null,
        createdBy: userId,
        createdAt: now,
        updatedAt: now,
      });

      if (convertedToSale) {
        try {
          await salesService.create(
            {
              date: data.deliveryDate ?? data.orderDate,
              productId: data.productId,
              customerId: data.customerId,
              quantity: data.quantity,
              pricePerCase: data.pricePerCase,
              totalPrice: total,
              paidAmount: 0,
              remainingAmount: total,
              paymentStatus: 'pending',
              remarks: data.remarks,
            },
            userId
          );
        } catch (error) {
          await deleteDoc(doc(db, COLLECTION, docRef.id));
          throw error;
        }
      }

      return {
        ...data,
        id: docRef.id,
        totalPrice: total,
        convertedToSale,
        createdBy: userId,
        createdAt: now.toDate(),
        updatedAt: now.toDate(),
      } as OrderEntry;
    } catch (error) {
      throw new Error(`Failed to create order: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async update(id: string, data: Partial<OrderEntry>, userId: string) {
    try {
      const existing = await this.getById(id);
      const now = Timestamp.now();
      const updateData: any = {
        ...data,
        updatedAt: now,
      };

      if (data.orderDate) {
        updateData.orderDate = Timestamp.fromDate(data.orderDate);
      }
      if (data.deliveryDate) {
        updateData.deliveryDate = Timestamp.fromDate(data.deliveryDate);
      }
      const newStatus = data.status ?? existing.status;
      const shouldConvert = newStatus === 'delivered' && !existing.convertedToSale;

      if (shouldConvert) {
        const total = data.totalPrice ?? existing.totalPrice;
        await salesService.create(
          {
            date: data.deliveryDate ?? existing.deliveryDate ?? existing.orderDate,
            productId: data.productId ?? existing.productId,
            customerId: data.customerId ?? existing.customerId,
            quantity: data.quantity ?? existing.quantity,
            pricePerCase: data.pricePerCase ?? existing.pricePerCase,
            totalPrice: total,
            paidAmount: 0,
            remainingAmount: total,
            paymentStatus: 'pending',
            remarks: data.remarks ?? existing.remarks,
          },
          userId
        );
        updateData.convertedToSale = true;
      }

      await updateDoc(doc(db, COLLECTION, id), updateData);
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to update order: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },

  async delete(id: string) {
    try {
      await deleteDoc(doc(db, COLLECTION, id));
      return { success: true };
    } catch (error) {
      throw new Error(`Failed to delete order: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  },
};
