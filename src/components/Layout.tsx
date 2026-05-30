import React, { useState } from 'react';
import { Sidebar } from './Sidebar';

interface LayoutProps {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
}

export const Layout: React.FC<LayoutProps> = ({ children, title, subtitle }) => {
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50 md:flex">
      <Sidebar mobileVisible={mobileSidebarOpen} onMobileClose={() => setMobileSidebarOpen(false)} />
      <div className="flex-1">
        <div className="sticky top-0 z-20 bg-white border-b shadow-sm">
          <div className="flex items-center justify-between gap-4 px-4 py-4 md:px-6">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="md:hidden rounded-lg border border-gray-200 bg-white p-2 text-primary shadow-sm"
                onClick={() => setMobileSidebarOpen(true)}
              >
                ☰
              </button>
              <div>
                {title ? (
                  <h1 className="text-2xl font-bold text-gray-800">{title}</h1>
                ) : (
                  <h1 className="text-xl font-bold text-gray-800">Nakshatra</h1>
                )}
                {subtitle && <p className="text-gray-600 mt-1">{subtitle}</p>}
              </div>
            </div>
          </div>
        </div>
        <main className="p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
};
