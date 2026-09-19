'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/', label: 'Chat', icon: '💬' },
  { href: '/settings', label: 'Settings', icon: '⚙️' },
  { href: '/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/history', label: 'History', icon: '🕐' },
];

export default function SidebarNav() {
  const pathname = usePathname();
  const router = useRouter();

  const handleNewChat = () => {
    // Navigate to chat and signal new conversation
    router.push('/?new=1');
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <div className="logo-icon">⚡</div>
        <div>
          <div className="logo-text">AI Router</div>
          <div className="logo-sub">Unified Model Gateway</div>
        </div>
      </div>

      <nav className="nav-section">
        <div className="nav-label">Navigation</div>
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`nav-item ${pathname === item.href ? 'active' : ''}`}
          >
            <span className="nav-icon">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="sidebar-footer">
        <button className="new-chat-btn" onClick={handleNewChat} id="new-chat-btn">
          <span>＋</span>
          New Chat
        </button>
      </div>
    </aside>
  );
}
