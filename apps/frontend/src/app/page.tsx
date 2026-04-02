import Link from 'next/link'
import { Fish } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import SiteHeader from '@/components/SiteHeader'

// ── 型定義（他コンポーネントが import するため export 必須） ──────
export type EnvData = {
  weather: string | null
  wind_speed_ms: number | null
  tide_type: string | null
}
export type EnvDataMap = Record<string, EnvData>

export type AISummaryRecord = {
  summary_type: string
  target_id: number | null
  target_date: string
  summary_text: string
}

export type AreaRecord = {
  id: number
  name: string
}

export type FishRecord = {
  id: number
  name: string
}

// species_name → 同グループの全 species_name[]
export type SpeciesGroupMap = Record<string, string[]>

// ── エリア・魚種スラッグ ──────────────────────────────────────
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

// ── エリア定義 ────────────────────────────────────────────────
type AreaSlug = 'tokyo' | 'sagami' | 'sotobo' | 'minamibo'

const AREA_CONFIG: { slug: AreaSlug; name: string; description: string }[] = [
  { slug: 'tokyo',    name: '東京湾', description: '金沢八景・横浜・走水など' },
  { slug: 'sagami',   name: '相模湾', description: '茅ケ崎・平塚・小田原など' },
  { slug: 'sotobo',   name: '外房',   description: '勝浦・大原・一宮など' },
  { slug: 'minamibo', name: '南房',   description: '館山・白浜など' },
]

// ── おすすめ型 ────────────────────────────────────────────────
type Recommendation = {
  area: string
  fish: string
  score: number
  avgCount: number
  wowPercent: number | null
  shipCount: number
  rank: 1 | 2 | 3
}

// ── 型 ────────────────────────────────────────────────────────
type SpeciesStat = {
  name: string
  avgMax: number       // 直近7日の平均釣果
  shipCount: number    // 直近7日の出船数
  trend: 'up' | 'flat' | 'down'
}

type AreaStat = {
  areaName: string
  slug: AreaSlug
  description: string
  weekRecords: number  // 直近7日の件数
  topSpecies: SpeciesStat[]
  aiSummary: string | null
  aiSummaryDate: string | null
}

// ── データ取得 ─────────────────────────────────────────────────
type RawRow = {
  sail_date: string | null
  count_max: number | null
  shipyards: { areas: { name: string } | null } | null
  catch_details: { species_name: string | null; count: number | null }[]
}

function jstDateStr(d: Date): string {
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000)
  return jst.toISOString().slice(0, 10)
}

async function getAreaStats(): Promise<AreaStat[]> {
  const now = new Date()
  const cutoff14 = new Date(now); cutoff14.setDate(now.getDate() - 14)
  const cutoff7  = new Date(now); cutoff7.setDate(now.getDate() - 7)

  const cutoff14Str = jstDateStr(cutoff14)
  const cutoff7Str  = jstDateStr(cutoff7)

  const { data } = await supabase
    .from('catches')
    .select(`
      sail_date,
      count_max,
      shipyards ( areas ( name ) ),
      catch_details ( species_name, count )
    `)
    .gte('sail_date', cutoff14Str)
    .order('sail_date', { ascending: false })

  const rows = (data ?? []) as unknown as RawRow[]

  return AREA_CONFIG.map(({ slug, name, description }) => {
    const areaRows = rows.filter((r) => r.shipyards?.areas?.name === name)
    const recentRows = areaRows.filter((r) => r.sail_date && r.sail_date >= cutoff7Str)
    const prevRows   = areaRows.filter((r) => r.sail_date && r.sail_date < cutoff7Str)

    // 集計ヘルパー: species_name → { total, count }
    function buildMap(rs: RawRow[]) {
      const m = new Map<string, { total: number; count: number; ships: Set<string> }>()
      rs.forEach((row, i) => {
        for (const d of row.catch_details) {
          if (!d.species_name || d.count === null) continue
          const cur = m.get(d.species_name) ?? { total: 0, count: 0, ships: new Set() }
          cur.total += d.count
          cur.count += 1
          cur.ships.add(String(i)) // row index as proxy for distinct records
          m.set(d.species_name, cur)
        }
      })
      return m
    }

    const recentMap = buildMap(recentRows)
    const prevMap   = buildMap(prevRows)

    const topSpecies: SpeciesStat[] = [...recentMap.entries()]
      .map(([speciesName, v]) => {
        const recentAvg = v.total / v.count
        const prev = prevMap.get(speciesName)
        const prevAvg = prev ? prev.total / prev.count : 0
        let trend: 'up' | 'flat' | 'down' = 'flat'
        if (prevAvg === 0) {
          trend = recentAvg > 0 ? 'up' : 'flat'
        } else {
          const ratio = recentAvg / prevAvg
          if (ratio >= 1.1) trend = 'up'
          else if (ratio <= 0.9) trend = 'down'
        }
        return {
          name: speciesName,
          avgMax: Math.round(recentAvg),
          shipCount: v.ships.size,
          trend,
        }
      })
      .sort((a, b) => b.avgMax - a.avgMax)

    return {
      areaName: name,
      slug,
      description,
      weekRecords: recentRows.length,
      topSpecies,
      aiSummary: null,
      aiSummaryDate: null,
    }
  })
}

