'use client'

import { CatchRecord, CatchDetail } from '@/lib/supabase'

/* ── Badge definitions ─────────────────────────────────────── */
const AREA_STYLE   = { bg: 'rgba(0,245,255,0.10)',  color: 'rgba(160,200,255,0.90)' }
const FISH_STYLE   = { bg: 'rgba(0,245,255,0.08)',  color: 'rgba(140,185,255,0.80)' }

const METHOD_STYLE: Record<string, { bg: string; color: string }> = {
  'テンヤ':   { bg: 'rgba(74,222,128,0.08)',  color: '#4ade80' },
  'ルアー':   { bg: 'rgba(0,245,255,0.10)',  color: '#00F5FF' },
  'ジギング': { bg: 'rgba(0,245,255,0.10)',  color: '#00F5FF' },
  '餌':       { bg: 'rgba(251,146,60,0.08)',  color: '#fb923c' },
  'エサ':     { bg: 'rgba(251,146,60,0.08)',  color: '#fb923c' },
  'テンビン': { bg: 'rgba(251,146,60,0.08)',  color: '#fb923c' },
  '天秤':     { bg: 'rgba(251,146,60,0.08)',  color: '#fb923c' },
}
const METHOD_DEFAULT = { bg: 'rgba(255,255,255,0.06)', color: 'rgba(240,244,255,0.45)' }

function Badge({ label, bg, color }: { label: string; bg: string; color: string }) {
  return (
    <span style={{
      padding: '3px 10px', fontSize: 10, fontWeight: 600,
      borderRadius: 'var(--radius-pill)',
      background: bg, color,
      whiteSpace: 'nowrap',
      letterSpacing: '0.04em',
    }}>
      {label}
    </span>
  )
}

/* ── Formatters ─────────────────────────────────────────────── */
function formatCatch(min: number | null, max: number | null): string {
  if (min === null && max === null) return '—'
  const lo = min ?? max!
  const hi = max ?? min!
  return `${lo}〜${hi}本`
}

function formatSize(min: number | null, max: number | null): string {
  if (min === null && max === null) return '—'
  const lo = min ?? max!
  const hi = max ?? min!
  return `${lo}〜${hi}cm`
}

function normalizeSizeText(text: string): string {
  const unit = /kg/i.test(text) ? 'kg' : 'cm'
  const stripped = text.replace(/\s*cm/gi, '').replace(/\s*kg/gi, '').replace(/\s*センチ/g, '').replace(/[~\-–〜～]/g, '〜').trim()
  return stripped ? stripped + unit : ''
}

function formatDate(s: string | null): string {
  if (!s) return '—'
  const d = new Date(s)
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}

type Props = { records: CatchRecord[] }

