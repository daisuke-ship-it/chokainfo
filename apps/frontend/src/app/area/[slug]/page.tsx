import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { TrendingUp, Fish } from 'lucide-react'
import { supabase, CatchRecord } from '@/lib/supabase'
import { EnvDataMap, AISummaryRecord, AreaRecord, FishRecord, SpeciesGroupMap } from '@/app/page'
import CatchDashboard from '@/components/CatchDashboard'
import SiteHeader from '@/components/SiteHeader'

// ── エリア定義 ──────────────────────────────────────────────
type AreaSlug = 'tokyo' | 'sagami' | 'sotobo' | 'minamibo'
type AreaName = '東京湾' | '相模湾' | '外房' | '南房'

const AREA_CONFIG: Record<AreaSlug, { name: AreaName; id: number; description: string }> = {
  tokyo:    { name: '東京湾', id: 1, description: '金沢八景・横浜・走水など東京湾の船宿釣果情報を毎日自動収集。タチウオ・アジ・シーバスなど最新データを確認できます。' },
  sagami:   { name: '相模湾', id: 2, description: '茅ケ崎・平塚・小田原など相模湾の船宿釣果情報を毎日自動収集。カツオ・マダイ・サワラなど最新データを確認できます。' },
  sotobo:   { name: '外房',   id: 4, description: '勝浦・大原・一宮など外房の船宿釣果情報を毎日自動収集。ヒラメ・マダイ・イサキなど最新データを確認できます。' },
  minamibo: { name: '南房',   id: 5, description: '館山・白浜など南房の船宿釣果情報を毎日自動収集。マダイ・ヒラメ・イカなど最新データを確認できます。' },
}

// ── 型定義 ────────────────────────────────────────────────────
type RawCatchDetail = {
  id: number
  species_name_raw: string | null
  count: number | null
  unit: string | null
  size_text: string | null
  fish_species: { name: string } | null
}

type RawCatch = {
  id: number
  created_at: string
  sail_date: string | null
  boat_name_raw: string | null
  source_url: string | null
  condition_text: string | null
  shipyards: { name: string; areas: { name: string } | null; ports: { name: string } | null } | null
  catches_v2: RawCatchDetail[]
}

