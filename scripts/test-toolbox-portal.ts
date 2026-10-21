import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parsePortalFields } from '../src/main/services/toolbox/portal-parser'

const valid = { overview: true, usageDetail: '12.34 GB / 100.00 GB', remaining: '87.66 GB (87.66%) 剩余', percent: '12.34', extra: '2.50 GB 剩余', reset: '下个周期开始时间 2026/11/01', payment: '2026/11/09', cycle: '2026/10/01 - 2026/10/31' }
test('preserves GB precision and calendar dates', () => {
  assert.deepEqual(parsePortalFields(valid), { used: '12.34', total: '100.00', remaining: '87.66', extraRemaining: '2.50', unit: 'GB', usedPercent: 12.34, nextResetDate: '2026-11-01', nextPaymentDate: '2026-11-09', cycle: valid.cycle })
})
test('permits independent display rounding', () => { assert.equal(parsePortalFields({ ...valid, remaining: '87.65 GB 剩余' }).used, '12.34') })
test('rejects inconsistent, absent and unsupported fields', () => {
  for (const fields of [{ ...valid, remaining: '80 GB' }, { ...valid, usageDetail: '' }, { ...valid, usageDetail: '12 TB / 100 TB' }, { ...valid, payment: '2026/02/30' }, { ...valid, percent: '60' }]) {
    assert.throws(() => parsePortalFields(fields), { code: 'unsupported' })
  }
})
test('classifies login, challenge and unavailable without confusing service passwords', () => {
  assert.throws(() => parsePortalFields({ login: true }), { code: 'login_required' })
  assert.throws(() => parsePortalFields({ challenge: true, login: true }), { code: 'challenge' })
  assert.throws(() => parsePortalFields({ unavailable: true }), { code: 'service_unavailable' })
  assert.equal(parsePortalFields({ ...valid, login: true }).used, '12.34')
})
test('missing optional fields stay unknown; zero is not unlimited', () => {
  const result = parsePortalFields({ overview: true, usageDetail: '0.00 GB / 0.00 GB', remaining: '0.00 GB' })
  assert.equal(result.usedPercent, null)
  assert.equal(result.extraRemaining, null)
  assert.equal(result.nextPaymentDate, null)
})
