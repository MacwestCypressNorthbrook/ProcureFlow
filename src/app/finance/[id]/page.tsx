import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import FinanceDetailClient from '@/components/shared/FinanceDetailClient'

export default async function FinanceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  const { data: po, error } = await supabase
    .from('purchase_orders')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !po) {
    notFound()
  }

  return <FinanceDetailClient po={po} />
}