// ── データ取得 ─────────────────────────────────────────────────
async function getCatchData(): Promise<CatchRecord[]> {
  const { data, error } = await supabase
    .from('fishing_trips')
    .select(`
      id,
      created_at,
      sail_date,
      boat_name_raw,
      source_url,
      condition_text,
      shipyards ( name, areas ( name ), ports ( name ) ),
      catches_v2 ( id, fish_species_id, species_name_raw, count, count_min, count_max, unit, size_text, detail_type, fish_species ( name ) )
    `)
    .order('sail_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Supabase fetch error:', error)
    return []
  }

  const rawRows = (data ?? []) as unknown as RawCatch[]
  const mapped: CatchRecord[] = rawRows.map((row) => {
    const details = row.catches_v2 ?? []
    const mainFish = details.find(d => d.fish_species)?.fish_species?.name ?? null
    const counts = details.map(d => d.count).filter((v): v is number => v !== null)

    return {
      id:             row.id,
      created_at:     row.created_at,
      date:           row.sail_date,
      boat_name:      row.boat_name_raw ?? null,
      fish_name:      mainFish,
      size_min_cm:    null,
      size_max_cm:    null,
      count_min:      counts.length ? Math.min(...counts) : null,
      count_max:      counts.length ? Math.max(...counts) : null,
      source_url:     row.source_url,
      shipyard_name:  row.shipyards?.name ?? null,
      shipyard_area:  row.shipyards?.areas?.name ?? null,
      port_name:      row.shipyards?.ports?.name ?? null,
      fishing_method: null,
      method_group:   null,
      condition_text: row.condition_text ?? null,
      catch_details:  details.map((d) => ({
        id:           d.id,
        species_name: d.species_name_raw ?? null,
        count:        d.count ?? null,
        unit:         d.unit ?? null,
        size_text:    d.size_text ?? null,
      })),
    }
  })

  const seen = new Set<string>()
  return mapped.filter((r) => {
    const key = [r.shipyard_name ?? '', r.date ?? '', r.boat_name ?? ''].join('|')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
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

async function getEnvDataMap(): Promise<EnvDataMap> {
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

async function getAreas(): Promise<AreaRecord[]> {
  const { data } = await supabase
    .from('areas')
    .select('id, name')
    .order('id')
  return (data ?? []) as AreaRecord[]
}

async function getFishSpecies(): Promise<FishRecord[]> {
  const { data } = await supabase
    .from('fish_species')
    .select('id, name')
    .order('id')
  return (data ?? []) as FishRecord[]
}

async function getSpeciesGroupMap(): Promise<SpeciesGroupMap> {
  const { data } = await supabase
    .from('species_groups')
    .select('species_name, group_name')
  if (!data || data.length === 0) return {}

  const byGroup: Record<string, string[]> = {}
  for (const row of data) {
    if (!byGroup[row.group_name]) byGroup[row.group_name] = []
    byGroup[row.group_name].push(row.species_name)
  }
  const result: SpeciesGroupMap = {}
  for (const row of data) {
    result[row.species_name] = byGroup[row.group_name]
  }
  return result
}

async function getAISummaries(): Promise<AISummaryRecord[]> {
  const { data } = await supabase
    .from('ai_summaries')
    .select('summary_type, target_id, target_date, summary_text')
    .order('target_date', { ascending: false })
    .limit(200)
  return (data ?? []) as AISummaryRecord[]
}

// ── Static params / Metadata ───────────────────────────────────
export async function generateStaticParams() {
  return Object.keys(AREA_CONFIG).map((slug) => ({ slug }))
}

type PageParams = Promise<{ slug: string }>

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const { slug } = await params
  const config = AREA_CONFIG[slug as AreaSlug]
  if (!config) return {}

  const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.chokainfo.com'
  const now = new Date()
  const today = now.toISOString().slice(0, 10)
  const ogImage = `${BASE_URL}/api/og?area=${encodeURIComponent(config.name)}&date=${today}`
  const title = `${config.name}の船釣り釣果情報【${now.getFullYear()}年${now.getMonth() + 1}月最新】| 釣果情報.com`

  return {
    title,
    description: config.description,
    openGraph: {
      title,
      description: config.description,
      siteName: '釣果情報.com',
      type: 'website',
      locale: 'ja_JP',
      images: [{ url: ogImage, width: 1200, height: 630, alt: `${config.name} 釣果情報` }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: config.description,
      images: [ogImage],
    },
  }
}

export const revalidate = 300

// ── Page ───────────────────────────────────────────────────────
export default async function AreaPage({ params }: { params: PageParams }) {
  const { slug } = await params
  const config = AREA_CONFIG[slug as AreaSlug]
  if (!config) notFound()

  const [records, envData, latestAt, areas, fishSpeciesList, aiSummaries, speciesGroupMap] = await Promise.all([
    getCatchData(),
    getEnvDataMap(),
    getLatestUpdatedAt(),
    getAreas(),
    getFishSpecies(),
    getAISummaries(),
    getSpeciesGroupMap(),
  ])

  const nowStr = new Date(latestAt ?? Date.now()).toLocaleString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Tokyo',
  })

  // ── 直近7日の釣れている魚ランキング（サーバーサイド算出） ───
  const cutoff7 = new Date()
  cutoff7.setDate(cutoff7.getDate() - 7)
  const cutoff7Str = cutoff7.toISOString().slice(0, 10)

  const areaRecords = records.filter((r) => r.shipyard_area === config.name)
  const speciesStats = new Map<string, { trips: number; totalCount: number }>()
  for (const r of areaRecords) {
    if (!r.date || r.date < cutoff7Str) continue
    const seen = new Set<string>()
    for (const d of r.catch_details) {
      if (!d.species_name || d.count === null) continue
      const name = d.species_name
      if (seen.has(name)) continue
      seen.add(name)
      const cur = speciesStats.get(name) ?? { trips: 0, totalCount: 0 }
      cur.trips += 1
      cur.totalCount += d.count
      speciesStats.set(name, cur)
    }
  }

  const topFish = [...speciesStats.entries()]
    .map(([name, v]) => ({ name, trips: v.trips, avg: Math.round(v.totalCount / v.trips) }))
    .sort((a, b) => b.trips - a.trips || b.avg - a.avg)
    .slice(0, 6)

  return (
    <div style={{ minHeight: '100vh' }}>

      {/* ── 構造化データ ──────────────────────────────────────── */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'BreadcrumbList',
          itemListElement: [
            { '@type': 'ListItem', position: 1, name: 'トップ', item: 'https://www.chokainfo.com/' },
            { '@type': 'ListItem', position: 2, name: config.name, item: `https://www.chokainfo.com/area/${slug}` },
          ],
        }) }}
      />

      {/* ── Header ─────────────────────────────────────────────── */}
      <SiteHeader updatedAt={nowStr} subtitle={config.name} />

      {/* ── Hero ────────────────────────────────────────────────── */}
      <section style={{ position: 'relative', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(135deg, rgba(56,189,248,0.06) 0%, transparent 40%, rgba(56,189,248,0.03) 100%)',
        }} />
        <div className="page-container" style={{ position: 'relative', padding: '32px 16px 28px' }}>
          {/* パンくずナビ */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
            <Link href="/" style={{ color: 'var(--text-secondary)' }}>トップ</Link>
            <span style={{ opacity: 0.5 }}>›</span>
            <span style={{ color: 'var(--text-primary)' }}>{config.name}</span>
          </div>
          <p className="section-label" style={{ marginBottom: 8, color: 'var(--color-cyan)' }}>
            AREA FISHING REPORT
          </p>
          <h1 style={{ marginBottom: 6 }}>
            {config.name}の船釣り釣果
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 460, lineHeight: 1.7 }}>
            {config.description}
          </p>
        </div>
      </section>

      {/* ── 今釣れている魚ランキング（SEO + 即表示） ───────────── */}
      {topFish.length > 0 && (
        <section className="page-container" style={{ paddingTop: 16, paddingBottom: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <TrendingUp size={14} style={{ color: 'var(--color-cyan)' }} />
            <span className="section-label">今{config.name}で釣れている魚</span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>直近7日</span>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {topFish.map((sp, i) => (
              <div key={sp.name} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 16px', borderRadius: 12,
                border: '1px solid var(--border-default)',
                background: i === 0 ? 'rgba(56,189,248,0.08)' : 'var(--bg-card)',
              }}>
                <span style={{
                  fontSize: 11, fontWeight: 700,
                  color: i === 0 ? 'var(--color-cyan)' : 'var(--text-muted)',
                  minWidth: 16,
                }}>
                  {i + 1}
                </span>
                <Fish size={13} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500 }}>{sp.name}</span>
                <span className="data-value" style={{ fontSize: 13, color: 'var(--color-cyan)', fontWeight: 600 }}>
                  {sp.avg}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{sp.trips}件</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Main ─────────────────────────────────────────────────── */}
      <main className="page-container" style={{ paddingTop: 16, paddingBottom: 100 }}>
        {records.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '60px 20px',
            background: 'var(--bg-surface)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-subtle)',
          }}>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>現在、釣果データがありません</p>
          </div>
        ) : (
          <CatchDashboard
            records={records}
            envData={envData}
            areas={areas}
            fishSpeciesList={fishSpeciesList}
            aiSummaries={aiSummaries}
            speciesGroupMap={speciesGroupMap}
            initialArea={config.name}
            initialFish={null}
          />
        )}
      </main>

      {/* ── 魚種別釣果リンク ─────────────────────────────────── */}
      <section className="page-container" style={{ paddingBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Fish size={14} style={{ color: 'var(--color-cyan)' }} />
          <span className="section-label">魚種別釣果を見る</span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            { name: 'タチウオ', slug: 'tachiuo' }, { name: 'アジ', slug: 'aji' },
            { name: 'シーバス', slug: 'seabass' }, { name: 'サワラ', slug: 'sawara' },
            { name: 'トラフグ', slug: 'torafugu' }, { name: 'マダイ', slug: 'madai' },
            { name: 'ヒラメ', slug: 'hirame' }, { name: 'シロギス', slug: 'shirogisu' },
          ].map((f) => (
            <Link
              key={f.slug}
              href={`/fish/${f.slug}`}
              style={{
                padding: '8px 18px', borderRadius: 100, fontSize: 13,
                border: '1px solid var(--border-default)',
                background: 'var(--bg-card)', color: 'var(--text-secondary)',
                textDecoration: 'none',
              }}
            >
              {f.name}
            </Link>
          ))}
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer style={{ borderTop: '1px solid var(--border-subtle)', padding: '28px 0' }}>
        <div className="page-container" style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexWrap: 'wrap', gap: 8,
        }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            &copy; {new Date().getFullYear()} 釣果情報.com — {config.name}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            データは各船宿サイトより自動収集
          </span>
        </div>
      </footer>

    </div>
  )
}
