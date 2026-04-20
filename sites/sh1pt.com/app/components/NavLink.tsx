'use client';

import { usePathname } from 'next/navigation';
import type { AnchorHTMLAttributes, ReactNode } from 'react';

type NavLinkProps = AnchorHTMLAttributes<HTMLAnchorElement> & {
  href: string;
  children: ReactNode;
  matchPrefix?: boolean;
};

export default function NavLink({ href, children, matchPrefix, className, ...rest }: NavLinkProps) {
  const pathname = usePathname() ?? '';
  const cleanHref = href.split('#')[0].split('?')[0];
  const isExternal = href.startsWith('http');
  const isHashOnly = href.startsWith('#') || cleanHref === '';

  let active = false;
  if (!isExternal && !isHashOnly) {
    if (cleanHref === '/') {
      active = pathname === '/';
    } else if (matchPrefix) {
      active = pathname === cleanHref || pathname.startsWith(`${cleanHref}/`);
    } else {
      active = pathname === cleanHref;
    }
  }

  const composed = ['nav-link', active ? 'is-active' : '', className ?? ''].filter(Boolean).join(' ');
  return (
    <a href={href} className={composed} {...rest}>
      {children}
    </a>
  );
}
