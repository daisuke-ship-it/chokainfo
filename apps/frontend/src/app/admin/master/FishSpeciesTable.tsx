'use client'

import { useState, useEffect } from 'react'

type FishSpecies = {
  id: number | null
  name: string
  aliases: string[]
  category: string | null
  _editing: boolean
  _saving: boolean
  _aliasText: string
}

const CATEGORIES = [
  { value: '', label: '— なし —' },
  { value: 'rockfish', label: 'rockfish（根魚）' },
  { value: 'sea_bream', label: 'sea_bream（タイ類）' },
  { value: 'deep_sea', label: 'deep_sea（深海魚）' },
  { value: 'reef', label: 'reef（礁魚）' },
  { value: 'squid', label: 'squid（イカ類）' },
  { value: 'migratory', label: 'migratory（回遊魚）' },
  { value: 'grouper', label: 'grouper（ハタ類）' },
  { value: 'bottom', label: 'bottom（底物）' },
  { value: 'other', label: 'other（その他）' },
]

function toRow(fish: { id: number; name: string; aliases: string[] | null; category: string | null }): FishSpecies {
  return {
    id: fish.id,
    name: fish.name,
    aliases: fish.aliases ?? [],
    category: fish.category,
    _editing: false,
    _saving: false,
    _aliasText: (fish.aliases ?? []).join(', '),
  }
}

