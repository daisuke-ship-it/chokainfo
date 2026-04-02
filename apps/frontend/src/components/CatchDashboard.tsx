'use client'

import { useState, useMemo, useRef } from 'react'
import { Cloud, Waves, Ship, Fish as FishIcon, Ruler } from 'lucide-react'
import { CatchRecord } from '@/lib/supabase'
import { EnvData, EnvDataMap, AISummaryRecord, AreaRecord, FishRecord, SpeciesGroupMap } from '@/app/page'
import TrendBar, { Fish, FISH_LIST, FISH_ALIASES } from './TrendBar'
import CatchTable, { SortField } from './CatchTable'
import CatchCards from './CatchCards'
import CatchChart from './CatchChart'

type Area = '東京湾' | '相模湾' | '外房' | '南房'
type Tab  = '一覧' | 'グラフ'
// Period は 'yyyy-MM-dd' の日付文字列 or '直近7日' | '直近30日'

const AREAS: Area[] = ['東京湾', '相模湾', '外房', '南房']
const TABS:  Tab[]  = ['一覧', 'グラフ']

// 釣り方グループ ソート優先順位
const METHOD_ORDER: Record<string, number> = {
  'ルアー': 0,
  'テンヤ': 1,
  'エサ':   2,
}

interface Props {
  records: CatchRecord[]
  envData: EnvDataMap
  areas: AreaRecord[]
  fishSpeciesList: FishRecord[]
  aiSummaries: AISummaryRecord[]
  speciesGroupMap: SpeciesGroupMap
  initialArea?: Area
  initialFish?: Fish | null
}

// JST 日付を YYYY-MM-DD で返す（サーバー[UTC]・ブラウザ[JST]両対応）
function localDateStr(d: Date): string {
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000)
  const y   = jst.getUTCFullYear()
  const m   = String(jst.getUTCMonth() + 1).padStart(2, '0')
  const day = String(jst.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// 今日/昨日/一昨日 + 直近7日 / 直近30日
function buildPeriods(): { label: string; value: string }[] {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const weekdays = ['日', '月', '火', '水', '木', '金', '土']

  const result: { label: string; value: string }[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    result.push({
      label: `${d.getMonth() + 1}/${d.getDate()}(${weekdays[d.getDay()]})`,
      value: localDateStr(d),
    })
  }
  result.push({ label: '直近7日', value: '直近7日' })
  result.push({ label: '直近30日', value: '直近30日' })
  return result
}

function todayStr(): string {
  return localDateStr(new Date())
}

function defaultDateStr(): string {
  const now = new Date()
  const jstHour = (now.getUTCHours() + 9) % 24
  if (jstHour >= 15) return localDateStr(now)
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  return localDateStr(yesterday)
}

/* ── Utils ──────────────────────────────────────────────────── */
function isSameDay(d1: Date, d2: Date) {
  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth()    === d2.getMonth()    &&
    d1.getDate()     === d2.getDate()
  )
}

function filterByArea(records: CatchRecord[], area: Area | null): CatchRecord[] {
  if (!area) return records
  return records.filter((x) => x.shipyard_area?.includes(area))
}

function filterByFish(
  records: CatchRecord[],
  fish: Fish | null,
  speciesGroupMap: SpeciesGroupMap,
): CatchRecord[] {
  if (!fish) return records
  // species_groups テーブル由来のエイリアス。なければ FISH_ALIASES にフォールバック
  const aliases = speciesGroupMap[fish] ?? FISH_ALIASES[fish]
  return records.filter((x) => {
    if (x.fish_name && aliases.some((a) => x.fish_name!.includes(a))) return true
    return x.catch_details.some((d) => d.species_name && aliases.some((a) => d.species_name!.includes(a)))
  })
}

