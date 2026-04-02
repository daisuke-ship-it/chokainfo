'use client'

import {
  LineChart, Line,
  BarChart, Bar,
  XAxis, YAxis,
  CartesianGrid, Tooltip,
  Legend, ResponsiveContainer,
} from 'recharts'
import type { TrendPoint, TideBar } from '@/app/analysis/page'

// ── 色パレット ─────────────────────────────────────────────────
const FISH_COLORS: Record<string, string> = {
  'タチウオ': '#d4a017',
  'アジ':     '#4ade80',
  'サワラ':   '#f87171',
  'シーバス': '#60a5fa',
  'マダイ':   '#c084fc',
  'ヒラメ':   '#fb923c',
}
const DEFAULT_COLORS = ['#d4a017', '#4ade80', '#f87171', '#60a5fa', '#c084fc']

const CHART_STYLE = {
  background: 'transparent',
  fontSize:   11,
}

const TOOLTIP_STYLE = {
  background:   '#0f172a',
  border:       '1px solid #334155',
  borderRadius: 6,
  color:        '#e2e8f0',
  fontSize:     12,
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{
      fontSize: 16, fontWeight: 700, color: 'var(--text)',
      marginBottom: 4, paddingBottom: 8,
      borderBottom: '1px solid var(--border)',
    }}>
      {children}
    </h2>
  )
}

// ── 魚種別トレンドグラフ ──────────────────────────────────────
function TrendChart({ data }: { data: TrendPoint[] }) {
  // data に登場する魚種キーを取得（"date" 以外）
  const fishKeys = data.length > 0
    ? Object.keys(data[0]).filter((k) => k !== 'date')
    : []

  if (fishKeys.length === 0) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center', background: 'var(--surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>グラフデータが不足しています</p>
      </div>
    )
  }

  // 最近20日分だけ表示（スマホで見やすく）
  const displayData = data.slice(-20)

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={displayData} style={CHART_STYLE}
        margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
        <XAxis
          dataKey="date"
          tick={{ fill: '#64748b', fontSize: 10 }}
          tickLine={false}
          axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
          interval={3}
        />
        <YAxis
          tick={{ fill: '#64748b', fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          width={32}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelStyle={{ color: '#94a3b8', marginBottom: 4 }}
          formatter={(value) => [`${value}尾`, '']}
        />
        <Legend
          wrapperStyle={{ fontSize: 11, color: '#94a3b8', paddingTop: 8 }}
        />
        {fishKeys.map((fish, i) => (
          <Line
            key={fish}
            type="monotone"
            dataKey={fish}
            stroke={FISH_COLORS[fish] ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length]}
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  )
}

// ── 潮汐×釣果 棒グラフ（横軸：魚種、バー：潮汐種別）──────────
const TIDE_COLORS: Record<string, string> = {
  '大潮': '#00d4c8',
  '中潮': '#60a5fa',
  '小潮': '#94a3b8',
  '長潮': '#64748b',
  '若潮': '#475569',
}

function TideChart({ data }: { data: TideBar[] }) {
  const tideKeys = data.map((d) => d.tide as string)
  const fishKeys = data.length > 0
    ? Object.keys(data[0]).filter((k) => k !== 'tide')
    : []

  const hasData = fishKeys.length > 0 && data.some((d) => fishKeys.some((f) => d[f] !== null))
  if (!hasData) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center', background: 'var(--surface)', borderRadius: 'var(--radius-lg)', border: '1px solid var(--border)' }}>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>潮汐データが不足しています</p>
      </div>
    )
  }

  // ピボット: tide行 → fish行（各行に潮汐種別の値を持つ）
  const pivoted = fishKeys.map((fish) => {
    const row: Record<string, string | number | null> = { fish }
    for (const d of data) {
      row[d.tide as string] = d[fish] ?? null
    }
    return row
  })

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={pivoted} style={CHART_STYLE}
        margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
        <XAxis
          dataKey="fish"
          tick={{ fill: '#64748b', fontSize: 11 }}
          tickLine={false}
          axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
        />
        <YAxis
          tick={{ fill: '#64748b', fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          width={32}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelStyle={{ color: '#94a3b8', marginBottom: 4 }}
          formatter={(value) => [`${value}尾`, '']}
        />
        <Legend
          wrapperStyle={{ fontSize: 11, color: '#94a3b8', paddingTop: 8 }}
        />
        {tideKeys.map((tide) => (
          <Bar
            key={tide}
            dataKey={tide}
            fill={TIDE_COLORS[tide] ?? '#94a3b8'}
            radius={[3, 3, 0, 0]}
            maxBarSize={20}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  )
}

// ── Main Export ───────────────────────────────────────────────
export default function AnalysisCharts({
  trendData,
  tideData,
}: {
  trendData: TrendPoint[]
  tideData: TideBar[]
}) {
  return (
    <>
      {/* Section 3: 魚種別トレンド */}
      <section>
        <SectionTitle>魚種別釣果トレンド（直近30日）</SectionTitle>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
          全エリア合算の魚種別平均釣果の推移（尾/日）
        </p>
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '16px 12px',
        }}>
          <TrendChart data={trendData} />
        </div>
      </section>

      {/* Section 4: 潮汐×釣果 */}
      <section>
        <SectionTitle>潮汐と釣果の相関</SectionTitle>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
          直近30日のデータで潮回り別の平均釣果を比較（主要魚種）
        </p>
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          padding: '16px 12px',
        }}>
          <TideChart data={tideData} />
        </div>
      </section>
    </>
  )
}
