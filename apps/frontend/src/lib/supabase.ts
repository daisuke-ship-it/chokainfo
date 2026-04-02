import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type CatchDetail = {
  id: number
  species_name: string | null
  count: number | null
  unit: string | null
  size_text: string | null
}

export type CatchRecord = {
  id: number
  created_at: string
  date: string | null
  boat_name: string | null
  fish_name: string | null
  size_min_cm: number | null
  size_max_cm: number | null
  count_min: number | null
  count_max: number | null
  source_url: string | null
  shipyard_name: string | null
  shipyard_area: string | null
  port_name: string | null
  fishing_method: string | null
  method_group: string | null
  condition_text: string | null
  catch_details: CatchDetail[]
}
