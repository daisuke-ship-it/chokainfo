import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabaseAdmin'
import ShipyardTable from './ShipyardTable'

export const dynamic = 'force-dynamic'

type Shipyard = {
  id: number
  name: string
  url: string
  is_active: boolean
  scrape_config: { handler?: string } | null
  last_scraped_at: string | null
  last_error: string | null
  areas: { name: string } | { name: string }[] | null
}

export default async function ShipyardsAdminPage() {
  const { data: shipyards } = await supabaseAdmin
    .from('shipyards')
    .select('id, name, url, is_active, scrape_config, last_scraped_at, last_error, areas(name)')
    .order('id')

  const list = (shipyards ?? []) as unknown as Shipyard[]
  const total = list.length
  const active = list.filter((s) => s.is_active).length
  const inactive = total - active

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', padding: '24px 20px' }}>
      {/* ヘッダー */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '20px',
        }}
      >
        <h1 style={{ color: 'var(--text)', fontSize: '20px', fontWeight: 500 }}>
          船宿管理
        </h1>
        <Link
          href="/admin/shipyards/new"
          style={{
            background: 'var(--accent)',
            color: '#050A18',
            padding: '8px 16px',
            borderRadius: '8px',
            fontSize: '13px',
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          + 新規追加
        </Link>
      </div>

      {/* 統計バッジ */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', flexWrap: 'wrap' }}>
        {[
          { label: '全件', count: total, color: 'var(--text-sub)' },
          { label: 'アクティブ', count: active, color: '#4ade80' },
          { label: '非アクティブ', count: inactive, color: 'var(--text-muted)' },
        ].map(({ label, count, color }) => (
          <div
            key={label}
            style={{
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid var(--border-strong)',
              borderRadius: '8px',
              padding: '6px 14px',
              fontSize: '13px',
              color,
            }}
          >
            {label}: <strong>{count}</strong>
          </div>
        ))}
      </div>

      <ShipyardTable shipyards={list} />
    </div>
  )
}
