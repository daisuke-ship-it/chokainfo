import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { supabase, CatchRecord } from '@/lib/supabase'
import { fishContents } from '@/lib/fishContent'
import { fishAreaContents, FishAreaContent } from '@/lib/fishAreaContent'
import { EnvDataMap, AISummaryRecord, AreaRecord } from '@/app/page'
import FishDashboard from '@/components/FishDashboard'
import SiteHeader from '@/components/SiteHeader'

// ── エリア定義 ────────────────────────────────────────────────
type AreaSlug = 'tokyo' | 'sagami' | 'sotobo' | 'minamibo'
type AreaName = '東京湾' | '相模湾' | '外房' | '南房'

const AREA_MAP: Record<AreaSlug, { name: AreaName; slug: string }> = {
  tokyo:    { name: '東京湾', slug: 'tokyo' },
  sagami:   { name: '相模湾', slug: 'sagami' },
  sotobo:   { name: '外房',   slug: 'sotobo' },
  minamibo: { name: '南房',   slug: 'minamibo' },
}

// FishDashboard が受け付けるエリア型に絞る
type FishArea = '東京湾' | '相模湾'
const FISH_DASHBOARD_AREAS: AreaName[] = ['東京湾', '相模湾']

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
      id, created_at, sail_date, boat_name,
      count_min, count_max, size_min_cm, size_max_cm,
      source_url, condition_text,
      shipyards ( name, areas ( name ), ports ( name ) ),
      fish_species ( name ),
      fishing_methods ( name, method_group ),
      catch_details (*)
    `)
    .eq('fish_species_id', fishSpeciesId)
    .order('sail_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) return []

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
  const params: { slug: string; area: string }[] = []
  for (const slug of Object.keys(fishContents)) {
    for (const area of Object.keys(AREA_MAP)) {
      params.push({ slug, area })
    }
  }
  return params
}

type PageParams = Promise<{ slug: string; area: string }>

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const { slug, area } = await params
  const content = fishContents[slug]
  const areaConfig = AREA_MAP[area as AreaSlug]
  if (!content || !areaConfig) return {}

  const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.chokainfo.com'
  const today = new Date().toISOString().slice(0, 10)
  const ogImage = `${BASE_URL}/api/og?area=${encodeURIComponent(areaConfig.name)}&fish=${encodeURIComponent(content.name)}&date=${today}`
  const title = `${areaConfig.name}${content.name}釣果情報 | 最新釣果まとめ - 釣果情報.com`
  const description = `${areaConfig.name}の${content.name}最新釣果。各船宿の釣果を毎日自動更新。AIによる釣況サマリー付き。`

  return {
    title,
    description,
    openGraph: {
      title, description,
      siteName: '釣果情報.com', type: 'website', locale: 'ja_JP',
      images: [{ url: ogImage, width: 1200, height: 630, alt: `${areaConfig.name} ${content.name} 釣果情報` }],
    },
    twitter: {
      card: 'summary_large_image', title, description, images: [ogImage],
    },
  }
}

export const revalidate = 3600

// ── Page ───────────────────────────────────────────────────────
export default async function FishAreaPage({ params }: { params: PageParams }) {
  const { slug, area } = await params
  const content = fishContents[slug]
  const areaConfig = AREA_MAP[area as AreaSlug]
  if (!content || !areaConfig) notFound()

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

  // FishDashboard が対応するエリアのみ initialArea として渡す
  const initialArea: FishArea | null = FISH_DASHBOARD_AREAS.includes(areaConfig.name)
    ? (areaConfig.name as FishArea)
    : null

  const areaContent = fishAreaContents[`${slug}/${area}`] ?? null

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>

      {/* ── Header ─────────────────────────────────────────── */}
      <SiteHeader updatedAt={nowStr} subtitle={`${areaConfig.name} · ${content.name}`} />

      {/* ── Hero with background image ───────────────────────── */}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 14, flexWrap: 'wrap' }}>
              <Link href="/" style={{ color: 'rgba(255,255,255,0.55)' }}>トップ</Link>
              <span>›</span>
              <Link href={`/area/${area}`} style={{ color: 'rgba(255,255,255,0.55)' }}>{areaConfig.name}</Link>
              <span>›</span>
              <span style={{ color: 'rgba(255,255,255,0.75)' }}>{content.name}釣果</span>
            </div>
            <h1 style={{
              fontSize: 'clamp(26px, 5vw, 40px)',
              fontWeight: 700, color: '#f0f4ff',
              fontFamily: 'var(--font-serif)',
              letterSpacing: '0.04em', lineHeight: 1.2, marginBottom: 12,
            }}>
              {areaConfig.name} {content.name}釣果まとめ
            </h1>
            <p style={{ fontSize: '0.9rem', color: '#8899bb', maxWidth: 480, lineHeight: 1.6 }}>
              {content.description}
            </p>
          </div>
        </div>
      </div>

      {/* ── Main ─────────────────────────────────────────── */}
      <main style={{ position: 'relative', padding: '20px 0 100px' }}>
        <div className="page-container" style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
          {/* エリア・魚種切り替えタブ */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', minWidth: 36 }}>エリア</span>
              {(Object.entries(AREA_MAP) as [AreaSlug, typeof AREA_MAP[AreaSlug]][]).map(([s, c]) => {
                const isActive = s === area
                return (
                  <Link key={s} href={`/fish/${slug}/${s}`} style={{
                    padding: '6px 16px', borderRadius: 'var(--radius-pill)',
                    fontSize: 13, fontWeight: isActive ? 700 : 400,
                    border: isActive ? '1.5px solid var(--accent)' : '1px solid rgba(255,255,255,0.15)',
                    background: isActive ? 'rgba(0,245,255,0.12)' : 'rgba(255,255,255,0.04)',
                    color: isActive ? 'var(--accent)' : 'rgba(255,255,255,0.6)',
                    whiteSpace: 'nowrap', transition: 'all 0.15s',
                  }}>
                    {c.name}
                  </Link>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', minWidth: 36 }}>魚種</span>
              {Object.values(fishContents).map((fc) => {
                const isActive = fc.slug === slug
                return (
                  <Link key={fc.slug} href={`/fish/${fc.slug}/${area}`} style={{
                    padding: '6px 16px', borderRadius: 'var(--radius-pill)',
                    fontSize: 13, fontWeight: isActive ? 700 : 400,
                    border: isActive ? '1.5px solid var(--accent)' : '1px solid rgba(255,255,255,0.15)',
                    background: isActive ? 'rgba(0,245,255,0.12)' : 'rgba(255,255,255,0.04)',
                    color: isActive ? 'var(--accent)' : 'rgba(255,255,255,0.6)',
                    whiteSpace: 'nowrap', transition: 'all 0.15s',
                  }}>
                    {fc.name}
                  </Link>
                )
              })}
            </div>
          </div>
          <FishDashboard
            records={records}
            envData={envData}
            aiSummaries={aiSummaries}
            areas={areas}
            fishId={fishId}
            content={content}
            initialArea={initialArea}
          />

          {/* ── 攻略コンテンツ ─────────────────────────── */}
          {areaContent ? (
            <GuideSection content={areaContent} fishName={content.name} areaName={areaConfig.name} />
          ) : (
            <PlaceholderSection fishName={content.name} areaName={areaConfig.name} />
          )}
        </div>
      </main>

      {/* ── Footer ──────────────────────────────────────── */}
      <footer style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)', padding: '32px 0' }}>
        <div className="page-container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            © {new Date().getFullYear()} 釣果情報.com — {areaConfig.name} {content.name}釣果情報
          </span>
          <span style={{ fontSize: 11, color: 'var(--border-strong)' }}>
            データは各船宿サイトより自動収集しています
          </span>
        </div>
      </footer>
    </div>
  )
}

// ── 攻略コンテンツ（コンテンツあり） ─────────────────────────────
function GuideSection({
  content,
  fishName,
  areaName,
}: {
  content: FishAreaContent
  fishName: string
  areaName: string
}) {
  return (
    <section>
      {/* セクションヘッダー */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: 'var(--accent)', textTransform: 'uppercase', marginBottom: 6 }}>
          FISHING GUIDE
        </div>
        <h2 style={{ fontSize: 'clamp(16px, 2.5vw, 20px)', fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>
          {content.heading}
        </h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.75, maxWidth: 640 }}>
          {content.intro}
        </p>
      </div>

      {/* 釣り方カード */}
      <div style={{ marginBottom: 32 }}>
        <h3 style={subHeadStyle}>釣り方の種類</h3>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: 14,
        }}>
          {content.methods.map((m) => (
            <div key={m.name} style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: '18px 18px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}>
              {/* カードヘッダー */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 24, lineHeight: 1 }}>{m.icon}</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{m.name}</span>
              </div>

              <p style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
                {m.summary}
              </p>

              {/* 詳細リスト */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {m.details.map((d) => (
                  <div key={d.label} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <span style={{
                      fontSize: 10, fontWeight: 700, color: 'var(--accent)',
                      background: 'rgba(212,160,23,0.12)',
                      border: '1px solid rgba(212,160,23,0.25)',
                      borderRadius: 4,
                      padding: '1px 6px',
                      flexShrink: 0,
                      marginTop: 1,
                      whiteSpace: 'nowrap',
                    }}>
                      {d.label}
                    </span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.55 }}>
                      {d.value}
                    </span>
                  </div>
                ))}
              </div>

              {/* コツ */}
              <div style={{
                background: 'rgba(0,245,255,0.03)',
                border: '1px solid rgba(0,245,255,0.10)',
                borderRadius: 6,
                padding: '7px 10px',
                marginTop: 2,
              }}>
                <span style={{ fontSize: 10, color: '#64748b' }}>💡 コツ　</span>
                <span style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.55 }}>{m.tip}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 季節カレンダー */}
      <div style={{ marginBottom: 32 }}>
        <h3 style={subHeadStyle}>季節カレンダー</h3>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
          gap: 10,
        }}>
          {content.seasons.map((s) => (
            <div key={s.period} style={{
              background: 'var(--surface)',
              border: `1px solid ${s.color}33`,
              borderTop: `3px solid ${s.color}`,
              borderRadius: 'var(--radius-md)',
              padding: '14px 14px 12px',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: s.color, marginBottom: 3 }}>
                {s.period}
              </div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
                {s.label}
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
                {s.description}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* 主なポイント */}
      <div>
        <h3 style={subHeadStyle}>主なポイント</h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {content.spots.map((spot) => (
            <span key={spot} style={{
              fontSize: 13, padding: '5px 14px',
              borderRadius: 'var(--radius-pill)',
              background: 'rgba(30,58,95,0.6)',
              color: '#93c5fd',
              border: '1px solid rgba(147,197,253,0.2)',
            }}>
              📍 {spot}
            </span>
          ))}
        </div>
      </div>
    </section>
  )
}

// ── コンテンツ準備中プレースホルダー ─────────────────────────────
function PlaceholderSection({ fishName, areaName }: { fishName: string; areaName: string }) {
  return (
    <section>
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        padding: '40px 24px',
        textAlign: 'center',
      }}>
        <p style={{ fontSize: 28, marginBottom: 10 }}>🎣</p>
        <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
          {areaName}の{fishName}攻略ガイド
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.65 }}>
          釣り方・季節カレンダー・ポイント情報などのコンテンツを準備中です。<br />
          最新の釣果データは上のダッシュボードでご確認ください。
        </p>
      </div>
    </section>
  )
}

// ── スタイル定数 ──────────────────────────────────────────────
const subHeadStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  color: 'var(--text)',
  marginBottom: 12,
  paddingBottom: 8,
  borderBottom: '1px solid var(--border)',
}
