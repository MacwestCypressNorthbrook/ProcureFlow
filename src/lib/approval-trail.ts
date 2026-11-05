/**
 * A requisition's sign-offs, shared by every list that filters by approver.
 *
 * One definition of "an approval" for the whole app: a stage approving it,
 * the Administrator raising its PO, or the Administrator authorizing and
 * closing it. Send-backs, edits and the like are not approvals.
 */

/** One sign-off, as the list queries return it. */
export interface ApprovalStep {
  name: string | null
  stage: string
  action: string
  at: string
}

export const APPROVAL_ACTIONS = ['approved', 'po_created', 'completed'] as const

/**
 * SQL for a requisition's sign-offs as a JSON array, oldest first — use it as
 * a column: `${approvalsListSql('r.id')} AS approvals_list`.
 *
 * Pass a PO column to keep only that PO's sign-offs alongside the
 * requisition-wide ones, so a split requisition's POs do not borrow each
 * other's approvals. Arguments are column references, never user input.
 */
export function approvalsListSql(requestIdCol: string, poIdCol?: string): string {
  return `(SELECT jsonb_agg(
             jsonb_build_object(
               'name', COALESCE(au.name, au.email),
               'stage', a.stage,
               'action', a.action,
               'at', a.created_at
             ) ORDER BY a.created_at
           )
      FROM public.request_approvals a
      LEFT JOIN public.users au ON au.id = a.performed_by
     WHERE a.request_id = ${requestIdCol}
       AND a.action IN (${APPROVAL_ACTIONS.map((x) => `'${x}'`).join(', ')})
       ${poIdCol ? `AND (a.po_id IS NULL OR a.po_id = ${poIdCol})` : ''}
       AND COALESCE(au.name, au.email) IS NOT NULL)`
}

/**
 * The sign-offs worth showing, oldest first.
 *
 * Authorizing a requisition records both `po_created` and `completed` from the
 * same person in the same moment — one decision, so it shows once. A stage
 * approved twice (after a send-back) keeps both, since each was a real sign-off.
 */
export function approvalSteps(list: ApprovalStep[] | null | undefined): ApprovalStep[] {
  const sorted = [...(list ?? [])].sort((a, b) => a.at.localeCompare(b.at))
  const out: ApprovalStep[] = []
  for (const step of sorted) {
    const prev = out[out.length - 1]
    const sameMoment =
      prev &&
      prev.name === step.name &&
      prev.stage === step.stage &&
      Math.abs(new Date(step.at).getTime() - new Date(prev.at).getTime()) < 60_000
    if (sameMoment) out[out.length - 1] = step
    else out.push(step)
  }
  return out
}

/** Everyone who signed off, for the Approver filter's options. */
export const approverNames = (list: ApprovalStep[] | null | undefined): string[] =>
  (list ?? []).map((s) => s.name).filter((n): n is string => Boolean(n))

/**
 * Dates for the Approval Date filter. With approvers ticked, only their own
 * sign-offs count, so "Ama, 3 Oct" finds what Ama approved on 3 Oct.
 */
export const approvalDates = (list: ApprovalStep[] | null | undefined, approvers: string[]): string[] =>
  (list ?? []).filter((s) => approvers.length === 0 || (s.name !== null && approvers.includes(s.name))).map((s) => s.at)

/** The most recent sign-off, for sorting by approval. */
export const lastApproval = (list: ApprovalStep[] | null | undefined): ApprovalStep | null => {
  const steps = approvalSteps(list)
  return steps.length ? steps[steps.length - 1] : null
}

/** The approval stages in chain order, as export columns list them. */
export const APPROVAL_STAGES = ['lead', 'supply_chain', 'cost_control', 'admin'] as const

/** A stage's latest sign-off — after a send-back, the one that let it through. */
export const stageApproval = (list: ApprovalStep[] | null | undefined, stage: string): ApprovalStep | null =>
  approvalSteps(list).filter((s) => s.stage === stage).pop() ?? null

/**
 * The whole chain as one line for a spreadsheet cell, oldest first:
 * "Project Lead: Ama Mensah, 03 Oct 2026 → Supply Chain: …".
 */
export function approvalTrailText(list: ApprovalStep[] | null | undefined, stageLabel: (stage: string) => string): string {
  return approvalSteps(list)
    .map((s) => {
      const day = new Date(s.at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      return `${stageLabel(s.stage)}: ${s.name ?? 'Unknown'}, ${day}`
    })
    .join(' → ')
}
