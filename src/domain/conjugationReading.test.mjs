import assert from 'node:assert/strict';
import test from 'node:test';
import { conjugationReading } from './conjugationReading.ts';

test('legacy godan forms derive readings without retaining the dictionary ending', () => {
  const item = { original: '頷く', reading: 'うなずく', inflection_class: 'godan' };
  for (const [form, reading] of [['頷きます', 'うなずきます'], ['頷いて', 'うなずいて'], ['頷こう', 'うなずこう']]) {
    assert.equal(conjugationReading(item, { kind: 'test', form }), reading);
  }
});
test('explicit and exact ruby readings take precedence; irregular readings are never guessed', () => {
  const item = { original: '来る', reading: 'くる', inflection_class: 'kuru', ruby_terms: [{ text: '来ない', reading: 'こない' }] };
  assert.equal(conjugationReading(item, { form: '来ます' }), undefined);
  assert.equal(conjugationReading(item, { form: '来ます', reading: 'きます' }), 'きます');
  assert.equal(conjugationReading(item, { form: '来ない' }), 'こない');
});
