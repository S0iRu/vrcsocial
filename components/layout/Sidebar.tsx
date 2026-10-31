'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { Star, History, LogOut, BarChart3, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { pickUserImageUrl } from '@/lib/vrcFields';

type SidebarUser = {
  displayName?: string;
  icon?: string;
  currentAvatarThumbnailImageUrl?: string;
  userIcon?: string;
  iconUrl?: string;
  profilePicOverride?: string;
  profilePicOverrideThumbnail?: string;
};

const Sidebar = () => {
  const [user, setUser] = useState<SidebarUser | null>(null);
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();

  useEffect(() => {
    const fetchUser = async () => {
      if (typeof window === 'undefined') return;

      try {
        const res = await fetch('/api/user', {
          credentials: 'include'
        });
        if (res.ok) {
          const data: unknown = await res.json();
          if (data && typeof data === 'object') {
            setUser(data as SidebarUser);
          }
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
    if (typeof window !== 'undefined') {
      localStorage.removeItem('vrc_logs');
    }
    window.location.href = '/login';
  };

  const navItems = [
    { icon: Star, label: 'Favorites', shortLabel: 'Favorites', href: '/' },
    { icon: Users, label: 'Group Instances', shortLabel: 'Groups', href: '/groups' },
    { icon: History, label: 'Logs', shortLabel: 'Logs', href: '/logs' },
    { icon: BarChart3, label: 'Graph', shortLabel: 'Graph', href: '/graph' },
  ];

  const avatarUrl = pickUserImageUrl(user);

  return (
    <>
      <aside className="hidden md:flex fixed left-0 top-0 h-screen w-60 bg-[var(--bg)] border-r border-[var(--line)] flex-col z-50 px-6 py-8">
        <Link href="/" className="block">
          <p className="font-display text-[1.7rem] leading-none">VRC</p>
          <p className="kicker mt-2">Social</p>
        </Link>

        <nav className="flex-1 mt-12">
          {navItems.map((item) => {
            const active = item.href === '/' ? pathname === '/' : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 py-3 border-t border-[var(--line)] text-sm tracking-wide transition-colors ${active ? 'text-[var(--fg)]' : 'text-[var(--faint)] hover:text-[var(--fg)]'}`}
            >
              <item.icon className={`w-4 h-4 ${active ? 'text-[#5b9dff]' : ''}`} />
              {item.label}
            </Link>
            );
          })}
        </nav>

        <div className="border-t border-[var(--line)] pt-4 flex items-center gap-3">
          {loading ? (
            <div className="h-10 flex-1 bg-[var(--surface)] animate-pulse"></div>
          ) : (
            <>
              <div className="w-9 h-9 overflow-hidden border border-[var(--line)] shrink-0 flex items-center justify-center text-xs">
                {avatarUrl ? (
                  <Image src={avatarUrl} alt="" width={36} height={36} className="w-full h-full object-cover" unoptimized />
                ) : (
                  'U'
                )}
              </div>
              <div className="overflow-hidden min-w-0 flex-1">
                <p className="text-sm truncate leading-tight">{user?.displayName || 'Guest'}</p>
                <p className="kicker mt-1">{user ? 'Online' : 'Offline'}</p>
              </div>
            </>
          )}
          <button onClick={handleLogout} className="icon-btn shrink-0" title="Log Out">
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </aside>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-[var(--bg)] border-t border-[var(--line)] z-50 flex items-center justify-around px-2">
        {navItems.map((item) => {
          const active = item.href === '/' ? pathname === '/' : pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center justify-center w-full h-full gap-1 text-[10px] tracking-wide ${active ? 'text-[#5b9dff]' : 'text-[var(--faint)]'}`}
          >
            <item.icon className="w-4 h-4" />
            <span>{item.shortLabel}</span>
          </Link>
          );
        })}
      </nav>
    </>
  );
};

export default Sidebar;
