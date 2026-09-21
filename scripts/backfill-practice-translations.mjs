import {
  exportReviewDataBackup,
  getDb,
  loadReviewData,
} from '../server/storage.mjs';

const translationsByQuestionId = {
  '2026-08-28-001-practice-01': '那个孩子每次付款，都会有电话打来。',
  '2026-08-28-001-practice-05': '每天早上起床时，我都会洗脸。',
  'source-bun-kumitate-2413-star-reference': '明天不会因线路检查而调整发车时间。',
  'practice-bun-kumitate-star-001': '既然是老师的请求，我决定一定参加帮忙。',
  'source-bun-kumitate-2414-star': '既然是曾在我困难时帮助过我的你的请求，我一定想尽力帮忙。',
  'practice-bun-kumitate-star-002': '随着台风逼近，原定活动取消了。',
  'practice-bun-kumitate-star-003': '因车站改建工程，从下周起部分发车时间将有所调整。',
  'grammar-practice-20260830-002': '刚到车站，他就朝检票口跑去。',
  '2026-08-30-language-types--1-practice': '第一种语言讲完后，开始说明第二种语言时，最自然的连接词是什么？',
  'grammar-practice-20260830-003': '要是说了那么失礼的话，交易会立刻中止。',
  'grammar-practice-20260830-006': '如果能去海外，无论多忙我都打算做好准备。',
  'grammar-practice-20260830-001': '一旦把这个秘密告诉他，恐怕马上就会传遍公司。',
  'grammar-practice-20260830-004': '刚一走进房间，灯突然灭了。',
  'grammar-practice-20260830-005': '自从孩子出生以后，晚上连安稳觉也睡不了了。',
  '2026-08-31-n1-time-totan-q1': '刚一打开窗户，冷风就吹了进来。',
  '2026-08-31-n1-time-totan-q2': '刚到车站，手机就响了起来。',
  '2026-08-31-n1-time-totan-q3': '他刚钻进被窝就睡着了。',
  '2026-08-31-n1-time-totan-q4': '刚把旧箱子提起来，箱底就掉了。',
  '2026-08-31-n1-time-totan-q5': '刚听到老师的名字，教室就安静了下来。',
  '2026-08-31-n1-time-irai-q1': '自从来到日本以后，我每天都用日语写日记。',
  '2026-08-31-n1-time-irai-q2': '自从大学毕业以后，我一次也没有回过故乡。',
  '2026-08-31-n1-time-irai-q3': '结婚以来，我一直住在这个城市。',
  '2026-08-31-n1-time-irai-q4': '自从遭遇事故以后，他就一直没有开车。',
  '2026-08-31-n1-time-irai-q5': '从小时候起，我就一直记得这首歌。',
  '2026-08-31-n1-time-ga-hayai-ka-q1': '铃声刚响，学生们就冲出了教室。',
  '2026-08-31-n1-time-ga-hayai-ka-q2': '刚到机场，山田就冲进了便利店。',
  '2026-08-31-n1-time-ga-hayai-ka-q3': '刚听到消息，他就冲出了公司。',
  '2026-08-31-n1-time-ga-hayai-ka-q4': '新商品刚发售，订单就蜂拥而至。',
  '2026-08-31-n1-time-ga-hayai-ka-q5': '会议刚结束，部长就赶往下一个行程。',
  '2026-08-31-n1-time-ya-merged-q1': '父亲刚看了我一眼，就笑了起来。',
  '2026-08-31-n1-time-ya-merged-q3': '新制度刚公布，全国各地的咨询便接连而来。',
  '2026-08-31-n1-time-ya-merged-q4': '入场接待一开始，工作人员立刻忙了起来。',
  '2026-08-31-n1-time-ya-merged-q5': '比赛开始的哨声一响，观众席便爆发出巨大的欢呼声。',
  '2026-08-31-n1-time-nari-q2': '田中刚挂断电话，就把我叫了过去。',
  '2026-08-31-n1-time-nari-q3': '山川刚坐到餐桌旁，就狼吞虎咽地吃了起来。',
  '2026-08-31-n1-time-nari-q4': '大家刚看见那只动物，就从现场逃走了。',
  '2026-08-31-n1-time-nari-q5': '他刚接过资料，就走出了会议室。',
  '2026-08-31-n1-time-soba-kara-q2': '刚记住的新单词，转眼又忘了。',
  '2026-08-31-n1-time-soba-kara-q4': '面包刚烤好就不断卖出去。',
  '2026-08-31-n1-time-soba-kara-q5': '衣服刚买完，又会想要新的。',
  '2026-08-31-n1-time-kara-to-iu-mono-q2': '自从听了那位老师的话以后，我一直在思考人生的种种问题。',
  '2026-08-31-n1-time-kara-to-iu-mono-q3': '自从辞职以后，我几乎每天都在钓鱼。',
  '2026-08-31-n1-time-kara-to-iu-mono-q5': '自从孩子出生以后，我开始总是关注儿童用品。',
  '2026-08-31-n1-context-ni-atte-q2': '母亲即使卧病在床，仍然担心着孩子们。',
  '2026-08-31-n1-context-ni-atte-q4': '身处动荡的时代，人们一直在探索新的价值观。',
  '2026-08-31-n1-context-ni-atte-q5': '即使身处严峻的竞争环境，这家企业仍持续保持稳定增长。',
  '2026-08-31-n1-time-to-omou-to-q1': '他刚笑起来，转眼又突然哭了起来。',
  '2026-08-31-n1-time-to-omou-to-q2': '电车刚停下，乘客们就一起站了起来。',
  '2026-08-31-n1-time-to-omou-to-q3': '天空刚放亮，转眼又乌云密布。',
  '2026-08-31-n1-time-to-omou-to-q4': '孩子刚跑出去，马上就摔倒了。',
  '2026-08-31-n1-time-to-omou-to-q5': '雨刚停，接着又刮起了强风。',
  'n2-w2-review-11': '填写学历、工作经历、资格等内容，并提交给求职单位的文件。',
  'n2-w2-review-17': '田中面试合格，被那家公司录用了。',
  'n2-w2-review-21': '请选择“咨询、询问”最恰当的用法。正确句：我向公司咨询了应聘方法。',
  'n2-w2-review-22': '请选择“赚取”最恰当的用法。正确句：我通过打工赚取生活费。',
  'n2-w2-review-12': '在工作时间结束前离开公司或学校。',
  'n2-w2-review-23': '请选择“暂时离席”最恰当的用法。正确句：田中现在暂时离席。',
  'n2-w2-review-04': '需要讨论的内容很多，下午的会议比预定时间拖得更久。',
  'n2-w2-review-13': '充满干劲、精神饱满地投入工作等事情。',
  'n2-w2-review-06': '现在为您转接给负责人，请稍等。',
  'n2-w2-review-07': '从下个月起工作地点改变，决定调到大阪分店。',
  'n2-w2-review-14': '辞掉现在的公司或工作，转到其他公司或改换职业。',
  'n2-w2-review-09': '从公司官网下载申请表，并填写了必要事项。',
  'n2-w2-review-24': '请选择“导入”最恰当的用法。正确句：把照片导入电脑后放进了文档。',
  'n2-w2-review-08': '文档编辑完成后，为了防止内容丢失，请务必保存。',
  'n2-w2-review-25': '请选择“偏移”最恰当的用法。正确句：打印位置稍微偏了。',
  'n2-w2-review-15': '收件人不希望收到的广告邮件或内容可疑的邮件。',
};

