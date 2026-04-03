import Link from 'next/link'
import type { Metadata } from 'next'
import { MapPin, ExternalLink, ArrowRight } from 'lucide-react'
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

type TripCount = {
  shipyard_id: number
  cnt: number
}

// ── データ取得 ──────────────────────────────────────────────────
async function getShipyards(): Promise<ShipyardRow[]> {
  const { data } = await supabase
    .from('shipyards')
    .select('id, name, url, is_active, areas ( name ), ports ( name )')
    .eq('is_active', true)
    .order('name')
  return (data ?? []) as unknown as ShipyardRow[]
}

async function getRecentTripCounts(): Promise<Map<number, number>> {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 7)
  const cutoffStr = cutoff.toISOString().slice(0, 10)

  const { data } = await supabase
    .from('fishing_trips')
    .select('shipyard_id')
    .gte('sail_date', cutoffStr)

  const counts = new Map<number, number>()
  if (data) {
    for (const row of data as { shipyard_id: number }[]) {
      counts.set(row.shipyard_id, (counts.get(row.shipyard_id) ?? 0) + 1)
    }
  }
  return counts
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
export const metadata: Metadata = {
  title: '船宿一覧 | 釣果情報.com',
  description: '東京湾・相模湾の船宿一覧。各船宿の最新釣果情報を毎日自動収集しています。',
}

export const revalidate = 300

// ── Slug 生成 ────────────────────────────────────────────────────
function toSlug(id: number): string {
  return String(id)
}

// ── Page ────────────────────────────────────────────────────────
export default async function YadoListPage() {
  const [shipyards, tripCounts, latestAt] = await Promise.all([
    getShipyards(),
    getRecentTripCounts(),
    getLatestUpdatedAt(),
  ])

  const nowStr = new Date(latestAt ?? Date.now()).toLocaleString('ja-JP', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Asia/Tokyo',
  })

  // エリア別にグループ化
  const byArea = new Map<string, ShipyardRow[]>()
  for (const s of shipyards) {
    const area = s.areas?.name ?? 'その他'
    const list = byArea.get(area) ?? []
    list.push(s)
    byArea.set(area, list)
  }
  const areaOrder = ['東京湾', '相模湾', '外房', '南房', 'その他']
  const sortedAreas = [...byArea.entries()].sort(
    (a, b) => (areaOrder.indexOf(a[0]) === -1 ? 99 : areaOrder.indexOf(a[0])) -
              (areaOrder.indexOf(b[0]) === -1 ? 99 : areaOrder.indexOf(b[0]))
  )

  return (
    <div style={{ minHeight: '100vh' }}>
      <SiteHeader updatedAt={nowStr} subtitle="船宿一覧" />

      {/* ── Hero ──────────────────────────────────────────── */}
      <section style={{ position: 'relative', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(135deg, rgba(0,212,200,0.06) 0%, transparent 40%, rgba(0,212,200,0.03) 100%)',
        }} />
        <div className="page-container" style={{ position: 'relative', padding: '32px 16px 28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
            <Link href="/" style={{ color: 'var(--text-secondary)' }}>トップ</Link>
            <span style={{ opacity: 0.5 }}>›</span>
            <span style={{ color: 'var(--text-primary)' }}>船宿一覧</span>
          </div>
          <p className="section-label" style={{ marginBottom: 8, color: 'var(--color-cyan)' }}>
            SHIPYARDS
          </p>
          <h1 style={{ marginBottom: 6 }}>
            船宿一覧
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 460, lineHeight: 1.7 }}>
            釣果情報を収集している船宿の一覧です。各船宿をタップして釣果履歴を確認できます。
          </p>
        </div>
      </section>

      {/* ── Main ──────────────────────────────────────────── */}
      <main className="page-container" style={{ paddingTop: 8, paddingBottom: 100 }}>
        {sortedAreas.map(([areaName, yards]) => (
          <section key={areaName} style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <MapPin size={14} style={{ color: 'var(--color-cyan)' }} />
              <span className="section-label">{areaName}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {yards.length}件
              </span>
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 10,
            }}>
              {yards.map((yard) => {
                const trips = tripCounts.get(yard.id) ?? 0
                return (
                  <Link key={yard.id} href={`/yado/${toSlug(yard.id)}`} style={{ textDecoration: 'none' }}>
                    <div className="glass-card" style={{
                      padding: '14px 16px',
                      display: 'flex', alignItems: 'center', gap: 12,
                      height: '100%',
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 14, fontWeight: 600, color: 'var(--text-primary)',
                          marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {yard.name}
                        </div>
                        <div style={{ display: 'flex', gap: 10, fontSize: 12, color: 'var(--text-secondary)' }}>
                          {yard.ports?.name && <span>{yard.ports.name}</span>}
                          {trips > 0 && (
                            <span style={{ color: 'var(--color-cyan)' }}>
                              直近7日 {trips}件
                            </span>
                          )}
                        </div>
                      </div>
                      <ArrowRight size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                    </div>
                  </Link>
                )
              })}
            </div>
          </section>
        ))}

        {shipyards.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '60px 20px',
            background: 'var(--bg-surface)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border-subtle)',
          }}>
            <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>船宿データがありません</p>
          </div>
        )}
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
