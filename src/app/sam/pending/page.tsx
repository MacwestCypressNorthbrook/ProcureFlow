import { redirect } from 'next/navigation'

/**
 * Superseded by the six-stage chain: the Project Lead reviews requisitions, not purchase orders.
 * Kept as a redirect so old links and bookmarks still land somewhere useful.
 */
export default function Page() {
  redirect('/sam/requests')
}
