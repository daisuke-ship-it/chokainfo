import Link from 'next/link'
import { Fish, TrendingUp, MapPin, ArrowRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import SiteHeader from '@/components/SiteHeader'
import SiteFooter from '@/components/SiteFooter'
import { EnvDataMap, AISummaryRecord } from '@/lib/types'
import { AREA_CONFIG, AREA_SLUGS, FISH_SLUGS, type AreaSlug } from '@/lib/constants'


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
  avgMax: number
  shipCount: number
  trend: 'up' | 'flat' | 'down'
}

type AreaStat = {
  areaName: string
  slug: AreaSlug
  description: string
  weekRecords: number
  topSpecies: SpeciesStat[]
  aiSummary: string | null
  aiSummaryDate: string | null
}

// ── データ取得 ─────────────────────────────────────────────────
type RawRow = {
  sail_date: string | null
  shipyards: { areas: { name: string } | null } | null
  catches_v2: {
    species_name_raw: string | null
    count: number | null
    detail_type: string | null
    fish_species: { name: string } | null
  }[]
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
    .from('fishing_trips')
    .select(`
      sail_date,
      shipyards ( areas ( name ) ),
      catches_v2 ( species_name_raw, count, detail_type, fish_species ( name ) )
    `)
    .gte('sail_date', cutoff14Str)
    .order('sail_date', { ascending: false })

  const rows = (data ?? []) as unknown as RawRow[]

  return AREA_CONFIG.map(({ slug, name, description }) => {
    const areaRows = rows.filter((r) => r.shipyards?.areas?.name === name)
    const recentRows = areaRows.filter((r) => r.sail_date && r.sail_date >= cutoff7Str)
    const prevRows   = areaRows.filter((r) => r.sail_date && r.sail_date < cutoff7Str)

    function buildMap(rs: RawRow[]) {
      const m = new Map<string, { total: number; count: number; ships: Set<string> }>()
      rs.forEach((row, i) => {
        for (const d of row.catches_v2) {
          if (d.detail_type !== 'catch') continue
          const speciesName = d.fish_species?.name ?? d.species_name_raw
          if (!speciesName || d.count === null) continue
          const cur = m.get(speciesName) ?? { total: 0, count: 0, ships: new Set() }
          cur.total += d.count
          cur.count += 1
          cur.ships.add(String(i))
          m.set(speciesName, cur)
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
        return { name: speciesName, avgMax: Math.round(recentAvg), shipCount: v.ships.size, trend }
      })
      .sort((a, b) => b.shipCount - a.shipCount || b.avgMax - a.avgMax)
      .slice(0, 6)

    return {
      areaName: name, slug, description,
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
    .from('fishing_trips')
    .select('sail_date, shipyards ( name, areas ( name ) ), catches_v2 ( species_name_raw, count, detail_type, fish_species ( name ) )')
    .gte('sail_date', cutoffStr)
    .order('sail_date', { ascending: false })

  type RawRec = {
    sail_date: string | null
    shipyards: { name: string; areas: { name: string } | null } | null
    catches_v2: {
      species_name_raw: string | null
      count: number | null
      detail_type: string | null
      fish_species: { name: string } | null
    }[]
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
    for (const d of row.catches_v2) {
      if (d.detail_type !== 'catch') continue
      const speciesName = d.fish_species?.name ?? d.species_name_raw
      if (!speciesName || d.count === null || d.count <= 0) continue
      const key = `${area}|${speciesName}`
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
    .from('fishing_trips')
    .select('created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.created_at ?? null
}

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
    <div style={{ minHeight: '100vh' }}>
      <SiteHeader updatedAt={nowStr} />

      {/* ── Hero ─────────────────────────────────────────── */}
      <section style={{ position: 'relative', overflow: 'hidden', minHeight: 220 }}>
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(160deg, rgba(56,189,248,0.08) 0%, rgba(4,8,16,0.9) 40%, rgba(56,189,248,0.04) 100%)',
        }} />
        <div style={{
          position: 'absolute', inset: 0, opacity: 0.12,
          background: 'radial-gradient(ellipse 80% 60% at 70% 20%, rgba(56,189,248,0.3) 0%, transparent 70%)',
        }} />
        <div className="page-container" style={{ position: 'relative', padding: '48px 16px 44px' }}>
          <p style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.16em',
            color: 'var(--color-cyan)', textTransform: 'uppercase' as const, marginBottom: 12,
          }}>
            FISHING REPORT — DAILY UPDATE
          </p>
          <h1 style={{ marginBottom: 10, fontSize: 'clamp(24px, 5vw, 36px)' }}>
            関東圏の船釣り釣果まとめ
          </h1>
          <p style={{
            fontSize: 16, fontWeight: 500, color: 'var(--color-cyan)',
            marginBottom: 10, letterSpacing: '0.04em',
          }}>
            釣果データで、海を見る。
          </p>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 460, lineHeight: 1.7 }}>
            関東圏の複数船宿から釣果データを毎日自動収集。エリアを選んで最新の釣果情報を確認できます。
          </p>
        </div>
      </section>

      {/* ── Main ──────────────────────────────────────────── */}
      <main className="page-container" style={{ paddingTop: 8, paddingBottom: 100 }}>

        {/* おすすめ */}
        {recommendations.length > 0 && (
          <section style={{ marginBottom: 32 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <TrendingUp size={15} style={{ color: 'var(--color-cyan)' }} />
                <span className="section-label">今週の注目</span>
              </div>
              <Link href="/analysis" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                分析 <ArrowRight size={11} style={{ verticalAlign: '-1px' }} />
              </Link>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
              {recommendations.map((rec) => (
                <RecommendationCard key={`${rec.area}-${rec.fish}`} rec={rec} />
              ))}
            </div>
          </section>
        )}

        {/* エリアカード */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <MapPin size={15} style={{ color: 'var(--color-cyan)' }} />
            <span className="section-label">エリア別釣況</span>
          </div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
            gap: 16,
          }}>
            {statsWithSummary.map((stat) => (
              <AreaCard key={stat.slug} stat={stat} />
            ))}
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  )
}

// ── RecommendationCard ────────────────────────────────────────
function RecommendationCard({ rec }: { rec: Recommendation }) {
  const areaSlug = AREA_SLUGS[rec.area] ?? 'tokyo'
  const fishSlug = FISH_SLUGS[rec.fish as keyof typeof FISH_SLUGS]
  const href = fishSlug ? `/fish/${fishSlug}/${areaSlug}` : `/area/${areaSlug}`

  const scoreColor =
    rec.score >= 70 ? '#34D399' :
    rec.score >= 40 ? '#FBBF24' : 'var(--text-secondary)'

  return (
    <Link href={href} style={{ textDecoration: 'none' }}>
      <div className="glass-card" style={{
        padding: '14px 16px',
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        {/* Score */}
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: `${scoreColor}12`,
          border: `1px solid ${scoreColor}30`,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <span className="data-value" style={{ fontSize: 18, fontWeight: 700, color: scoreColor, lineHeight: 1 }}>
            {rec.score}
          </span>
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3 }}>
            {rec.fish}
            <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 400, marginLeft: 8 }}>
              {rec.area}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--text-secondary)' }}>
            <span>
              平均 <span className="data-value" style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{rec.avgCount}</span>尾
            </span>
            {rec.wowPercent !== null && (
              <span>
                前週比 <span style={{
                  color: rec.wowPercent >= 0 ? '#34D399' : '#F87171',
                  fontWeight: 500,
                }}>
                  {rec.wowPercent >= 0 ? '+' : ''}{rec.wowPercent}%
                </span>
              </span>
            )}
            <span>{rec.shipCount}船宿</span>
          </div>
        </div>
      </div>
    </Link>
  )
}

