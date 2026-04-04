import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

// GET: confidence_score < 1.0 の catches_v2 を取得（新しい順）
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const limit = Number(url.searchParams.get('limit') || '50')
    const showResolved = url.searchParams.get('resolved') === 'true'

    let query = supabaseAdmin
      .from('catches_v2')
      .select(`
        id, species_name_raw, count, count_min, count_max, size_text,
        confidence_score, detail_type, unit,
        fishing_trips!inner (
          id, sail_date, boat_name_raw,
          shipyards ( id, name )
        ),
        trip_signals (
          signal_type, signal_value
        )
      `)
      .order('confidence_score', { ascending: true })
      .limit(limit)

    if (showResolved) {
      // 全件（resolved含む）: confidence_score < 1.0
      query = query.lt('confidence_score', 1.0)
    } else {
      // 未対応のみ: confidence_score < 0.8
      query = query.lt('confidence_score', 0.8)
    }

    const { data, error } = await query

    if (error) throw error
    return NextResponse.json({ data })
  } catch (e) {
    const msg = e instanceof Error ? e.message : '取得エラー'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// PATCH: confidence_score を更新（「問題なし」マーク or 手動スコア設定）
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { ids, confidence_score } = body as {
      ids: number[]
      confidence_score: number
    }

    if (!ids || ids.length === 0) {
      return NextResponse.json({ error: 'ids が必要です' }, { status: 400 })
    }
    if (confidence_score === undefined || confidence_score < 0 || confidence_score > 1) {
      return NextResponse.json({ error: 'confidence_score は 0〜1 の範囲で指定してください' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('catches_v2')
      .update({ confidence_score })
      .in('id', ids)
      .select('id, confidence_score')

    if (error) throw error
    return NextResponse.json({ data })
  } catch (e) {
    const msg = e instanceof Error ? e.message : '更新エラー'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
