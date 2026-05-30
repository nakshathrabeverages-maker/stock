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
  UsersPage,
  PurchasesPage,
  CustomersPage,
  SalesPage,
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
            <ProtectedRoute requiredRoles={['admin']}>
              <RawMaterialsPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/products"
          element={
            <ProtectedRoute requiredRoles={['admin']}>
              <ProductsPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/production"
          element={
            <ProtectedRoute requiredRoles={['admin', 'operator']}>
              <ProductionPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/material-usage"
          element={
            <ProtectedRoute requiredRoles={['admin', 'operator']}>
              <MaterialUsagePage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/reports"
          element={
            <ProtectedRoute requiredRoles={['admin', 'operator']}>
              <ReportsPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/purchases"
          element={
            <ProtectedRoute requiredRoles={["admin", "operator"]}>
              <PurchasesPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/expenses"
          element={
            <ProtectedRoute requiredRoles={["admin"]}>
              <ExpensesPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/customers"
          element={
            <ProtectedRoute requiredRoles={["admin", "operator"]}>
              <CustomersPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/sales"
          element={
            <ProtectedRoute requiredRoles={["admin"]}>
              <SalesPage />
            </ProtectedRoute>
          }
        />

        <Route
          path="/users"
          element={
            <ProtectedRoute requiredRoles={['admin', 'co-admin']}>
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
