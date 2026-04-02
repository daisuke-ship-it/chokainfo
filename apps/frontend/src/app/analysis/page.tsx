import Link from 'next/link'
import type { Metadata } from 'next'
import { supabase } from '@/lib/supabase'
import SiteHeader from '@/components/SiteHeader'
import AnalysisCharts from '@/components/AnalysisCharts'

export const metadata: Metadata = {
  title: '釣果分析 | 今週末どこに行けば釣れる？ - 釣果情報.com',
  description: '直近7日の釣果データから「釣れているエリア×魚種」をスコアリング。潮汐・前週比・出船数を総合した釣果分析ページ。',
}

export const revalidate = 3600

// ── 定数 ─────────────────────────────────────────────────────
const HEATMAP_FISH = ['タチウオ', 'アジ', 'サワラ', 'シーバス', 'マダイ', 'ヒラメ']
const AREAS        = ['東京湾', '相模湾', '外房', '南房']

const FISH_SLUGS: Record<string, string> = {
  'タチウオ': 'tachiuo',
  'アジ':     'aji',
  'サワラ':   'sawara',
  'シーバス': 'seabass',
}
const AREA_SLUGS: Record<string, string> = {
  '東京湾': 'tokyo',
  '相模湾': 'sagami',
  '外房':   'sotobo',
  '南房':   'minamibo',
}

// ── 型 ────────────────────────────────────────────────────────
type RawRow = {
  sail_date: string | null
  shipyards: { name: string; areas: { name: string } | null } | null
  catch_details: { species_name: string | null; count: number | null }[]
}

type DailyEntry = {
  sumCount: number
  nEntries: number
  shipyards: Set<string>
}

export type Recommendation = {
  area: string
  fish: string
  score: number
  avgCount: number
  wowPercent: number | null
  shipCount: number
  rank: 1 | 2 | 3
}

export type HeatmapCell = {
  fish: string
  area: string
  avgCount: number | null
  level: 0 | 1 | 2 | 3
  href: string
}

export type TrendPoint = {
  date: string
  [key: string]: number | string | null
}

export type TideBar = {
  tide: string
  [key: string]: number | string | null
}

// ── データ取得 ─────────────────────────────────────────────────
async function fetchRows(): Promise<RawRow[]> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 30)
  const cutoffStr = cutoff.toISOString().slice(0, 10)

  const { data } = await supabase
    .from('catches')
    .select('sail_date, shipyards ( name, areas ( name ) ), catch_details ( species_name, count )')
    .gte('sail_date', cutoffStr)
    .order('sail_date', { ascending: false })

  return (data ?? []) as unknown as RawRow[]
}

async function fetchEnvData(): Promise<Record<string, string>> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 30)
  const { data } = await supabase
    .from('environment_data')
    .select('date, tide_type')
    .gte('date', cutoff.toISOString().slice(0, 10))
  if (!data) return {}
  return Object.fromEntries(
    data.filter((r) => r.tide_type).map((r) => [r.date, r.tide_type as string])
  )
}

async function getLatestUpdatedAt(): Promise<string | null> {
  const { data } = await supabase
    .from('catches').select('created_at')
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  return data?.created_at ?? null
}

// ── 集計ヘルパー ───────────────────────────────────────────────
function buildAgg(rows: RawRow[]): Map<string, DailyEntry> {
  const agg = new Map<string, DailyEntry>()
  for (const row of rows) {
    const area = row.shipyards?.areas?.name
    const yard = row.shipyards?.name
    const date = row.sail_date
    if (!area || !date) continue
    for (const d of row.catch_details) {
      if (!d.species_name || d.count === null || d.count <= 0) continue
      const key = `${area}|${d.species_name}|${date}`
      const cur = agg.get(key) ?? { sumCount: 0, nEntries: 0, shipyards: new Set<string>() }
      cur.sumCount  += d.count
      cur.nEntries  += 1
      if (yard) cur.shipyards.add(yard)
      agg.set(key, cur)
    }
  }
  return agg
}

