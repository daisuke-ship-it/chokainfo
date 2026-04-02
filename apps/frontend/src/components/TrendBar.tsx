'use client'

import Link from 'next/link'
import { CatchRecord } from '@/lib/supabase'

export type Fish = 'タチウオ' | 'アジ' | 'シーバス' | 'サワラ' | 'トラフグ' | 'マダイ' | 'ヒラメ' | 'シロギス' | '青物'

export const FISH_LIST: Fish[] = ['タチウオ', 'アジ', 'シーバス', 'サワラ', 'トラフグ', 'マダイ', 'ヒラメ', 'シロギス', '青物']

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
}

export const FISH_ALIASES: Record<Fish, string[]> = {
  'タチウオ': ['タチウオ', '太刀魚'],
  'アジ':     ['アジ'],
  'シーバス': ['シーバス'],
  'サワラ':   ['サワラ'],
  'トラフグ': ['トラフグ', 'フグ'],
  'マダイ':   ['マダイ', '真鯛'],
  'ヒラメ':   ['ヒラメ'],
  'シロギス': ['シロギス', 'キス'],
  // イナダ系（関東）・ワラサ・ブリ成長段階 + 地方名 + ヒラマサ・カンパチ系
  '青物': [
    '青物',
    'イナダ', 'ワラサ', 'ブリ', '鰤',
    'ヒラマサ', '平政',
    'カンパチ', '間八',
    'ショゴ',                       // カンパチ幼魚（関東）
    'サンパク',                     // ワラサ別名（関東一部）
    'ハマチ',                       // ブリ幼魚（関西）
    'メジロ',                       // ブリ幼魚（関西）
    'ガンド', 'ガンジ',             // ブリ幼魚（北陸・日本海）
    'フクラギ',                     // ブリ幼魚（富山）
    'ツバス',                       // ブリ幼魚（関西）
    'ヤズ',                         // ブリ幼魚（九州・瀬戸内）
    'サゴシ',                       // サワラ幼魚（関西）を青物扱いする場合あり
    'シオ', 'シオゴ',               // カンパチ幼魚（九州）
    'ネリゴ',                       // カンパチ幼魚（九州）
    'アオモノ',
  ],
}

type Trend = { icon: string; label: string; color: string }

function getTrend(recent: number, prev: number, hasData: boolean): Trend {
  if (!hasData) return { icon: '—', label: 'データなし', color: 'var(--text-muted)' }
  if (prev === 0 && recent === 0) return { icon: '—', label: 'データなし', color: 'var(--text-muted)' }
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

type Props = {
  records: CatchRecord[]
  activeFish: Fish | null
  onFishClick: (f: Fish) => void
}

export default function TrendBar({ records, activeFish, onFishClick }: Props) {
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
        const hasData   = recentRecs.length > 0 || prevRecs.length > 0
        const trend     = getTrend(recentAvg, prevAvg, hasData)
        const isActive  = activeFish === fish

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
              border: isActive ? '1.5px solid rgba(0,245,255,0.60)' : '0.5px solid rgba(180,210,255,0.12)',
              background: isActive ? 'rgba(0,245,255,0.10)' : 'rgba(8,18,55,0.28)',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.15s',
              display: 'flex',
              flexDirection: 'column',
              gap: 2,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: isActive ? '#00F5FF' : 'var(--text-main)', whiteSpace: 'nowrap' }}>
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
              直近{Math.round(recentAvg * 10) / 10} / 前週{Math.round(prevAvg * 10) / 10}
            </div>
            <Link
              href={`/fish/${FISH_SLUGS[fish]}`}
              onClick={(e) => e.stopPropagation()}
              style={{ fontSize: 10, color: 'rgba(0,245,255,0.75)', marginTop: 4, textAlign: 'right' }}
            >
              詳細を見る →
            </Link>
          </div>
        )
      })}
    </div>
  )
}