function filterByPeriod(records: CatchRecord[], period: string): CatchRecord[] {
  if (period === '直近7日') {
    const cutoff = new Date(); cutoff.setHours(0, 0, 0, 0); cutoff.setDate(cutoff.getDate() - 7)
    // r.date は 'YYYY-MM-DD' 文字列 → 文字列比較でUTCズレを回避
    const cutoffStr = localDateStr(cutoff)
    return records.filter((r) => r.date && r.date >= cutoffStr)
  }
  if (period === '直近30日') {
    const cutoff = new Date(); cutoff.setHours(0, 0, 0, 0); cutoff.setDate(cutoff.getDate() - 30)
    const cutoffStr = localDateStr(cutoff)
    return records.filter((r) => r.date && r.date >= cutoffStr)
  }
  // 特定日付 → 文字列一致で比較（タイムゾーンの影響を受けない）
  return records.filter((r) => r.date === period)
}

/* ── Helpers ────────────────────────────────────────────────── */
function getPeriodDate(period: string): string | null {
  if (period === '直近7日' || period === '直近30日') return null
  return period
}

function getSummaryLabel(period: string): string {
  if (period === '直近7日')  return '直近7日の釣果サマリー'
  if (period === '直近30日') return '直近30日の釣果サマリー'
  const d = new Date(period + 'T00:00:00')
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}の釣果サマリー`
}

function addDatePrefix(text: string, dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const prefix = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}の`
  if (text.startsWith(prefix)) return text          // 既に日付プレフィックスあり → そのまま返す
  if (text.startsWith('本日の')) return prefix + text.slice(3)
  if (text.startsWith('本日'))   return prefix + text.slice(2)
  return prefix + text
}

/* ── AI summary lookup ───────────────────────────────────────── */
function findAreaId(area: Area | null, areas: AreaRecord[]): number | null {
  if (!area) return null
  return areas.find((a) => a.name === area)?.id ?? null
}

function findFishId(fish: Fish | null, fishSpeciesList: FishRecord[]): number | null {
  if (!fish) return null
  const aliases = FISH_ALIASES[fish]
  return fishSpeciesList.find((f) => aliases.some((a) => f.name === a))?.id ?? null
}

function lookupSummary(
  aiSummaries: AISummaryRecord[],
  type: string,
  targetId: number | null,
  targetDate: string | null,
): string | null {
  if (targetId === null) return null
  const candidates = aiSummaries.filter(
    (s) => s.summary_type === type && s.target_id === targetId
  )
  if (candidates.length === 0) return null
  // targetDate が指定されている場合はその日付を優先、なければ最新日のサマリーを返す
  if (targetDate !== null) {
    const exact = candidates.find((s) => s.target_date === targetDate)
    if (exact) return exact.summary_text
  }
  // フォールバック: 最新日のサマリー（aiSummaries は target_date 降順で取得済み）
  return candidates[0].summary_text
}

/* ── Sub-components ──────────────────────────────────────────── */
function FilterPill({
  active, disabled, onClick, children,
}: {
  active: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode
}) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        padding: '6px 16px',
        borderRadius: 'var(--radius-pill)',
        fontSize: 12,
        fontWeight: active ? 600 : 400,
        cursor: disabled ? 'not-allowed' : 'pointer',
        border: active ? '1px solid #00d4c8' : '1px solid rgba(255,255,255,0.15)',
        background: disabled ? 'var(--surface-2)' : active ? 'rgba(0,212,200,0.10)' : 'rgba(255,255,255,0.04)',
        color: disabled ? 'var(--text-muted)' : active ? '#00d4c8' : 'var(--text-sub)',
        boxShadow: active ? '0 0 12px rgba(0,212,200,0.30), inset 0 0 8px rgba(0,212,200,0.05)' : 'none',
        transition: 'all 0.15s',
        whiteSpace: 'nowrap' as const,
        opacity: disabled ? 0.5 : 1,
        flexShrink: 0,
      }}
    >
      {children}
    </button>
  )
}

function FilterLabel({ text }: { text: string }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', minWidth: 44, flexShrink: 0 }}>
      {text}
    </span>
  )
}

