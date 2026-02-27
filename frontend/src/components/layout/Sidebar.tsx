import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  BarChart2,
  ScrollText,
  Settings,
  Linkedin,
  Fingerprint,
} from 'lucide-react';
import { clsx } from 'clsx';

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
}

interface SidebarProps {
  /** Count of new responses — shown as a badge on Dashboard */
  responseCount?: number;
  /** Whether the sidebar is open (mobile drawer mode) */
  isOpen?: boolean;
  /** Called when user clicks the overlay on mobile */
  onClose?: () => void;
}

export function Sidebar({ responseCount = 0, isOpen = true, onClose }: SidebarProps) {
  const navItems: NavItem[] = [
    {
      to: '/dashboard',
      label: 'Dashboard',
      icon: <LayoutDashboard size={18} />,
      badge: responseCount > 0 ? responseCount : undefined,
    },
    {
      to: '/identities',
      label: 'Identità',
      icon: <Fingerprint size={18} />,
    },
    {
      to: '/prospects',
      label: 'Prospect',
      icon: <Users size={18} />,
    },
    {
      to: '/analytics',
      label: 'Analytics',
      icon: <BarChart2 size={18} />,
    },
    {
      to: '/logs',
      label: 'Log',
      icon: <ScrollText size={18} />,
    },
    {
      to: '/settings',
      label: 'Impostazioni',
      icon: <Settings size={18} />,
    },
  ];

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar panel */}
      <aside
        className={clsx(
          'fixed top-0 left-0 z-30 flex h-full w-64 flex-col bg-gray-900 text-white transition-transform duration-300 ease-in-out',
          'lg:static lg:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center gap-3 border-b border-gray-700 px-5">
          <Linkedin size={22} className="text-blue-400 shrink-0" />
          <span className="text-base font-semibold tracking-tight leading-tight">
            LinkedIn<br />Platform
          </span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                clsx(
                  'group flex items-center justify-between rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:bg-gray-700 hover:text-white'
                )
              }
              onClick={onClose}
            >
              <span className="flex items-center gap-3">
                {item.icon}
                {item.label}
              </span>
              {item.badge !== undefined && (
                <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">
                  {item.badge > 99 ? '99+' : item.badge}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t border-gray-700 px-5 py-3 text-xs text-gray-500">
          v0.0.1 — MVP
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
