import React from 'react'
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
        <span style={{ color: 'var(--text)', fontWeight: 500, fontSize: '15px' }}>
          ⚙ 管理画面
        </span>
        <LogoutButton />
      </header>
      <main>{children}</main>
    </div>
  )
}
