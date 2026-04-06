// ── 共有定数 ──────────────────────────────────────────────────
// エリア・魚種のスラッグマッピング。SiteHeader / page.tsx / TrendBar で共用。

import { Fish, FISH_LIST, FISH_SLUGS } from '@/components/TrendBar'

export type AreaSlug = 'tokyo' | 'sagami' | 'sotobo' | 'minamibo'

export const AREA_CONFIG: { slug: AreaSlug; name: string; description: string }[] = [
  { slug: 'tokyo',    name: '東京湾', description: '金沢八景・横浜・走水など' },
  { slug: 'sagami',   name: '相模湾', description: '茅ケ崎・平塚・小田原など' },
  { slug: 'sotobo',   name: '外房',   description: '勝浦・大原・一宮など' },
  { slug: 'minamibo', name: '南房',   description: '館山・白浜など' },
]

export const AREA_SLUGS: Record<string, string> = {
  '東京湾': 'tokyo',
  '相模湾': 'sagami',
  '外房': 'sotobo',
  '南房': 'minamibo',
}

// SiteHeader 用のナビリンク
export const NAV_AREAS = AREA_CONFIG.map((a) => ({
  label: a.name,
  href: `/area/${a.slug}`,
}))

export const NAV_FISH = FISH_LIST.map((f) => ({
  label: f,
  href: `/fish/${FISH_SLUGS[f]}`,
}))

// Re-export for convenience
export { FISH_LIST, FISH_SLUGS }
export type { Fish }
