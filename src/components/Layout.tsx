import React from 'react';
import { Sidebar } from './Sidebar';

interface LayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
}

export const Layout: React.FC<LayoutProps> = ({ children, title, subtitle }) => {
  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <div className="flex-1 overflow-auto">
        {/* Header */}
        {(title || subtitle) && (
          <div className="bg-white shadow-sm p-6 border-b">
            {title && <h1 className="text-3xl font-bold text-gray-800">{title}</h1>}
            {subtitle && <p className="text-gray-600 mt-1">{subtitle}</p>}
          </div>
        )}
        {/* Main Content */}
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
};
