'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type DetectResult = {
  handler: string
  list_path?: string | null
  catch_category_id?: number | null
  feed_path?: string | null
  error?: string
}

type TestResult = {
  handler: string
  sample: { title?: string; text?: string }[]
  warnings: string[]
}

type Area = { id: number; name: string }

const HANDLER_COLORS: Record<string, string> = {
  gyosan: '#60a5fa',
  wordpress: '#4ade80',
  blogphp: '#fb923c',
  claude: '#c084fc',
  rss: '#fbbf24',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid var(--border-strong)',
  borderRadius: '8px',
  padding: '10px 12px',
  color: 'var(--text)',
  fontSize: '14px',
  outline: 'none',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  color: 'var(--text-muted)',
  fontSize: '12px',
  marginBottom: '6px',
}

export default function NewShipyardPage() {
  const router = useRouter()

  const [step, setStep] = useState(1)
  const [url, setUrl] = useState('')
  const [detecting, setDetecting] = useState(false)
  const [detected, setDetected] = useState<DetectResult | null>(null)
  const [scrapeConfigText, setScrapeConfigText] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [name, setName] = useState('')
  const [areaId, setAreaId] = useState<number | ''>('')
  const [areas, setAreas] = useState<Area[]>([])
  const [isActive, setIsActive] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleDetect() {
    setDetecting(true)
    setError('')
    try {
      const res = await fetch('/api/admin/detect-handler', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const data: DetectResult = await res.json()
      setDetected(data)
      setScrapeConfigText(JSON.stringify(buildScrapeConfig(data), null, 2))
      setStep(2)

      // fetch areas
      const areasRes = await fetch('/api/admin/shipyards')
      if (areasRes.ok) {
        // We get shipyards, but we need areas separately
        // Use supabase anon directly for areas
        const { supabase } = await import('@/lib/supabase')
        const { data: areasData } = await supabase.from('areas').select('id, name').order('id')
        setAreas(areasData ?? [])
      }
    } catch {
      setError('ハンドラー検出に失敗しました')
    } finally {
      setDetecting(false)
    }
  }

  function buildScrapeConfig(d: DetectResult): Record<string, unknown> {
    const cfg: Record<string, unknown> = { handler: d.handler }
    if (d.list_path !== undefined) cfg.list_path = d.list_path
    if (d.catch_category_id !== undefined) cfg.catch_category_id = d.catch_category_id
    if (d.feed_path !== undefined) cfg.feed_path = d.feed_path
    return cfg
  }

  async function handleTest() {
    setTesting(true)
    setError('')
    try {
      let config: Record<string, unknown> = {}
      try { config = JSON.parse(scrapeConfigText) } catch { config = { handler: 'claude' } }

      const res = await fetch('/api/admin/scraper/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, scrape_config: config }),
      })
      const data: TestResult = await res.json()
      setTestResult(data)
      setStep(3)
    } catch {
      setError('テスト取得に失敗しました')
    } finally {
      setTesting(false)
    }
  }

  function proceedToInfo() {
    setStep(4)
  }

  async function handleSave() {
    if (!name.trim()) { setError('船宿名を入力してください'); return }
    setSaving(true)
    setError('')
    try {
      let config: Record<string, unknown> = {}
      try { config = JSON.parse(scrapeConfigText) } catch { config = { handler: 'claude' } }

      const res = await fetch('/api/admin/shipyards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          url,
          area_id: areaId || null,
          scrape_config: config,
          is_active: isActive,
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? '保存エラー')
      }
      router.push('/admin/shipyards')
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  const cardStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.07)',
    backdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.10)',
    borderRadius: '16px',
    padding: '28px 24px',
    marginBottom: '20px',
  }

  return (
    <div style={{ maxWidth: '680px', margin: '0 auto', padding: '24px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <a
          href="/admin/shipyards"
          style={{ color: 'var(--text-muted)', fontSize: '13px', textDecoration: 'none' }}
        >
          ← 一覧に戻る
        </a>
        <h1 style={{ color: 'var(--text)', fontSize: '18px', fontWeight: 500 }}>
          新規船宿追加
        </h1>
      </div>

      {/* ステップインジケーター */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px' }}>
        {['URL入力', '設定確認', 'テスト', '船宿情報'].map((label, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              textAlign: 'center',
              padding: '6px',
              borderRadius: '8px',
              fontSize: '12px',
              background: step === i + 1 ? 'var(--accent)' : step > i + 1 ? 'rgba(56,189,248,0.20)' : 'rgba(255,255,255,0.05)',
              color: step === i + 1 ? '#050A18' : step > i + 1 ? 'var(--accent)' : 'var(--text-muted)',
              fontWeight: step === i + 1 ? 600 : 400,
            }}
          >
            {i + 1}. {label}
          </div>
        ))}
      </div>

      {error && (
        <p style={{ color: '#ff6b6b', fontSize: '13px', marginBottom: '16px', padding: '10px', background: 'rgba(255,107,107,0.10)', borderRadius: '8px' }}>
          {error}
        </p>
      )}

      {/* Step 1: URL入力 */}
      {step >= 1 && (
        <div style={cardStyle}>
          <h2 style={{ color: 'var(--text)', fontSize: '15px', marginBottom: '16px' }}>
            Step 1: URL入力
          </h2>
          <label style={labelStyle}>船宿サイトURL</label>
          <div style={{ display: 'flex', gap: '10px' }}>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              style={{ ...inputStyle, flex: 1 }}
            />
            <button
              onClick={handleDetect}
              disabled={detecting || !url}
              style={{
                background: detecting || !url ? 'rgba(56,189,248,0.4)' : 'var(--accent)',
                color: '#050A18',
                border: 'none',
                borderRadius: '8px',
                padding: '10px 16px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: detecting || !url ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {detecting ? '検出中...' : '自動判定'}
            </button>
          </div>
        </div>
      )}

      {/* Step 2: 検出結果確認 */}
      {step >= 2 && detected && (
        <div style={cardStyle}>
          <h2 style={{ color: 'var(--text)', fontSize: '15px', marginBottom: '16px' }}>
            Step 2: 検出結果確認
          </h2>
          <div style={{ marginBottom: '14px' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>検出ハンドラー: </span>
            <span
              style={{
                background: `${HANDLER_COLORS[detected.handler] ?? '#c084fc'}22`,
                color: HANDLER_COLORS[detected.handler] ?? '#c084fc',
                padding: '2px 10px',
                borderRadius: '100px',
                fontSize: '12px',
                fontWeight: 600,
              }}
            >
              {detected.handler}
            </span>
            {detected.error && (
              <span style={{ marginLeft: '8px', color: '#fbbf24', fontSize: '12px' }}>
                ⚠ {detected.error}
              </span>
            )}
          </div>
          <label style={labelStyle}>scrape_config（編集可能）</label>
          <textarea
            value={scrapeConfigText}
            onChange={(e) => setScrapeConfigText(e.target.value)}
            rows={5}
            style={{
              ...inputStyle,
              fontFamily: 'monospace',
              fontSize: '12px',
              resize: 'vertical',
            }}
          />
          <button
            onClick={handleTest}
            disabled={testing}
            style={{
              marginTop: '12px',
              background: testing ? 'rgba(56,189,248,0.4)' : 'var(--accent)',
              color: '#050A18',
              border: 'none',
              borderRadius: '8px',
              padding: '10px 20px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: testing ? 'not-allowed' : 'pointer',
            }}
          >
            {testing ? 'テスト中...' : 'テスト取得'}
          </button>
        </div>
      )}

      {/* Step 3: テスト結果 */}
      {step >= 3 && testResult && (
        <div style={cardStyle}>
          <h2 style={{ color: 'var(--text)', fontSize: '15px', marginBottom: '16px' }}>
            Step 3: テスト結果
          </h2>
          {testResult.warnings.length > 0 && (
            <div style={{ marginBottom: '12px' }}>
              {testResult.warnings.map((w, i) => (
                <p key={i} style={{ color: '#fbbf24', fontSize: '12px', marginBottom: '4px' }}>
                  ⚠ {w}
                </p>
              ))}
            </div>
          )}
          {testResult.sample.length > 0 ? (
            <div>
              {testResult.sample.map((item, i) => (
                <div
                  key={i}
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    padding: '10px 12px',
                    marginBottom: '8px',
                    fontSize: '13px',
                    color: 'var(--text-sub)',
                  }}
                >
                  {item.title && <strong style={{ color: 'var(--text)' }}>{item.title}</strong>}
                  {item.text && <span>{item.text}</span>}
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
              サンプルが取得できませんでした
            </p>
          )}
          <button
            onClick={proceedToInfo}
            style={{
              marginTop: '14px',
              background: 'var(--accent)',
              color: '#050A18',
              border: 'none',
              borderRadius: '8px',
              padding: '10px 20px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            次へ: 船宿情報入力
          </button>
        </div>
      )}

      {/* Step 4: 船宿情報入力 */}
      {step >= 4 && (
        <div style={cardStyle}>
          <h2 style={{ color: 'var(--text)', fontSize: '15px', marginBottom: '16px' }}>
            Step 4: 船宿情報
          </h2>
          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>船宿名 *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: 中山丸"
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>エリア</label>
            <select
              value={areaId}
              onChange={(e) => setAreaId(e.target.value ? Number(e.target.value) : '')}
              style={{ ...inputStyle }}
            >
              <option value="">選択してください</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div style={{ marginBottom: '20px' }}>
            <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span>is_active（有効）</span>
              <button
                onClick={() => setIsActive(!isActive)}
                style={{
                  width: '44px',
                  height: '24px',
                  borderRadius: '100px',
                  border: 'none',
                  background: isActive ? 'var(--accent)' : 'rgba(255,255,255,0.12)',
                  cursor: 'pointer',
                  position: 'relative',
                  transition: 'background 0.2s',
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    top: '4px',
                    left: isActive ? '23px' : '4px',
                    width: '16px',
                    height: '16px',
                    borderRadius: '50%',
                    background: isActive ? '#050A18' : 'rgba(255,255,255,0.5)',
                    transition: 'left 0.2s',
                  }}
                />
              </button>
              <span style={{ color: isActive ? 'var(--accent)' : 'var(--text-muted)', fontSize: '12px' }}>
                {isActive ? 'ON' : 'OFF'}
              </span>
            </label>
          </div>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              background: saving ? 'rgba(56,189,248,0.4)' : 'var(--accent)',
              color: '#050A18',
              border: 'none',
              borderRadius: '8px',
              padding: '11px 24px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: saving ? 'not-allowed' : 'pointer',
            }}
          >
            {saving ? '保存中...' : '保存する'}
          </button>
        </div>
      )}
    </div>
  )
}
