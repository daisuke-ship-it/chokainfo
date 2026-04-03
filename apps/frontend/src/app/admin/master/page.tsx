import FishSpeciesTable from './FishSpeciesTable'

export default function MasterPage() {
  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', padding: '24px 20px' }}>
      <h1 style={{ fontSize: 20, fontWeight: 500, marginBottom: 24, color: 'var(--text)' }}>
        マスターデータ管理
      </h1>
      <h2 style={{ fontSize: 14, fontWeight: 500, marginBottom: 14, color: 'var(--text-muted)' }}>
        魚種マスター
      </h2>
      <FishSpeciesTable />
    </div>
  )
}