async function getRecommendations(): Promise<Recommendation[]> {
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 14)
  const cutoffStr = cutoff.toISOString().slice(0, 10)

  const { data } = await supabase
    .from('catches')
    .select('sail_date, shipyards ( name, areas ( name ) ), catch_details ( species_name, count )')
    .gte('sail_date', cutoffStr)
    .order('sail_date', { ascending: false })

  type RawRec = {
    sail_date: string | null
    shipyards: { name: string; areas: { name: string } | null } | null
    catch_details: { species_name: string | null; count: number | null }[]
  }
  const rows = (data ?? []) as unknown as RawRec[]

  const today = new Date()
  const last7Str = new Date(today); last7Str.setDate(today.getDate() - 7)
  const prev7Str = new Date(today); prev7Str.setDate(today.getDate() - 14)
  const last7StrISO = last7Str.toISOString().slice(0, 10)
  const prev7StrISO = prev7Str.toISOString().slice(0, 10)

  type PairAgg = { sumCount: number; nEntries: number; shipyards: Set<string> }
  const last7 = new Map<string, PairAgg>()
  const prev7 = new Map<string, PairAgg>()

  for (const row of rows) {
    const area = row.shipyards?.areas?.name
    const yard = row.shipyards?.name
    const date = row.sail_date
    if (!area || !date) continue
    const isLast7 = date >= last7StrISO
    const isPrev7 = date >= prev7StrISO && date < last7StrISO
    const target = isLast7 ? last7 : isPrev7 ? prev7 : null
    if (!target) continue
    for (const d of row.catch_details) {
      if (!d.species_name || d.count === null || d.count <= 0) continue
      const key = `${area}|${d.species_name}`
      const cur = target.get(key) ?? { sumCount: 0, nEntries: 0, shipyards: new Set<string>() }
      cur.sumCount += d.count
      cur.nEntries += 1
      if (yard) cur.shipyards.add(yard)
      target.set(key, cur)
    }
  }

  const results: Recommendation[] = []
  for (const [key, l7] of last7.entries()) {
    if (l7.nEntries < 3) continue
    const [area, fish] = key.split('|')
    const avgCount = l7.sumCount / l7.nEntries
    if (avgCount < 3) continue
    const shipCount = l7.shipyards.size
    const p7 = prev7.get(key)
    let wowPercent: number | null = null
    if (p7 && p7.nEntries > 0) {
      const prevAvg = p7.sumCount / p7.nEntries
      if (prevAvg > 0) wowPercent = Math.round((avgCount - prevAvg) / prevAvg * 100)
    }
    const countScore = Math.min(avgCount / 40 * 60, 60)
    const wowScore   = wowPercent !== null && wowPercent > 0 ? Math.min(wowPercent / 60 * 25, 25) : 0
    const shipScore  = Math.min(shipCount / 5 * 15, 15)
    const score      = Math.round(countScore + wowScore + shipScore)
    results.push({ area, fish, score, avgCount: Math.round(avgCount), wowPercent, shipCount, rank: 1 })
  }

  results.sort((a, b) => b.score - a.score)
  return results.slice(0, 3).map((r, i) => ({ ...r, rank: (i + 1) as 1 | 2 | 3 }))
}

