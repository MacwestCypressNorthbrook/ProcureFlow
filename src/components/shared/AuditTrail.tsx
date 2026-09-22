import { AUDIT_ACTION_LABELS, auditTone, relativeTime, type PoAuditEntry } from '@/lib/audit'
import { ROLE_LABELS } from '@/lib/utils'
import { CheckCircle, XCircle, Send, MessageSquare, FileText, Clock, Banknote } from 'lucide-react'

function actionIcon(action: string) {
  switch (action) {
    case 'approved':
    case 'approved_by_sam':
      return <CheckCircle size={12} />
    case 'paid':
    case 'payment_completed':
      return <Banknote size={12} />
    case 'rejected':
    case 'rejected_by_sam':
    case 'sent_back':
    case 'sent_back_by_sam':
      return <XCircle size={12} />
    case 'comment_added':
      return <MessageSquare size={12} />
    case 'po_attached':
      return <FileText size={12} />
    default:
      return <Send size={12} />
  }
}

const TONE_STYLES = {
  positive: 'bg-emerald-500 text-white ring-emerald-500/20',
  negative: 'bg-destructive text-white ring-destructive/20',
  neutral: 'bg-muted text-muted-foreground ring-border',
} as const

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

/** The actor line — the point of the whole panel. Never silently anonymous. */
function Actor({ entry }: { entry: PoAuditEntry }) {
  if (!entry.actor_name && !entry.actor_email) {
    return (
      <span className="italic text-muted-foreground" title="This account has since been removed">
        Deleted user
      </span>
    )
  }

  const name = entry.actor_name || entry.actor_email || 'Unknown'
  const role = entry.actor_role ? ROLE_LABELS[entry.actor_role] ?? entry.actor_role : null

  return (
    <span className="inline-flex items-center gap-1.5 align-middle">
      <span
        aria-hidden
        className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-primary/10 text-[9px] font-semibold text-primary"
      >
        {initials(name)}
      </span>
      <span className="font-semibold text-foreground">{name}</span>
      {role && <span className="text-muted-foreground">· {role}</span>}
    </span>
  )
}

/**
 * The chronological record of what happened to a purchase order.
 *
 * Oldest first, so the trail reads top-to-bottom like the approval itself.
 * Every entry answers three questions in one line: what happened, who did it,
 * and when — with a relative time to scan and an exact timestamp to verify.
 */
export default function AuditTrail({ entries }: { entries: PoAuditEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
        <Clock size={13} />
        No recorded activity yet.
      </div>
    )
  }

  return (
    <ol className="space-y-0">
      {entries.map((entry, i) => {
        const tone = auditTone(entry.action)
        const isLast = i === entries.length - 1
        const exact = new Date(entry.created_at).toLocaleString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })

        return (
          <li key={entry.id} className="relative flex gap-3 pb-5 last:pb-0">
            {!isLast && (
              <span aria-hidden className="absolute left-[11px] top-6 bottom-0 w-px bg-border" />
            )}
            <span
              aria-hidden
              className={`mt-0.5 flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full ring-4 ring-card ${TONE_STYLES[tone]}`}
            >
              {actionIcon(entry.action)}
            </span>

            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-xs font-semibold text-foreground">
                {AUDIT_ACTION_LABELS[entry.action] ?? entry.action}
              </p>

              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                <Actor entry={entry} />
              </p>

              {entry.notes && (
                <p className="mt-1.5 rounded-md border-l-2 border-border bg-muted/40 px-2.5 py-1.5 text-[11px] leading-relaxed text-foreground/80">
                  {entry.notes}
                </p>
              )}

              <p className="mt-1 text-[10px] text-muted-foreground">
                <time dateTime={entry.created_at} title={exact}>
                  {relativeTime(entry.created_at)}
                </time>
                <span className="mx-1.5 text-border">|</span>
                <span className="tabular-nums">{exact}</span>
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
