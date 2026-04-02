import { NextRequest, NextResponse } from 'next/server'

type DetectResult = {
  handler: string
  list_path?: string | null
  catch_category_id?: number | null
  feed_path?: string | null
  error?: string
}

async function fetchWithTimeout(url: string, timeoutMs = 8000): Promise<Response> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; chokainfo-bot/1.0)' },
    })
    return res
  } finally {
    clearTimeout(id)
  }
}

export async function POST(request: NextRequest) {
  try {
    const { url } = (await request.json()) as { url: string }

    if (!url) {
      return NextResponse.json({ error: 'url が必要です' }, { status: 400 })
    }

    // 1. gyosan.jp
    if (url.includes('gyosan.jp')) {
      return NextResponse.json<DetectResult>({
        handler: 'gyosan',
        list_path: '/category/Choka/',
      })
    }

    // 2. WordPress REST API
    try {
      const base = new URL(url).origin
      const wpRes = await fetchWithTimeout(`${base}/wp-json/wp/v2/`, 8000)
      if (wpRes.ok) {
        return NextResponse.json<DetectResult>({
          handler: 'wordpress',
          catch_category_id: null,
        })
      }
    } catch {
      // ignore
    }

    // 3. blog.php CMS
    try {
      const res = await fetchWithTimeout(url, 8000)
      const text = await res.text()
      if (text.includes('blog.php') || text.includes('class="blog_tabel"')) {
        return NextResponse.json<DetectResult>({ handler: 'blogphp' })
      }

      // 4. RSS/RDF
      if (text.includes('<rss') || text.includes('<rdf:RDF')) {
        return NextResponse.json<DetectResult>({ handler: 'rss', feed_path: null })
      }

      // Check /index.rdf
      try {
        const base = new URL(url).origin
        const rdfRes = await fetchWithTimeout(`${base}/index.rdf`, 5000)
        if (rdfRes.ok) {
          return NextResponse.json<DetectResult>({ handler: 'rss', feed_path: '/index.rdf' })
        }
      } catch {
        // ignore
      }
    } catch {
      // ignore
    }

    // 5. fallback
    return NextResponse.json<DetectResult>({ handler: 'claude' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : '判定エラー'
    return NextResponse.json<DetectResult>({ handler: 'claude', error: msg })
  }
}
