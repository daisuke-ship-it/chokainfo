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
    .from('fishing_trips')
    .select(`
      id, created_at, sail_date, boat_name_raw, source_url, condition_text,
      shipyards ( name, areas ( name ), ports ( name ) ),
      catches_v2!inner ( id, fish_species_id, species_name_raw, count, count_min, count_max, unit, size_text, detail_type, fish_species ( name ) )
    `)
    .eq('catches_v2.fish_species_id', fishSpeciesId)
    .order('sail_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(500)

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

  // フロント側デデュープ
  const seen = new Set<string>()
  return mapped.filter((r) => {
    const key = [r.shipyard_name ?? '', r.date ?? '', r.boat_name ?? ''].join('|')
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
    .from('fishing_trips')
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
    <div style={{ minHeight: '100vh' }}>

      {/* ── Header ─────────────────────────────────────────── */}
      <SiteHeader updatedAt={nowStr} subtitle={content.name} />

      {/* ── Hero + 魚種タブ ──────────────────────────────── */}
      <section style={{ position: 'relative', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(135deg, rgba(0,212,200,0.06) 0%, transparent 40%, rgba(0,212,200,0.03) 100%)',
        }} />
        <div className="page-container" style={{ position: 'relative', padding: '32px 16px 24px' }}>

          {/* パンくずナビ */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
            <Link href="/" style={{ color: 'var(--text-secondary)' }}>トップ</Link>
            <span style={{ opacity: 0.5 }}>›</span>
            <Link href="/fish/tachiuo" style={{ color: 'var(--text-secondary)' }}>魚種</Link>
            <span style={{ opacity: 0.5 }}>›</span>
            <span style={{ color: 'var(--text-primary)' }}>{content.name}</span>
          </div>

          <p className="section-label" style={{ marginBottom: 8, color: 'var(--color-cyan)' }}>
            SPECIES FISHING REPORT
          </p>
          <h1 style={{ marginBottom: 6 }}>
            {content.name}釣果まとめ
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 460, lineHeight: 1.7 }}>
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
                    padding: '5px 14px',
                    borderRadius: 100,
                    fontSize: 12, fontWeight: isActive ? 600 : 400,
                    border: isActive ? '1px solid var(--color-cyan)' : '1px solid var(--border-default)',
                    background: isActive ? 'var(--color-cyan-dim)' : 'transparent',
                    color: isActive ? 'var(--color-cyan)' : 'var(--text-secondary)',
                    whiteSpace: 'nowrap' as const,
                  }}
                >
                  {fc.name}
                </Link>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── Main ─────────────────────────────────────────── */}
      <main className="page-container" style={{ paddingTop: 8, paddingBottom: 100 }}>
        <FishDashboard
          records={records}
          envData={envData}
          aiSummaries={aiSummaries}
          areas={areas}
          fishId={fishId}
          content={content}
        />
      </main>

      {/* ── Footer ───────────────────────────────────────── */}
      <footer style={{ borderTop: '1px solid var(--border-subtle)', padding: '28px 0' }}>
        <div className="page-container" style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexWrap: 'wrap', gap: 8,
        }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            &copy; {new Date().getFullYear()} 釣果情報.com
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            データは各船宿サイトより自動収集
          </span>
        </div>
      </footer>
    </div>
  )
}
