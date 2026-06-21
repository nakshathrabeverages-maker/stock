import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { authService } from '@/services/authService';
import { userService } from '@/services/userService';
import { useAuthStore } from '@/store/authStore';
import { Loading } from '@/components';
import {
  LoginPage,
  DashboardPage,
  RawMaterialsPage,
  ProductsPage,
  ProductionPage,
  MaterialUsagePage,
  ReportsPage,
  ReportsAggregationPage,
  UsersPage,
  PurchasesPage,
  CustomersPage,
  SalesPage,
  OrdersPage,
  ExpensesPage,
} from '@/pages';

const ProtectedRoute: React.FC<{
  children: React.ReactNode;
  requiredRoles?: Array<'admin' | 'operator' | 'co-admin' | 'viewer'>;
}> = ({ children, requiredRoles }) => {
  const { user, loading } = useAuthStore();

  if (loading) {
    return <Loading fullScreen message="Authenticating..." />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRoles && !requiredRoles.includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

function App() {
  const { setUser, setLoading } = useAuthStore();

  useEffect(() => {
    // Check if user is logged in
    const unsubscribe = authService.onAuthStateChanged(async (firebaseUser) => {
      if (firebaseUser) {
        try {
          // Fetch user document from Firestore and populate the store
          const userDoc = await userService.getById(firebaseUser.uid);
          setUser(userDoc);
        } catch (error) {
          console.error('Error fetching user:', error);
          setUser(null);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, [setUser, setLoading]);

  return (
    <BrowserRouter>
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<LoginPage />} />

        {/* Protected Routes */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <DashboardPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/raw-materials"
          element={
            <ProtectedRoute requiredRoles={['admin','co-admin']}>
              <RawMaterialsPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/products"
          element={
            <ProtectedRoute requiredRoles={['admin','co-admin']}>
              <ProductsPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/production"
          element={
            <ProtectedRoute requiredRoles={['admin', 'operator', 'co-admin']}>
              <ProductionPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/material-usage"
          element={
            <ProtectedRoute requiredRoles={['admin', 'operator', 'co-admin']}>
              <MaterialUsagePage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/reports"
          element={
            <ProtectedRoute requiredRoles={['admin', 'operator', 'co-admin']}>
              <ReportsPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/reports-aggregation"
          element={
            <ProtectedRoute requiredRoles={['admin', 'operator', 'co-admin']}>
              <ReportsAggregationPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/purchases"
          element={
            <ProtectedRoute requiredRoles={["admin", "operator", "co-admin"]}>
              <PurchasesPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/expenses"
          element={
            <ProtectedRoute requiredRoles={["admin", "co-admin"]}>
              <ExpensesPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/customers"
          element={
            <ProtectedRoute requiredRoles={["admin", "operator", "co-admin"]}>
              <CustomersPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/sales"
          element={
            <ProtectedRoute requiredRoles={["admin", "co-admin"]}>
              <SalesPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/orders"
          element={
            <ProtectedRoute requiredRoles={["admin", "co-admin"]}>
              <OrdersPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/users"
          element={
            <ProtectedRoute requiredRoles={['admin']}>
              <UsersPage />
            </ProtectedRoute>
          }
        />

        {/* Redirect to dashboard as default */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