/* ── AI Summary Card ─────────────────────────────────────────── */
function AISummaryCard({ variant, label, text }: {
  variant: 'area' | 'fish'; label: string; text: string
}) {
  const isArea    = variant === 'area'
  const bg        = 'rgba(0,245,255,0.06)'
  const leftColor = 'var(--accent)'
  const sideColor = 'rgba(0,245,255,0.22)'
  const textColor = isArea ? '#7ee8e4' : '#a0efec'

  return (
    <div style={{
      background: bg,
      borderLeft:   `4px solid ${leftColor}`,
      borderRight:  `1px solid ${sideColor}`,
      borderTop:    `1px solid ${sideColor}`,
      borderBottom: `1px solid ${sideColor}`,
      borderRadius: 8,
      padding: '10px 14px',
    }}>
      <p style={{
        fontSize: 10, fontWeight: 700, color: textColor,
        textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5, opacity: 0.7,
      }}>
        {label}
      </p>
      <p style={{ fontSize: 13, color: textColor, lineHeight: 1.6, margin: 0 }}>
        {text}
      </p>
    </div>
  )
}

/* ── Summary card ────────────────────────────────────────────── */
function SummaryCard({ records, envData, period, sizeUnit = 'cm', fishAliases = null }: {
  records: CatchRecord[]   // pre-filtered (period + area + fish)
  envData: EnvDataMap
  period: string
  sizeUnit?: 'cm' | 'kg'
  fishAliases?: string[] | null
}) {
  const isDatePeriod = period !== '直近7日' && period !== '直近30日'
  const envForPeriod: EnvData | null = isDatePeriod ? (envData[period] ?? null) : null

  const shipyardCount = new Set(records.map((r) => r.shipyard_name).filter(Boolean)).size

  // fishAliases がある場合は catch_details を魚種で絞って集計
  // ない場合はレコードの count_max/count_min をそのまま使用
  function detailCounts(r: CatchRecord): number[] {
    if (!fishAliases) return []
    return r.catch_details
      .filter((d) => d.count !== null && d.species_name && fishAliases.some((a) => d.species_name!.includes(a)))
      .map((d) => d.count!)
  }

  const catchVals = records.flatMap((r) => {
    const dc = detailCounts(r)
    if (dc.length > 0) return [Math.max(...dc)]
    if (!fishAliases) return (r.count_max ?? r.count_min) !== null ? [r.count_max ?? r.count_min!] : []
    return []
  })
  const catchAvg  = catchVals.length > 0
    ? Math.round(catchVals.reduce((a, b) => a + b, 0) / catchVals.length * 10) / 10
    : null

  // 全レコードの count 値をフラットに収集し、全体の min〜max を求める
  // catch_details に最小値（0など）が含まれないケースがあるため、
  // details がある場合もレコードレベルの count_min を必ず含める
  const allCounts = records.flatMap((r) => {
    const dc = detailCounts(r)
    if (dc.length > 0) {
      return r.count_min !== null ? [...dc, r.count_min] : dc
    }
    if (!fishAliases) return [r.count_min, r.count_max].filter((v): v is number => v !== null)
    return []
  })
  const catchRangeMin = allCounts.length > 0 ? Math.min(...allCounts) : null
  const catchRangeMax = allCounts.length > 0 ? Math.max(...allCounts) : null

  // DEBUG: ブラウザコンソールで確認（確認後削除）
  if (typeof window !== 'undefined' && fishAliases) {
    console.group('[SummaryCard DEBUG] fishAliases:', fishAliases)
    records.forEach((r) => {
      const dc = detailCounts(r)
      console.log(
        `${r.shipyard_name} | count_min=${r.count_min} count_max=${r.count_max}`,
        '| dc:', dc,
        '| details:', r.catch_details.map(d => `${d.species_name}:${d.count}`)
      )
    })
    console.log('allCounts:', allCounts)
    console.log('catchRangeMin:', catchRangeMin, 'catchRangeMax:', catchRangeMax)
    console.groupEnd()
  }
  const catchRange =
    catchRangeMin !== null && catchRangeMax !== null && catchRangeMin !== catchRangeMax
      ? `${catchRangeMin}〜${catchRangeMax}`
      : catchRangeMax !== null ? String(catchRangeMax)
      : catchRangeMin !== null ? String(catchRangeMin)
      : '—'

  // size_min_cm/max_cm（旧形式）または catch_details.size_text（新形式）からサイズを集計
  // fishAliases がある場合は該当魚種の details のみ対象
  // sizeUnit='kg': size_text に 'kg' を含む行のみ小数含む数値を抽出
  // sizeUnit='cm': kg 表記の行を除外して cm ベースで集計
  const sizeNums = records.flatMap((r) => {
    const details = fishAliases
      ? r.catch_details.filter((d) => d.species_name && fishAliases.some((a) => d.species_name!.includes(a)))
      : r.catch_details
    if (sizeUnit === 'kg') {
      return details.flatMap((d) => {
        if (!d.size_text || !/kg/i.test(d.size_text)) return []
        const nums = d.size_text.match(/\d+\.?\d*/g)
        return nums ? nums.map(Number) : []
      })
    }
    if (!fishAliases && (r.size_min_cm !== null || r.size_max_cm !== null)) {
      return [r.size_min_cm, r.size_max_cm].filter((v): v is number => v !== null)
    }
    return details.flatMap((d) => {
      if (!d.size_text || /kg/i.test(d.size_text)) return []
      const nums = d.size_text.replace(/センチ/g, '').match(/\d+/g)
      return nums ? nums.map(Number) : []
    })
  })
  const sizeMin = sizeNums.length > 0 ? Math.min(...sizeNums) : null
  const sizeMax = sizeNums.length > 0 ? Math.max(...sizeNums) : null
  const sizeRange =
    sizeMin !== null && sizeMax !== null && sizeMin !== sizeMax
      ? `${sizeMin}〜${sizeMax}`
      : sizeMax !== null ? `${sizeMax}`
      : '—'

  const weatherWord = envForPeriod?.weather ? envForPeriod.weather.split(' ')[0] : null

  const stats: { Icon: React.ElementType; label: string; value: string; highlight?: boolean }[] = [
    { Icon: Cloud,    label: 'Weather',      value: weatherWord ?? '—' },
    { Icon: Waves,    label: 'Tide',         value: envForPeriod?.tide_type ?? '—' },
    { Icon: Ship,     label: 'No. of Boats', value: shipyardCount > 0 ? String(shipyardCount) : '—' },
    { Icon: FishIcon, label: 'Avg. Catch',   value: catchAvg !== null ? String(catchAvg) : '—', highlight: true },
    { Icon: FishIcon, label: 'Max Catch',    value: catchRangeMax !== null ? String(catchRangeMax) : '—' },
    { Icon: Ruler,    label: 'size',         value: sizeRange },
  ]

  return (
    <div style={{
      background: 'rgba(255,255,255,0.05)',
      backdropFilter: 'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
      border: '1px solid rgba(255,255,255,0.10)',
      borderRadius: 20,
      padding: '24px',
    }}>
      <p style={{ fontSize: 16, fontWeight: 700, color: '#f0f4ff', marginBottom: 20, fontFamily: 'var(--font-serif)', letterSpacing: '0.04em' }}>
        釣果サマリー
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '18px 8px' }}>
        {stats.map(({ Icon, label, value, highlight }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon size={24} strokeWidth={1.5} style={{ color: '#00d4c8', flexShrink: 0 }} />
            <div>
              <p style={{ fontSize: 10, color: '#8899bb', marginBottom: 3, letterSpacing: '0.05em', fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 400 }}>{label}</p>
              <p style={{ fontSize: 22, fontWeight: 700, color: highlight ? '#00d4c8' : '#f0f4ff', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
                {value}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Main ────────────────────────────────────────────────────── */
export default function CatchDashboard({
  records, envData, areas, fishSpeciesList, aiSummaries, speciesGroupMap, initialArea, initialFish,
}: Props) {
  const [area,      setArea]      = useState<Area | null>(initialArea ?? '東京湾')
  const [fish,      setFish]      = useState<Fish | null>(initialFish !== undefined ? initialFish : 'タチウオ')
  const [period,    setPeriod]    = useState<string>(defaultDateStr())
  const [tab,       setTab]       = useState<Tab>('一覧')
  const [sortField, setSortField] = useState<SortField>(null)
  const dateInputRef = useRef<HTMLInputElement>(null)

  const toggleArea   = (a: Area) => { setArea((p) => (p === a ? null : a)) }
  const handleFishClick = (f: Fish) => setFish((p) => (p === f ? null : f))

  // Filtered data
  const areaOnlyFiltered = useMemo(() => filterByArea(records, area), [records, area])
  const areaFishFiltered = useMemo(
    () => filterByFish(areaOnlyFiltered, fish, speciesGroupMap),
    [areaOnlyFiltered, fish, speciesGroupMap],
  )

  const filtered = useMemo(() => {
    let r = filterByPeriod(areaFishFiltered, period)

    const maxCount = (r: CatchRecord) =>
      r.catch_details.length > 0
        ? Math.max(...r.catch_details.map((d) => d.count ?? -1))
        : -1

    if (sortField === 'count') {
      r = [...r].sort((a, b) => maxCount(b) - maxCount(a))
    } else if (sortField === 'size') {
      r = [...r].sort((a, b) => maxCount(b) - maxCount(a)) // size_text はテキストのため count で代替
    } else {
      // デフォルト: 釣り方グループ順 → catch_details の最大釣果数降順
      r = [...r].sort((a, b) => {
        const aOrd = METHOD_ORDER[a.method_group ?? a.fishing_method ?? ''] ?? 99
        const bOrd = METHOD_ORDER[b.method_group ?? b.fishing_method ?? ''] ?? 99
        if (aOrd !== bOrd) return aOrd - bOrd
        return maxCount(b) - maxCount(a)
      })
    }
    return r
  }, [areaFishFiltered, period, sortField])

  const sizeUnit: 'cm' | 'kg' = fish === 'トラフグ' ? 'kg' : 'cm'
  const fishAliases: string[] | null = fish ? (speciesGroupMap[fish] ?? FISH_ALIASES[fish]) : null

  // AI summary lookup
  const summaryDate    = getPeriodDate(period)
  const areaId         = findAreaId(area, areas)
  const fishId         = findFishId(fish, fishSpeciesList)
  const areaSummaryRaw = lookupSummary(aiSummaries, 'area', areaId, summaryDate)
  const fishSummary    = lookupSummary(aiSummaries, 'fish_species', fishId, summaryDate)
  const areaSummary    = areaSummaryRaw && summaryDate
    ? addDatePrefix(areaSummaryRaw, summaryDate)
    : areaSummaryRaw

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* ── 1. エリア選択 + Area AI サマリー ─────────────────────── */}
      <div style={{
        background: 'rgba(255,255,255,0.05)',
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(0,212,200,0.35)',
        borderRadius: 16, padding: '14px 16px',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <FilterLabel text="エリア" />
          <div style={{ display: 'flex', gap: 6 }}>
            {AREAS.map((a) => (
              <FilterPill key={a} active={area === a} onClick={() => toggleArea(a)}>
                {a}
              </FilterPill>
            ))}
          </div>
        </div>
        {areaSummary && (
          <AISummaryCard variant="area" label="🤖 エリアの状況" text={areaSummary} />
        )}
      </div>

      {/* ── 2. 魚種トレンド（2×2） ───────────────────────────────── */}
      <TrendBar records={areaOnlyFiltered} activeFish={fish} onFishClick={handleFishClick} />

      {/* ── 3. 魚種・期間フィルター ──────────────────────────────── */}
      <div style={{
        background: 'rgba(255,255,255,0.05)',
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(0,212,200,0.35)',
        borderRadius: 16, padding: '14px 16px',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        {/* 魚種 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <FilterLabel text="魚種" />
          <div className="scroll-x" style={{ display: 'flex', gap: 6, flex: 1, minWidth: 0 }}>
            {FISH_LIST.map((f) => (
              <FilterPill key={f} active={fish === f} onClick={() => handleFishClick(f)}>
                {f}
              </FilterPill>
            ))}
          </div>
        </div>

        <div style={{ height: 1, background: 'var(--border)' }} />

        {/* 期間：今日/昨日/一昨日 + 直近7日/直近30日 + 📅 カレンダー */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <FilterLabel text="期間" />
          <div className="scroll-x" style={{ display: 'flex', gap: 6, flexWrap: 'nowrap', flex: 1, minWidth: 0 }}>
            {buildPeriods().map(({ label, value }) => (
              <FilterPill key={value} active={period === value} onClick={() => setPeriod(value)}>
                {label}
              </FilterPill>
            ))}
            {/* 📅 カレンダー指定ボタン */}
            {(() => {
              const presets = buildPeriods().map((p) => p.value)
              const isCustom = /^\d{4}-\d{2}-\d{2}$/.test(period) && !presets.includes(period)
              return (
                <label style={{ position: 'relative', display: 'inline-block', cursor: 'pointer' }}>
                  <FilterPill active={isCustom} onClick={() => {}}>
                    日付指定 📅{isCustom ? ` ${period.slice(5).replace('-', '/')}` : ''}
                  </FilterPill>
                  <input
                    type="date"
                    value={isCustom ? period : ''}
                    onChange={(e) => e.target.value && setPeriod(e.target.value)}
                    style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }}
                  />
                </label>
              )
            })()}
          </div>
        </div>
      </div>

      {/* ── 4. 魚種 AI サマリー ──────────────────────────────────── */}
      {fish && fishSummary && (
        <AISummaryCard
          variant="fish"
          label={`🤖 ${area ?? 'エリア'} × ${fish}の状況`}
          text={fishSummary}
        />
      )}

      {/* ── 5. 釣果サマリーカード ────────────────────────────────── */}
      <SummaryCard records={filtered} envData={envData} period={period} sizeUnit={sizeUnit} fishAliases={fishAliases} />

      {/* ── 6. 釣果一覧 / グラフ タブ ───────────────────────────── */}
      <div style={{
        background: 'rgba(255,255,255,0.05)',
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(0,212,200,0.35)',
        borderRadius: 16, overflow: 'hidden',
      }}>
        {/* タブヘッダー */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          borderBottom: '1px solid var(--border)', padding: '0 16px', flexWrap: 'wrap', gap: 6,
        }}>
          <div style={{ display: 'flex' }}>
            {TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)} style={{
                padding: '12px 16px', fontSize: 13,
                fontWeight: tab === t ? 600 : 400, cursor: 'pointer', border: 'none',
                borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
                background: 'transparent',
                color: tab === t ? '#e2e8f0' : 'var(--text-sub)',
                transition: 'all 0.15s', whiteSpace: 'nowrap',
              }}>
                {t}
              </button>
            ))}
          </div>
          {tab === '一覧' && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)', paddingRight: 4 }}>
              {filtered.length}件
            </span>
          )}
        </div>

        {/* 一覧タブ: テーブル（上）+ 詳細カード（下） */}
        {tab === '一覧' && (
          <>
            <CatchTable records={filtered} sortField={sortField} onSort={setSortField} sizeUnit={sizeUnit} />
            {filtered.length > 0 && (
              <>
                <div style={{ borderTop: '1px solid var(--border)' }} />
                <CatchCards records={filtered} />
              </>
            )}
          </>
        )}

        {/* グラフタブ */}
        {tab === 'グラフ' && (
          <div style={{ padding: '20px 22px' }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 14 }}>
              直近30日の釣果平均トレンド
            </p>
            <CatchChart records={areaFishFiltered} fishAliases={fishAliases} envData={envData} period={period} />
          </div>
        )}
      </div>
    </div>
  )
}
