'use client'

import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import { CatchRecord } from '@/lib/supabase'
import { EnvDataMap } from '@/app/page'

export type Props = {
  records: CatchRecord[]
  fishAliases: string[] | null
  envData: EnvDataMap
  period: string
}

type ChartPoint = {
  date: string       // 'M/D' 表示用
  fullDate: string   // 'YYYY-MM-DD' envData ルックアップ用
  min: number | null
  band: number | null  // max - min（min の上に積み上げてレンジ帯を描く）
  avg: number | null
  max: number | null   // ツールチップ表示用
  ships: number
  tide: string | null
}

// ── 潮汐設定 ────────────────────────────────────────────────
const TIDE_CONFIG: Record<string, { symbol: string; color: string }> = {
  '大潮': { symbol: '🌕', color: '#00F5FF' },
  '中潮': { symbol: '🌔', color: '#7c3aed' },
  '小潮': { symbol: '🌒', color: '#6b7280' },
  '長潮': { symbol: '〜',  color: '#4b5563' },
  '若潮': { symbol: '↑',  color: '#06b6d4' },
}

// ── ユーティリティ ────────────────────────────────────────────
function toJSTDateStr(d: Date): string {
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000)
  const y   = jst.getUTCFullYear()
  const m   = String(jst.getUTCMonth() + 1).padStart(2, '0')
  const day = String(jst.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function buildChartDays(period: string): string[] {
  const isSpecificDate = /^\d{4}-\d{2}-\d{2}$/.test(period)
  const days = period === '直近7日' ? 7 : 30
  const base = new Date()
  base.setHours(0, 0, 0, 0)

  // 特定日指定の場合はその日を末尾にして30日表示
  const endDate = isSpecificDate ? new Date(period + 'T00:00:00') : base

  const result: string[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(endDate)
    d.setDate(endDate.getDate() - i)
    result.push(toJSTDateStr(d))
  }
  return result
}

function buildChartData(
  records: CatchRecord[],
  fishAliases: string[] | null,
  envData: EnvDataMap,
  period: string,
): ChartPoint[] {
  const dates = buildChartDays(period)

  type Acc = { counts: number[]; ships: number }
  const byDate = new Map<string, Acc>()
  for (const d of dates) byDate.set(d, { counts: [], ships: 0 })

  for (const r of records) {
    if (!r.date) continue
    const key = r.date.split('T')[0]
    if (!byDate.has(key)) continue
    const acc = byDate.get(key)!
    acc.ships++

    if (fishAliases) {
      const dc = r.catch_details
        .filter((d) => d.count !== null && d.species_name && fishAliases.some((a) => d.species_name!.includes(a)))
        .map((d) => d.count!)
      if (dc.length > 0) {
        acc.counts.push(...dc)
        if (r.count_min !== null) acc.counts.push(r.count_min)
      }
    } else {
      const hi = r.count_max ?? r.count_min
      if (hi !== null) acc.counts.push(hi)
      if (r.count_min !== null) acc.counts.push(r.count_min)
    }
  }

  return dates.map((fullDate) => {
    const { counts, ships } = byDate.get(fullDate)!
    const [, m, d] = fullDate.split('-').map(Number)
    const tide = envData[fullDate]?.tide_type ?? null

    if (counts.length === 0) {
      return { date: `${m}/${d}`, fullDate, min: null, band: null, avg: null, max: null, ships, tide }
    }

    const min  = Math.min(...counts)
    const max  = Math.max(...counts)
    const avg  = Math.round(counts.reduce((a, b) => a + b, 0) / counts.length * 10) / 10
    return { date: `${m}/${d}`, fullDate, min, band: max - min, avg, max, ships, tide }
  })
}

// ── カスタムツールチップ ──────────────────────────────────────
function CustomTooltip({ active, payload }: { active?: boolean; payload?: { payload: ChartPoint }[] }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  return (
    <div style={{
      background: 'var(--primary)', borderRadius: 8,
      padding: '8px 14px', boxShadow: 'var(--shadow-md)',
    }}>
      <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, marginBottom: 4 }}>{d.date}</p>
      {d.avg !== null ? (
        <>
          <p style={{ color: 'white', fontWeight: 700, fontSize: 15 }}>平均 {d.avg}</p>
          <p style={{ color: '#93c5fd', fontSize: 12, marginTop: 2 }}>{d.min}〜{d.max}</p>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 4 }}>
            出船 {d.ships}件{d.tide ? `　${d.tide}` : ''}
          </p>
        </>
      ) : (
        <p style={{ color: 'rgba(255,255,255,0.35)', fontSize: 12 }}>データなし</p>
      )}
    </div>
  )
}

// ── カスタム X 軸ティック（日付 + 潮汐アイコン） ────────────────
function XAxisTick({
  x, y, payload, dateTideMap,
}: {
  x: number | string; y: number | string
  payload: { value: string }
  dateTideMap: Record<string, string | null>
}) {
  const nx = Number(x), ny = Number(y)
  const tide = dateTideMap[payload.value] ?? null
  const tideConf = tide ? (TIDE_CONFIG[tide] ?? null) : null
  return (
    <g transform={`translate(${nx},${ny})`}>
      <text x={0} y={0} dy={12} textAnchor="middle" fill="var(--text-muted)" fontSize={10}>
        {payload.value}
      </text>
      {tideConf && (
        <text x={0} y={0} dy={25} textAnchor="middle" fontSize={11} fill={tideConf.color}>
          {tideConf.symbol}
        </text>
      )}
    </g>
  )
}

// ── メインコンポーネント ────────────────────────────────────────
export default function CatchChart({ records, fishAliases, envData, period }: Props) {
  const data = buildChartData(records, fishAliases, envData, period)
  const maxVal = Math.max(...data.map((d) => d.max ?? 0), 1)
  const interval = period === '直近7日' ? 0 : 4

  // date('M/D') → tide_type のマップ（XAxisTick で使用）
  const dateTideMap: Record<string, string | null> = {}
  for (const d of data) dateTideMap[d.date] = d.tide

  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data} margin={{ top: 4, right: 24, left: -22, bottom: 20 }}>
        <defs>
          <linearGradient id="rangeGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#00F5FF" stopOpacity={0.22} />
            <stop offset="100%" stopColor="#00F5FF" stopOpacity={0.05} />
          </linearGradient>
        </defs>

        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />

        <XAxis
          dataKey="date"
          tick={(props) => <XAxisTick {...props} dateTideMap={dateTideMap} />}
          tickLine={false}
          axisLine={false}
          interval={interval}
          height={42}
        />
        <YAxis
          tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          domain={[0, maxVal + 2]}
          allowDecimals={false}
        />

        <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'var(--accent)', strokeWidth: 1, strokeDasharray: '4 2' }} />

        {/* レンジ帯: min を透明ベースラインとして積み上げ、band を色付きで表示 */}
        <Area
          type="monotone"
          dataKey="min"
          stackId="range"
          stroke="none"
          fill="transparent"
          connectNulls={false}
          isAnimationActive={false}
          legendType="none"
        />
        <Area
          type="monotone"
          dataKey="band"
          stackId="range"
          stroke="none"
          fill="url(#rangeGrad)"
          connectNulls={false}
          isAnimationActive={false}
          legendType="none"
        />

        {/* 平均値折れ線 */}
        <Line
          type="monotone"
          dataKey="avg"
          stroke="#00F5FF"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: '#00F5FF', stroke: 'white', strokeWidth: 2 }}
          connectNulls={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
