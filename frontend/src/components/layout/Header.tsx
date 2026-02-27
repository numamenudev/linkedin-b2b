import React, { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, Settings, Menu, MessageSquare } from 'lucide-react';
import { clsx } from 'clsx';
import { useAuth } from '@/hooks/useAuth';

interface HeaderProps {
  /** Count of new responses — shown as a badge */
  responseCount?: number;
  /** Called when the hamburger button is clicked (mobile) */
  onMenuToggle?: () => void;
}

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/agents': 'Agenti',
  '/prospects': 'Prospect',
  '/analytics': 'Analytics',
  '/logs': 'Log',
  '/settings': 'Impostazioni',
  '/identities': 'Identità',
};

function getPageTitle(pathname: string): string {
  // Exact match first
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];

  // Partial prefix match (e.g. /agents/123)
  for (const [path, title] of Object.entries(PAGE_TITLES)) {
    if (pathname.startsWith(path + '/')) return title;
  }

  return 'LinkedIn Platform';
}

function UserMenu({ onLogout }: { onLogout: () => void }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const initial = user?.email?.[0]?.toUpperCase() ?? 'U';

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
        aria-label="User menu"
        aria-expanded={open}
        aria-haspopup="true"
      >
        {initial}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-52 origin-top-right rounded-md border border-gray-200 bg-white shadow-lg z-50">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-xs text-gray-500">Connesso come</p>
            <p className="truncate text-sm font-medium text-gray-800">
              {user?.email ?? '—'}
            </p>
          </div>
          <div className="py-1">
            <button
              onClick={() => {
                setOpen(false);
                onLogout();
              }}
              className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              Disconnetti
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function Header({ responseCount = 0, onMenuToggle }: HeaderProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();

  const title = getPageTitle(location.pathname);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-gray-200 bg-white px-4 shadow-sm">
      {/* Left side: hamburger (mobile) + page title */}
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuToggle}
          className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors lg:hidden"
          aria-label="Toggle sidebar"
        >
          <Menu size={20} />
        </button>

        <h1 className="text-lg font-semibold text-gray-800">{title}</h1>

        {/* Responses badge */}
        {responseCount > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
            <MessageSquare size={12} />
            {responseCount} {responseCount === 1 ? 'risposta' : 'risposte'}
          </span>
        )}
      </div>

      {/* Right side: notifications + settings + user */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate('/logs')}
          className={clsx(
            'relative rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors',
          )}
          aria-label="Notifiche"
        >
          <Bell size={20} />
          {responseCount > 0 && (
            <span className="absolute right-0.5 top-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" />
          )}
        </button>

        <button
          onClick={() => navigate('/settings')}
          className="rounded-md p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
          aria-label="Impostazioni"
        >
          <Settings size={20} />
        </button>

        <div className="mx-1 h-5 w-px bg-gray-200" />

        <UserMenu onLogout={handleLogout} />
      </div>
    </header>
  );
}

export default Header;
