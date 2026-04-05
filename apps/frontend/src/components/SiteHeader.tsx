'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

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
        color: active ? 'var(--color-cyan)' : 'var(--text-secondary)',
        padding: '5px 10px',
        borderRadius: 'var(--radius-pill)',
        background: active ? 'var(--color-cyan-dim)' : 'transparent',
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
    <div
      style={{ position: 'relative' }}
      onMouseEnter={onOpen}
      onMouseLeave={onClose}
    >
      <div
        onClick={() => (open ? onClose() : onOpen())}
        style={{
          display: 'flex', alignItems: 'center', gap: 3,
          fontSize: 13,
          fontWeight: active ? 600 : 400,
          color: active ? 'var(--color-cyan)' : 'var(--text-secondary)',
          padding: '5px 10px',
          borderRadius: 'var(--radius-pill)',
          background: active ? 'var(--color-cyan-dim)' : 'transparent',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          letterSpacing: '0.02em',
        }}
      >
        {label}
        <ChevronDown size={11} strokeWidth={1.5} style={{ opacity: 0.5 }} />
      </div>
      {open && (
        <>
          {/* ギャップを埋める透明ブリッジ */}
          <div style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            width: '100%',
            height: 8,
          }} />
          <div style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
          background: 'rgba(8, 18, 38, 0.95)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
          minWidth: 120,
          boxShadow: 'var(--shadow-float)',
          zIndex: 200,
        }}>
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={onClose}
              style={{
                display: 'block',
                padding: '9px 16px',
                fontSize: 13,
                color: 'var(--text-secondary)',
                letterSpacing: '0.02em',
              }}
            >
              {item.label}
            </Link>
          ))}
          </div>
        </>
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
      background: 'rgba(4, 8, 16, 0.85)',
      backdropFilter: 'blur(24px) saturate(180%)',
      WebkitBackdropFilter: 'blur(24px) saturate(180%)',
      borderBottom: '1px solid var(--border-subtle)',
    }}>
      <div className="page-container" style={{
        display: 'flex', alignItems: 'center', height: 56, gap: 16,
      }}>
        {/* Logo */}
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 10,
            background: 'linear-gradient(135deg, rgba(56,189,248,0.18) 0%, rgba(56,189,248,0.08) 100%)',
            border: '1px solid rgba(56,189,248,0.30)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <svg width="18" height="18" viewBox="0 0 32 20" fill="none">
              <path d="M4 10 L10 3 L10 17 Z" fill="#38BDF8" opacity="0.9" />
              <ellipse cx="19" cy="10" rx="11" ry="7" fill="#38BDF8" opacity="0.85" />
              <path d="M14 3 Q19 1 24 4 L22 7 Q19 5 14 7 Z" fill="white" opacity="0.4" />
              <circle cx="27" cy="9" r="1.5" fill="white" />
            </svg>
          </div>
          <div>
            <span style={{
              fontSize: 16, fontWeight: 700, color: 'var(--text-primary)',
              letterSpacing: '0.04em',
              fontFamily: 'var(--font-serif)',
            }}>
              釣果情報<span style={{ color: 'var(--color-cyan)' }}>.com</span>
            </span>
            <span style={{
              display: 'block', fontSize: 9,
              color: 'var(--text-muted)', lineHeight: 1, marginTop: 1,
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
            fontSize: 11, color: 'var(--text-secondary)',
            marginLeft: 'auto', flexShrink: 0,
          }}>
            <span style={{
              width: 5, height: 5, borderRadius: '50%',
              background: 'var(--color-cyan)', display: 'inline-block',
              boxShadow: '0 0 6px rgba(56,189,248,0.70)',
            }} />
            <span className="data-value">{updatedAt}</span>
          </div>
        )}
      </div>
    </header>
  )
}
