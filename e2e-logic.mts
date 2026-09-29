import {
  STAGE_ORDER, STAGES, currentStage, nextStage, previousStage,
  statusForStage, canActAt, queueStatusesForRole, stageSeesPurchaseOrder,
  isTerminalStage, TERMINAL_STAGE,
} from './src/lib/workflow'

let pass = 0, fail = 0
const check = (name: string, ok: boolean, detail = '') => {
  if (ok) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name} ${detail}`) }
}

console.log('\n── Chain order')
// Cost Control audits the rates and the vendor invoices BEFORE Administration
// raises the purchase order and closes the requisition. Finance is off the
// chain entirely — its routes remain for historical purchase orders.
check('five stages, requester first, administration last',
  STAGE_ORDER.join('>') === 'requester>lead>supply_chain>cost_control>admin',
  STAGE_ORDER.join('>'))

console.log('\n── Forward movement')
check('requester → lead', nextStage('requester') === 'lead')
check('lead → supply chain', nextStage('lead') === 'supply_chain')
check('supply chain → cost control', nextStage('supply_chain') === 'cost_control')
check('cost control → administration', nextStage('cost_control') === 'admin')
check('administration is terminal', nextStage('admin') === null)
check('administration is THE terminal stage', TERMINAL_STAGE === 'admin' && isTerminalStage('admin'))
check('no stage before administration is terminal',
  !isTerminalStage('lead') && !isTerminalStage('supply_chain') && !isTerminalStage('cost_control'))
check('finance is off the chain', nextStage('finance') === null && !STAGE_ORDER.includes('finance'))

console.log('\n── Send-back goes to the previous stage')
check('lead sends back to requester', previousStage('lead') === 'requester')
check('supply chain sends back to lead', previousStage('supply_chain') === 'lead')
check('cost control sends back to supply chain', previousStage('cost_control') === 'supply_chain')
check('administration sends back to cost control', previousStage('admin') === 'cost_control')
check('requester cannot send back', previousStage('requester') === null)

console.log('\n── Who may act where (separation of duties)')
const roles = ['engineer','project_lead','supply_chain','administrator','cost_control','finance'] as const
const expected: Record<string, string> = {
  requester: 'engineer', lead: 'project_lead', supply_chain: 'supply_chain',
  cost_control: 'cost_control', admin: 'administrator', finance: 'finance',
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
check('sent_back is held by sent_back_to', currentStage('sent_back', 'supply_chain') === 'supply_chain')
check('sent_back with no holder falls to requester', currentStage('sent_back', null) === 'requester')
check('completed holds nobody', currentStage('completed') === null)
check('rejected holds nobody', currentStage('rejected') === null)

console.log('\n── Queues are stage-exact (no skipping ahead)')
check('lead queue is only pending_lead', JSON.stringify(queueStatusesForRole('project_lead')) === '["pending_lead"]')
check('cost control queue is only pending_cost_control', JSON.stringify(queueStatusesForRole('cost_control')) === '["pending_cost_control"]')
check('administration queue is only pending_admin', JSON.stringify(queueStatusesForRole('administrator')) === '["pending_admin"]')
// A purchase order attached at any point is visible to everyone on the
// requisition — gating it by stage index hid it from whoever opened the
// requisition earlier in the chain.
check('PO visible to every stage', STAGE_ORDER.every(() => stageSeesPurchaseOrder()))

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'} — ${pass} passed, ${fail} failed`)
process.exit(fail === 0 ? 0 : 1)
