import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('shipyards')
      .select('id, name, url, is_active, scrape_config, last_scraped_at, last_error, areas(name)')
      .order('id')

    if (error) throw error
    return NextResponse.json(data)
  } catch (e) {
    const msg = e instanceof Error ? e.message : '取得エラー'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, url, area_id, scrape_config, is_active } = body as {
      name: string
      url: string
      area_id?: number
      scrape_config?: Record<string, unknown>
      is_active?: boolean
    }

    const { data, error } = await supabaseAdmin
      .from('shipyards')
      .insert({
        name,
        url,
        area_id: area_id ?? null,
        scrape_config: scrape_config ?? { handler: 'claude' },
        is_active: is_active ?? true,
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : '登録エラー'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
