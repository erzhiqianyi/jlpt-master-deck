// 假名 → 罗马音：修订赫本式，长音按假名原样写（とうきょう → toukyou，ゲーム → geemu）。
// 规则只在这里维护，服务端写入时生成并存库，客户端只读结果。

const PAIRS = { // 两字组合（拗音、外来音），优先于单字匹配
  きゃ:'kya',きゅ:'kyu',きょ:'kyo',ぎゃ:'gya',ぎゅ:'gyu',ぎょ:'gyo',しゃ:'sha',しゅ:'shu',しょ:'sho',しぇ:'she',
  じゃ:'ja',じゅ:'ju',じょ:'jo',じぇ:'je',ちゃ:'cha',ちゅ:'chu',ちょ:'cho',ちぇ:'che',ぢゃ:'ja',ぢゅ:'ju',ぢょ:'jo',
  にゃ:'nya',にゅ:'nyu',にょ:'nyo',ひゃ:'hya',ひゅ:'hyu',ひょ:'hyo',びゃ:'bya',びゅ:'byu',びょ:'byo',
  ぴゃ:'pya',ぴゅ:'pyu',ぴょ:'pyo',みゃ:'mya',みゅ:'myu',みょ:'myo',りゃ:'rya',りゅ:'ryu',りょ:'ryo',
  てぃ:'ti',でぃ:'di',とぅ:'tu',どぅ:'du',てゅ:'tyu',でゅ:'dyu',ふぁ:'fa',ふぃ:'fi',ふぇ:'fe',ふぉ:'fo',ふゅ:'fyu',
  うぃ:'wi',うぇ:'we',うぉ:'wo',ゔぁ:'va',ゔぃ:'vi',ゔぇ:'ve',ゔぉ:'vo',つぁ:'tsa',つぃ:'tsi',つぇ:'tse',つぉ:'tso',
  いぇ:'ye',くぁ:'kwa',ぐぁ:'gwa',
};
const SINGLE = Object.fromEntries(('あa いi うu えe おo かka きki くku けke こko がga ぎgi ぐgu げge ごgo ' +
  'さsa しshi すsu せse そso ざza じji ずzu ぜze ぞzo たta ちchi つtsu てte とto だda ぢji づzu でde どdo ' +
  'なna にni ぬnu ねne のno はha ひhi ふfu へhe ほho ばba びbi ぶbu べbe ぼbo ぱpa ぴpi ぷpu ぺpe ぽpo ' +
  'まma みmi むmu めme もmo やya ゆyu よyo らra りri るru れre ろro わwa ゐi ゑe をo ゔvu ' +
  'ぁa ぃi ぅu ぇe ぉo ゃya ゅyu ょyo ゎwa').split(' ').map((pair) => [pair[0], pair.slice(1)]));
// 可能作助词的假名：自定义罗马音允许写成助词读音
const PARTICLE_ALTERNATIVES = { は: 'wa', へ: 'e' };

const toHiragana = (text) => text.normalize('NFKC')
  .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

function syllableAt(text, index) {
  const pair = text.slice(index, index + 2);
  if (PAIRS[pair]) return { romaji: PAIRS[pair], length: 2 };
  if (SINGLE[text[index]]) return { romaji: SINGLE[text[index]], length: 1 };
  return null;
}

// 返回逐音节结果；alternatives 用于校验自定义写法
function tokenize(reading) {
  const text = toHiragana(reading);
  const tokens = [];
  for (let i = 0; i < text.length;) {
    const c = text[i];
    if (c === 'ー') {
      const vowel = tokens.map((t) => t.romaji).join('').match(/[aiueo]$/)?.[0] ?? '';
      tokens.push({ romaji: vowel }); i++; continue;
    }
    if (c === 'っ') {
      const next = syllableAt(text, i + 1);
      tokens.push({ romaji: next ? (next.romaji.startsWith('ch') ? 't' : next.romaji[0]) : '' }); i++; continue;
    }
    if (c === 'ん') {
      const next = syllableAt(text, i + 1);
      tokens.push({ romaji: next && /^[aiueoy]/.test(next.romaji) ? "n'" : 'n' }); i++; continue;
    }
    const syllable = syllableAt(text, i);
    if (syllable) {
      const alternative = syllable.length === 1 ? PARTICLE_ALTERNATIVES[c] : undefined;
      tokens.push({ romaji: syllable.romaji, alternatives: alternative ? [alternative] : [] });
      i += syllable.length; continue;
    }
    if (c === '〜' || c === '~') { tokens.push({ romaji: '~' }); i++; continue; }
    if (c === ' ' || c === '・' || c === '　') { tokens.push({ romaji: ' ' }); i++; continue; }
    // 语法条目的读音常并列几种形式：〜とく／〜どく、〜なり…なり、〜とばかり（に）
    if (c === '／' || c === '/') { tokens.push({ romaji: ' / ' }); i++; continue; }
    if (c === '.') { tokens.push({ romaji: '.' }); i++; continue; } // NFKC 把 … 变成 ...
    if (c === '（' || c === '(') { tokens.push({ romaji: '(' }); i++; continue; }
    if (c === '）' || c === ')') { tokens.push({ romaji: ')' }); i++; continue; }
    throw new Error(`读音只能包含假名，发现「${c}」`);
  }
  return tokens;
}

export const kanaToRomaji = (reading) => tokenize(reading).map((t) => t.romaji).join('');

// 比较用：小写，去掉空格、撇号、连字符、波浪线
const compact = (value) => value.toLowerCase().replace(/[\s'\-~]/g, '');

// 搜索用宽松键：再合并长音，tokyo / toukyou / tōkyō 都能对上
export function romajiSearchKey(value) {
  return compact(value.normalize('NFD').replace(/[̀-ͯ]/g, ''))   // ō → o
    .replace(/ou|oo/g, 'o').replace(/uu/g, 'u').replace(/aa/g, 'a').replace(/ii/g, 'i').replace(/ee/g, 'e');
}

// 自定义写法只能在空格、助词读音（は→wa、へ→e）上与自动结果不同
export function acceptCustomRomaji(reading, custom) {
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = tokenize(reading).map((t) => {
    const options = [t.romaji, ...(t.alternatives ?? [])].map(compact).filter((v, i, all) => all.indexOf(v) === i);
    return options.length > 1 ? `(?:${options.map(escape).join('|')})` : escape(options[0]);
  }).join('');
  return new RegExp(`^${pattern}$`).test(compact(custom));
}

// 允许：假名、长音符、波浪线（〜 U+301C、～ U+FF5E、~）、中点、空格，以及并列形式用的 ／ … （）
export const isKana = (text) => /^[\p{Script=Hiragana}\p{Script=Katakana}ー〜～~・ 　／/…（）().]+$/u.test(text) && /[\p{Script=Hiragana}\p{Script=Katakana}]/u.test(text);

// 生成要写进库的三列
export function romajiColumns(reading, custom) {
  if (reading == null) return { romaji: null, romaji_key: null, romaji_custom: 0 };
  if (!isKana(reading)) throw new Error(`读音只能包含假名：${reading}`);
  if (custom && !acceptCustomRomaji(reading, custom)) throw new Error(`自定义罗马音「${custom}」与读音「${reading}」不一致`);
  const romaji = custom ?? kanaToRomaji(reading);
  return { romaji, romaji_key: romajiSearchKey(romaji), romaji_custom: custom ? 1 : 0 };
}
