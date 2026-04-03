import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('fish_species')
      .select('*')
      .order('id')

    if (error) throw error
    return NextResponse.json({ data })
  } catch (e) {
    const msg = e instanceof Error ? e.message : '取得エラー'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, aliases, growth_names, category } = body as {
      name: string
      aliases?: string[]
      growth_names?: unknown
      category?: string | null
    }

    const { data, error } = await supabaseAdmin
      .from('fish_species')
      .insert({
        name,
        aliases: aliases ?? [],
        growth_names: growth_names ?? null,
        category: category ?? null,
      })
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ data }, { status: 201 })
  } catch (e) {
    const msg = e instanceof Error ? e.message : '登録エラー'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
