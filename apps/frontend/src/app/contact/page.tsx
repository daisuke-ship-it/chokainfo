'use client'

import { useState } from 'react'
import Link from 'next/link'
import SiteHeader from '@/components/SiteHeader'

export default function ContactPage() {
  const [status, setStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setStatus('sending')
    const form = e.currentTarget
    const data = new FormData(form)

    try {
      const res = await fetch('https://formspree.io/f/xyzabcde', {
        method: 'POST',
        body: data,
        headers: { Accept: 'application/json' },
      })
      if (res.ok) {
        setStatus('success')
        form.reset()
      } else {
        setStatus('error')
      }
    } catch {
      setStatus('error')
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }}>

      {/* ── Header ─────────────────────────────────────────── */}
      <SiteHeader />

      {/* ── Hero ────────────────────────────────────────────── */}
      <div style={{
        background: 'var(--primary)',
        paddingTop: 40, paddingBottom: 44,
      }}>
        <div className="page-container">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 10 }}>
            <Link href="/" style={{ color: 'rgba(255,255,255,0.55)' }}>トップ</Link>
            <span>›</span>
            <span style={{ color: 'rgba(255,255,255,0.75)' }}>お問い合わせ</span>
          </div>
          <h1 style={{ fontSize: 'clamp(18px, 3vw, 24px)', fontWeight: 700, color: 'white', fontFamily: 'var(--font-serif)', letterSpacing: '0.04em', lineHeight: 1.25 }}>
            お問い合わせ
          </h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 6, lineHeight: 1.6 }}>
            船宿の追加リクエスト・不具合報告・ご意見などをお送りください。
          </p>
        </div>
      </div>

      {/* ── Main ─────────────────────────────────────────────── */}
      <main style={{ padding: '40px 0 100px' }}>
        <div className="page-container" style={{ maxWidth: 560 }}>

          {status === 'success' ? (
            <div style={{
              background: 'var(--surface)',
              border: '1px solid rgba(74,222,128,0.3)',
              borderRadius: 'var(--radius-lg)',
              padding: '40px 32px',
              textAlign: 'center',
            }}>
              <p style={{ fontSize: 32, marginBottom: 12 }}>✅</p>
              <p style={{ fontSize: 16, fontWeight: 700, color: '#4ade80', marginBottom: 8 }}>送信しました</p>
              <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
                お問い合わせありがとうございます。内容を確認後、必要に応じてご返信いたします。
              </p>
              <Link href="/" style={{
                display: 'inline-block',
                padding: '8px 20px',
                background: 'var(--accent)',
                color: '#000',
                borderRadius: 'var(--radius-pill)',
                fontSize: 13, fontWeight: 700,
                textDecoration: 'none',
              }}>
                トップへ戻る
              </Link>
            </div>
          ) : (
            <div style={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              padding: '28px 24px',
            }}>
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                {/* お問い合わせ種別 */}
                <div>
                  <label style={labelStyle}>
                    お問い合わせ種別 <span style={{ color: '#f87171' }}>*</span>
                  </label>
                  <select name="type" required style={inputStyle}>
                    <option value="">選択してください</option>
                    <option value="ship_request">船宿の追加リクエスト</option>
                    <option value="bug_report">不具合・誤情報の報告</option>
                    <option value="feature_request">機能リクエスト</option>
                    <option value="other">その他</option>
                  </select>
                </div>

                {/* メールアドレス */}
                <div>
                  <label style={labelStyle}>
                    メールアドレス（任意）
                  </label>
                  <input
                    type="email"
                    name="email"
                    placeholder="reply@example.com"
                    style={inputStyle}
                  />
                  <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                    返信が必要な場合はご記入ください
                  </p>
                </div>

                {/* 内容 */}
                <div>
                  <label style={labelStyle}>
                    内容 <span style={{ color: '#f87171' }}>*</span>
                  </label>
                  <textarea
                    name="message"
                    required
                    rows={5}
                    placeholder="例：金沢八景の〇〇丸を追加してほしい&#10;例：3/15の釣果データに誤りがあります"
                    style={{ ...inputStyle, resize: 'vertical', minHeight: 120 }}
                  />
                </div>

                {status === 'error' && (
                  <p style={{ fontSize: 13, color: '#f87171', textAlign: 'center' }}>
                    送信に失敗しました。時間をおいて再度お試しください。
                  </p>
                )}

                <button
                  type="submit"
                  disabled={status === 'sending'}
                  style={{
                    padding: '12px 0',
                    background: status === 'sending' ? 'var(--border)' : 'var(--accent)',
                    color: status === 'sending' ? 'var(--text-muted)' : '#000',
                    border: 'none',
                    borderRadius: 'var(--radius-pill)',
                    fontSize: 14, fontWeight: 700,
                    cursor: status === 'sending' ? 'not-allowed' : 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {status === 'sending' ? '送信中…' : '送信する'}
                </button>
              </form>
            </div>
          )}
        </div>
      </main>

      {/* ── Footer ───────────────────────────────────────── */}
      <footer style={{ borderTop: '1px solid var(--border)', background: 'var(--surface)', padding: '32px 0' }}>
        <div className="page-container" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            © {new Date().getFullYear()} 釣果情報.com
          </span>
          <span style={{ fontSize: 11, color: 'var(--border-strong)' }}>
            データは各船宿サイトより自動収集しています
          </span>
        </div>
      </footer>
    </div>
  )
}

// ── スタイル定数 ──────────────────────────────────────────────
const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 13,
  fontWeight: 600,
  color: 'var(--text)',
  marginBottom: 6,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  background: 'var(--surface-2)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontSize: 14,
  color: 'var(--text)',
  outline: 'none',
  boxSizing: 'border-box',
}
