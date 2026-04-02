'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { Home, Map, Fish, TrendingUp, Anchor, ChevronDown, Circle } from 'lucide-react'

const AREAS = [
  { label: '東京湾', href: '/area/tokyo' },
  { label: '相模湾', href: '/area/sagami' },
  { label: '外房',   href: '/area/sotobo' },
  { label: '南房',   href: '/area/minamibo' },
]

const FISH = [
  { label: 'タチウオ', href: '/fish/tachiuo' },
  { label: 'アジ',     href: '/fish/aji' },
  { label: 'シーバス', href: '/fish/seabass' },
  { label: 'サワラ',   href: '/fish/sawara' },
  { label: 'トラフグ', href: '/fish/torafugu' },
  { label: 'マダイ',   href: '/fish/madai' },
  { label: 'ヒラメ',   href: '/fish/hirame' },
  { label: 'シロギス', href: '/fish/shirogisu' },
]

type Props = { updatedAt?: string; subtitle?: string }

function NavLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      style={{
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        color: active ? '#00F5FF' : 'rgba(240,244,255,0.55)',
        padding: '6px 12px',
        borderRadius: 'var(--radius-pill)',
        background: active ? 'rgba(0,245,255,0.10)' : 'transparent',
        whiteSpace: 'nowrap',
        letterSpacing: '0.02em',
      }}
    >
      {children}
    </Link>
  )
}

function DropdownNav({
  label, active, items, open, onOpen, onClose,
}: {
  label: string
  active: boolean
  items: { label: string; href: string }[]
  open: boolean
  onOpen: () => void
  onClose: () => void
}) {
  return (
    <div style={{ position: 'relative' }} onMouseEnter={onOpen} onMouseLeave={onClose}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 3,
        fontSize: 13,
        fontWeight: active ? 600 : 400,
        color: active ? '#00F5FF' : 'rgba(240,244,255,0.55)',
        padding: '6px 12px',
        borderRadius: 'var(--radius-pill)',
        background: active ? 'rgba(0,245,255,0.10)' : 'transparent',
        cursor: 'default',
        whiteSpace: 'nowrap',
        letterSpacing: '0.02em',
      }}>
        {label}
        <ChevronDown size={12} strokeWidth={1.5} style={{ opacity: 0.6 }} />
      </div>
      {open && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 8px)',
          left: 0,
          background: 'rgba(10, 26, 50, 0.92)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid rgba(255,255,255,0.10)',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
          minWidth: 120,
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          zIndex: 200,
        }}>
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              style={{
                display: 'block',
                padding: '10px 18px',
                fontSize: 13,
                color: 'rgba(240,244,255,0.8)',
                letterSpacing: '0.02em',
              }}
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

export default function SiteHeader({ updatedAt, subtitle = '関東圏' }: Props) {
  const pathname = usePathname()
  const [openMenu, setOpenMenu] = useState<'area' | 'fish' | null>(null)

  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 100,
      background: 'rgba(5, 10, 24, 0.80)',
      backdropFilter: 'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)',
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      boxShadow: '0 4px 32px rgba(0,0,0,0.4)',
    }}>
      <div className="page-container" style={{ display: 'flex', alignItems: 'center', height: 62, gap: 20 }}>

        {/* Logo */}
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 'var(--radius-md)',
            background: 'linear-gradient(135deg, rgba(0,245,255,0.20) 0%, rgba(0,245,255,0.10) 100%)',
            border: '1px solid rgba(0,245,255,0.40)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            boxShadow: '0 0 16px rgba(0,245,255,0.20)',
          }}>
            <svg width="20" height="20" viewBox="0 0 32 20" fill="none">
              <path d="M4 10 L10 3 L10 17 Z" fill="#00F5FF" opacity="0.9" />
              <ellipse cx="19" cy="10" rx="11" ry="7" fill="#00F5FF" opacity="0.85" />
              <path d="M14 3 Q19 1 24 4 L22 7 Q19 5 14 7 Z" fill="white" opacity="0.4" />
              <circle cx="27" cy="9" r="1.5" fill="white" />
            </svg>
          </div>
          <div>
            <span style={{
              fontSize: 18, fontWeight: 700, color: 'white',
              letterSpacing: '0.04em',
              fontFamily: 'var(--font-serif)',
            }}>
              釣果情報<span style={{ color: '#00F5FF' }}>.com</span>
            </span>
            <span style={{
              display: 'block', fontSize: 10,
              color: 'rgba(240,244,255,0.35)', lineHeight: 1, marginTop: 2,
              letterSpacing: '0.08em',
            }}>
              {subtitle}
            </span>
          </div>
        </Link>

        {/* PC Nav */}
        <nav className="hidden md:flex" style={{ alignItems: 'center', gap: 2 }}>
          <NavLink href="/" active={pathname === '/'}>ホーム</NavLink>
          <DropdownNav
            label="エリア"
            active={pathname.startsWith('/area')}
            items={AREAS}
            open={openMenu === 'area'}
            onOpen={() => setOpenMenu('area')}
            onClose={() => setOpenMenu(null)}
          />
          <DropdownNav
            label="魚種"
            active={pathname.startsWith('/fish')}
            items={FISH}
            open={openMenu === 'fish'}
            onOpen={() => setOpenMenu('fish')}
            onClose={() => setOpenMenu(null)}
          />
          <NavLink href="/yado" active={pathname.startsWith('/yado')}>船宿</NavLink>
          <NavLink href="/analysis" active={pathname.startsWith('/analysis')}>分析</NavLink>
        </nav>

        {/* Updated at */}
        {updatedAt && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: '0.75rem', color: '#00d4c8',
            marginLeft: 'auto', flexShrink: 0,
            letterSpacing: '0.03em',
          }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: '#00F5FF', display: 'inline-block',
              boxShadow: '0 0 8px rgba(0,245,255,0.80)',
            }} />
            <span>更新: {updatedAt}</span>
          </div>
        )}

      </div>
    </header>
  )
}
