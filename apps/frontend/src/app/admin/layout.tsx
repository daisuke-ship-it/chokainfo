import React from 'react'
import Link from 'next/link'
import LogoutButton from './LogoutButton'

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 20px',
          borderBottom: '1px solid var(--border-strong)',
          background: 'rgba(5, 10, 24, 0.90)',
          backdropFilter: 'blur(10px)',
          position: 'sticky',
          top: 0,
          zIndex: 100,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <span style={{ color: 'var(--text)', fontWeight: 500, fontSize: '15px' }}>
            ⚙ 管理画面
          </span>
          <nav style={{ display: 'flex', gap: '4px' }}>
            <Link
              href="/admin/shipyards"
              style={{
                color: 'var(--text-muted)',
                fontSize: '13px',
                padding: '4px 12px',
                borderRadius: '6px',
                textDecoration: 'none',
                border: '1px solid transparent',
              }}
            >
              船宿管理
            </Link>
            <Link
              href="/admin/master"
              style={{
                color: 'var(--text-muted)',
                fontSize: '13px',
                padding: '4px 12px',
                borderRadius: '6px',
                textDecoration: 'none',
                border: '1px solid transparent',
              }}
            >
              マスター管理
            </Link>
            <Link
              href="/admin/anomalies"
              style={{
                color: 'var(--text-muted)',
                fontSize: '13px',
                padding: '4px 12px',
                borderRadius: '6px',
                textDecoration: 'none',
                border: '1px solid transparent',
              }}
            >
              異常値
            </Link>
          </nav>
        </div>
        <LogoutButton />
      </header>
      <main>{children}</main>
    </div>
  )
}
