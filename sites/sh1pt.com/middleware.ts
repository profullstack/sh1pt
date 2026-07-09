import { NextResponse, type NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const host = request.headers.get('host');
  if (host && host.startsWith('www.')) {
    const url = new URL(request.url);
    url.hostname = host.slice(4).split(':')[0];
    url.port = '';
    url.protocol = 'https:';
    return NextResponse.redirect(url, 308);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
