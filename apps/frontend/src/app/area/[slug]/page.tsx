import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
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
  species_name: string | null
  count: number | null
  unit: string | null
  size_text: string | null
}

type RawCatch = {
  id: number
  created_at: string
  sail_date: string | null
  boat_name: string | null
  count_min: number | null
  count_max: number | null
  size_min_cm: number | null
  size_max_cm: number | null
  source_url: string | null
  condition_text: string | null
  shipyards: { name: string; areas: { name: string } | null; ports: { name: string } | null } | null
  fish_species: { name: string } | null
  fishing_methods: { name: string; method_group: string | null } | null
  catch_details: RawCatchDetail[]
}

// ── データ取得 ─────────────────────────────────────────────────
async function getCatchData(): Promise<CatchRecord[]> {
  const { data, error } = await supabase
    .from('catches')
    .select(`
      id,
      created_at,
      sail_date,
      boat_name,
      count_min,
      count_max,
      size_min_cm,
      size_max_cm,
      source_url,
      condition_text,
      shipyards ( name, areas ( name ), ports ( name ) ),
      fish_species ( name ),
      fishing_methods ( name, method_group ),
      catch_details (*)
    `)
    .order('sail_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Supabase fetch error:', error)
    return []
  }

  const rawRows = (data ?? []) as unknown as RawCatch[]
  const mapped: CatchRecord[] = rawRows.map((row) => ({
    id:             row.id,
    created_at:     row.created_at,
    date:           row.sail_date,
    boat_name:      row.boat_name ?? null,
    fish_name:      row.fish_species?.name ?? null,
    size_min_cm:    row.size_min_cm,
    size_max_cm:    row.size_max_cm,
    count_min:      row.count_min,
    count_max:      row.count_max,
    source_url:     row.source_url,
    shipyard_name:  row.shipyards?.name ?? null,
    shipyard_area:  row.shipyards?.areas?.name ?? null,
    port_name:      row.shipyards?.ports?.name ?? null,
    fishing_method: row.fishing_methods?.name ?? null,
    method_group:   row.fishing_methods?.method_group ?? null,
    condition_text: row.condition_text ?? null,
    catch_details:  (row.catch_details ?? []).map((d) => ({
      id:           d.id,
      species_name: d.species_name ?? null,
      count:        d.count ?? null,
      unit:         d.unit ?? null,
      size_text:    d.size_text ?? null,
    })),
  }))

  const seen = new Set<string>()
  return mapped.filter((r) => {
    const key = [r.shipyard_name ?? '', r.date ?? '', r.fish_name ?? '', r.count_min ?? '', r.count_max ?? ''].join('|')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
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
  const today = new Date().toISOString().slice(0, 10)
  const ogImage = `${BASE_URL}/api/og?area=${encodeURIComponent(config.name)}&date=${today}`
  const title = `${config.name}の船釣り釣果情報 | 釣果情報.com`

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

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>

      {/* ── Header ─────────────────────────────────────────────── */}
      <SiteHeader updatedAt={nowStr} subtitle={config.name} />

      {/* ── Hero with background image ───────────────────────────── */}
      <div style={{ position: 'relative', overflow: 'hidden', minHeight: 280, marginBottom: '-60px' }}>
        <img
          src="https://images.unsplash.com/photo-1505118380757-91f5f5632de0?w=1200&q=80"
          alt="東京湾夜景"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.6 }}
        />
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to bottom, rgba(5,8,15,0.3) 0%, rgba(5,8,15,0.95) 100%)',
        }} />
        <div style={{ position: 'relative', paddingTop: 40, paddingBottom: 80 }}>
          <div className="page-container">
            {/* パンくずナビ */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 14 }}>
              <Link href="/" style={{ color: 'rgba(255,255,255,0.55)' }}>トップ</Link>
              <span>›</span>
              <span style={{ color: 'rgba(255,255,255,0.75)' }}>{config.name}</span>
            </div>
            <h1 style={{
              fontSize: 'clamp(26px, 5vw, 40px)',
              fontWeight: 700, color: '#f0f4ff',
              fontFamily: 'var(--font-serif)',
              letterSpacing: '0.04em', lineHeight: 1.2, marginBottom: 12,
            }}>
              {config.name}の船釣り釣果まとめ
            </h1>
            <p style={{ fontSize: '0.9rem', color: '#8899bb', maxWidth: 480, lineHeight: 1.6 }}>
              {config.description}
            </p>
          </div>
        </div>
      </div>

      {/* ── Main ─────────────────────────────────────────────────── */}
      <main style={{ position: 'relative', padding: '20px 0 100px' }}>
        <div className="page-container">
          {records.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '80px 20px',
              background: 'var(--surface)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border)',
            }}>
              <p style={{ fontSize: 32, marginBottom: 10 }}>🎣</p>
              <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>現在、釣果データがありません</p>
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
        </div>
      </main>

      {/* ── Footer ─────────────────────────────────────────────── */}
      <footer style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)', padding: '32px 0' }}>
        <div className="page-container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            © {new Date().getFullYear()} 釣果情報.com — {config.name} 船釣り釣果情報
          </span>
          <span style={{ fontSize: 11, color: 'var(--border-strong)' }}>
            データは各船宿サイトより自動収集しています
          </span>
        </div>
      </footer>

    </div>
  )
}
