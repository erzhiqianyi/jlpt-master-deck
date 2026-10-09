// 罗马音：修订赫本式 + 输入法式长音；并列读音的分隔符原样保留
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { romajiColumns, acceptCustomRomaji } from '../server/v3/romaji.mjs';

test('kana readings become input-style romaji with a loose search key', () => {
  assert.deepEqual(romajiColumns('とうきょう'), { romaji: 'toukyou', romaji_key: 'tokyo', romaji_custom: 0 });
  assert.equal(romajiColumns('がいかん').romaji, 'gaikan');
});

test('grammar readings keep their alternative and optional separators', () => {
  assert.equal(romajiColumns('あく／ひらく').romaji, 'aku / hiraku');
  assert.equal(romajiColumns('〜とく／〜どく').romaji, '~toku / ~doku');
  assert.equal(romajiColumns('～なり…なり').romaji, '~nari...nari');
  assert.equal(romajiColumns('～とばかり（に）').romaji, '~tobakari(ni)');
  assert.ok(acceptCustomRomaji('～いかんでは', '~ikande wa'));
});

test('readings with kanji or only punctuation are rejected', () => {
  assert.throws(() => romajiColumns('AをBとかんがえる'));
  assert.throws(() => romajiColumns('にともなう→に伴う'));
  assert.throws(() => romajiColumns('...'));
});
