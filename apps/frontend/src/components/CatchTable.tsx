'use client'

import { CatchRecord, CatchDetail } from '@/lib/supabase'

export type SortField = 'count' | 'size' | null

type Props = {
  records: CatchRecord[]
  sortField: SortField
  onSort: (f: SortField) => void
  sizeUnit?: 'cm' | 'kg'
}

// 釣り方グループ別 行背景色
const GROUP_ROW_BG: Record<string, string> = {
  'ルアー': 'rgba(0,245,255,0.05)',
  'テンヤ': 'rgba(74,222,128,0.04)',
  'エサ':   'rgba(251,146,60,0.04)',
}
const GROUP_ROW_BG_DEFAULT = 'transparent'

// 釣り方グループ別 左ボーダー色
const GROUP_BORDER: Record<string, string> = {
  'ルアー': '#00F5FF',
  'テンヤ': '#22c55e',
  'エサ':   '#f97316',
}

// fishing_method 文字列 → グループ名（method_group が null の場合のフォールバック）
// includes で部分一致させ表記ゆれに対応
function resolveMethodGroup(record: { method_group: string | null; fishing_method: string | null }): string | null {
  if (record.method_group) return record.method_group
  const m = record.fishing_method ?? ''
  if (!m) return null
  if (m.includes('ルアー') || m.includes('ジギング')) return 'ルアー'
  if (m.includes('テンヤ')) return 'テンヤ'
  if (m.includes('餌') || m.includes('エサ') || m.includes('テンビン') || m.includes('天秤')) return 'エサ'
  return null
}

function maxDetailCount(details: CatchDetail[]): number {
  if (details.length === 0) return -1
  return Math.max(...details.map((d) => d.count ?? -1))
}

function aggregateBySpecies(details: CatchDetail[]) {
  const map = new Map<string, { min: number; max: number }>()
  for (const d of details) {
    if (d.count === null) continue
    const key = d.species_name ?? '—'
    const cur = map.get(key)
    map.set(key, cur
      ? { min: Math.min(cur.min, d.count), max: Math.max(cur.max, d.count) }
      : { min: d.count, max: d.count }
    )
  }
  return [...map.entries()].map(([name, { min, max }]) => ({ name, min, max }))
}

// 単位なし・MIN〜MAX形式（一覧用）複数魚種は行ごとの配列で返す
function formatDetailsLines(details: CatchDetail[], countMin: number | null): string[] {
  if (details.length === 0) return ['—']
  const agg = aggregateBySpecies(details)
  if (agg.length === 0) return ['—']
  return agg.map(({ name, max }) => {
    const lo = countMin ?? max
    const rangeStr = lo === max ? `${max}` : `${lo}〜${max}`
    return `${name} ${rangeStr}`
  })
}

// 魚種ごとのサイズ行を返す（formatDetailsLines と同順）
function formatSizeLines(details: CatchDetail[]): string[] {
  if (details.length === 0) return ['—']
  const agg = aggregateBySpecies(details)
  if (agg.length === 0) return ['—']
  // 魚種ごとに最初の size_text を取得
  const sizeMap = new Map<string, string | null>()
  for (const d of details) {
    const key = d.species_name ?? '—'
    if (!sizeMap.has(key)) sizeMap.set(key, d.size_text ?? null)
  }
  return agg.map(({ name }) => {
    const text = sizeMap.get(name) ?? null
    if (!text) return '—'
    const stripped = text.replace(/\s*cm/gi, '').replace(/\s*kg/gi, '').replace(/\s*センチ/g, '').replace(/[~\-–〜～]/g, '〜').trim()
    return stripped || '—'
  })
}

