import test from 'node:test'
import assert from 'node:assert/strict'
import { GUIDES, guideBySlug } from './guides.ts'

test('guides have unique slugs and search-friendly lengths', () => {
  assert.equal(new Set(GUIDES.map(g => g.slug)).size, GUIDES.length)
  for (const g of GUIDES) {
    assert.ok(g.seoTitle.length <= 60, `${g.slug} title too long`)
    assert.ok(g.description.length <= 160, `${g.slug} description too long`)
    assert.ok(g.sections.length > 0 && g.faq.length > 0)
    assert.match(g.updated, /^\d{4}-\d{2}-\d{2}$/)
  }
  assert.equal(guideBySlug('how-presales-work')?.slug, 'how-presales-work')
  assert.equal(guideBySlug('nope'), undefined)
})
