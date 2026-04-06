import Link from 'next/link'
import { AREA_CONFIG, FISH_LIST, FISH_SLUGS } from '@/lib/constants'

// 人気上位の魚種（フッターに表示する主要種）
const POPULAR_FISH = [
  'タチウオ', 'アジ', 'シーバス', 'サワラ', 'マダイ', 'ヒラメ',
  '青物', 'カワハギ', 'アマダイ', 'ヤリイカ', 'スルメイカ', 'マルイカ',
] as const

export default function SiteFooter() {
  return (
    <footer style={{
      borderTop: '1px solid var(--border-subtle)',
      padding: '40px 0 24px',
      marginTop: 40,
    }}>
      <div className="page-container">
        {/* リンクグリッド */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
          gap: 28,
          marginBottom: 32,
        }}>
          {/* エリア */}
          <div>
            <p style={{
              fontSize: 11, fontWeight: 600, letterSpacing: '0.10em',
              color: 'var(--text-secondary)', textTransform: 'uppercase' as const,
              marginBottom: 12,
            }}>
              エリア
            </p>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {AREA_CONFIG.map((a) => (
                <li key={a.slug}>
                  <Link href={`/area/${a.slug}`} style={{
                    fontSize: 13, color: 'var(--text-muted)',
                  }}>
                    {a.name}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* 魚種（人気） */}
          <div>
            <p style={{
              fontSize: 11, fontWeight: 600, letterSpacing: '0.10em',
              color: 'var(--text-secondary)', textTransform: 'uppercase' as const,
              marginBottom: 12,
            }}>
              人気の魚種
            </p>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {POPULAR_FISH.map((f) => (
                <li key={f}>
                  <Link href={`/fish/${FISH_SLUGS[f]}`} style={{
                    fontSize: 13, color: 'var(--text-muted)',
                  }}>
                    {f}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* その他魚種 */}
          <div>
            <p style={{
              fontSize: 11, fontWeight: 600, letterSpacing: '0.10em',
              color: 'var(--text-secondary)', textTransform: 'uppercase' as const,
              marginBottom: 12,
            }}>
              その他の魚種
            </p>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {FISH_LIST.filter((f) => !(POPULAR_FISH as readonly string[]).includes(f)).map((f) => (
                <li key={f}>
                  <Link href={`/fish/${FISH_SLUGS[f]}`} style={{
                    fontSize: 13, color: 'var(--text-muted)',
                  }}>
                    {f}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* サイト情報 */}
          <div>
            <p style={{
              fontSize: 11, fontWeight: 600, letterSpacing: '0.10em',
              color: 'var(--text-secondary)', textTransform: 'uppercase' as const,
              marginBottom: 12,
            }}>
              サイト
            </p>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <li>
                <Link href="/analysis" style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  分析
                </Link>
              </li>
              <li>
                <Link href="/yado" style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                  船宿一覧
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* コピーライト */}
        <div style={{
          borderTop: '1px solid var(--border-subtle)',
          paddingTop: 20,
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
      </div>
    </footer>
  )
}
