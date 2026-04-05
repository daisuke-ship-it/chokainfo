'use client'

import Link from 'next/link'
import { CatchRecord } from '@/lib/supabase'

export type Fish = 'タチウオ' | 'アジ' | 'シーバス' | 'サワラ' | 'トラフグ' | 'マダイ' | 'ヒラメ' | 'シロギス' | '青物' | 'ヤリイカ' | 'スルメイカ' | 'マルイカ' | 'スミイカ' | 'アオリイカ' | 'クロダイ' | 'メバル' | 'アマダイ' | 'マゴチ' | 'カワハギ' | 'イサキ' | 'カサゴ' | 'マダコ' | 'ショウサイフグ' | 'カツオ' | 'キハダマグロ'

export const FISH_LIST: Fish[] = ['タチウオ', 'アジ', 'シーバス', 'サワラ', 'トラフグ', 'マダイ', 'ヒラメ', 'シロギス', '青物', 'ヤリイカ', 'スルメイカ', 'マルイカ', 'スミイカ', 'アオリイカ', 'クロダイ', 'メバル', 'アマダイ', 'マゴチ', 'カワハギ', 'イサキ', 'カサゴ', 'マダコ', 'ショウサイフグ', 'カツオ', 'キハダマグロ']

const FISH_SLUGS: Record<Fish, string> = {
  'タチウオ': 'tachiuo',
  'アジ':     'aji',
  'シーバス': 'seabass',
  'サワラ':   'sawara',
  'トラフグ': 'torafugu',
  'マダイ':   'madai',
  'ヒラメ':   'hirame',
  'シロギス': 'shirogisu',
  '青物':     'aomono',
  'ヤリイカ': 'yariika',
  'スルメイカ': 'surumeika',
  'マルイカ': 'maruika',
  'スミイカ': 'sumiika',
  'アオリイカ': 'aoriika',
  'クロダイ': 'kurodai',
  'メバル':   'mebaru',
  'アマダイ': 'amadai',
  'マゴチ':   'magochi',
  'カワハギ': 'kawahagi',
  'イサキ':   'isaki',
  'カサゴ':   'kasago',
  'マダコ':   'madako',
  'ショウサイフグ': 'shousaifugu',
  'カツオ':   'katsuo',
  'キハダマグロ': 'kihada',
}

export const FISH_ALIASES: Record<Fish, string[]> = {
  'タチウオ': ['タチウオ', '太刀魚'],
  'アジ':     ['アジ', 'マアジ', '鯵'],
  'シーバス': ['シーバス', 'スズキ', '鱸', 'セイゴ', 'フッコ'],
  'サワラ':   ['サワラ', 'サゴシ'],
  'トラフグ': ['トラフグ'],
  'マダイ':   ['マダイ', '真鯛', 'タイ', '鯛'],
  'ヒラメ':   ['ヒラメ', '平目'],
  'シロギス': ['シロギス', 'キス'],
  '青物': [
    '青物',
    'イナダ', 'ワラサ', 'ブリ', '鰤',
    'ヒラマサ', '平政',
    'カンパチ', '間八',
    'ショゴ', 'サンパク',
    'ハマチ', 'メジロ',
    'ガンド', 'ガンジ',
    'フクラギ', 'ツバス',
    'ヤズ',
    'シオ', 'シオゴ',
    'ネリゴ', 'アオモノ',
  ],
  'ヤリイカ': ['ヤリイカ', 'やりいか', '槍烏賊'],
  'スルメイカ': ['スルメイカ', 'ムギイカ'],
  'マルイカ': ['マルイカ', 'ケンサキイカ', 'まるいか'],
  'スミイカ': ['スミイカ', 'コウイカ'],
  'アオリイカ': ['アオリイカ'],
  'クロダイ': ['クロダイ', 'チヌ', '黒鯛'],
  'メバル':   ['メバル', 'クロメバル'],
  'アマダイ': ['アマダイ', '甘鯛', 'アカアマダイ'],
  'マゴチ':   ['マゴチ', 'ゴチ'],
  'カワハギ': ['カワハギ', 'ハギ'],
  'イサキ':   ['イサキ', 'いさき'],
  'カサゴ':   ['カサゴ', 'ガシラ'],
  'マダコ':   ['マダコ', 'タコ', '蛸'],
  'ショウサイフグ': ['ショウサイフグ'],
  'カツオ':   ['カツオ', '鰹', 'ハガツオ'],
  'キハダマグロ': ['キハダマグロ', 'キハダ', 'キメジ', 'マグロ'],
}

type Trend = { icon: string; label: string; color: string }

function getTrend(recent: number, prev: number, hasRecent: boolean): Trend {
  if (!hasRecent) return { icon: '⏸', label: '出船なし', color: 'var(--text-muted)' }
  if (prev === 0) return { icon: '↑', label: '好調継続', color: '#16A34A' }
  const r = recent / prev
  if (r >= 1.3)  return { icon: '↑',  label: '好調継続',   color: '#16A34A' }
  if (r >= 1.05) return { icon: '↗', label: '上がり調子', color: '#0D9488' }
  if (r >= 0.95) return { icon: '→', label: '横ばい',     color: '#6B7280' }
  if (r >= 0.7)  return { icon: '↘', label: '鈍化',       color: '#D97706' }
  return               { icon: '↓',  label: '不調',       color: '#DC2626' }
}

