// next/og を使用（Next.js 16 に内蔵 = @vercel/og との競合を回避）
import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Edge runtime を明示（外部 fetch が安定、@vercel/og の設計思想に合致）
export const runtime = 'edge'

// ── 日本語フォント取得 ──────────────────────────────────────────────
// Satori は woff/TTF/OTF のみ対応（woff2 非対応）
// IE11 User-Agent を使うと Google Fonts が woff を返す
async function loadFont(text: string): Promise<ArrayBuffer | null> {
  try {
    const css = await fetch(
      `https://fonts.googleapis.com/css?family=Noto+Sans+JP:700&text=${encodeURIComponent(text)}`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 6.1; Trident/7.0; rv:11.0) like Gecko',
        },
      }
    ).then(r => r.text())
    const url = css.match(/url\(([^)]+)\)/)?.[1]
    if (!url) return null
    return fetch(url).then(r => r.arrayBuffer())
  } catch {
    return null
  }
}

// ── Supabase 統計取得 ───────────────────────────────────────────────
type Stats = {
  avgCount: number | null
  maxCount: number | null
  sizeRange: string | null
  recordCount: number
}

async function fetchStats(area: string, fish: string, date: string): Promise<Stats> {
  const empty: Stats = { avgCount: null, maxCount: null, sizeRange: null, recordCount: 0 }
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const [{ data: areaRow }, { data: fishRow }] = await Promise.all([
      supabase.from('areas').select('id').eq('name', area).maybeSingle(),
      supabase.from('fish_species').select('id').eq('name', fish).maybeSingle(),
    ])
    if (!areaRow?.id || !fishRow?.id) return empty

    const { data: shipyards } = await supabase
      .from('shipyards').select('id').eq('area_id', areaRow.id).eq('is_active', true)
    const ids = (shipyards ?? []).map((s: { id: number }) => s.id)
    if (!ids.length) return empty

    const from = new Date(new Date(date).getTime() - 7 * 86400_000).toISOString().slice(0, 10)
    const { data: rows } = await supabase
      .from('catches')
      .select('count_min, count_max, size_min_cm, size_max_cm')
      .eq('fish_species_id', fishRow.id)
      .in('shipyard_id', ids)
      .gte('sail_date', from)
      .lte('sail_date', date)
      .order('sail_date', { ascending: false })
      .limit(50)

    if (!rows?.length) return empty

    const counts = rows
      .map((c: { count_max: number | null; count_min: number | null }) => c.count_max ?? c.count_min)
      .filter((v): v is number => v !== null)
    const mins = rows.map((c: { size_min_cm: number | null }) => c.size_min_cm).filter((v): v is number => v !== null)
    const maxs = rows.map((c: { size_max_cm: number | null }) => c.size_max_cm).filter((v): v is number => v !== null)

    return {
      avgCount: counts.length ? Math.round(counts.reduce((a, b) => a + b, 0) / counts.length * 10) / 10 : null,
      maxCount: counts.length ? Math.max(...counts) : null,
      sizeRange: mins.length && maxs.length ? `${Math.min(...mins)}〜${Math.max(...maxs)}cm` : null,
      recordCount: rows.length,
    }
  } catch {
    return empty
  }
}

