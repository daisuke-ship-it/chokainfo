import { supabaseAdmin } from '@/lib/supabaseAdmin'
import { notFound } from 'next/navigation'
import ShipyardEditForm from './ShipyardEditForm'

export const dynamic = 'force-dynamic'

type Props = {
  params: Promise<{ id: string }>
}

export default async function ShipyardDetailPage({ params }: Props) {
  const { id } = await params

  const { data: shipyard, error } = await supabaseAdmin
    .from('shipyards')
    .select('id, name, url, is_active, scrape_config, last_scraped_at, last_error, areas(name)')
    .eq('id', id)
    .single()

  if (error || !shipyard) {
    notFound()
  }

  // 直近3件のcatch_raw
  const { data: rawList } = await supabaseAdmin
    .from('catch_raw')
    .select('id, scraped_at, source_url')
    .eq('shipyard_id', id)
    .order('scraped_at', { ascending: false })
    .limit(3)

  return (
    <ShipyardEditForm
      shipyard={shipyard as unknown as Parameters<typeof ShipyardEditForm>[0]['shipyard']}
      recentRaw={rawList ?? []}
    />
  )
}