function avg(records: CatchRecord[]) {
  const vals = records
    .map((r) => r.count_max ?? r.count_min)
    .filter((v): v is number => v !== null)
  if (vals.length === 0) return 0
  return vals.reduce((a, b) => a + b, 0) / vals.length
}

function formatDate(dateStr: string): string {
  const [, m, d] = dateStr.split('-').map(Number)
  return `${m}/${d}`
}

function daysDiff(dateStr: string): number {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const target = new Date(dateStr + 'T00:00:00')
  return Math.floor((now.getTime() - target.getTime()) / 86400_000)
}

type Props = {
  records: CatchRecord[]
  activeFish: Fish | null
  onFishClick: (f: Fish) => void
  /** データなしの魚カードを非表示にする */
  hideEmpty?: boolean
}

export default function TrendBar({ records, activeFish, onFishClick, hideEmpty }: Props) {
  const todayMs   = new Date().setHours(0, 0, 0, 0)
  const recent7s  = todayMs - 6  * 86400_000
  const prev7s    = todayMs - 13 * 86400_000
  const prev7e    = todayMs - 7  * 86400_000

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 8,
      }}
    >
      {FISH_LIST.map((fish) => {
        const aliases = FISH_ALIASES[fish]
        const fishRecs = records.filter(
          (r) => r.fish_name && aliases.some((a) => r.fish_name!.includes(a))
        )

        // 最終出船日
        const allDates = fishRecs
          .map((r) => r.date)
          .filter((d): d is string => d !== null)
          .sort((a, b) => b.localeCompare(a))
        const lastDate = allDates[0] ?? null
        const daysAgo = lastDate ? daysDiff(lastDate) : null

        const recentRecs = fishRecs.filter((r) => {
          if (!r.date) return false
          const t = new Date(r.date).getTime()
          return t >= recent7s && t <= todayMs + 86400_000
        })
        const prevRecs = fishRecs.filter((r) => {
          if (!r.date) return false
          const t = new Date(r.date).getTime()
          return t >= prev7s && t < prev7e
        })

        const recentAvg = avg(recentRecs)
        const prevAvg   = avg(prevRecs)
        const hasRecent = recentRecs.length > 0
        const hasAny    = lastDate !== null

        if (hideEmpty && !hasAny) return null

        const trend     = getTrend(recentAvg, prevAvg, hasRecent)
        const isActive  = activeFish === fish
        const isStale   = !hasRecent  // 7日以内に出船なし

        // 船宿数（直近7日）
        const shipyardCount = new Set(
          recentRecs.map((r) => r.shipyard_name).filter(Boolean)
        ).size

        // サマリーテキスト生成
        let summaryText: string
        if (hasRecent) {
          summaryText = `平均${Math.round(recentAvg)}匹 / ${shipyardCount}船宿`
        } else if (lastDate && daysAgo !== null) {
          summaryText = `${formatDate(lastDate)}最終（${daysAgo}日前）`
        } else {
          summaryText = 'データなし'
        }

        return (
          <div
            key={fish}
            role="button"
            tabIndex={0}
            onClick={() => onFishClick(fish)}
            onKeyDown={(e) => e.key === 'Enter' && onFishClick(fish)}
            style={{
              padding: '10px 8px',
              borderRadius: 'var(--radius-md)',
              border: isActive
                ? '1.5px solid rgba(56,189,248,0.60)'
                : isStale
                  ? '0.5px solid rgba(180,210,255,0.06)'
                  : '0.5px solid rgba(180,210,255,0.12)',
              background: isActive
                ? 'rgba(56,189,248,0.10)'
                : isStale
                  ? 'rgba(8,18,55,0.15)'
                  : 'rgba(8,18,55,0.28)',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.15s',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
              opacity: isStale && !isActive ? 0.6 : 1,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{
                fontSize: 12, fontWeight: 700,
                color: isActive ? '#7DD3FC' : isStale ? 'var(--text-secondary)' : 'var(--text-primary)',
                whiteSpace: 'nowrap',
              }}>
                {fish}
              </span>
              <span style={{ fontSize: 16, color: trend.color, lineHeight: 1, marginLeft: 4 }}>
                {trend.icon}
              </span>
            </div>
            <div style={{ fontSize: 10, color: trend.color, fontWeight: 600 }}>
              {trend.label}
            </div>
            <div style={{ fontSize: 9, color: 'var(--text-muted)', marginTop: 1 }}>
              {summaryText}
            </div>
            <Link
              href={`/fish/${FISH_SLUGS[fish]}`}
              onClick={(e) => e.stopPropagation()}
              style={{ fontSize: 10, color: 'rgba(56,189,248,0.75)', marginTop: 4, textAlign: 'right' }}
            >
              詳細を見る →
            </Link>
          </div>
        )
      })}
    </div>
  )
}
