import assert from 'node:assert/strict'
import test from 'node:test'
import { cn } from '../src/renderer/lib/utils'

test('semantic font sizes preserve semantic foreground colors in shared buttons and cards', () => {
  assert.match(cn('text-on-primary', 'text-label-sm'), /text-on-primary/)
  assert.match(cn('text-body-sm', 'text-on-surface-variant'), /text-body-sm/)
  assert.equal(cn('text-body-md', 'text-label-sm'), 'text-label-sm')
})