async function getAISummariesForAreas(): Promise<AISummaryRecord[]> {
  const { data } = await supabase
    .from('ai_summaries')
    .select('summary_type, target_id, target_date, summary_text')
    .eq('summary_type', 'area')
    .order('target_date', { ascending: false })
    .limit(20)
  return (data ?? []) as AISummaryRecord[]
}

async function getLatestUpdatedAt(): Promise<string | null> {
  const { data } = await supabase
    .from('catches')
    .select('created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.created_at ?? null
}

// ── 下位ページで使う汎用データ取得関数（他ページが直接 import できるように export） ──
export async function fetchEnvDataMap(): Promise<EnvDataMap> {
  const { data } = await supabase
    .from('environment_data')
    .select('date, weather, wind_speed_ms, tide_type')
    .order('date', { ascending: false })
    .limit(30)
  if (!data) return {}
  return Object.fromEntries(
    data.map((row) => [row.date, {
      weather:       row.weather       ?? null,
      wind_speed_ms: row.wind_speed_ms ?? null,
      tide_type:     row.tide_type     ?? null,
    }])
  )
}

export const revalidate = 300

// ── Page ───────────────────────────────────────────────────────
export default async function Home() {
  const [areaStats, aiSummaries, latestAt, recommendations] = await Promise.all([
    getAreaStats(),
    getAISummariesForAreas(),
    getLatestUpdatedAt(),
    getRecommendations(),
  ])

  const statsWithSummary = areaStats.map((s) => {
    const summary = aiSummaries.find((a) => {
      const areaId = AREA_CONFIG.findIndex((c) => c.name === s.areaName) + 1
      return a.target_id === areaId
    })
    return { ...s, aiSummary: summary?.summary_text ?? null, aiSummaryDate: summary?.target_date ?? null }
  })

  const nowStr = new Date(latestAt ?? Date.now()).toLocaleString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Tokyo',
  })

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>

      {/* ── Header ─────────────────────────────────────────────── */}
      <SiteHeader updatedAt={nowStr} />

      {/* ── Hero ────────────────────────────────────────────────── */}
      <div style={{ position: 'relative', overflow: 'hidden', minHeight: 280 }}>
        {/* 背景画像 */}
        <img
          src="https://images.unsplash.com/photo-1505118380757-91f5f5632de0?w=1920&q=80"
          alt="海釣り"
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            objectFit: 'cover',
            objectPosition: 'center',
            filter: 'brightness(0.45)',
          }}
        />
        {/* 下部フェード */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to bottom, transparent 40%, var(--bg-surface) 100%)',
        }} />
        {/* コンテンツ */}
        <div style={{ position: 'relative', paddingTop: 48, paddingBottom: 56 }}>
          <div className="page-container">
            <p style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.16em',
              color: '#00d4c8', textTransform: 'uppercase', marginBottom: 12,
            }}>
              FISHING REPORT — DAILY UPDATE
            </p>
            <h1 style={{
              fontSize: 'clamp(26px, 5vw, 40px)', fontWeight: 700, color: '#f0f4ff',
              fontFamily: 'var(--font-serif)', letterSpacing: '0.05em',
              lineHeight: 1.2, marginBottom: 12,
            }}>
              関東圏の船釣り釣果まとめ
            </h1>
            <p style={{
              fontSize: 16, fontWeight: 500, color: '#00d4c8',
              marginBottom: 10, letterSpacing: '0.04em',
            }}>
              釣果データで、海を見る。
            </p>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', maxWidth: 480, lineHeight: 1.65 }}>
              関東圏の複数船宿から釣果データを毎日自動収集。エリアを選んで最新の釣果情報を確認できます。
            </p>
          </div>
        </div>
      </div>

      {/* ── Main ─────────────────────────────────────────────────── */}
      <main style={{ padding: '32px 0 100px' }}>
        <div className="page-container">

          {/* 今週末のおすすめ */}
          {recommendations.length > 0 && (
            <div style={{ marginBottom: 32 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <h2 style={{ fontSize: 15, fontWeight: 700, color: '#f0f4ff', fontFamily: 'var(--font-serif)', letterSpacing: '0.04em' }}>
                  今週末のおすすめ
                </h2>
                <Link href="/analysis" style={{ fontSize: 11, color: '#00d4c8', opacity: 0.8 }}>
                  詳細分析 →
                </Link>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {recommendations.map((rec) => (
                  <TopRecommendationCard key={`${rec.area}-${rec.fish}`} rec={rec} />
                ))}
              </div>
            </div>
          )}

          {/* エリアカード 2×2グリッド */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 20,
            marginBottom: 40,
          }}>
            {statsWithSummary.map((stat) => (
              <AreaCard key={stat.slug} stat={stat} />
            ))}
          </div>

          {/* 使い方ガイド */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.02) 100%)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            borderTop: '1px solid rgba(255,255,255,0.20)',
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 20,
            padding: '20px 24px',
          }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 10, letterSpacing: '0.08em' }}>
              ご利用方法
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {[
                'エリアカードをタップして詳細な釣果一覧を確認',
                '魚種・釣り方・期間でフィルタリングして比較',
                '船長コメントや釣果グラフで傾向を分析',
              ].map((text, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 20, height: 20, borderRadius: '50%',
                    background: 'rgba(0,212,200,0.15)', color: '#00d4c8',
                    fontSize: 11, fontWeight: 700, flexShrink: 0, marginTop: 1,
                  }}>{i + 1}</span>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>{text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)', padding: '32px 0' }}>
        <div className="page-container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            © {new Date().getFullYear()} 釣果情報.com — 関東圏 船釣り釣果情報
          </span>
          <span style={{ fontSize: 11, color: 'var(--border-strong)' }}>
            データは各船宿サイトより自動収集しています
          </span>
        </div>
      </footer>
    </div>
  )
}

