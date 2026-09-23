import { redirect } from 'next/navigation'

/**
 * Superseded by the six-stage chain: the review queue is now driven by workflow stage.
 * Kept as a redirect so old links and bookmarks still land somewhere useful.
 */
export default function Page() {
  redirect('/mintah/queue')
}
