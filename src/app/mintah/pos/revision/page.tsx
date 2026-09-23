import { redirect } from 'next/navigation'

/**
 * Superseded by the six-stage chain: the Administrator raises purchase orders now, not Supply Chain.
 * Kept as a redirect so old links and bookmarks still land somewhere useful.
 */
export default function Page() {
  redirect('/mintah/queue')
}