// ── TopRecommendationCard ─────────────────────────────────────
const RANK_BADGE: Record<number, { bg: string; border: string; color: string }> = {
  1: { bg: 'rgba(0,212,200,0.15)',   border: 'rgba(0,212,200,0.5)', color: '#00d4c8' },
  2: { bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.2)', color: '#8899bb' },
  3: { bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.12)', color: '#4a5a7a' },
}

function TopRecommendationCard({ rec }: { rec: Recommendation }) {
  const areaSlug = AREA_SLUGS[rec.area] ?? 'tokyo'
  const fishSlug = FISH_SLUGS[rec.fish]
  const href     = fishSlug ? `/fish/${fishSlug}/${areaSlug}` : `/area/${areaSlug}`
  const scoreColor =
    rec.score >= 70 ? '#4ade80' :
    rec.score >= 40 ? '#facc15' : '#94a3b8'

  return (
    <Link href={href} style={{ textDecoration: 'none' }}>
      <div style={{
        background: 'linear-gradient(135deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.02) 100%)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(255,255,255,0.20)',
        border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: 16,
        padding: '14px 18px',
        display: 'flex', alignItems: 'center', gap: 14,
        cursor: 'pointer',
      }}>
        <div style={{
          width: 24, height: 24, borderRadius: 6,
          background: RANK_BADGE[rec.rank].bg,
          border: `1px solid ${RANK_BADGE[rec.rank].border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 11, fontWeight: 700, color: RANK_BADGE[rec.rank].color,
          flexShrink: 0,
        }}>{rec.rank}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 15, fontWeight: 700, color: '#f0f4ff' }}>
            {rec.area} × {rec.fish}
          </span>
          <div style={{ display: 'flex', gap: 14, marginTop: 4, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: '#8899bb' }}>
              平均 <span style={{ color: '#f0f4ff', fontWeight: 600 }}>{rec.avgCount}尾</span>
            </span>
            {rec.wowPercent !== null && (
              <span style={{ fontSize: 11, color: '#8899bb' }}>
                前週比 <span style={{ color: rec.wowPercent >= 0 ? '#4ade80' : '#f87171', fontWeight: 600 }}>
                  {rec.wowPercent >= 0 ? '+' : ''}{rec.wowPercent}%
                </span>
              </span>
            )}
            <span style={{ fontSize: 11, color: '#8899bb' }}>
              <span style={{ color: '#f0f4ff', fontWeight: 600 }}>{rec.shipCount}</span>船宿
            </span>
          </div>
        </div>
        <div style={{ textAlign: 'center', flexShrink: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: scoreColor, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
            {rec.score}
          </div>
          <div style={{ fontSize: 9, color: '#8899bb', marginTop: 2 }}>スコア</div>
        </div>
      </div>
    </Link>
  )
}

// ── トレンドインジケーター ────────────────────────────────────
const TREND = {
  up:   { icon: '↑', color: '#22c55e' },
  flat: { icon: '→', color: '#6b7280' },
  down: { icon: '↓', color: '#ef4444' },
}

// ── AreaCard コンポーネント ────────────────────────────────────
function AreaCard({ stat }: { stat: AreaStat }) {
  const { slug, areaName, description, weekRecords, topSpecies, aiSummary, aiSummaryDate } = stat
  const hasData = weekRecords > 0 || topSpecies.length > 0

  return (
    <Link href={`/area/${slug}`} style={{ textDecoration: 'none' }}>
      <div style={{
        background: 'linear-gradient(135deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.02) 100%)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderTop: '1px solid rgba(255,255,255,0.20)',
        border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: 20,
        padding: '24px',
        cursor: 'pointer',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 0,
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}>

        {/* カードヘッダー */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
          <h2 style={{
            fontSize: 22, fontWeight: 700, color: '#f0f4ff', margin: 0,
            fontFamily: 'var(--font-serif)', letterSpacing: '0.04em',
          }}>
            {areaName}
          </h2>
          {weekRecords > 0 && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '3px 9px',
              borderRadius: 'var(--radius-pill)',
              background: 'rgba(0,212,200,0.12)', color: '#00d4c8',
              border: '1px solid rgba(0,212,200,0.35)',
              whiteSpace: 'nowrap', flexShrink: 0, marginLeft: 8,
            }}>
              今週{weekRecords}件
            </span>
          )}
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>{description}</p>

        {/* 区切り線 */}
        <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', marginBottom: 16 }} />

        {hasData ? (
          <>
            {/* 今週の注目魚種 */}
            {topSpecies.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 10, color: '#8899bb', marginBottom: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  今週の釣果報告
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {topSpecies.map((sp) => {
                    const t = TREND[sp.trend]
                    return (
                      <div key={sp.name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {/* Lucide Fish icon */}
                        <Fish size={14} strokeWidth={1.5} style={{ color: '#00d4c8', flexShrink: 0 }} />
                        {/* 魚種名 */}
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', flex: 1 }}>
                          {sp.name}
                        </span>
                        {/* トレンド */}
                        <span style={{ fontSize: 13, fontWeight: 700, color: t.color, minWidth: 14, textAlign: 'center' }}>
                          {t.icon}
                        </span>
                        {/* 平均釣果 */}
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#f0f4ff', minWidth: 30, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {sp.avgMax}
                        </span>
                        {/* 出船数 */}
                        <span style={{ fontSize: 10, color: '#8899bb', minWidth: 36 }}>
                          {sp.shipCount}船
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* AIサマリー（全文） */}
            {aiSummary && (
              <div style={{
                background: 'rgba(0,212,200,0.04)',
                border: '1px solid rgba(0,212,200,0.15)',
                borderRadius: 10,
                padding: '10px 12px',
                marginBottom: 14,
              }}>
                <p style={{ fontSize: 10, color: '#00d4c8', marginBottom: 4, fontWeight: 600, opacity: 0.8 }}>
                  ✦ {aiSummaryDate ? `${aiSummaryDate.replace(/-/g, '/')}の状況` : '状況'}
                </p>
                <p style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.65, margin: 0 }}>
                  {aiSummary}
                </p>
              </div>
            )}
          </>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '20px 0' }}>
            データ収集準備中
          </p>
        )}

        {/* 詳細リンク */}
        <div style={{ marginTop: 'auto', paddingTop: 12 }}>
          <span style={{
            fontSize: 13, fontWeight: 600, color: '#00d4c8',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            釣果一覧を見る →
          </span>
        </div>
      </div>
    </Link>
  )
}