// ── OGP 画像生成 ───────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const area = searchParams.get('area') ?? '東京湾'
    const fish = searchParams.get('fish') ?? ''
    const date = searchParams.get('date') ?? new Date().toISOString().slice(0, 10)

    const title = fish || '釣果情報'
    const displayDate = date.replace(/-/g, '/').replace(
      /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/,
      '$1年$2月$3日'
    )
    // フォントに含める文字（サブセット化で軽量化）
    const fontText = `釣果情報com×〜 ${area}${fish}${displayDate}平均最高サイズ本件cm関東圏船釣り毎日自動収集複数船宿から0123456789`

    const [fontData, stats] = await Promise.all([
      loadFont(fontText),
      fish ? fetchStats(area, fish, date) : Promise.resolve<Stats>({ avgCount: null, maxCount: null, sizeRange: null, recordCount: 0 }),
    ])

    const hasStats = stats.maxCount !== null || stats.avgCount !== null
    const fonts = fontData
      ? [{ name: 'NotoSansJP', data: fontData, style: 'normal' as const, weight: 700 as const }]
      : []
    const ff = fonts.length ? 'NotoSansJP, sans-serif' : 'sans-serif'

    // ── JSX レイアウト ──
    // 注意: Satori では position:absolute は使わず、全要素に display:flex が必要
    return new ImageResponse(
      (
        <div
          style={{
            width: '1200px',
            height: '630px',
            display: 'flex',
            flexDirection: 'column',
            background: 'linear-gradient(135deg, #0d1f38 0%, #0c1e35 60%, #091828 100%)',
            fontFamily: ff,
          }}
        >
          {/* ── ヘッダー ── */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '40px 60px 0',
          }}>
            {/* サイト名 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '44px', height: '44px',
                borderRadius: '10px',
                background: '#1d4ed8',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <div style={{
                  width: '24px', height: '14px',
                  background: 'white',
                  borderRadius: '6px',
                  display: 'flex',
                }} />
              </div>
              <span style={{ fontSize: '28px', fontWeight: 700, color: '#e2e8f0' }}>
                釣果情報.com
              </span>
            </div>
            {/* 日付 */}
            <span style={{ fontSize: '18px', color: '#64748b' }}>
              {displayDate}
            </span>
          </div>

          {/* ── メインエリア ── */}
          <div style={{
            flex: '1',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '0 60px',
            gap: '28px',
          }}>
            {/* エリア × 魚種 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
              <span style={{
                fontSize: '26px', fontWeight: 700,
                color: '#93c5fd',
                background: 'rgba(29,78,216,0.25)',
                padding: '8px 20px',
                borderRadius: '8px',
                border: '1px solid rgba(147,197,253,0.35)',
              }}>
                {area}
              </span>
              <span style={{ fontSize: '30px', color: '#d4a017', fontWeight: 700 }}>
                ×
              </span>
              <span style={{
                fontSize: '72px', fontWeight: 700,
                color: '#ffffff',
                lineHeight: '1',
              }}>
                {title}
              </span>
            </div>

            {/* 統計カード or プレースホルダー */}
            {hasStats ? (
              <div style={{ display: 'flex', gap: '16px' }}>
                {stats.avgCount !== null && (
                  <div style={{
                    display: 'flex', flexDirection: 'column', gap: '8px',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '14px',
                    padding: '22px 36px',
                    minWidth: '190px',
                  }}>
                    <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 700 }}>平均釣果</span>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                      <span style={{ fontSize: '52px', fontWeight: 700, color: '#93c5fd', lineHeight: '1' }}>
                        {String(stats.avgCount)}
                      </span>
                      <span style={{ fontSize: '18px', color: '#64748b' }}>本</span>
                    </div>
                  </div>
                )}
                {stats.maxCount !== null && (
                  <div style={{
                    display: 'flex', flexDirection: 'column', gap: '8px',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '14px',
                    padding: '22px 36px',
                    minWidth: '190px',
                  }}>
                    <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 700 }}>最高釣果</span>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                      <span style={{ fontSize: '52px', fontWeight: 700, color: '#d4a017', lineHeight: '1' }}>
                        {String(stats.maxCount)}
                      </span>
                      <span style={{ fontSize: '18px', color: '#64748b' }}>本</span>
                    </div>
                  </div>
                )}
                {stats.sizeRange && (
                  <div style={{
                    display: 'flex', flexDirection: 'column', gap: '8px',
                    background: 'rgba(255,255,255,0.05)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '14px',
                    padding: '22px 36px',
                    minWidth: '220px',
                  }}>
                    <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 700 }}>サイズ</span>
                    <div style={{ display: 'flex', alignItems: 'baseline' }}>
                      <span style={{ fontSize: '38px', fontWeight: 700, color: '#e2e8f0', lineHeight: '1' }}>
                        {stats.sizeRange}
                      </span>
                    </div>
                  </div>
                )}
                <div style={{
                  display: 'flex', flexDirection: 'column', gap: '8px',
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '14px',
                  padding: '22px 36px',
                  minWidth: '150px',
                }}>
                  <span style={{ fontSize: '13px', color: '#64748b', fontWeight: 700 }}>船宿数</span>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                    <span style={{ fontSize: '52px', fontWeight: 700, color: '#86efac', lineHeight: '1' }}>
                      {String(stats.recordCount)}
                    </span>
                    <span style={{ fontSize: '18px', color: '#64748b' }}>件</span>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{
                display: 'flex', alignItems: 'center',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '14px',
                padding: '26px 40px',
              }}>
                <span style={{ fontSize: '20px', color: '#64748b' }}>
                  最新釣果データを毎日自動収集・集計
                </span>
              </div>
            )}
          </div>

          {/* ── フッター ── */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '20px 60px 36px',
            borderTop: '1px solid rgba(255,255,255,0.07)',
          }}>
            <span style={{ fontSize: '15px', color: '#475569' }}>
              関東圏 船釣り釣果情報 | 複数船宿から毎日自動収集
            </span>
            <span style={{ fontSize: '15px', color: '#2563eb', fontWeight: 700 }}>
              chokainfo.com
            </span>
          </div>
        </div>
      ),
      { width: 1200, height: 630, fonts }
    )
  } catch (err) {
    // 予期しないエラー時はシンプルな fallback 画像を返す
    console.error('[og] render error:', err)
    return new ImageResponse(
      (
        <div style={{
          width: '1200px', height: '630px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: '#0c1e35',
        }}>
          <span style={{ fontSize: '48px', color: '#e2e8f0', fontFamily: 'sans-serif' }}>
            釣果情報.com
          </span>
        </div>
      ),
      { width: 1200, height: 630 }
    )
  }
}
