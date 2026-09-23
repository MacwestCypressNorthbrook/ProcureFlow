import { redirect } from 'next/navigation'

/**
 * Superseded by the six-stage chain: Finance works from the stage queue, which carries the requisition too.
 * Kept as a redirect so old links and bookmarks still land somewhere useful.
 */
export default function Page() {
  redirect('/finance/queue')
}
