import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { ExternalLink, Fish, Calendar, Anchor } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import SiteHeader from '@/components/SiteHeader'

// ── 型 ──────────────────────────────────────────────────────────
type ShipyardRow = {
  id: number
  name: string
  url: string | null
  is_active: boolean
  areas: { name: string } | null
  ports: { name: string } | null
}

type TripRow = {
  id: number
  sail_date: string | null
  boat_name_raw: string | null
  source_url: string | null
  condition_text: string | null
  created_at: string
  catches_v2: {
    species_name_raw: string | null
    count: number | null
    size_text: string | null
    detail_type: string | null
    fish_species: { name: string } | null
  }[]
}

// ── データ取得 ──────────────────────────────────────────────────
async function getShipyard(id: number): Promise<ShipyardRow | null> {
  const { data } = await supabase
    .from('shipyards')
    .select('id, name, url, is_active, areas ( name ), ports ( name )')
    .eq('id', id)
    .maybeSingle()
  return data as unknown as ShipyardRow | null
}

async function getTrips(shipyardId: number): Promise<TripRow[]> {
  const { data } = await supabase
    .from('fishing_trips')
    .select(`
      id, sail_date, boat_name_raw, source_url, condition_text, created_at,
      catches_v2 ( species_name_raw, count, size_text, detail_type, fish_species ( name ) )
    `)
    .eq('shipyard_id', shipyardId)
    .order('sail_date', { ascending: false })
    .limit(100)
  return (data ?? []) as unknown as TripRow[]
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

// ── Metadata ────────────────────────────────────────────────────
type PageParams = Promise<{ slug: string }>

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const { slug } = await params
  const id = parseInt(slug, 10)
  if (isNaN(id)) return {}

  const shipyard = await getShipyard(id)
  if (!shipyard) return {}

  const title = `${shipyard.name} 釣果情報 | 釣果情報.com`
  const description = `${shipyard.name}（${shipyard.areas?.name ?? ''}${shipyard.ports?.name ? ` ${shipyard.ports.name}` : ''}）の最新釣果情報。毎日自動更新。`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      siteName: '釣果情報.com',
      type: 'website',
      locale: 'ja_JP',
    },
  }
}

export const revalidate = 300

// ── ヘルパー ────────────────────────────────────────────────────
function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  const d = new Date(dateStr + 'T00:00:00')
  const wd = ['日', '月', '火', '水', '木', '金', '土']
  return `${d.getMonth() + 1}/${d.getDate()}(${wd[d.getDay()]})`
}

