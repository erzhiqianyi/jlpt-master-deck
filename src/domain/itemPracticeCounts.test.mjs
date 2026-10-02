import test from 'node:test';
import assert from 'node:assert/strict';
import { itemPracticeCounts } from './itemPracticeCounts.mjs';
const answer = (itemId, questionId = 'q') => ({ itemId, questionId, answeredAt: 'now' });
test('counts linked items once per completed session across practice types', () => {
 const topic = { id: 'topic', completedAt: 'now', answers: [answer('word','q1'), answer('word','q2'),answer('grammar')] };
 assert.deepEqual(itemPracticeCounts([topic, topic, { id:'free', completedAt:'now',answers:[answer('word')] }]), {word:2,grammar:1});
});
test('excludes unfinished, unlinked and memory-card answers', () => {
 assert.deepEqual(itemPracticeCounts([{id:'unfinished',answers:[answer('word')]},{id:'done',completedAt:'now',answers:[answer(''),answer('word','memory-card:word'),{itemId:'word'}]}]),{});
});
