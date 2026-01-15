'use client';

import Link from 'next/link';
import { Star, History, LogOut, BarChart3 } from 'lucide-react';
import { useEffect, useState } from 'react';

const Sidebar = () => {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      if (typeof window === 'undefined') return;

      try {
        // Authentication handled via httpOnly cookies
        const res = await fetch('/api/user', {
          credentials: 'include'
        });
        if (res.ok) {
          const data = await res.json();
          setUser(data);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    fetchUser();
  }, []);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch (e) {
      console.error('Logout error:', e);
    }
    // Clear any remaining localStorage data
    if (typeof window !== 'undefined') {
      localStorage.removeItem('vrc_logs');
    }
    window.location.href = '/login';
  };

  const navItems = [
    { icon: Star, label: 'Favorites', href: '/' },
    { icon: History, label: 'Logs', href: '/logs' },
    { icon: BarChart3, label: 'Graph', href: '/graph' },
  ];

  return (
    <>
      <aside className="hidden md:flex fixed left-0 top-0 h-screen w-64 glass border-r border-white/5 flex-col z-50">
        <div className="p-6">
          <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-cyan-400">
            VRC Social
          </h1>
          <p className="text-xs text-muted-foreground mt-1">Companion App</p>
        </div>

        <nav className="flex-1 px-4 space-y-2 mt-4">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-xl text-slate-300 hover:text-white hover:bg-white/5 transition-all duration-200 group"
            >
              <item.icon className="w-5 h-5 text-indigo-400 group-hover:text-cyan-400 transition-colors" />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-white/5">
          <div className="glass-card p-3 rounded-xl flex items-center gap-3 relative pr-10">
            {loading ? (
              <>
                <div className="w-10 h-10 rounded-full bg-slate-700 animate-pulse shrink-0"></div>
                <div className="overflow-hidden min-w-0 flex-1">
                  <div className="h-4 bg-slate-700 rounded animate-pulse w-24"></div>
                  <div className="h-3 bg-slate-700 rounded animate-pulse w-16 mt-1.5"></div>
                </div>
              </>
            ) : (
              <>
                <div className="w-10 h-10 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-bold overflow-hidden shadow-sm border border-white/10 shrink-0">
                  {user?.currentAvatarThumbnailImageUrl ? (
                    <img src={user.currentAvatarThumbnailImageUrl} alt="User" className="w-full h-full object-cover" />
                  ) : (
                    'U'
                  )}
                </div>
                <div className="overflow-hidden min-w-0">
                  <p className="text-sm font-medium text-white truncate leading-tight">{user?.displayName || 'Guest'}</p>
                  <p className="text-xs text-green-400 truncate mt-0.5">{user ? 'Online' : 'Offline'}</p>
                </div>
              </>
            )}

            <button
              onClick={handleLogout}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-slate-400 hover:text-rose-400 hover:bg-white/5 rounded-lg transition-colors"
              title="Log Out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 glass border-t border-white/5 z-50 flex items-center justify-around px-2 pb-safe bg-[#0f172a]/90 backdrop-blur-xl">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="flex flex-col items-center justify-center w-full h-full text-slate-400 hover:text-indigo-400 transition-colors gap-1"
          >
            <item.icon className="w-5 h-5" />
            <span className="text-[10px] font-medium">{item.label}</span>
          </Link>
        ))}
      </nav>
    </>
  );
};

export default Sidebar;
