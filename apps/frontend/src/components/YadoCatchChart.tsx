'use client'

import { useState } from 'react'
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts'

// ── 型 ──────────────────────────────────────────────────────────
export type TripData = {
  sail_date: string | null
  boat_name_raw: string | null
  catches: {
    species_name: string | null
    count: number | null
    detail_type: string | null
  }[]
}

type ChartPoint = {
  date: string       // 'M/D' 表示用
  fullDate: string   // 'YYYY-MM-DD'
  total: number      // 全魚種合計
  trips: number      // 出船数
  species: Record<string, number>  // 魚種別数量
}

type Props = {
  trips: TripData[]
  topSpeciesNames: string[]
}

// ── 定数 ────────────────────────────────────────────────────────
const SPECIES_COLORS = [
  '#38BDF8', '#34D399', '#FBBF24', '#F87171',
  '#A78BFA', '#FB923C', '#F472B6', '#22D3EE',
]

// ── ヘルパー ────────────────────────────────────────────────────
function buildChartData(trips: TripData[], days: number): ChartPoint[] {
  const now = new Date()
  now.setHours(0, 0, 0, 0)

  // 日付リスト作成
  const dates: string[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(now.getDate() - i)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    dates.push(`${y}-${m}-${day}`)
  }

  // 日付ごとに集計
  const byDate = new Map<string, { total: number; trips: number; species: Record<string, number> }>()
  for (const d of dates) byDate.set(d, { total: 0, trips: 0, species: {} })

  for (const trip of trips) {
    if (!trip.sail_date) continue
    const key = trip.sail_date.split('T')[0]
    const acc = byDate.get(key)
    if (!acc) continue
    acc.trips++

    for (const c of trip.catches) {
      if (c.detail_type !== 'catch' || c.count === null || !c.species_name) continue
      acc.total += c.count
      acc.species[c.species_name] = (acc.species[c.species_name] ?? 0) + c.count
    }
  }

  return dates.map((fullDate) => {
    const { total, trips, species } = byDate.get(fullDate)!
    const [, m, d] = fullDate.split('-').map(Number)
    return { date: `${m}/${d}`, fullDate, total, trips, species }
  })
}

// ── カスタムツールチップ ────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltip({ active, payload, topSpeciesNames }: any) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload as ChartPoint
  if (d.total === 0) {
    return (
      <div style={{
        background: 'var(--bg-mid)', borderRadius: 8,
        padding: '8px 14px', border: '1px solid var(--border-default)',
      }}>
        <p style={{ color: 'var(--text-muted)', fontSize: 11 }}>{d.date} — データなし</p>
      </div>
    )
  }
  return (
    <div style={{
      background: 'var(--bg-mid)', borderRadius: 8,
      padding: '8px 14px', border: '1px solid var(--border-default)',
      minWidth: 120,
    }}>
      <p style={{ color: 'var(--text-muted)', fontSize: 11, marginBottom: 6 }}>
        {d.date}　{d.trips}件出船
      </p>
      {topSpeciesNames.map((name: string, i: number) => {
        const count = d.species[name]
        if (!count) return null
        return (
          <div key={name} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, lineHeight: 1.8 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                width: 8, height: 8, borderRadius: 2,
                background: SPECIES_COLORS[i % SPECIES_COLORS.length],
                flexShrink: 0,
              }} />
              <span style={{ color: 'var(--text-secondary)' }}>{name}</span>
            </span>
            <span className="data-value" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>
              {count}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ── メインコンポーネント ────────────────────────────────────────
export default function YadoCatchChart({ trips, topSpeciesNames }: Props) {
  const [period, setPeriod] = useState<'7d' | '30d'>('7d')
  const days = period === '7d' ? 7 : 30
  const data = buildChartData(trips, days)
  const maxVal = Math.max(...data.map((d) => d.total), 1)

  return (
    <div>
      {/* 期間切り替え */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 12,
        justifyContent: 'flex-end',
      }}>
        {(['7d', '30d'] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            style={{
              padding: '4px 12px', borderRadius: 100, border: 'none',
              fontSize: 11, cursor: 'pointer',
              background: period === p ? 'rgba(56,189,248,0.15)' : 'transparent',
              color: period === p ? 'var(--color-cyan)' : 'var(--text-muted)',
            }}
          >
            {p === '7d' ? '7日' : '30日'}
          </button>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <ComposedChart data={data} margin={{ top: 4, right: 8, left: -22, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-subtle)" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            interval={period === '7d' ? 0 : 4}
          />
          <YAxis
            tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            domain={[0, maxVal + 2]}
            allowDecimals={false}
          />
          <Tooltip
            content={(props) => <ChartTooltip {...props} topSpeciesNames={topSpeciesNames} />}
            cursor={{ stroke: 'var(--color-cyan)', strokeWidth: 1, strokeDasharray: '4 2' }}
          />

          {/* 棒グラフ: 合計釣果数 */}
          <Bar dataKey="total" radius={[3, 3, 0, 0]} maxBarSize={period === '7d' ? 28 : 12}>
            {data.map((entry, i) => (
              <Cell
                key={i}
                fill={entry.total > 0 ? 'rgba(56,189,248,0.3)' : 'transparent'}
                stroke={entry.total > 0 ? 'rgba(56,189,248,0.5)' : 'transparent'}
              />
            ))}
          </Bar>

          {/* 折れ線: 出船数 */}
          <Line
            type="monotone"
            dataKey="trips"
            stroke="#34D399"
            strokeWidth={1.5}
            dot={false}
            yAxisId={0}
            connectNulls={false}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* 凡例 */}
      <div style={{
        display: 'flex', gap: 12, justifyContent: 'center',
        marginTop: 4, fontSize: 10, color: 'var(--text-muted)',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 12, height: 8, borderRadius: 2, background: 'rgba(56,189,248,0.3)', border: '1px solid rgba(56,189,248,0.5)' }} />
          合計釣果
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ width: 12, height: 2, background: '#34D399' }} />
          出船数
        </span>
      </div>
    </div>
  )
}
