import { NextRequest, NextResponse } from 'next/server'

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // /admin (login page) and /api/admin/auth are exempt
  if (pathname === '/admin' || pathname.startsWith('/api/admin/auth')) {
    return NextResponse.next()
  }

  const token = request.cookies.get('admin_token')?.value
  const adminPassword = process.env.ADMIN_PASSWORD

  if (!adminPassword || token !== adminPassword) {
    const loginUrl = new URL('/admin', request.url)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/admin/:path+', '/api/admin/:path*'],
}
