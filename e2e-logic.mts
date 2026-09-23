import {
  STAGE_ORDER, STAGES, currentStage, nextStage, previousStage,
  statusForStage, canActAt, queueStatusesForRole, stageSeesPurchaseOrder,
} from './src/lib/workflow'

let pass = 0, fail = 0
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name} ${detail}`) }
}

console.log('\n── Chain order')
check('six stages, requester first, finance last',
  STAGE_ORDER.join('>') === 'requester>lead>supply_chain>admin>cost_control>finance',
  STAGE_ORDER.join('>'))

console.log('\n── Forward movement')
check('requester → lead', nextStage('requester') === 'lead')
check('lead → supply chain', nextStage('lead') === 'supply_chain')
check('supply chain → admin', nextStage('supply_chain') === 'admin')
check('admin → cost control', nextStage('admin') === 'cost_control')
check('cost control → finance', nextStage('cost_control') === 'finance')
check('finance is terminal', nextStage('finance') === null)

console.log('\n── Send-back goes to the previous stage')
check('lead sends back to requester', previousStage('lead') === 'requester')
check('supply chain sends back to lead', previousStage('supply_chain') === 'lead')
check('admin sends back to supply chain', previousStage('admin') === 'supply_chain')
check('cost control sends back to admin', previousStage('cost_control') === 'admin')
check('finance sends back to cost control', previousStage('finance') === 'cost_control')
check('requester cannot send back', previousStage('requester') === null)

console.log('\n── Who may act where (separation of duties)')
const roles = ['engineer','project_lead','supply_chain','administrator','cost_control','finance'] as const
const expected: Record<string, string> = {
  requester: 'engineer', lead: 'project_lead', supply_chain: 'supply_chain',
  admin: 'administrator', cost_control: 'cost_control', finance: 'finance',
}
for (const stage of STAGE_ORDER) {
  for (const role of roles) {
    const allowed = canActAt(role, stage)
    // Only super_user is elevated; the Administrator is scoped to its own
    // stage so it cannot approve the requisitions it raises POs for.
    const shouldBe = expected[stage] === role
    check(`${role} at ${STAGES[stage].label}: ${allowed ? 'allowed' : 'denied'}`,
      allowed === shouldBe, `(expected ${shouldBe})`)
  }
}
check('super_user oversees every stage', STAGE_ORDER.every((s) => canActAt('super_user', s)))
check('legacy role "sam" still maps to lead', canActAt('sam', 'lead'))

console.log('\n── Status ↔ stage')
for (const stage of STAGE_ORDER.slice(1)) {
  check(`${statusForStage(stage)} resolves back to ${stage}`,
    currentStage(statusForStage(stage)) === stage)
}
check('sent_back is held by sent_back_to', currentStage('sent_back', 'admin') === 'admin')
check('sent_back with no holder falls to requester', currentStage('sent_back', null) === 'requester')
check('completed holds nobody', currentStage('completed') === null)
check('rejected holds nobody', currentStage('rejected') === null)

console.log('\n── Queues are stage-exact (no skipping ahead)')
check('lead queue is only pending_lead', JSON.stringify(queueStatusesForRole('project_lead')) === '["pending_lead"]')
check('cost control queue is only pending_cost_control', JSON.stringify(queueStatusesForRole('cost_control')) === '["pending_cost_control"]')
check('finance queue is only pending_finance', JSON.stringify(queueStatusesForRole('finance')) === '["pending_finance"]')
check('PO visible from admin onward', stageSeesPurchaseOrder('admin') && stageSeesPurchaseOrder('finance'))
check('PO not visible before admin', !stageSeesPurchaseOrder('lead') && !stageSeesPurchaseOrder('supply_chain'))

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'} — ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