function normalizedJapanese(value) {
  return String(value ?? '')
    .replace(/\s+/gu, '')
    .replace(/[，、]/gu, '、')
    .replace(/[。．]/gu, '。');
}

function completedPrompt(question) {
  const prompt = String(question.prompt ?? '');
  const blanks = prompt.match(/（[　\s]*）/gu) ?? [];
  if (blanks.length === 0) return prompt;
  if (blanks.length !== 1 || !question.answer || /^\d+$/u.test(String(question.answer))) {
    return null;
  }
  return prompt.replace(/（[　\s]*）/u, String(question.answer));
}

function translationFromExamples(item, question) {
  const completed = completedPrompt(question);
  if (!completed) return null;
  const normalizedCompleted = normalizedJapanese(completed);
  return item.examples?.find((example) => (
    example.zh && normalizedJapanese(example.ja) === normalizedCompleted
  ))?.zh ?? null;
}

const userId = Number(process.env.JLPT_USER_ID);
if (!Number.isSafeInteger(userId) || userId <= 0) throw new Error('Set JLPT_USER_ID to the account to repair');
const data = loadReviewData(userId);
const updateItem = getDb().prepare(`
  UPDATE owned_review_items
  SET item_json = ?, source = ?, updated_at = ?
  WHERE id = ? AND user_id = ?
`);
let questionCount = 0;
let updatedQuestionCount = 0;
const missing = [];

for (const item of data.items) {
  if (!Array.isArray(item.practice_questions) || item.practice_questions.length === 0) continue;
  let changed = false;
  const practiceQuestions = item.practice_questions.map((question) => {
    questionCount += 1;
    const translation = String(question.translation_zh ?? '').trim()
      || translationsByQuestionId[question.id]
      || translationFromExamples(item, question);
    if (!translation) {
      missing.push(`${item.id}:${question.id ?? questionCount}`);
      return question;
    }
    if (question.translation_zh === translation) return question;
    changed = true;
    updatedQuestionCount += 1;
    return { ...question, translation_zh: translation };
  });
  if (changed) {
    updateItem.run(
      JSON.stringify({ ...item, practice_questions: practiceQuestions }),
      'migration:practice-translation-zh',
      new Date().toISOString(),
      item.id,
      userId,
    );
  }
}

if (missing.length) {
  throw new Error(`Missing translation_zh for ${missing.length} practice questions:\n${missing.join('\n')}`);
}

const backup = exportReviewDataBackup(userId);
console.log(JSON.stringify({
  questionCount,
  updatedQuestionCount,
  missingCount: missing.length,
  backupFiles: backup.files,
}, null, 2));