// ── Page ────────────────────────────────────────────────────────
export default async function YadoDetailPage({ params }: { params: PageParams }) {
  const { slug } = await params
  const id = parseInt(slug, 10)
  if (isNaN(id)) notFound()

  const [shipyard, trips, latestAt] = await Promise.all([
    getShipyard(id),
    getTrips(id),
    getLatestUpdatedAt(),
  ])

  if (!shipyard) notFound()

  const nowStr = new Date(latestAt ?? Date.now()).toLocaleString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Tokyo',
  })

  // 直近の魚種集計（7日）
  const cutoff7 = new Date()
  cutoff7.setDate(cutoff7.getDate() - 7)
  const cutoff7Str = cutoff7.toISOString().slice(0, 10)

  const speciesMap = new Map<string, { total: number; count: number }>()
  for (const trip of trips) {
    if (!trip.sail_date || trip.sail_date < cutoff7Str) continue
    for (const c of trip.catches_v2) {
      if (c.detail_type !== 'catch') continue
      const name = c.fish_species?.name ?? c.species_name_raw
      if (!name || c.count === null) continue
      const cur = speciesMap.get(name) ?? { total: 0, count: 0 }
      cur.total += c.count
      cur.count += 1
      speciesMap.set(name, cur)
    }
  }

  const topSpecies = [...speciesMap.entries()]
    .map(([name, v]) => ({ name, avg: Math.round(v.total / v.count), entries: v.count }))
    .sort((a, b) => b.entries - a.entries || b.avg - a.avg)
    .slice(0, 8)

  return (
    <div style={{ minHeight: '100vh' }}>
      <SiteHeader updatedAt={nowStr} subtitle={shipyard.name} />

      {/* ── Hero ──────────────────────────────────────────── */}
      <section style={{ position: 'relative', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(135deg, rgba(56,189,248,0.06) 0%, transparent 40%, rgba(56,189,248,0.03) 100%)',
        }} />
        <div className="page-container" style={{ position: 'relative', padding: '32px 16px 28px' }}>
          {/* パンくず */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
            <Link href="/" style={{ color: 'var(--text-secondary)' }}>トップ</Link>
            <span style={{ opacity: 0.5 }}>›</span>
            <Link href="/yado" style={{ color: 'var(--text-secondary)' }}>船宿</Link>
            <span style={{ opacity: 0.5 }}>›</span>
            <span style={{ color: 'var(--text-primary)' }}>{shipyard.name}</span>
          </div>
          <p className="section-label" style={{ marginBottom: 8, color: 'var(--color-cyan)' }}>
            SHIPYARD DETAIL
          </p>
          <h1 style={{ marginBottom: 8 }}>
            {shipyard.name}
          </h1>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 13, color: 'var(--text-secondary)' }}>
            {shipyard.areas?.name && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Anchor size={13} style={{ color: 'var(--color-cyan)', opacity: 0.7 }} />
                {shipyard.areas.name}
                {shipyard.ports?.name && ` / ${shipyard.ports.name}`}
              </span>
            )}
            {shipyard.url && (
              <a
                href={shipyard.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--color-cyan)' }}
              >
                <ExternalLink size={12} />
                公式サイト
              </a>
            )}
          </div>
        </div>
      </section>

      {/* ── Main ──────────────────────────────────────────── */}
      <main className="page-container" style={{ paddingTop: 8, paddingBottom: 100 }}>

        {/* 直近の魚種 */}
        {topSpecies.length > 0 && (
          <section style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <Fish size={14} style={{ color: 'var(--color-cyan)' }} />
              <span className="section-label">直近7日の魚種</span>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {topSpecies.map((sp) => (
                <div key={sp.name} style={{
                  padding: '6px 14px',
                  borderRadius: 100,
                  border: '1px solid var(--border-default)',
                  background: 'var(--bg-card)',
                  fontSize: 13,
                  color: 'var(--text-primary)',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <span>{sp.name}</span>
                  <span className="data-value" style={{ color: 'var(--color-cyan)', fontWeight: 600 }}>
                    {sp.avg}
                  </span>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 釣果履歴 */}
        <section>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Calendar size={14} style={{ color: 'var(--color-cyan)' }} />
            <span className="section-label">釣果履歴</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {trips.length}件
            </span>
          </div>

          {trips.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '60px 20px',
              background: 'var(--bg-surface)',
              borderRadius: 'var(--radius-lg)',
              border: '1px solid var(--border-subtle)',
            }}>
              <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>釣果データがありません</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {trips.map((trip) => {
                const catches = trip.catches_v2.filter((c) => c.detail_type === 'catch')
                return (
                  <div key={trip.id} className="glass-card" style={{ padding: '14px 16px' }}>
                    {/* Header */}
                    <div style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      marginBottom: catches.length > 0 ? 10 : 0,
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                          {formatDate(trip.sail_date)}
                        </span>
                        {trip.boat_name_raw && (
                          <span style={{
                            fontSize: 11, color: 'var(--text-secondary)',
                            padding: '2px 8px', borderRadius: 100,
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border-subtle)',
                          }}>
                            {trip.boat_name_raw}
                          </span>
                        )}
                      </div>
                      {trip.source_url && (
                        <a
                          href={trip.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: 'var(--text-muted)', flexShrink: 0 }}
                        >
                          <ExternalLink size={13} />
                        </a>
                      )}
                    </div>

                    {/* Catches */}
                    {catches.length > 0 && (
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {catches.map((c, i) => {
                          const name = c.fish_species?.name ?? c.species_name_raw ?? '—'
                          return (
                            <div key={i} style={{
                              display: 'flex', alignItems: 'baseline', gap: 6,
                              fontSize: 13,
                            }}>
                              <span style={{ color: 'var(--text-secondary)' }}>{name}</span>
                              {c.count !== null && (
                                <span className="data-value" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                  {c.count}
                                </span>
                              )}
                              {c.size_text && (
                                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                  {c.size_text}
                                </span>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* Condition text */}
                    {trip.condition_text && (
                      <p style={{
                        fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6,
                        marginTop: 8,
                        overflow: 'hidden', textOverflow: 'ellipsis',
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                      } as React.CSSProperties}>
                        {trip.condition_text}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>
      </main>

      {/* ── Footer ────────────────────────────────────────── */}
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