export default function FishSpeciesTable() {
  const [rows, setRows] = useState<FishSpecies[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/master/fish-species')
      .then((r) => r.json())
      .then(({ data, error }) => {
        if (error) throw new Error(error)
        setRows((data ?? []).map(toRow))
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  function startEdit(index: number) {
    setRows((prev) =>
      prev.map((row, i) =>
        i === index ? { ...row, _editing: true } : row
      )
    )
  }

  function updateField(index: number, field: keyof Pick<FishSpecies, 'name' | 'category' | '_aliasText'>, value: string) {
    setRows((prev) =>
      prev.map((row, i) =>
        i === index ? { ...row, [field]: value } : row
      )
    )
  }

  async function saveRow(index: number) {
    const row = rows[index]
    const aliases = row._aliasText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)

    setRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, _saving: true } : r))
    )

    try {
      if (row.id === null) {
        // 新規作成
        const res = await fetch('/api/admin/master/fish-species', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: row.name,
            aliases,
            growth_names: [],
            category: row.category || null,
          }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || '登録エラー')
        setRows((prev) =>
          prev.map((r, i) =>
            i === index
              ? { ...r, id: json.data.id, aliases, _editing: false, _saving: false }
              : r
          )
        )
      } else {
        // 更新
        const res = await fetch(`/api/admin/master/fish-species/${row.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: row.name,
            aliases,
            category: row.category || null,
          }),
        })
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || '更新エラー')
        setRows((prev) =>
          prev.map((r, i) =>
            i === index
              ? { ...r, aliases, _editing: false, _saving: false }
              : r
          )
        )
      }
    } catch (e) {
      setRows((prev) =>
        prev.map((r, i) => (i === index ? { ...r, _saving: false } : r))
      )
      alert(e instanceof Error ? e.message : '保存に失敗しました')
    }
  }

  async function deleteRow(index: number) {
    const row = rows[index]
    const label = row.name || '(未入力)'

    if (!confirm(`「${label}」を削除しますか？`)) return

    if (row.id === null) {
      // まだ保存されていない仮行は単に除去
      setRows((prev) => prev.filter((_, i) => i !== index))
      return
    }

    setRows((prev) =>
      prev.map((r, i) => (i === index ? { ...r, _saving: true } : r))
    )

    try {
      const res = await fetch(`/api/admin/master/fish-species/${row.id}`, {
        method: 'DELETE',
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '削除エラー')
      setRows((prev) => prev.filter((_, i) => i !== index))
    } catch (e) {
      setRows((prev) =>
        prev.map((r, i) => (i === index ? { ...r, _saving: false } : r))
      )
      alert(e instanceof Error ? e.message : '削除に失敗しました')
    }
  }

  function addRow() {
    setRows((prev) => [
      ...prev,
      {
        id: null,
        name: '',
        aliases: [],
        category: null,
        _editing: true,
        _saving: false,
        _aliasText: '',
      },
    ])
    // 新しく追加された行へスクロール
    setTimeout(() => {
      window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })
    }, 50)
  }

  if (loading) {
    return (
      <p style={{ color: 'var(--text-muted)', fontSize: '13px', padding: '16px 0' }}>
        読み込み中...
      </p>
    )
  }

  if (error) {
    return (
      <p style={{ color: '#ff6b6b', fontSize: '13px', padding: '16px 0' }}>
        エラー: {error}
      </p>
    )
  }

  const inputStyle: React.CSSProperties = {
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(255,255,255,0.2)',
    color: '#f0f4ff',
    borderRadius: 4,
    padding: '4px 8px',
    fontSize: '13px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  }

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    cursor: 'pointer',
  }

  const cellStyle: React.CSSProperties = {
    padding: '8px 12px',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    verticalAlign: 'middle',
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
        <button
          onClick={addRow}
          style={{
            background: 'transparent',
            color: 'var(--text)',
            border: '1px solid rgba(255,255,255,0.3)',
            borderRadius: '8px',
            padding: '7px 16px',
            fontSize: '13px',
            fontWeight: 500,
            cursor: 'pointer',
          }}
        >
          + 新規追加
        </button>
      </div>

      <div
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid var(--border-strong)',
          borderRadius: '12px',
          overflow: 'hidden',
        }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                {[
                  { label: 'ID', width: 60 },
                  { label: '名前', width: 120 },
                  { label: '別名（カンマ区切り）', width: 300 },
                  { label: 'カテゴリ', width: 160 },
                  { label: '操作', width: 140 },
                ].map(({ label, width }) => (
                  <th
                    key={label}
                    style={{
                      padding: '10px 12px',
                      textAlign: 'left',
                      color: '#8899bb',
                      fontSize: 11,
                      fontWeight: 500,
                      background: 'rgba(255,255,255,0.05)',
                      width,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={row.id ?? `new-${i}`}
                  onClick={() => !row._editing && startEdit(i)}
                  style={{
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    cursor: row._editing ? 'default' : 'pointer',
                    background: row._editing ? 'rgba(255,255,255,0.03)' : 'transparent',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    if (!row._editing) {
                      ;(e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)'
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!row._editing) {
                      ;(e.currentTarget as HTMLElement).style.background = 'transparent'
                    }
                  }}
                >
                  {/* ID */}
                  <td style={{ ...cellStyle, color: 'var(--text-muted)', width: 60 }}>
                    {row.id ?? '—'}
                  </td>

                  {/* 名前 */}
                  <td style={{ ...cellStyle, width: 120 }}>
                    {row._editing ? (
                      <input
                        style={inputStyle}
                        value={row.name}
                        autoFocus={row.id === null}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => updateField(i, 'name', e.target.value)}
                        placeholder="例: タチウオ"
                      />
                    ) : (
                      <span style={{ color: '#f0f4ff' }}>{row.name}</span>
                    )}
                  </td>

                  {/* 別名 */}
                  <td style={{ ...cellStyle, width: 300 }}>
                    {row._editing ? (
                      <input
                        style={inputStyle}
                        value={row._aliasText}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => updateField(i, '_aliasText', e.target.value)}
                        placeholder="例: タチウオ, 太刀魚, たちうお"
                      />
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                        {row.aliases.length > 0 ? row.aliases.join(', ') : '—'}
                      </span>
                    )}
                  </td>

                  {/* カテゴリ */}
                  <td style={{ ...cellStyle, width: 160 }}>
                    {row._editing ? (
                      <select
                        style={selectStyle}
                        value={row.category ?? ''}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => updateField(i, 'category', e.target.value)}
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c.value} value={c.value} style={{ background: '#0a0f1e' }}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span style={{ color: 'var(--text-muted)', fontSize: '12px' }}>
                        {row.category ?? '—'}
                      </span>
                    )}
                  </td>

                  {/* 操作 */}
                  <td style={{ ...cellStyle, width: 140 }} onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      {row._editing ? (
                        <button
                          disabled={row._saving || !row.name.trim()}
                          onClick={() => saveRow(i)}
                          style={{
                            background: row._saving || !row.name.trim() ? 'rgba(0,212,200,0.3)' : '#00d4c8',
                            color: '#050A18',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '5px 12px',
                            fontSize: '12px',
                            fontWeight: 600,
                            cursor: row._saving || !row.name.trim() ? 'not-allowed' : 'pointer',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {row._saving ? '保存中...' : '保存'}
                        </button>
                      ) : null}
                      <button
                        disabled={row._saving}
                        onClick={() => deleteRow(i)}
                        style={{
                          background: 'transparent',
                          color: row._saving ? 'rgba(239,68,68,0.4)' : '#ef4444',
                          border: '1px solid',
                          borderColor: row._saving ? 'rgba(239,68,68,0.2)' : 'rgba(239,68,68,0.4)',
                          borderRadius: '6px',
                          padding: '5px 10px',
                          fontSize: '12px',
                          cursor: row._saving ? 'not-allowed' : 'pointer',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        削除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}
                  >
                    魚種データがありません
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p style={{ color: 'var(--text-muted)', fontSize: '11px', marginTop: '10px' }}>
        行をクリックすると編集モードになります。編集後「保存」を押すと即時反映されます。
      </p>
    </>
  )
}
