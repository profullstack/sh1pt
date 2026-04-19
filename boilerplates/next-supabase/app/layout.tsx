import type { ReactNode } from 'react';

export const metadata = { title: 'sh1pt · next + supabase' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
