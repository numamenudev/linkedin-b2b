import React, { useState } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';

interface LayoutProps {
  children: React.ReactNode;
  /** Optional response count forwarded to Sidebar badge and Header badge */
  responseCount?: number;
}

export function Layout({ children, responseCount = 0 }: LayoutProps) {
  // On mobile the sidebar behaves as a drawer (hidden by default)
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Sidebar — fixed on desktop, drawer on mobile */}
      <Sidebar
        responseCount={responseCount}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main content wrapper */}
      <div className="flex flex-1 flex-col overflow-hidden lg:ml-0">
        {/* Top header */}
        <Header
          responseCount={responseCount}
          onMenuToggle={() => setSidebarOpen((v) => !v)}
        />

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

export default Layout;