// ── 計算関数 ───────────────────────────────────────────────────
function computeRecommendations(agg: Map<string, DailyEntry>): Recommendation[] {
  const today = new Date()
  const last7Start = new Date(today); last7Start.setDate(today.getDate() - 7)
  const prev7Start = new Date(today); prev7Start.setDate(today.getDate() - 14)
  const last7Str = last7Start.toISOString().slice(0, 10)
  const prev7Str = prev7Start.toISOString().slice(0, 10)

  // (area|fish) → last7 / prev7 合計
  type PairAgg = { sumCount: number; nEntries: number; shipyards: Set<string> }
  const last7: Map<string, PairAgg> = new Map()
  const prev7: Map<string, PairAgg> = new Map()

  for (const [key, entry] of agg.entries()) {
    const [area, fish, date] = key.split('|')
    const pairKey = `${area}|${fish}`
    const isLast7 = date >= last7Str
    const isPrev7 = date >= prev7Str && date < last7Str
    const target = isLast7 ? last7 : isPrev7 ? prev7 : null
    if (!target) continue
    const cur = target.get(pairKey) ?? { sumCount: 0, nEntries: 0, shipyards: new Set<string>() }
    cur.sumCount  += entry.sumCount
    cur.nEntries  += entry.nEntries
    entry.shipyards.forEach((s) => cur.shipyards.add(s))
    target.set(pairKey, cur)
  }

  const results: Recommendation[] = []
  for (const [pairKey, l7] of last7.entries()) {
    if (l7.nEntries < 3) continue              // データ不足は除外
    const [area, fish] = pairKey.split('|')
    const avgCount   = l7.sumCount / l7.nEntries
    if (avgCount < 3) continue                 // 平均3尾未満は除外
    const shipCount  = l7.shipyards.size

    const p7 = prev7.get(pairKey)
    let wowPercent: number | null = null
    if (p7 && p7.nEntries > 0) {
      const prevAvg = p7.sumCount / p7.nEntries
      if (prevAvg > 0) wowPercent = Math.round((avgCount - prevAvg) / prevAvg * 100)
    }

    // スコアリング (0–100)
    const countScore = Math.min(avgCount / 40 * 60, 60)
    const wowScore   = wowPercent !== null && wowPercent > 0
      ? Math.min(wowPercent / 60 * 25, 25)
      : 0
    const shipScore  = Math.min(shipCount / 5 * 15, 15)
    const score      = Math.round(countScore + wowScore + shipScore)

    results.push({ area, fish, score, avgCount: Math.round(avgCount), wowPercent, shipCount, rank: 1 })
  }

  results.sort((a, b) => b.score - a.score)
  return results.slice(0, 3).map((r, i) => ({ ...r, rank: (i + 1) as 1 | 2 | 3 }))
}

function computeHeatmap(agg: Map<string, DailyEntry>): HeatmapCell[] {
  const today = new Date()
  const cutoff = new Date(today); cutoff.setDate(today.getDate() - 7)
  const cutoffStr = cutoff.toISOString().slice(0, 10)

  // (area|fish) → { sumCount, nEntries }
  const map = new Map<string, { sumCount: number; nEntries: number }>()
  for (const [key, entry] of agg.entries()) {
    const parts = key.split('|')
    const [area, fish, date] = parts
    if (date < cutoffStr) continue
    const pairKey = `${area}|${fish}`
    const cur = map.get(pairKey) ?? { sumCount: 0, nEntries: 0 }
    cur.sumCount += entry.sumCount
    cur.nEntries += entry.nEntries
    map.set(pairKey, cur)
  }

  const cells: HeatmapCell[] = []
  for (const fish of HEATMAP_FISH) {
    for (const area of AREAS) {
      const entry = map.get(`${area}|${fish}`)
      const avgCount = entry && entry.nEntries > 0
        ? Math.round(entry.sumCount / entry.nEntries)
        : null

      const level: HeatmapCell['level'] =
        avgCount === null ? 0 :
        avgCount <= 10   ? 1 :
        avgCount <= 30   ? 2 : 3

      const fishSlug = FISH_SLUGS[fish]
      const areaSlug = AREA_SLUGS[area] ?? 'tokyo'
      const href = fishSlug
        ? `/fish/${fishSlug}/${areaSlug}`
        : `/area/${areaSlug}`

      cells.push({ fish, area, avgCount, level, href })
    }
  }
  return cells
}

