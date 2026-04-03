import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    const allowed = ['name', 'aliases', 'growth_names', 'category'] as const
    const updates: Record<string, unknown> = {}
    for (const key of allowed) {
      if (key in body) updates[key] = body[key]
    }

    const { data, error } = await supabaseAdmin
      .from('fish_species')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json({ data })
  } catch (e) {
    const msg = e instanceof Error ? e.message : '更新エラー'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // catches テーブルで参照されている場合はエラーを返す
    const { count, error: refError } = await supabaseAdmin
      .from('catches')
      .select('id', { count: 'exact', head: true })
      .eq('fish_species_id', id)

    if (refError) throw refError

    if (count && count > 0) {
      return NextResponse.json(
        { error: `この魚種は catches テーブルで ${count} 件参照されているため削除できません` },
        { status: 409 }
      )
    }

    const { error } = await supabaseAdmin
      .from('fish_species')
      .delete()
      .eq('id', id)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (e) {
    const msg = e instanceof Error ? e.message : '削除エラー'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