// ── Trend indicator ──────────────────────────────────────────
const TREND_ICON: Record<string, { icon: string; color: string }> = {
  up:   { icon: '↑', color: '#34D399' },
  flat: { icon: '→', color: 'var(--text-secondary)' },
  down: { icon: '↓', color: '#F87171' },
}

// ── AreaCard ──────────────────────────────────────────────────
function AreaCard({ stat }: { stat: AreaStat }) {
  const { slug, areaName, description, weekRecords, topSpecies, aiSummary, aiSummaryDate } = stat
  const hasData = weekRecords > 0 || topSpecies.length > 0

  return (
    <Link href={`/area/${slug}`} style={{ textDecoration: 'none' }}>
      <div className="glass-card" style={{
        height: '100%', display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
          <div>
            <h2 style={{ fontSize: 20, margin: 0 }}>{areaName}</h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{description}</p>
          </div>
          {weekRecords > 0 && (
            <span style={{
              fontSize: 11, fontWeight: 600, padding: '3px 10px',
              borderRadius: 'var(--radius-pill)',
              background: 'var(--color-cyan-dim)', color: 'var(--color-cyan)',
              border: '1px solid rgba(56,189,248,0.25)',
              whiteSpace: 'nowrap', flexShrink: 0,
            }}>
              {weekRecords}件
            </span>
          )}
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'var(--border-subtle)', margin: '12px 0' }} />

        {hasData ? (
          <>
            {/* Species list */}
            {topSpecies.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <p className="section-label" style={{ marginBottom: 8, fontSize: 10 }}>
                  直近7日の釣果
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {topSpecies.map((sp) => {
                    const t = TREND_ICON[sp.trend]
                    return (
                      <div key={sp.name} style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '4px 0',
                      }}>
                        <Fish size={13} strokeWidth={1.5} style={{ color: 'var(--color-cyan)', opacity: 0.7, flexShrink: 0 }} />
                        <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)', flex: 1 }}>
                          {sp.name}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: t.color, width: 16, textAlign: 'center' }}>
                          {t.icon}
                        </span>
                        <span className="data-value" style={{
                          fontSize: 14, fontWeight: 600, color: 'var(--text-primary)',
                          width: 36, textAlign: 'right',
                        }}>
                          {sp.avgMax}
                        </span>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 32 }}>
                          {sp.shipCount}船
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* AI Summary */}
            {aiSummary && (
              <div style={{
                background: 'rgba(56,189,248,0.04)',
                border: '1px solid rgba(56,189,248,0.12)',
                borderRadius: 10,
                padding: '10px 12px',
                marginBottom: 12,
              }}>
                <p style={{ fontSize: 10, color: 'var(--color-cyan)', marginBottom: 4, fontWeight: 600, opacity: 0.8 }}>
                  {aiSummaryDate ? `${aiSummaryDate.replace(/-/g, '/')} の状況` : '状況'}
                </p>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>
                  {aiSummary}
                </p>
              </div>
            )}
          </>
        ) : (
          <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '24px 0' }}>
            データ収集準備中
          </p>
        )}

        {/* Footer link */}
        <div style={{ marginTop: 'auto', paddingTop: 10 }}>
          <span style={{
            fontSize: 13, fontWeight: 500, color: 'var(--color-cyan)',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            釣果一覧を見る <ArrowRight size={13} />
          </span>
        </div>
      </div>
    </Link>
  )
}