function computeTrend(agg: Map<string, DailyEntry>): TrendPoint[] {
  // 集計に登場する魚種を収集（上位5種まで）
  const fishCounts = new Map<string, number>()
  for (const [key, entry] of agg.entries()) {
    const fish = key.split('|')[1]
    fishCounts.set(fish, (fishCounts.get(fish) ?? 0) + entry.nEntries)
  }
  const topFish = [...fishCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([f]) => f)

  // 直近30日の日付リスト
  const dates: string[] = []
  for (let i = 29; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i)
    dates.push(d.toISOString().slice(0, 10))
  }

  return dates.map((date) => {
    const point: TrendPoint = { date: `${parseInt(date.slice(5, 7))}/${parseInt(date.slice(8, 10))}` }
    for (const fish of topFish) {
      // その日の全エリア合算avg
      let sumCount = 0; let nEntries = 0
      for (const area of AREAS) {
        const entry = agg.get(`${area}|${fish}|${date}`)
        if (entry) { sumCount += entry.sumCount; nEntries += entry.nEntries }
      }
      point[fish] = nEntries > 0 ? Math.round(sumCount / nEntries) : null
    }
    return point
  })
}

function computeTide(
  rows: RawRow[],
  envMap: Record<string, string>
): TideBar[] {
  const TIDE_ORDER = ['大潮', '中潮', '小潮', '長潮', '若潮']
  const TARGET_FISH = ['タチウオ', 'アジ', 'サワラ', 'シーバス']

  // (tide|fish) → { sumCount, nEntries }
  const map = new Map<string, { sumCount: number; nEntries: number }>()
  for (const row of rows) {
    const date = row.sail_date
    if (!date) continue
    const tideType = envMap[date]
    if (!tideType) continue
    for (const d of row.catch_details) {
      if (!d.species_name || d.count === null || d.count <= 0) continue
      if (!TARGET_FISH.includes(d.species_name)) continue
      const key = `${tideType}|${d.species_name}`
      const cur = map.get(key) ?? { sumCount: 0, nEntries: 0 }
      cur.sumCount += d.count
      cur.nEntries += 1
      map.set(key, cur)
    }
  }

  return TIDE_ORDER.map((tide) => {
    const bar: TideBar = { tide }
    for (const fish of TARGET_FISH) {
      const entry = map.get(`${tide}|${fish}`)
      bar[fish] = entry && entry.nEntries > 0
        ? Math.round(entry.sumCount / entry.nEntries)
        : null
    }
    return bar
  })
}

// ── ヒートマップ セルスタイル ─────────────────────────────────
const LEVEL_STYLE: Record<number, { bg: string; color: string; border: string }> = {
  0: { bg: 'rgba(15,23,42,0.6)',   color: '#475569', border: 'rgba(71,85,105,0.3)' },
  1: { bg: 'rgba(30,58,138,0.25)', color: '#93c5fd', border: 'rgba(147,197,253,0.2)' },
  2: { bg: 'rgba(30,58,138,0.55)', color: '#60a5fa', border: 'rgba(96,165,250,0.3)'  },
  3: { bg: 'rgba(30,58,138,0.9)',  color: '#e0f2fe', border: 'rgba(224,242,254,0.25)' },
}

const RANK_BADGE: Record<number, { bg: string; border: string; color: string }> = {
  1: { bg: 'rgba(0,212,200,0.15)',   border: 'rgba(0,212,200,0.5)', color: '#00d4c8' },
  2: { bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.2)', color: '#8899bb' },
  3: { bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.12)', color: '#4a5a7a' },
}