export default function CatchCards({ records }: Props) {
  if (records.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-muted)', fontSize: 14 }}>
        <p style={{ fontSize: 28, marginBottom: 8 }}>🎣</p>
        条件に一致するデータがありません
      </div>
    )
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
      gap: 16,
      padding: '4px 0',
    }}>
      {records.map((r) => {
        const methodStyle = r.fishing_method
          ? (METHOD_STYLE[r.fishing_method] ?? METHOD_DEFAULT)
          : null
        const condText = r.condition_text
          ? (r.condition_text.length > 100 ? r.condition_text.slice(0, 100) + '…' : r.condition_text)
          : null

        return (
          <div key={r.id} style={{
            background: 'rgba(255,255,255,0.05)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid rgba(255,255,255,0.12)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.40)',
            padding: '20px 20px 16px',
            display: 'flex', flexDirection: 'column', gap: 0,
          }}>
            {/* Header: 船宿名 + 日付 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div style={{ flex: 1, marginRight: 8 }}>
                <p style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-main)', lineHeight: 1.3, letterSpacing: '0.02em' }}>
                  {r.shipyard_name ?? '—'}
                </p>
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0, paddingTop: 1, letterSpacing: '0.03em' }}>
                {formatDate(r.date)}
              </span>
            </div>

            {/* Badges */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
              {r.shipyard_area && (
                <Badge label={r.shipyard_area} bg={AREA_STYLE.bg} color={AREA_STYLE.color} />
              )}
              {r.port_name && (
                <Badge label={r.port_name} bg={AREA_STYLE.bg} color={AREA_STYLE.color} />
              )}
              {r.boat_name && (
                <Badge label={r.boat_name} bg="rgba(255,255,255,0.06)" color="rgba(200,220,240,0.65)" />
              )}
              {r.fish_name && (
                <Badge label={r.fish_name} bg={FISH_STYLE.bg} color={FISH_STYLE.color} />
              )}
              {r.fishing_method && methodStyle && (
                <Badge label={r.fishing_method} bg={methodStyle.bg} color={methodStyle.color} />
              )}
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: 'var(--border)', marginBottom: 16 }} />

            {/* Stats */}
            {r.catch_details.length > 0 ? (() => {
              const map = new Map<string, { min: number; max: number; unit: string; size_text: string | null }>()
              for (const d of r.catch_details) {
                if (d.count === null) continue
                const key = d.species_name ?? '—'
                const cur = map.get(key)
                map.set(key, cur
                  ? { ...cur, min: Math.min(cur.min, d.count), max: Math.max(cur.max, d.count) }
                  : { min: d.count, max: d.count, unit: d.unit ?? '尾', size_text: d.size_text ?? null }
                )
              }
              const agg = [...map.entries()].map(([name, v]) => ({ name, ...v }))
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {agg.map(({ name, min, max, unit, size_text }) => {
                    // catch_detailsは1種1レコード(count=max値のみ)が多いため、
                    // 親レコードのcount_minをレンジ下限として補完する
                    const lo = (r.count_min !== null && r.count_min < max) ? r.count_min : min
                    return (
                    <div key={name} style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 56, flexShrink: 0, letterSpacing: '0.02em' }}>
                        {name}
                      </span>
                      <span style={{ fontSize: 16, fontWeight: 700, color: '#00F5FF', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em' }}>
                        {lo === max ? `${max}` : `${lo}〜${max}`}
                      </span>
                      {size_text && (
                        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-sub)', fontVariantNumeric: 'tabular-nums' }}>
                          {normalizeSizeText(size_text)}
                        </span>
                      )}
                    </div>
                  )})}

                </div>
              )
            })() : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 44, letterSpacing: '0.02em' }}>釣果</span>
                  <span style={{ fontSize: 17, fontWeight: 700, color: '#00F5FF', fontVariantNumeric: 'tabular-nums' }}>
                    {formatCatch(r.count_min, r.count_max)}
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', minWidth: 44, letterSpacing: '0.02em' }}>サイズ</span>
                  <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-sub)', fontVariantNumeric: 'tabular-nums' }}>
                    {formatSize(r.size_min_cm, r.size_max_cm)}
                  </span>
                </div>
              </div>
            )}

            {/* 船長コメント */}
            {condText && (
              <div style={{
                marginTop: 16,
                background: 'rgba(0,245,255,0.05)',
                border: '1px solid rgba(0,245,255,0.15)',
                borderRadius: 'var(--radius-md)',
                padding: '10px 12px',
              }}>
                <p style={{ fontSize: 10, color: 'rgba(0,245,255,0.55)', marginBottom: 5, letterSpacing: '0.06em' }}>💬 船長コメント</p>
                <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.65 }}>
                  {condText}
                </p>
              </div>
            )}

            {/* 記事リンク */}
            {r.source_url && (
              <a href={r.source_url} target="_blank" rel="noopener noreferrer"
                style={{ display: 'block', textAlign: 'right', fontSize: 11, color: 'rgba(0,245,255,0.75)', marginTop: 14, letterSpacing: '0.03em' }}>
                記事を見る ↗
              </a>
            )}
          </div>
        )
      })}
    </div>
  )
}
