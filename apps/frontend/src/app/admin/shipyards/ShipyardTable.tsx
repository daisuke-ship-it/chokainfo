'use client'

import { useState } from 'react'
import Link from 'next/link'

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

const HANDLER_COLORS: Record<string, { bg: string; color: string }> = {
  gyosan: { bg: 'rgba(59,130,246,0.20)', color: '#60a5fa' },
  wordpress: { bg: 'rgba(34,197,94,0.20)', color: '#4ade80' },
  blogphp: { bg: 'rgba(251,146,60,0.20)', color: '#fb923c' },
  claude: { bg: 'rgba(168,85,247,0.20)', color: '#c084fc' },
  rss: { bg: 'rgba(234,179,8,0.20)', color: '#fbbf24' },
}

const HANDLER_FILTERS = ['all', 'active', 'inactive', 'gyosan', 'wordpress', 'blogphp', 'claude'] as const
type HandlerFilter = typeof HANDLER_FILTERS[number]

function getAreaName(s: Shipyard): string {
  if (!s.areas) return ''
  if (Array.isArray(s.areas)) return s.areas[0]?.name ?? ''
  return s.areas.name ?? ''
}

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return '未取得'
  const diff = Date.now() - new Date(dateStr).getTime()
  const hours = Math.floor(diff / 3600000)
  if (hours < 1) return '1時間以内'
  if (hours < 24) return `${hours}時間前`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}日前`
  return `${Math.floor(days / 30)}ヶ月前`
}

function HandlerBadge({ handler }: { handler?: string }) {
  const h = handler ?? 'claude'
  const style = HANDLER_COLORS[h] ?? HANDLER_COLORS.claude
  return (
    <span
      style={{
        display: 'inline-block',
        background: style.bg,
        color: style.color,
        padding: '2px 8px',
        borderRadius: '100px',
        fontSize: '11px',
        fontWeight: 600,
      }}
    >
      {h}
    </span>
  )
}

export default function ShipyardTable({ shipyards }: { shipyards: Shipyard[] }) {
  const [filter, setFilter] = useState<HandlerFilter>('all')
  const [areaFilter, setAreaFilter] = useState<string>('all')
  const [toggleStates, setToggleStates] = useState<Record<number, boolean>>({})

  const isActive = (s: Shipyard) =>
    s.id in toggleStates ? toggleStates[s.id] : s.is_active

  // エリア一覧を動的に生成
  const areas = Array.from(new Set(shipyards.map(getAreaName).filter(Boolean))).sort()

  const filtered = shipyards.filter((s) => {
    if (filter === 'active' && !isActive(s)) return false
    if (filter === 'inactive' && isActive(s)) return false
    if (filter !== 'all' && filter !== 'active' && filter !== 'inactive') {
      if ((s.scrape_config?.handler ?? 'claude') !== filter) return false
    }
    if (areaFilter !== 'all' && getAreaName(s) !== areaFilter) return false
    return true
  })

  async function toggleActive(shipyard: Shipyard) {
    const newVal = !isActive(shipyard)
    setToggleStates((prev) => ({ ...prev, [shipyard.id]: newVal }))
    try {
      await fetch(`/api/admin/shipyards/${shipyard.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: newVal }),
      })
    } catch {
      // revert on error
      setToggleStates((prev) => ({ ...prev, [shipyard.id]: !newVal }))
    }
  }

  return (
    <>
      {/* エリアフィルター */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginRight: '2px' }}>エリア</span>
        {(['all', ...areas]).map((a) => (
          <button
            key={a}
            onClick={() => setAreaFilter(a)}
            style={{
              background: areaFilter === a ? 'rgba(0,212,200,0.15)' : 'rgba(255,255,255,0.05)',
              color: areaFilter === a ? '#00d4c8' : 'var(--text-muted)',
              border: '1px solid',
              borderColor: areaFilter === a ? 'rgba(0,212,200,0.5)' : 'var(--border-strong)',
              borderRadius: '100px',
              padding: '4px 12px',
              fontSize: '12px',
              cursor: 'pointer',
              fontWeight: areaFilter === a ? 600 : 400,
            }}
          >
            {a === 'all' ? 'すべて' : a}
          </button>
        ))}
      </div>

      {/* ハンドラー/ステータスフィルター */}
      <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginRight: '2px' }}>絞込</span>
        {HANDLER_FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              background: filter === f ? 'var(--accent)' : 'rgba(255,255,255,0.05)',
              color: filter === f ? '#050A18' : 'var(--text-muted)',
              border: '1px solid',
              borderColor: filter === f ? 'var(--accent)' : 'var(--border-strong)',
              borderRadius: '100px',
              padding: '4px 12px',
              fontSize: '12px',
              cursor: 'pointer',
              fontWeight: filter === f ? 600 : 400,
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {/* テーブル */}
      <div
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid var(--border-strong)',
          borderRadius: '12px',
          overflow: 'hidden',
        }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-strong)' }}>
                {['船宿名', 'エリア', 'URL', 'ハンドラー', '最終取得', '有効', '操作'].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: '10px 14px',
                      textAlign: 'left',
                      color: 'var(--text-muted)',
                      fontWeight: 500,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr
                  key={s.id}
                  style={{
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    opacity: isActive(s) ? 1 : 0.55,
                  }}
                >
                  <td style={{ padding: '10px 14px' }}>
                    <Link
                      href={`/admin/shipyards/${s.id}`}
                      style={{ color: 'var(--accent)', textDecoration: 'none' }}
                    >
                      {s.name}
                    </Link>
                    {s.last_error && (
                      <span
                        style={{
                          marginLeft: '6px',
                          color: '#ff6b6b',
                          fontSize: '11px',
                        }}
                        title={s.last_error}
                      >
                        ⚠
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {getAreaName(s) || '—'}
                  </td>
                  <td style={{ padding: '10px 14px', color: 'var(--text-muted)', maxWidth: '200px' }}>
                    <span
                      style={{
                        display: 'block',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                      title={s.url}
                    >
                      {s.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                    </span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <HandlerBadge handler={s.scrape_config?.handler} />
                  </td>
                  <td
                    style={{
                      padding: '10px 14px',
                      color: 'var(--text-muted)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {relativeTime(s.last_scraped_at)}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <button
                      onClick={() => toggleActive(s)}
                      title={isActive(s) ? '無効にする' : '有効にする'}
                      style={{
                        width: '40px',
                        height: '22px',
                        borderRadius: '100px',
                        border: 'none',
                        background: isActive(s) ? 'var(--accent)' : 'rgba(255,255,255,0.12)',
                        cursor: 'pointer',
                        position: 'relative',
                        transition: 'background 0.2s',
                        flexShrink: 0,
                      }}
                    >
                      <span
                        style={{
                          position: 'absolute',
                          top: '3px',
                          left: isActive(s) ? '21px' : '3px',
                          width: '16px',
                          height: '16px',
                          borderRadius: '50%',
                          background: isActive(s) ? '#050A18' : 'rgba(255,255,255,0.5)',
                          transition: 'left 0.2s',
                        }}
                      />
                    </button>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <Link
                      href={`/admin/shipyards/${s.id}`}
                      style={{
                        color: 'var(--text-muted)',
                        fontSize: '12px',
                        border: '1px solid var(--border-strong)',
                        borderRadius: '6px',
                        padding: '4px 10px',
                        textDecoration: 'none',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      編集
                    </Link>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}
                  >
                    該当する船宿がありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