// ── Page ───────────────────────────────────────────────────────
export default async function AnalysisPage() {
  const [rows, envMap, latestAt] = await Promise.all([
    fetchRows(),
    fetchEnvData(),
    getLatestUpdatedAt(),
  ])

  const agg             = buildAgg(rows)
  const recommendations = computeRecommendations(agg)
  const heatmapCells    = computeHeatmap(agg)
  const trendData       = computeTrend(agg)
  const tideData        = computeTide(rows, envMap)

  const nowStr = new Date(latestAt ?? Date.now()).toLocaleString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Tokyo',
  })

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>

      {/* ── Header ─────────────────────────────────────────── */}
      <SiteHeader updatedAt={nowStr} subtitle="釣果分析" />

      {/* ── Hero ────────────────────────────────────────────── */}
      <div style={{
        background: 'var(--primary)',
        paddingTop: 40, paddingBottom: 44,
      }}>
        <div className="page-container">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 10 }}>
            <Link href="/" style={{ color: 'rgba(255,255,255,0.55)' }}>トップ</Link>
            <span>›</span>
            <span style={{ color: 'rgba(255,255,255,0.75)' }}>釣果分析</span>
          </div>
          <div style={{ marginBottom: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--accent)', textTransform: 'uppercase' }}>
              ANALYSIS — DATA-DRIVEN FISHING INSIGHT
            </span>
          </div>
          <h1 style={{ fontSize: 'clamp(18px, 3.5vw, 26px)', fontWeight: 700, color: 'white', fontFamily: 'var(--font-serif)', letterSpacing: '0.04em', lineHeight: 1.25, marginBottom: 6 }}>
            今週末どこに行けば釣れる？
          </h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', maxWidth: 480, lineHeight: 1.6 }}>
            直近7日の釣果データをスコアリングし、釣れているエリア×魚種の組み合わせをランキング表示します。
          </p>
        </div>
      </div>

      {/* ── Main ─────────────────────────────────────────────── */}
      <main style={{ padding: '40px 0 100px' }}>
        <div className="page-container" style={{ display: 'flex', flexDirection: 'column', gap: 48 }}>

          {/* ─── Section 1: おすすめランキング ─────────────────────── */}
          <section>
            <SectionTitle>今週末のおすすめ</SectionTitle>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
              平均釣果・前週比・出船数を加重平均したスコアで上位3件を表示
            </p>

            {recommendations.length === 0 ? (
              <EmptyState text="スコアリング対象のデータが不足しています" />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {recommendations.map((rec) => (
                  <RecommendationCard key={`${rec.area}-${rec.fish}`} rec={rec} />
                ))}
              </div>
            )}
          </section>

          {/* ─── Section 2: ヒートマップ ────────────────────────────── */}
          <section>
            <SectionTitle>エリア別釣果ヒートマップ</SectionTitle>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>
              直近7日間の平均釣果（尾数）。濃い青=好調、グレー=データなし。タップで詳細へ
            </p>

            {/* ヒートマップ本体 */}
            <div style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: 380 }}>
                {/* ヘッダー行（エリア名） */}
                <div style={{ display: 'grid', gridTemplateColumns: '90px repeat(4, 1fr)', gap: 4, marginBottom: 4 }}>
                  <div />
                  {AREAS.map((area) => (
                    <div key={area} style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textAlign: 'center', padding: '4px 0' }}>
                      {area}
                    </div>
                  ))}
                </div>

                {/* 魚種ごとの行 */}
                {HEATMAP_FISH.map((fish) => {
                  const fishCells = heatmapCells.filter((c) => c.fish === fish)
                  return (
                    <div key={fish} style={{ display: 'grid', gridTemplateColumns: '90px repeat(4, 1fr)', gap: 4, marginBottom: 4 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', display: 'flex', alignItems: 'center' }}>
                        {fish}
                      </div>
                      {fishCells.map((cell) => {
                        const s = LEVEL_STYLE[cell.level]
                        return (
                          <Link key={cell.area} href={cell.href} style={{ textDecoration: 'none' }}>
                            <div style={{
                              background: s.bg,
                              border: `1px solid ${s.border}`,
                              borderRadius: 6,
                              padding: '8px 4px',
                              textAlign: 'center',
                              cursor: 'pointer',
                              transition: 'opacity 0.15s',
                            }}>
                              {cell.avgCount !== null ? (
                                <>
                                  <div style={{ fontSize: 14, fontWeight: 700, color: s.color, fontVariantNumeric: 'tabular-nums' }}>
                                    {cell.avgCount}
                                  </div>
                                  <div style={{ fontSize: 9, color: s.color, opacity: 0.7, marginTop: 1 }}>尾</div>
                                </>
                              ) : (
                                <div style={{ fontSize: 13, color: s.color }}>—</div>
                              )}
                            </div>
                          </Link>
                        )
                      })}
                    </div>
                  )
                })}

                {/* 凡例 */}
                <div style={{ display: 'flex', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
                  {[
                    { level: 0, label: 'データなし' },
                    { level: 1, label: '低調 (≤10)' },
                    { level: 2, label: '普通 (≤30)' },
                    { level: 3, label: '好調 (>30)' },
                  ].map(({ level, label }) => {
                    const s = LEVEL_STYLE[level]
                    return (
                      <div key={level} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                        <div style={{ width: 14, height: 14, borderRadius: 3, background: s.bg, border: `1px solid ${s.border}` }} />
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</span>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </section>

          {/* ─── Section 3 & 4: チャート（client） ─────────────────── */}
          <AnalysisCharts trendData={trendData} tideData={tideData} />

        </div>
      </main>

      {/* ── Footer ───────────────────────────────────────────── */}
      <footer style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)', padding: '32px 0' }}>
        <div className="page-container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            © {new Date().getFullYear()} 釣果情報.com — 釣果分析
          </span>
          <span style={{ fontSize: 11, color: 'var(--border-strong)' }}>
            データは各船宿サイトより自動収集しています
          </span>
        </div>
      </footer>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{
      fontSize: 16, fontWeight: 700, color: 'var(--text)',
      marginBottom: 4,
      paddingBottom: 8,
      borderBottom: '1px solid var(--border)',
    }}>
      {children}
    </h2>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div style={{
      padding: '40px 20px', textAlign: 'center',
      background: 'var(--surface)', borderRadius: 'var(--radius-lg)',
      border: '1px solid var(--border)',
    }}>
      <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{text}</p>
    </div>
  )
}

function RecommendationCard({ rec }: { rec: Recommendation }) {
  const areaSlug = AREA_SLUGS[rec.area] ?? 'tokyo'
  const fishSlug = FISH_SLUGS[rec.fish]
  const href     = fishSlug ? `/fish/${fishSlug}/${areaSlug}` : `/area/${areaSlug}`

  const scoreColor =
    rec.score >= 70 ? '#4ade80' :
    rec.score >= 40 ? '#facc15' : '#94a3b8'

  return (
    <Link href={href} style={{ textDecoration: 'none' }}>
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: '16px 20px',
        display: 'flex', alignItems: 'center', gap: 16,
        cursor: 'pointer',
      }}>
        {/* ランクバッジ */}
        <div style={{
          width: 24, height: 24, borderRadius: 6,
          background: RANK_BADGE[rec.rank].bg,
          border: `1px solid ${RANK_BADGE[rec.rank].border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700, color: RANK_BADGE[rec.rank].color,
          flexShrink: 0,
        }}>{rec.rank}</div>

        {/* エリア・魚種 */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
              {rec.area} × {rec.fish}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <StatItem label="平均釣果" value={`${rec.avgCount}尾`} />
            {rec.wowPercent !== null && (
              <StatItem
                label="前週比"
                value={`${rec.wowPercent >= 0 ? '+' : ''}${rec.wowPercent}%`}
                color={rec.wowPercent >= 0 ? '#4ade80' : '#f87171'}
              />
            )}
            <StatItem label="出船" value={`${rec.shipCount}船宿`} />
          </div>
        </div>

        {/* スコア */}
        <div style={{ textAlign: 'center', flexShrink: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 700, color: scoreColor, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
            {rec.score}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>スコア</div>
        </div>
      </div>
    </Link>
  )
}

function StatItem({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{label}　</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: color ?? 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </span>
    </div>
  )
}
