import AnomalyTable from './AnomalyTable'

export default function AnomaliesPage() {
  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px 20px' }}>
      <h1 style={{ fontSize: 20, fontWeight: 500, marginBottom: 24, color: 'var(--text)' }}>
        異常値管理
      </h1>
      <AnomalyTable />
    </div>
  )
}
