import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabaseAdmin'

type SampleItem = {
  title?: string
  text?: string
}

type TestResult = {
  handler: string
  sample: SampleItem[]
  warnings: string[]
}

async function fetchWithTimeout(url: string, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; chokainfo-bot/1.0)' },
    })
  } finally {
    clearTimeout(id)
  }
}

export async function POST(request: NextRequest) {
  const warnings: string[] = []

  try {
    const body = await request.json() as {
      shipyard_id?: number
      url?: string
      scrape_config?: Record<string, unknown>
    }

    let targetUrl: string | undefined = body.url
    let scrapeConfig: Record<string, unknown> = body.scrape_config ?? {}

    if (body.shipyard_id) {
      const { data, error } = await supabaseAdmin
        .from('shipyards')
        .select('url, scrape_config')
        .eq('id', body.shipyard_id)
        .single()
      if (error || !data) {
        return NextResponse.json({ error: '船宿が見つかりません' }, { status: 404 })
      }
      targetUrl = data.url
      scrapeConfig = (data.scrape_config as Record<string, unknown>) ?? {}
    }

    if (!targetUrl) {
      return NextResponse.json({ error: 'url が必要です' }, { status: 400 })
    }

    const handler = (scrapeConfig.handler as string) || 'claude'
    const sample: SampleItem[] = []

    if (handler === 'gyosan') {
      try {
        const listPath = (scrapeConfig.list_path as string) || '/category/Choka/'
        const base = new URL(targetUrl).origin
        const res = await fetchWithTimeout(`${base}${listPath}`, 8000)
        const html = await res.text()
        // Simple regex extraction without DOM parser
        const titleMatches = html.match(/<h\d[^>]*class="[^"]*blog[^"]*"[^>]*>([\s\S]*?)<\/h\d>/gi) ?? []
        const textMatches = html.match(/class="blog-middle"[^>]*>([\s\S]*?)<\/[^>]+>/gi) ?? []

        const items = titleMatches.length > 0 ? titleMatches : textMatches
        for (const item of items.slice(0, 3)) {
          const text = item.replace(/<[^>]+>/g, '').trim()
          if (text) sample.push({ text: text.slice(0, 200) })
        }
        if (sample.length === 0) {
          warnings.push('gyosan: 記事が見つかりませんでした。list_path を確認してください。')
          const snippet = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
          sample.push({ text: snippet.slice(0, 500) })
        }
      } catch (e) {
        warnings.push(`gyosan fetch エラー: ${e instanceof Error ? e.message : String(e)}`)
      }
    } else if (handler === 'blogphp') {
      try {
        const res = await fetchWithTimeout(targetUrl, 8000)
        const html = await res.text()
        const rowMatches = html.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) ?? []
        let count = 0
        for (const row of rowMatches) {
          if (count >= 3) break
          const text = row.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
          if (text.length > 20) {
            sample.push({ text: text.slice(0, 200) })
            count++
          }
        }
        if (sample.length === 0) {
          warnings.push('blogphp: テーブル行が見つかりませんでした。')
        }
      } catch (e) {
        warnings.push(`blogphp fetch エラー: ${e instanceof Error ? e.message : String(e)}`)
      }
    } else if (handler === 'wordpress') {
      try {
        const base = new URL(targetUrl).origin
        const categoryId = scrapeConfig.catch_category_id
        let apiUrl = `${base}/wp-json/wp/v2/posts?per_page=3`
        if (categoryId) apiUrl += `&categories=${categoryId}`
        const res = await fetchWithTimeout(apiUrl, 8000)
        if (!res.ok) {
          warnings.push(`WordPress API: ${res.status} ${res.statusText}`)
        } else {
          const posts = await res.json() as Array<{ title?: { rendered?: string } }>
          for (const post of posts.slice(0, 3)) {
            const title = post.title?.rendered?.replace(/<[^>]+>/g, '') ?? ''
            if (title) sample.push({ title })
          }
        }
        if (sample.length === 0) {
          warnings.push('WordPress: 記事が取得できませんでした。catch_category_id を確認してください。')
        }
      } catch (e) {
        warnings.push(`wordpress fetch エラー: ${e instanceof Error ? e.message : String(e)}`)
      }
    } else {
      // claude / rss / fallback: return HTML snippet
      try {
        const res = await fetchWithTimeout(targetUrl, 8000)
        const html = await res.text()
        const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
        sample.push({ text: text.slice(0, 500) })
      } catch (e) {
        warnings.push(`fetch エラー: ${e instanceof Error ? e.message : String(e)}`)
      }
    }

    const result: TestResult = { handler, sample, warnings }
    return NextResponse.json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'テストエラー'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
