'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { Home, MapPin, Fish, BarChart2, MoreHorizontal, Anchor, Mail, X } from 'lucide-react'

const NAV_ITEMS = [
  { label: 'ホーム', Icon: Home,     href: '/',            match: (p: string) => p === '/' },
  { label: 'エリア', Icon: MapPin,   href: '/area/tokyo',  match: (p: string) => p.startsWith('/area') },
  { label: '魚種',   Icon: Fish,     href: '/fish/tachiuo',match: (p: string) => p.startsWith('/fish') },
  { label: '分析',   Icon: BarChart2,href: '/analysis',    match: (p: string) => p.startsWith('/analysis') },
]

const MORE_ITEMS = [
  { label: '船宿', Icon: Anchor, href: '/yado' },
  { label: 'お問い合わせ', Icon: Mail, href: '/contact' },
]

export default function BottomNav() {
  const pathname = usePathname()
  const [moreOpen, setMoreOpen] = useState(false)

  const moreActive = pathname.startsWith('/yado') || pathname.startsWith('/contact')

  return (
    <div className="md:hidden">

      {/* Overlay */}
      {moreOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 199, background: 'rgba(5,10,24,0.5)', backdropFilter: 'blur(4px)' }}
          onClick={() => setMoreOpen(false)}
        />
      )}

      {/* "その他" popup */}
      {moreOpen && (
        <div style={{
          position: 'fixed',
          bottom: 72,
          right: 12,
          zIndex: 210,
          background: 'rgba(10, 22, 44, 0.95)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
          minWidth: 168,
          boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
        }}>
          {MORE_ITEMS.map((item, i) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMoreOpen(false)}
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '14px 20px',
                fontSize: 14, fontWeight: 500,
                color: 'rgba(240,244,255,0.85)',
                borderBottom: i < MORE_ITEMS.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                letterSpacing: '0.02em',
              }}
            >
              <item.Icon size={16} strokeWidth={1.5} style={{ color: 'rgba(240,244,255,0.5)' }} />
              {item.label}
            </Link>
          ))}
        </div>
      )}

      {/* Bottom navigation bar */}
      <nav style={{
        position: 'fixed',
        bottom: 0, left: 0, right: 0,
        zIndex: 200,
        height: 60,
        display: 'flex',
        alignItems: 'stretch',
        background: 'rgba(5, 10, 30, 0.40)',
        backdropFilter: 'blur(48px) saturate(200%)',
        WebkitBackdropFilter: 'blur(48px) saturate(200%)',
        boxShadow: '0 -4px 24px rgba(0,0,0,0.4)',
      }}>
        {NAV_ITEMS.map(({ href, label, Icon, match }) => {
          const active = match(pathname)
          return (
            <Link
              key={href}
              href={href}
              style={{
                flex: 1,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                gap: 3,
                color: active ? '#00F5FF' : 'rgba(200,220,255,0.80)',
                paddingTop: 2,
                position: 'relative',
              }}
            >
              {active && (
                <span style={{
                  position: 'absolute', top: -1, left: '50%', transform: 'translateX(-50%)',
                  width: 28, height: 2, borderRadius: '0 0 4px 4px',
                  background: '#00F5FF',
                  boxShadow: '0 0 12px rgba(0,245,255,0.9), 0 0 24px rgba(0,245,255,0.4)',
                }} />
              )}
              <Icon size={20} strokeWidth={active ? 2 : 1.5} />
              <span style={{ fontSize: 9, fontWeight: active ? 600 : 400, letterSpacing: '0.05em' }}>
                {label}
              </span>
            </Link>
          )
        })}

        {/* その他 */}
        <button
          onClick={() => setMoreOpen(!moreOpen)}
          style={{
            flex: 1,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: 3,
            background: 'none', border: 'none',
            cursor: 'pointer',
            color: (moreActive || moreOpen) ? '#00F5FF' : 'rgba(200,220,255,0.80)',
          }}
        >
          {moreOpen
            ? <X size={20} strokeWidth={1.5} />
            : <MoreHorizontal size={20} strokeWidth={1.5} />
          }
          <span style={{ fontSize: 9, fontWeight: (moreActive || moreOpen) ? 600 : 400, letterSpacing: '0.05em' }}>
            その他
          </span>
        </button>
      </nav>

    </div>
  )
}
