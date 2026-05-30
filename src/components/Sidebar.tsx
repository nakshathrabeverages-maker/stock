import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/store/authStore';

interface NavItem {
  label: string;
  path: string;
  icon: string;
  requiredRoles?: Array<'admin' | 'operator' | 'co-admin' | 'viewer'>;
}

export const Sidebar: React.FC = () => {
  const [isOpen, setIsOpen] = useState(true);
  const { user } = useAuthStore();
  const location = useLocation();

  const navItems: NavItem[] = [
    { label: 'Dashboard', path: '/dashboard', icon: '📊' },
    { label: 'Production', path: '/production', icon: '🏭', requiredRoles: ['admin', 'operator', 'co-admin'] },
    { label: 'Sales', path: '/sales', icon: '💰', requiredRoles: ['admin', 'co-admin'] },
    { label: 'Customers', path: '/customers', icon: '👤', requiredRoles: ['admin', 'operator', 'co-admin'] },
    { label: 'Material Usage', path: '/material-usage', icon: '📦', requiredRoles: ['admin', 'operator', 'co-admin'] },
    { label: 'Raw Materials', path: '/raw-materials', icon: '🔧', requiredRoles: ['admin', 'operator', 'co-admin'] },
    { label: 'Raw Material Purchases', path: '/purchases', icon: '🛒', requiredRoles: ['admin', 'operator', 'co-admin'] },
    { label: 'Expenses', path: '/expenses', icon: '💸', requiredRoles: ['admin', 'co-admin'] },
    { label: 'Products', path: '/products', icon: '📦', requiredRoles: ['admin', 'co-admin'] },
    { label: 'Reports', path: '/reports', icon: '📄', requiredRoles: ['admin', 'operator', 'co-admin'] },
    { label: 'Users', path: '/users', icon: '👥', requiredRoles: ['admin'] },
  ];

  const filteredItems = navItems.filter(
    item => !item.requiredRoles || item.requiredRoles.includes(user?.role || 'viewer')
  );

  return (
    <div className={`${isOpen ? 'w-64' : 'w-20'} transition-all duration-300 bg-primary text-white min-h-screen flex flex-col`}>
      {/* Header */}
      <div className="p-4 flex items-center justify-between">
        {isOpen && <h1 className="font-bold text-lg">Nakshatra</h1>}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="p-2 hover:bg-opacity-80 rounded transition"
        >
          {isOpen ? '◀' : '▶'}
        </button>
      </div>

      {/* User Info */}
      <div className="px-4 py-2 border-t border-opacity-20 border-white text-xs">
        {isOpen && (
          <div>
            <p className="font-semibold truncate">{user?.name}</p>
            <p className="text-opacity-70 text-white capitalize">{user?.role}</p>
          </div>
        )}
      </div>

      {/* Navigation Items */}
      <nav className="flex-1 overflow-y-auto mt-4">
        {filteredItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={`block px-4 py-3 transition-colors ${
              location.pathname === item.path
                ? 'bg-white bg-opacity-20'
                : 'hover:bg-white hover:bg-opacity-10'
            }`}
            title={!isOpen ? item.label : ''}
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">{item.icon}</span>
              {isOpen && <span className="text-sm font-medium">{item.label}</span>}
            </div>
          </Link>
        ))}
      </nav>

      {/* Footer */}
      <div className="border-t border-opacity-20 border-white p-4">
        <Link
          to="/login"
          className="block text-center py-2 px-3 bg-opacity-20 bg-white rounded hover:bg-opacity-30 transition text-sm"
          title={!isOpen ? 'Logout' : ''}
        >
          {isOpen ? 'Logout' : '🚪'}
        </Link>
      </div>
    </div>
  );
};
