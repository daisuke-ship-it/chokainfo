import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { supabase, CatchRecord } from '@/lib/supabase'
import { fishContents } from '@/lib/fishContent'
import { EnvData, EnvDataMap, AISummaryRecord, AreaRecord } from '@/app/page'
import FishDashboard from '@/components/FishDashboard'
import SiteHeader from '@/components/SiteHeader'

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
async function getFishSpeciesId(fishName: string): Promise<number | null> {
  const { data } = await supabase
    .from('fish_species')
    .select('id')
    .eq('name', fishName)
    .maybeSingle()
  return data?.id ?? null
}

async function getCatchDataForFish(fishSpeciesId: number): Promise<CatchRecord[]> {
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
    .eq('fish_species_id', fishSpeciesId)
    .order('sail_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(500)

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

  // フロント側デデュープ
  const seen = new Set<string>()
  return mapped.filter((r) => {
    const key = [r.shipyard_name ?? '', r.date ?? '', r.count_min ?? '', r.count_max ?? ''].join('|')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
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

async function getAISummaries(fishId: number): Promise<AISummaryRecord[]> {
  const { data } = await supabase
    .from('ai_summaries')
    .select('summary_type, target_id, target_date, summary_text')
    .eq('summary_type', 'fish_species')
    .eq('target_id', fishId)
    .order('target_date', { ascending: false })
    .limit(30)
  return (data ?? []) as AISummaryRecord[]
}

async function getAreas(): Promise<AreaRecord[]> {
  const { data } = await supabase
    .from('areas')
    .select('id, name')
    .order('id')
  return (data ?? []) as AreaRecord[]
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

// ── Static params / Metadata ───────────────────────────────────
export async function generateStaticParams() {
  return Object.keys(fishContents).map((slug) => ({ slug }))
}

type PageParams = Promise<{ slug: string }>

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const { slug } = await params
  const content = fishContents[slug]
  if (!content) return {}

  const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.chokainfo.com'
  const today = new Date().toISOString().slice(0, 10)
  const ogImage = `${BASE_URL}/api/og?area=${encodeURIComponent('東京湾')}&fish=${encodeURIComponent(content.name)}&date=${today}`

  return {
    title: content.metaTitle,
    description: content.metaDescription,
    openGraph: {
      title: content.metaTitle,
      description: content.metaDescription,
      siteName: '釣果情報.com',
      type: 'website',
      locale: 'ja_JP',
      images: [{ url: ogImage, width: 1200, height: 630, alt: `${content.name} 釣果情報` }],
    },
    twitter: {
      card: 'summary_large_image',
      title: content.metaTitle,
      description: content.metaDescription,
      images: [ogImage],
    },
  }
}

export const revalidate = 3600

// ── Page ───────────────────────────────────────────────────────
export default async function FishPage({ params }: { params: PageParams }) {
  const { slug } = await params
  const content = fishContents[slug]
  if (!content) notFound()

  const fishId = await getFishSpeciesId(content.name)
  if (!fishId) notFound()

  const [records, envData, aiSummaries, areas, latestAt] = await Promise.all([
    getCatchDataForFish(fishId),
    getEnvDataMap(),
    getAISummaries(fishId),
    getAreas(),
    getLatestUpdatedAt(),
  ])

  const nowStr = new Date(latestAt ?? Date.now()).toLocaleString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Tokyo',
  })

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>

      {/* ── Header ─────────────────────────────────────────── */}
      <SiteHeader updatedAt={nowStr} subtitle="東京湾 · 相模湾" />

      {/* ── Hero + 魚種タブ ──────────────────────────────── */}
      <div style={{ background: 'var(--primary)', paddingTop: 40, paddingBottom: 44 }}>
        <div className="page-container">

          {/* パンくずナビ */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 10 }}>
            <Link href="/" style={{ color: 'rgba(255,255,255,0.55)' }}>トップ</Link>
            <span>›</span>
            <span style={{ color: 'rgba(255,255,255,0.75)' }}>{content.name}釣果情報</span>
          </div>

          <div style={{ marginBottom: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', color: 'var(--accent)', textTransform: 'uppercase' }}>
              FISHING REPORT — DAILY UPDATE
            </span>
          </div>
          <h1 style={{ fontSize: 'clamp(16px, 3vw, 24px)', fontWeight: 700, color: 'white', fontFamily: 'var(--font-serif)', letterSpacing: '0.04em', lineHeight: 1.25, marginBottom: 6 }}>
            東京湾 {content.name}釣果まとめ
          </h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', maxWidth: 480, lineHeight: 1.6 }}>
            {content.description}
          </p>

          {/* 魚種切り替えタブ */}
          <div style={{ display: 'flex', gap: 6, marginTop: 16, flexWrap: 'wrap' }}>
            {Object.values(fishContents).map((fc) => {
              const isActive = fc.slug === slug
              return (
                <Link
                  key={fc.slug}
                  href={`/fish/${fc.slug}`}
                  style={{
                    padding: '5px 16px',
                    borderRadius: 'var(--radius-pill)',
                    fontSize: 13, fontWeight: isActive ? 700 : 400,
                    border: isActive ? '1.5px solid #d4a017' : '1px solid rgba(255,255,255,0.2)',
                    background: isActive ? 'rgba(212,160,23,0.15)' : 'transparent',
                    color: isActive ? '#d4a017' : 'rgba(255,255,255,0.6)',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.15s',
                  }}
                >
                  {fc.name}
                </Link>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Main ─────────────────────────────────────────── */}
      <main style={{ padding: '40px 0 100px' }}>
        <div className="page-container">
          <FishDashboard
            records={records}
            envData={envData}
            aiSummaries={aiSummaries}
            areas={areas}
            fishId={fishId}
            content={content}
          />
        </div>
      </main>

      {/* ── Footer ───────────────────────────────────────── */}
      <footer style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)', padding: '32px 0' }}>
        <div className="page-container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            © {new Date().getFullYear()} 釣果情報.com — 東京湾・相模湾 船釣り釣果情報
          </span>
          <span style={{ fontSize: 11, color: 'var(--border-strong)' }}>
            データは各船宿サイトより自動収集しています
          </span>
        </div>
      </footer>
    </div>
  )
}
