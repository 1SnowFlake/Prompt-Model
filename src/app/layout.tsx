import type { Metadata } from 'next';
import './globals.css';
import SidebarNav from '@/components/shared/SidebarNav';

export const metadata: Metadata = {
  title: 'AI Model Router',
  description: 'Unified AI Model Router — intelligently routes prompts to the best AI provider',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">
          <SidebarNav />
          <div className="page-content">{children}</div>
        </div>
      </body>
    </html>
  );
}
