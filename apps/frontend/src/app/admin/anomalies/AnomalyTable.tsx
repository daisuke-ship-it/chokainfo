'use client'

import { useState, useEffect } from 'react'

type Anomaly = {
  id: number
  species_name_raw: string | null
  count: number | null
  count_min: number | null
  count_max: number | null
  size_text: string | null
  confidence_score: number
  detail_type: string | null
  unit: string | null
  fishing_trips: {
    id: number
    sail_date: string | null
    boat_name_raw: string | null
    shipyards: { id: number; name: string } | null
  }
  trip_signals: { signal_type: string; signal_value: string | null }[]
}

export default function AnomalyTable() {
  const [rows, setRows] = useState<Anomaly[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showResolved, setShowResolved] = useState(false)
  const [actionLoading, setActionLoading] = useState<Set<number>>(new Set())

  // fetch data
  useEffect(() => {
    setLoading(true)
    fetch(`/api/admin/anomalies?resolved=${showResolved}`)
      .then(r => r.json())
      .then(({ data, error }) => {
        if (error) throw new Error(error)
        setRows(data ?? [])
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [showResolved])

  // mark as OK (set confidence_score to 1.0)
  async function markOk(id: number) {
    setActionLoading(prev => new Set(prev).add(id))
    try {
      const res = await fetch('/api/admin/anomalies', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [id], confidence_score: 1.0 }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      // remove from list
      setRows(prev => prev.filter(r => r.id !== id))
    } catch (e) {
      alert(e instanceof Error ? e.message : '更新失敗')
    } finally {
      setActionLoading(prev => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }

  // Score badge color
  function scoreColor(score: number): string {
    if (score <= 0.3) return '#ef4444'  // red
    if (score <= 0.5) return '#f59e0b'  // amber
    return '#6b7280'                     // gray
  }

  // Signal type to Japanese label
  function signalLabel(type: string): string {
    const map: Record<string, string> = {
      'anomaly': '異常値',
      'anomaly_duplicate': '重複疑い',
      'anomaly_zero': 'ゼロ値',
      'anomaly_hard_limit': 'ハードリミット超過',
      'anomaly_ratio': '前回比急変',
      'anomaly_iqr': 'IQR外れ値',
    }
    return map[type] || type
  }

  if (loading) {
    return <p style={{ color: 'var(--text-muted)', fontSize: 13, padding: '16px 0' }}>読み込み中...</p>
  }
  if (error) {
    return <p style={{ color: '#ff6b6b', fontSize: 13, padding: '16px 0' }}>エラー: {error}</p>
  }

  // Style constants (match admin pattern)
  const cellStyle: React.CSSProperties = {
    padding: '8px 12px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    verticalAlign: 'middle',
    fontSize: 13,
  }
  const thStyle: React.CSSProperties = {
    padding: '10px 12px',
    textAlign: 'left',
    color: '#8899bb',
    fontSize: 11,
    fontWeight: 500,
    background: 'rgba(255,255,255,0.05)',
    whiteSpace: 'nowrap',
  }

  return (
    <>
      {/* Filter toggle */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
          {rows.length}件の異常値
        </span>
        <label style={{ color: 'var(--text-muted)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={showResolved}
            onChange={e => setShowResolved(e.target.checked)}
            style={{ accentColor: '#38BDF8' }}
          />
          対応済みも表示
        </label>
      </div>

      {/* Table */}
      <div style={{
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid var(--border-strong)',
        borderRadius: 12,
        overflow: 'hidden',
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <th style={thStyle}>Score</th>
                <th style={thStyle}>日付</th>
                <th style={thStyle}>船宿</th>
                <th style={thStyle}>便</th>
                <th style={thStyle}>魚種</th>
                <th style={thStyle}>数量</th>
                <th style={thStyle}>サイズ</th>
                <th style={thStyle}>シグナル</th>
                <th style={thStyle}>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const trip = row.fishing_trips
                const sy = trip?.shipyards
                const isLoading = actionLoading.has(row.id)
                // Anomaly signals only
                const anomalySignals = (row.trip_signals || []).filter(s =>
                  s.signal_type.startsWith('anomaly')
                )

                return (
                  <tr key={row.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    {/* Score badge */}
                    <td style={cellStyle}>
                      <span style={{
                        display: 'inline-block',
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: 12,
                        fontWeight: 700,
                        fontFamily: 'var(--font-mono, monospace)',
                        color: 'white',
                        background: scoreColor(row.confidence_score),
                      }}>
                        {row.confidence_score.toFixed(1)}
                      </span>
                    </td>
                    {/* Date */}
                    <td style={{ ...cellStyle, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {trip?.sail_date ?? '—'}
                    </td>
                    {/* Shipyard */}
                    <td style={{ ...cellStyle, color: '#f0f4ff' }}>
                      {sy?.name ?? '—'}
                    </td>
                    {/* Boat */}
                    <td style={{ ...cellStyle, color: 'var(--text-muted)' }}>
                      {trip?.boat_name_raw ?? '—'}
                    </td>
                    {/* Species */}
                    <td style={{ ...cellStyle, color: '#f0f4ff', fontWeight: 600 }}>
                      {row.species_name_raw ?? '—'}
                    </td>
                    {/* Count */}
                    <td style={{ ...cellStyle, color: '#f0f4ff', fontFamily: 'var(--font-mono, monospace)' }}>
                      {row.count_min !== null && row.count_max !== null && row.count_min !== row.count_max
                        ? `${row.count_min}〜${row.count_max}`
                        : row.count ?? '—'}
                    </td>
                    {/* Size */}
                    <td style={{ ...cellStyle, color: 'var(--text-muted)', fontSize: 12 }}>
                      {row.size_text ?? '—'}
                    </td>
                    {/* Signals */}
                    <td style={cellStyle}>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {anomalySignals.length > 0 ? anomalySignals.map((s, i) => (
                          <span key={i} style={{
                            fontSize: 10,
                            padding: '2px 6px',
                            borderRadius: 4,
                            background: 'rgba(239,68,68,0.15)',
                            color: '#fca5a5',
                            whiteSpace: 'nowrap',
                          }}>
                            {signalLabel(s.signal_type)}
                          </span>
                        )) : (
                          <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>—</span>
                        )}
                      </div>
                    </td>
                    {/* Actions */}
                    <td style={cellStyle}>
                      <button
                        disabled={isLoading}
                        onClick={() => markOk(row.id)}
                        style={{
                          background: isLoading ? 'rgba(56,189,248,0.3)' : 'transparent',
                          color: isLoading ? 'rgba(56,189,248,0.5)' : '#38BDF8',
                          border: '1px solid',
                          borderColor: isLoading ? 'rgba(56,189,248,0.2)' : 'rgba(56,189,248,0.4)',
                          borderRadius: 6,
                          padding: '4px 10px',
                          fontSize: 11,
                          cursor: isLoading ? 'not-allowed' : 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {isLoading ? '処理中...' : '問題なし'}
                      </button>
                    </td>
                  </tr>
                )
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
                    異常値データはありません
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