function SortTh({ label, field, active, onSort }: {
  label: string; field: SortField; active: boolean; onSort: (f: SortField) => void
}) {
  return (
    <th
      onClick={() => onSort(active ? null : field)}
      style={{
        padding: '10px 12px', textAlign: 'right',
        color: active ? 'var(--accent)' : 'rgba(255,255,255,0.55)',
        fontWeight: 600, fontSize: 11, letterSpacing: '0.04em',
        cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}
    >
      {label}{active ? ' ▼' : ''}
    </th>
  )
}

const thBase: React.CSSProperties = {
  padding: '10px 12px', textAlign: 'left',
  color: 'rgba(255,255,255,0.55)', fontWeight: 600, fontSize: 11,
  letterSpacing: '0.04em', borderBottom: '1px solid rgba(255,255,255,0.07)',
  whiteSpace: 'nowrap',
}

export default function CatchTable({ records, sortField, onSort, sizeUnit = 'cm' }: Props) {
  if (records.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)', fontSize: 14 }}>
        <p style={{ fontSize: 28, marginBottom: 8 }}>🎣</p>
        条件に一致するデータがありません
      </div>
    )
  }

  // 🏆 トップ判定（catch_details の最大釣果数を持つ行）
  const maxCount = Math.max(...records.map((r) => maxDetailCount(r.catch_details)), -1)

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: '38%' }} />
          <col style={{ width: '37%' }} />
          <col style={{ width: '25%' }} />
        </colgroup>
        <thead>
          <tr style={{ background: 'rgba(5,8,15,0.85)' }}>
            <th style={thBase}>船宿</th>
            <SortTh label="釣果" field="count" active={sortField === 'count'} onSort={onSort} />
            <SortTh label="サイズ" field="size"  active={sortField === 'size'}  onSort={onSort} />
          </tr>
        </thead>
        <tbody>
          {records.map((r) => {
            const methodGroup = resolveMethodGroup(r)
            const rowBg       = methodGroup ? (GROUP_ROW_BG[methodGroup] ?? GROUP_ROW_BG_DEFAULT) : GROUP_ROW_BG_DEFAULT
            const borderColor = methodGroup ? (GROUP_BORDER[methodGroup] ?? null) : null
            const isTrophy    = maxCount > 0 && maxDetailCount(r.catch_details) === maxCount
            const dateStr     = r.date
              ? new Date(r.date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })
              : null

            return (
              <tr
                key={r.id}
                style={{
                  background: rowBg,
                  borderBottom: '1px solid var(--border)',
                  borderLeft: borderColor ? `2px solid ${borderColor}` : '2px solid transparent',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(0,245,255,0.08)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = rowBg)}
              >
                {/* 船宿（便名・釣り方サブテキスト付き） */}
                <td style={{ padding: '8px 12px', maxWidth: 0 }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600, fontSize: 13, color: 'var(--text-main)' }}>
                    {isTrophy && <span style={{ marginRight: 3 }}>🏆</span>}
                    {r.shipyard_name ?? '—'}
                  </div>
                  {dateStr && (
                    <div style={{ fontSize: 10, color: '#64748b', marginTop: 2, whiteSpace: 'nowrap' }}>
                      {dateStr}
                    </div>
                  )}
                  {r.boat_name && (
                    <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {r.boat_name}
                    </div>
                  )}
                  {r.fishing_method && (
                    <div style={{ fontSize: 10, color: '#64748b', marginTop: 1, whiteSpace: 'nowrap' }}>
                      {r.fishing_method}
                    </div>
                  )}
                </td>

                {/* 釣果（複数魚種は改行） */}
                <td style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 700, color: 'var(--accent)', fontVariantNumeric: 'tabular-nums', fontSize: 12, whiteSpace: 'nowrap' }}>
                  {formatDetailsLines(r.catch_details, r.count_min).map((line, i) => (
                    <div key={i}>{line}</div>
                  ))}
                </td>

                {/* サイズ（魚種ごとに複数行） */}
                <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-sub)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                  {formatSizeLines(r.catch_details).map((line, i) => (
                    <div key={i}>{line}</div>
                  ))}
                </td>

              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
