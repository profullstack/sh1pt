import { gate } from "@/lib/crawl-gateway";
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  // Crawl gateway first: AI training crawlers get 402 Payment Required (or the
  // sales page at /crawl) unless they present a paid pass. People, Googlebot
  // and retrieval crawlers fall through to everything below.
  const answer = await gate(request);
  if (answer) return answer;

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
