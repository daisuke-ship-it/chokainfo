'use client'

import { useState } from 'react'

type Shipyard = {
  id: number
  name: string
  url: string
  is_active: boolean
  scrape_config: { handler?: string } | null
  last_scraped_at: string | null
  last_error: string | null
  areas: { name: string } | null
}

type RawItem = {
  id: number
  scraped_at: string
  source_url: string
}

type TestResult = {
  handler: string
  sample: { title?: string; text?: string }[]
  warnings: string[]
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

const cardStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.07)',
  backdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.10)',
  borderRadius: '16px',
  padding: '24px',
  marginBottom: '16px',
}

function relativeTime(dateStr: string | null): string {
  if (!dateStr) return '未取得'
  const diff = Date.now() - new Date(dateStr).getTime()
  const hours = Math.floor(diff / 3600000)
  if (hours < 1) return '1時間以内'
  if (hours < 24) return `${hours}時間前`
  const days = Math.floor(hours / 24)
  return `${days}日前`
}

const HANDLER_COLORS: Record<string, string> = {
  gyosan: '#60a5fa',
  wordpress: '#4ade80',
  blogphp: '#fb923c',
  claude: '#c084fc',
  rss: '#fbbf24',
}

export default function ShipyardEditForm({
  shipyard,
  recentRaw,
}: {
  shipyard: Shipyard
  recentRaw: RawItem[]
}) {
  const [name, setName] = useState(shipyard.name)
  const [url, setUrl] = useState(shipyard.url)
  const [isActive, setIsActive] = useState(shipyard.is_active)
  const [configText, setConfigText] = useState(
    JSON.stringify(shipyard.scrape_config ?? { handler: 'claude' }, null, 2)
  )
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [error, setError] = useState('')

  const handler = (() => {
    try { return (JSON.parse(configText) as { handler?: string }).handler ?? 'claude' }
    catch { return 'claude' }
  })()

  async function handleSave() {
    setSaving(true)
    setError('')
    setSaveMsg('')
    try {
      let config: Record<string, unknown> = {}
      try { config = JSON.parse(configText) } catch { config = { handler: 'claude' } }

      const res = await fetch(`/api/admin/shipyards/${shipyard.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, url, is_active: isActive, scrape_config: config }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? '保存エラー')
      }
      setSaveMsg('保存しました')
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存に失敗しました')
    } finally {
      setSaving(false)
    }
  }

  async function handleTest() {
    setTesting(true)
    setError('')
    setTestResult(null)
    try {
      let config: Record<string, unknown> = {}
      try { config = JSON.parse(configText) } catch { config = { handler: 'claude' } }

      const res = await fetch('/api/admin/scraper/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, scrape_config: config }),
      })
      const data: TestResult = await res.json()
      setTestResult(data)
    } catch {
      setError('テスト実行に失敗しました')
    } finally {
      setTesting(false)
    }
  }

  return (
    <div style={{ maxWidth: '760px', margin: '0 auto', padding: '24px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <a
          href="/admin/shipyards"
          style={{ color: 'var(--text-muted)', fontSize: '13px', textDecoration: 'none' }}
        >
          ← 一覧に戻る
        </a>
        <h1 style={{ color: 'var(--text)', fontSize: '18px', fontWeight: 500 }}>
          {shipyard.name}
        </h1>
        <span
          style={{
            background: `${HANDLER_COLORS[handler] ?? '#c084fc'}22`,
            color: HANDLER_COLORS[handler] ?? '#c084fc',
            padding: '2px 10px',
            borderRadius: '100px',
            fontSize: '12px',
            fontWeight: 600,
          }}
        >
          {handler}
        </span>
      </div>

      {error && (
        <p style={{ color: '#ff6b6b', fontSize: '13px', marginBottom: '16px', padding: '10px', background: 'rgba(255,107,107,0.10)', borderRadius: '8px' }}>
          {error}
        </p>
      )}
      {saveMsg && (
        <p style={{ color: '#4ade80', fontSize: '13px', marginBottom: '16px', padding: '10px', background: 'rgba(74,222,128,0.10)', borderRadius: '8px' }}>
          {saveMsg}
        </p>
      )}

      {/* 基本情報 */}
      <div style={cardStyle}>
        <h2 style={{ color: 'var(--text)', fontSize: '14px', marginBottom: '16px' }}>基本情報</h2>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
          <div>
            <label style={labelStyle}>船宿名</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>エリア</label>
            <input
              type="text"
              value={shipyard.areas?.name ?? '未設定'}
              disabled
              style={{ ...inputStyle, opacity: 0.5 }}
            />
          </div>
        </div>

        <div style={{ marginBottom: '14px' }}>
          <label style={labelStyle}>URL</label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            style={inputStyle}
          />
        </div>

        <div style={{ marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <label style={{ ...labelStyle, marginBottom: 0 }}>is_active</label>
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
        </div>

        <div style={{ marginBottom: '6px' }}>
          <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: 'var(--text-muted)', marginBottom: '4px' }}>
            <span>最終取得: {relativeTime(shipyard.last_scraped_at)}</span>
            {shipyard.last_scraped_at && (
              <span style={{ color: 'rgba(255,255,255,0.3)' }}>
                {new Date(shipyard.last_scraped_at).toLocaleString('ja-JP')}
              </span>
            )}
          </div>
          {shipyard.last_error && (
            <p style={{ color: '#ff6b6b', fontSize: '12px', marginTop: '4px' }}>
              最終エラー: {shipyard.last_error}
            </p>
          )}
        </div>
      </div>

      {/* scrape_config */}
      <div style={cardStyle}>
        <h2 style={{ color: 'var(--text)', fontSize: '14px', marginBottom: '16px' }}>
          scrape_config
        </h2>
        <textarea
          value={configText}
          onChange={(e) => setConfigText(e.target.value)}
          rows={7}
          style={{ ...inputStyle, fontFamily: 'monospace', fontSize: '12px', resize: 'vertical' }}
        />
      </div>

      {/* アクションボタン */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            background: saving ? 'rgba(56,189,248,0.4)' : 'var(--accent)',
            color: '#050A18',
            border: 'none',
            borderRadius: '8px',
            padding: '10px 22px',
            fontSize: '14px',
            fontWeight: 600,
            cursor: saving ? 'not-allowed' : 'pointer',
          }}
        >
          {saving ? '保存中...' : '保存'}
        </button>
        <button
          onClick={handleTest}
          disabled={testing}
          style={{
            background: 'transparent',
            color: testing ? 'var(--text-muted)' : 'var(--accent)',
            border: '1px solid',
            borderColor: testing ? 'var(--border-strong)' : 'var(--accent)',
            borderRadius: '8px',
            padding: '10px 20px',
            fontSize: '14px',
            cursor: testing ? 'not-allowed' : 'pointer',
          }}
        >
          {testing ? 'テスト中...' : 'テスト実行'}
        </button>
      </div>

      {/* テスト結果 */}
      {testResult && (
        <div style={cardStyle}>
          <h2 style={{ color: 'var(--text)', fontSize: '14px', marginBottom: '12px' }}>
            テスト結果（ハンドラー: {testResult.handler}）
          </h2>
          {testResult.warnings.map((w, i) => (
            <p key={i} style={{ color: '#fbbf24', fontSize: '12px', marginBottom: '6px' }}>
              ⚠ {w}
            </p>
          ))}
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
              {item.title && <strong style={{ color: 'var(--text)', display: 'block', marginBottom: '4px' }}>{item.title}</strong>}
              {item.text && <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{item.text}</span>}
            </div>
          ))}
          {testResult.sample.length === 0 && (
            <p style={{ color: 'var(--text-muted)', fontSize: '13px' }}>サンプルが取得できませんでした</p>
          )}
        </div>
      )}

      {/* 直近のcatch_raw */}
      {recentRaw.length > 0 && (
        <div style={cardStyle}>
          <h2 style={{ color: 'var(--text)', fontSize: '14px', marginBottom: '12px' }}>
            直近のスクレイピング記録
          </h2>
          {recentRaw.map((r) => (
            <div
              key={r.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 0',
                borderBottom: '1px solid rgba(255,255,255,0.04)',
                fontSize: '12px',
              }}
            >
              <span style={{ color: 'var(--text-sub)' }}>
                {new Date(r.scraped_at).toLocaleString('ja-JP')}
              </span>
              <span style={{ color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>
                {r.source_url}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
