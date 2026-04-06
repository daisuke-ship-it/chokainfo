// ── 共有型定義 ──────────────────────────────────────────────────
// page.tsx から抽出。CatchDashboard / FishDashboard が import する。

export type EnvData = {
  weather: string | null
  wind_speed_ms: number | null
  tide_type: string | null
}
export type EnvDataMap = Record<string, EnvData>

export type AISummaryRecord = {
  summary_type: string
  target_id: number | null
  target_date: string
  summary_text: string
}

export type AreaRecord = {
  id: number
  name: string
}

export type FishRecord = {
  id: number
  name: string
}

export type SpeciesGroupMap = Record<string, string[]>
