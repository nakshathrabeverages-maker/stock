// Types for authentication
export type UserRole = 'admin' | 'operator' | 'co-admin' | 'viewer';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: Date;
  lastLogin?: Date;
  isActive: boolean;
}

// Types for raw materials
export interface RawMaterial {
  id: string;
  name: string;
  category: RawMaterialCategory;
  unit: string;
  currentStock: number;
  minimumStockLevel: number;
  dateAdded: Date;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
}

export type RawMaterialCategory =
  | 'Preforms'
  | 'Caps'
  | 'Stickers'
  | 'Shrink Rolls'
  | 'Minerals'
  | 'Filters'
  | 'Ink Materials';

// Types for products
export interface Product {
  id: string;
  name: string;
  bottleSize: string;
  currentStock: number;
  status: 'active' | 'inactive';
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Customer {
  id: string;
  name: string;
  village: string;
  firmName: string;
  phone: string;
  email?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// Types for production entries
export interface ProductionEntry {
  id: string;
  date: Date;
  productId: string;
  quantity: number;
  remarks?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// Types for material usage
export interface MaterialUsageEntry {
  id: string;
  date: Date;
  rawMaterialId: string;
  quantity: number;
  remarks?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// Types for stock transactions
export interface StockTransaction {
  id: string;
  rawMaterialId: string;
  type: 'opening' | 'purchase' | 'usage' | 'adjustment';
  quantity: number;
  date: Date;
  remarks?: string;
  createdBy: string;
  createdAt: Date;
}

// Purchase entries
export interface PurchaseEntry {
  id: string;
  rawMaterialId: string;
  quantity: number;
  supplier?: string;
  price: number;
  date: Date;
  remarks?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ExpenseEntry {
  id: string;
  date: Date;
  type: 'rawmaterial' | 'salary' | 'powerbill' | 'plant_maintenance' | 'machine_maintenance' | 'transport' | 'machine_spares' | 'capital_expenditure';
  subtype?: string;
  vendor?: string;
  value: number;
  remarks?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SettingEntry {
  id: string;
  key: string;
  value: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SaleEntry {
  id: string;
  date: Date;
  productId: string;
  customerId: string;
  quantity: number;
  pricePerCase: number;
  totalPrice: number;
  paidAmount: number;
  remainingAmount: number;
  paymentStatus: 'pending' | 'done';
  remarks?: string;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// Types for dashboard
export interface DashboardData {
  producedToday: number;
  totalProducts: number;
  totalRawMaterials: number;
  lowStockItems: RawMaterial[];
  recentActivities: Activity[];
}

export interface Activity {
  id: string;
  type: 'production' | 'material_usage' | 'stock_update' | 'user_action';
  description: string;
  timestamp: Date;
  userId: string;
  userName: string;
}

// API response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
