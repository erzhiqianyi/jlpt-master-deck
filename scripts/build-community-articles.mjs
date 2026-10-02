import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Editorial source for the AI learning series. Examples are fictional and never read a user's study data.
const articles = [
  {
    slug: 'ai-vocabulary-notes', module: '词汇', title: '把遇到的生词整理成可复习的词条',
    description: '词汇模块实例：从一句包含「見落とす」的原句出发，让 AI 查重、补读音和用法，再保存到单词本并核对。',
    lead: '看到一个不懂的词时，先保留原句，再整理词条。本文只做这一件事：把「見落とす」从一条学习记录变成能复习的词汇条目。',
    focus: '保留语境、检查重复、保存到指定单词本。',
    sample: '例句：忙しくて、メールの重要な一文を見落としてしまった。这里的「見落とす」该怎么理解？',
    worked: '一条可复习的记录可以写成：見落とす（みおとす）／动词／看漏、忽略本应注意到的内容。例句里的对象是“邮件中的重要一文”，因此要保留“本来应该看到却没注意到”的语境。对比「見逃す」时，列出各自更自然的句子，而不是只写“意思相同”。',
    prompt: '请通过 JLPT Master 检查我的词汇里是否已有「見落とす」。如果没有，保留原句作为来源，整理读音、中文释义、词性和两个自然的例句，说明它与「見逃す」的区别，保存到我的 N1 单词本。请返回实际保存的词条名称和位置；如果已有记录，先告诉我现有内容，再补充同一条。',
    steps: [
      '先把原句和疑问保存在「输入记录」，或在请求里完整给出。只有一个孤立词时，AI 很难判断你遇到的是哪种用法。',
      '让 AI 先查已有词条和单词本。词条已存在就更新同一条，避免同一个词散落成多个版本。',
      '核对读音、释义和例句，再要求实际保存。聊天中写出一份漂亮解释，不代表单词本已经增加内容。',
    ],
    result: '打开「词汇」中的目标单词本，搜索「見落とす」。核对读音、来源句、释义和与「見逃す」的区别；再用它做一次复习。',
    caution: '「見落とす」与「見逃す」有重叠语境，示例区别只能作为待核对的学习说明。AI 应根据原句解释，不要把两者写成永远不能互换。',
    appHref: '/#/vocabulary/wordbooks',
  },
  {
    slug: 'ai-grammar-comparison', module: '语法', title: '用一个易混点建立语法记录',
    description: '语法模块实例：围绕「〜ならでは」建立记录，写清接续、语感和与相近表达的区别，再核对例句。',
    lead: '语法本不需要堆很多定义。一条有用的记录应回答：怎样接、在什么语境用、容易和什么混淆。本文用「〜ならでは」做完整示例。',
    focus: '围绕一个表达，保存接续、语感、例句和易混点。',
    sample: '例句：京都ならではの風景を楽しんだ。问题是「ならでは」在这里强调什么，和「だけ」有什么不同？',
    worked: '这条记录至少要有“名词＋ならではの＋名词”的接续、原句中“京都特有”的语感，以及一个能自然使用的例句。对比「京都だけの風景」时，解释两种说法的强调点；不要只把「ならでは」翻成“只有”就结束。',
    prompt: '请通过 JLPT Master 检查我的语法本里有没有「〜ならでは」。结合「京都ならではの風景を楽しんだ」，整理接续、中文意思、使用语境和两个自然例句。重点解释它与「〜だけ」在这个句子里的语感差异，不要说成绝对规则。保存到语法本，并告诉我保存位置与需要我核对的地方。',
    steps: [
      '把要比较的两个表达和原句一起给出。只说“讲一下这个语法”，通常会得到过宽的解释。',
      '要求 AI 分开写接续、核心语感和对比例句。例句要真的体现差异，不能只是把同一句机械替换。',
      '查重后保存同一条语法记录；再打开网页核对读音、接续和例句是否自然。',
    ],
    result: '在「语法」的本子里搜索「ならでは」，检查接续与对比例句。若解释过于绝对，指出具体句子，请 AI 修正这一条记录。',
    caution: '语法差异常受上下文和语体影响。把 AI 的概括当成学习假设，用可靠例句和实际语境核对。',
    appHref: '/#/grammar/wordbooks',
  },
  {
    slug: 'ai-reading-unknown-word', module: '阅读', title: '读文章时，把不认识的词带着上下文留下来',
    description: '阅读模块实例：在文章中遇到「見込む」时，把句子与文章来源放进输入记录，再整理词义而不猜整篇文章。',
    lead: '阅读中遇到的生词，离开上下文就容易记错。本文聚焦一个动作：把文章里的未知词连同原句保存，再决定是否整理成词条。',
    focus: '保留原句和阅读来源，再整理词义。',
    sample: '示例句：来年度は利用者の増加を見込んでいる。只从这里判断，「見込む」表达的是怎样的预期？',
    worked: '在这句里，「見込む」可以先理解为“预计、预期”，对象是来年使用者人数增加。词条中应保留这个原句和文章标题，再补一个不同搭配的例句。若文章标题、出处或上下文缺失，先保持输入记录待整理。',
    prompt: '请通过 JLPT Master 读取我刚标记的阅读输入记录，先引用其中的原句和文章标题。解释这句里的「見込む」，补充读音和两个不同语境的例句；检查词汇本是否已有记录。确认来源后再保存为词条，并返回目标本子和词条名称。没有文章上下文时不要推断全文观点。',
    steps: [
      '在阅读页面选中不懂的词；必要时调整分词范围，再加入输入记录。队列会保留阅读来源和附近语境。',
      '让 AI 读取待整理记录，引用原句并查已有词条。若分词错误或原句不全，先修正输入，不要直接保存。',
      '整理后检查目标词条，再把输入记录标为已处理。保存队列并不会自动启动 AI。',
    ],
    result: '在「输入记录」确认这条记录的状态，再到词汇本搜索「見込む」。核对释义是否对应原句，而不是另一个常见义项。',
    caution: '示例句只支持局部词义。文章的事实、主张和出处应从全文核对；AI 不应凭一行摘录补出整篇内容。',
    appHref: '/#/captures',
  },
  {
    slug: 'ai-listening-shadowing', module: '听力', title: '用跟读录音找出没有听清的地方',
    description: '听力模块实例：对照标准音频、完整听力原文和自己的跟读录音，定位差异并保存分析建议。',
    lead: '“我没听懂”太笼统。把标准音频、完整原文与自己的跟读录音放在同一个问题下，才能追问到底漏听了什么。本文只讨论这一次录音分析。',
    focus: '分开标准音频、原文和自己的录音，找到可复听的差异。',
    sample: '示例：标准音频里说「そういうわけではないんですが」，自己回听时把「わけでは」漏成了「わけは」。这是示意句，并非真实录音的转写。',
    worked: '分析记录应分为三栏：标准原文「そういうわけではないんですが」；从自己的录音实际听到的形式；可能漏听的「では」。下一步可以先不看文字听两遍，再对照文字跟读两遍。若录音听不清，第二栏应写“无法确认”，而不是补成完整句子。',
    prompt: '请通过 JLPT Master 找到我指定的听力题和最新跟读录音。若客户端获得了 audio:read 授权且能处理音频，请分别听标准音频与我的录音，对照该音频的完整原文，标出我漏听或读错的具体片段、可能的音变，并给出两轮复听练习。把实际听到的内容和推测分开；无法读取或辨认的部分请明确说明，不要编造转写。',
    steps: [
      '在听力题中先确认标准音频和完整原文，再录一遍自己的跟读。选择具体题目与录音，避免 AI 分析错对象。',
      '音频读取需要单独的 audio:read 授权，客户端还必须能处理返回的音频。请求 AI 先确认它实际读取了哪些素材。',
      '把“听到的形式”“原文形式”和练习建议分开记录；回到题目中复听，核对 AI 的分析。',
    ],
    result: '在对应听力题的录音历史里查看分析。完整听力原文属于整段音频，单题解析只说明本题的依据和选项，别把原文重复塞进每道题。',
    caution: '音频工具返回的是音频，不会自动转写。听不清时应标为待核对；没有实际读取录音的 AI 不能声称已分析你的发音。',
    appHref: '/#/listening/words',
  },
  {
    slug: 'ai-daily-practice', module: '今日练习', title: '根据昨天的错题准备今天的一组练习',
    description: '今日练习模块实例：先读取昨天的答题记录，再针对薄弱题型生成新的同类题，并核对正式练习是否保存。',
    lead: '今天该练什么，最好从昨天实际做过的题开始。本文聚焦一个可检验的任务：用昨天的错题证据准备今天的一组针对练习。',
    focus: '先读答题记录，再生成同考查形式的新题。',
    sample: '示例：昨天做了 12 题，其中 4 题错在汉字读音，2 题错在语法接续。数字只是说明输出格式，不代表你的真实记录。',
    worked: '一份合格的准备结果会先写“2026 年某日，12 题，错 6 题；汉字读音错 4 题”，再说明为什么优先练读音。随后给出 8 道新的汉字读音题、正确答案和逐项解析。发布后要能在今日练习页找到标题与题数。',
    prompt: '请通过 JLPT Master 先读取东京时间昨天的答题记录，报告总题数、各题型错题数和最值得补的一类。针对这一类生成 8 道相同考查形式、不同语境的新题，每题给出答案和逐项解析，并保存为今天的正式练习。如果昨天没有作答，先说明情况，再查看更早的记录；不要虚构正确率或来源。最后返回练习标题和保存结果。',
    steps: [
      '先让 AI 展示它读取到的日期、题数和错题分布。没有真实答题记录时，不能凭印象说你“最弱”的题型。',
      '明确数量、题型与“相同考查形式、不同语境”。抽查新题是否只是原题换了几个字。',
      '要求保存后，打开今天的练习卡片确认题目和解析实际出现，再开始答题。',
    ],
    result: '在首页「今日练习」查看新的一组题。聊天里的题目、草稿和正式练习是不同状态；以网页里的保存结果为准。',
    caution: '小样本只能提示方向。若昨天只做了少量题，要把样本不足写出来，不要把暂时的错题比例当成稳定弱点。',
    appHref: '/#/home/questions',
  },
  {
    slug: 'ai-study-plan', module: '备考计划', title: '把考试目标拆成做得完的每日任务',
    description: '备考计划模块实例：输入考试日期、可用时间和教材进度，让 AI 生成具体日历任务，并保留已经完成的记录。',
    lead: '一份计划是否有用，关键是今天能否照着做。本文只解决计划的第一版：把考试目标、时间和教材位置变成可执行的每日任务。',
    focus: '按可用时间排任务，并写清教材范围和当天产出。',
    sample: '示例条件：准备 N1；每周可学 5 天，每天 45 分钟；语法书已经学到第 8 课。考试日期和教材页码应换成你自己的真实信息。',
    worked: '一天的任务可以写成“第 9 课的接续整理 15 分钟＋本课习题 20 分钟＋错题回看 10 分钟；产出：记录 2 个易混接续并完成习题”。三项相加恰好 45 分钟。下一天应引用真实的教材课次，不能凭空写第 10 课的页码。',
    prompt: '请通过 JLPT Master 读取我的计划设置、现有任务和最近练习。以我实际保存的考试日期、每周可学天数、每天时长及教材进度为准，安排接下来两周的每日任务。每项任务写出具体教材课次或题型、预计分钟数和完成后的产出；每天总时长不能超过设定。先让我核对缺失的信息，再保存计划。已经完成的任务不要重排。',
    steps: [
      '先在计划页保存考试日期、固定不能学习的时间、每天可用时长和教材起点。条件不完整时，请 AI 指出缺口。',
      '让 AI 读取既有任务与最近练习，按天列出任务。检查每一天的分钟数是否加起来仍在可用时间内。',
      '保存后打开日历，抽查第一周的教材范围、产出和休息安排。之后进度变化时只调整未来未完成任务。',
    ],
    result: '在「计划」的日历里查看逐日任务。任务应具体到课次、题型或页码，以及“完成问题、标出依据、回听错段”等可以确认的结果。',
    caution: '“每天学语法”不是可执行任务。若教材目录、日期或固定时间缺失，应先补资料，不要让 AI 自行编造课次和页码。',
    appHref: '/#/plan',
  },
  {
    slug: 'dots-jlpt-connection', module: 'Dots 持续跟进', title: '接入 Dots，让它持续跟进你的 JLPT 弱点',
    description: 'Dots 与 JLPT Master 的持续协作实例：从真实答题记录建立一个学习目标，跨次跟进变化，并在需要决定时提出下一步。',
    lead: 'Dots 的价值不止于按点执行一次任务。把“改善 N1 听力跟读”交给它持续跟进，它可以结合后续记录与反馈调整下一步，并在需要你判断时回来询问。',
    focus: '把一个可检验的学习目标交给 Dots 持续跟进，而不是只运行一次查询。',
    comparison: { title: 'Dots 和定时任务怎样分工？', scheduled: '定时任务：每到设定时间运行指定流程，例如每天 7 点生成一份练习草稿。', dot: 'Dots：持续记住目标与前面的决定，结合新进展判断接下来该查什么、做什么，以及何时需要你参与。', boundary: '如果必须每天固定检查，请另存定时日程；如果要在答题后立即触发，还取决于数据源是否支持事件。' },
    sample: '示例目标：你连续几次把听力跟读里的「ではない」听漏。第一天，Dots 读取相关练习与录音记录，指出它实际能确认的困难；你随后说“这周每天只有 20 分钟”。下一次有新练习记录或你反馈进展时，它据此调整复听建议。',
    worked: '一次持续跟进会留下“目标：分辨「ではない」；依据：实际练习与录音；已尝试：两轮复听；待验证：下一次录音是否仍漏听”的简短状态。后来若错误减少，Dots 应说明证据与样本量，再提议换一个重点；若录音不可读，就请求授权或让你提供材料，而不是宣称已经听过。',
    prompt: '请把“改善我的 N1 听力跟读漏听”作为一项持续跟进的学习责任。先通过已授权的 JLPT Master 插件读取最近相关练习、完整原文和可访问的录音信息，明确哪些内容你实际取得了；总结一个可检验的弱点与下一次练习。以后在你获得新的学习记录或我补充反馈、且你获准继续工作时，对照上次目标和结果，判断是继续同一难点、调整练习，还是请我决定。只在进度出现有证据的变化、遇到阻碍或需要我决定时联系我；保留简短的目标与决策记录。先不要自动发布练习或设置每天固定时间；需要保证每天运行时，再请我确认日程。',
    requestIntro: '先连接并授权 JLPT Master 插件，手动验证一次真实读取。随后把具体学习目标交给 Dots；它可以保留前次上下文并继续推进，但下一次何时拿到新数据取决于已授权来源和工作条件。',
    steps: [
      '确认 Dots 所用账号已安装并授权 JLPT Master 插件。先做一次只读查询，核对实际取得的练习、原文或录音信息。录音本身还需要相应权限和能处理音频的客户端。',
      '给 Dots 一个持续目标和判断标准，例如“下一次跟读还会不会漏听「ではない」”，并说清什么时候需要它向你报告或征求决定。',
      '回到 Activity 查看它后续做了什么，再到 JLPT Master 核对新练习与录音。你可以继续补充时间限制或更改目标，Dots 应沿用这些决定调整下一步。',
    ],
    result: '在 JLPT Master 的听力题与录音历史中核对它引用的材料；在 Dots 的 Activity 看目标、已做工作和待你决定的问题。下次继续对话时，可以直接修改目标，无须从头解释。',
    caution: '持续跟进不等于实时监听或自动改写学习记录。Dots 的主动研究只会读取获准信息；要固定时刻运行需保存日程，要响应事件需来源支持。个人数据仍需登录和授权。',
    appHref: '/#/listening/words',
    sources: [
      ['OpenAI：认识 Dots', 'https://learn.chatgpt.com/docs/dots'],
      ['Dots：持续任务、记忆与日程', 'https://learn.chatgpt.com/docs/dots/tasks-and-memory'],
      ['Dots：连接电脑和应用', 'https://learn.chatgpt.com/docs/dots/computers-and-apps'],
      ['OpenAI：连接并测试个人 MCP 插件', 'https://developers.openai.com/plugins/quickstart'],
    ],
  },
  {
    slug: 'dots-scheduled-practice', module: '定时任务', title: '定时任务：每天 7 点准备练习草稿',
    description: '固定时间的任务实例：每天按东京时间读取 JLPT Master 的答题记录，生成可核对的 N1 练习草稿，并检查保存结果。',
    lead: '当你确实需要每天同一时间得到一份草稿，就保存一条日程。本文聚焦固定流程：读取前一天的答题记录、生成草稿、核对保存结果。',
    focus: '把“每天帮我练习”写成有时间、输入、产出和通知条件的定时任务。',
    sample: '示例目标：每天早上 7 点（Asia/Tokyo）根据前一天的 N1 错题，准备 8 道同题型的新题。若昨天没有作答，就报告缺口并查看更早的记录。',
    worked: '一次可检查的运行应报告读取的日期、答题总数与错题分布，说明选题依据，给出练习草稿的实际保存位置。若历史记录不足或写入失败，应说明失败步骤，不能把聊天中的 8 道题当作“已保存”。',
    prompt: '请为我保存一条每日定时任务：每天早上 7:00（Asia/Tokyo），通过已授权的 JLPT Master 插件读取前一天的 N1 答题记录；如昨天没有作答，检查更早记录并说明依据。针对最有证据的薄弱题型，生成最多 8 道相同考查形式、不同语境的新题，含答案和逐项解析，保存到练习草稿，暂不发布为正式练习。来源不足时减少题量，不编造答题统计或教材出处。每次检查是否真的保存，把草稿标题和检查位置留在任务结果中；仅在授权失效、保存失败、题目需要我判断时通过 ChatGPT 提醒我。请确认已保存的日程、时区和下次运行时间。',
    requestIntro: '先手动跑通一次连接与草稿写入，再向 Dots 明确提出“保存定时任务”。下面的时间、题量与通知方式是示例，可按自己的学习节奏修改。',
    steps: [
      '先完成一次只读连接验证，再手动试做一份练习草稿，确认 Dots 可使用所需的读写权限，并在网页里找到草稿。',
      '把上面的请求交给 Dots，请它确认已保存的日程、Asia/Tokyo 时区与下次运行时间；到 Dots 的 Scheduled 页面复核，不要只凭聊天回复判断定时已生效。',
      '第一次运行后在 Activity 查看执行结果，并到 JLPT Master 的草稿页核对题目、答案、逐项解析和来源。若修改频率或暂停任务，到 Scheduled 中变更或停用。',
    ],
    result: '在「练习草稿」确认新草稿确实存在，再审题。草稿和今日正式练习是不同的状态；示例任务不会自动发布或替你作答。',
    caution: '这类任务按保存的日程尝试执行，但不会自动形成跨次的学习目标判断。若 Dots 将工作交给本机 Codex，电脑必须在线且 ChatGPT 桌面应用保持打开；一次运行完成也不等于写入成功，应核对实际草稿。',
    appHref: '/#/drafts',
    sources: [
      ['Dots：任务、记忆与定时日程', 'https://learn.chatgpt.com/docs/dots/tasks-and-memory'],
      ['Dots：检查与管理任务', 'https://learn.chatgpt.com/docs/dots/controls'],
      ['Dots：电脑与插件连接条件', 'https://learn.chatgpt.com/docs/dots/computers-and-apps'],
    ],
  },
];
export { articles };

const base = 'https://jlpt.erzhiqian.cc';
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const json = (value) => JSON.stringify(value).replace(/</g, '\\u003c');
const articleLink = (article) => `/articles/${article.slug}/`;

for (const [index, article] of articles.entries()) {
  const next = articles[index + 1] ?? null;
  const canonical = `${base}${articleLink(article)}`;
  const structured = { '@context': 'https://schema.org', '@type': 'Article', headline: article.title, description: article.description, inLanguage: 'zh-CN', mainEntityOfPage: canonical, publisher: { '@type': 'Organization', name: 'JLPT Master', url: `${base}/` }, isPartOf: { '@type': 'CollectionPage', name: 'AI 协作学习', url: `${base}/community/topics/ai-learning/` } };
  const crumbs = { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [['首页', `${base}/`], ['社区', `${base}/community/`], ['AI 协作', `${base}/community/topics/ai-learning/`], [article.title, canonical]].map(([name, item], position) => ({ '@type': 'ListItem', position: position + 1, name, item })) };
  const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(article.title)}｜AI 协作专题｜JLPT Master</title><meta name="description" content="${escapeHtml(article.description)}"><meta name="robots" content="index,follow,max-image-preview:large"><link rel="canonical" href="${canonical}">
<meta property="og:type" content="article"><meta property="og:site_name" content="JLPT Master"><meta property="og:title" content="${escapeHtml(article.title)}"><meta property="og:description" content="${escapeHtml(article.description)}"><meta property="og:url" content="${canonical}"><link rel="icon" href="/jlpt-brand.png" type="image/png"><link rel="stylesheet" href="/articles/articles.css">
<script type="application/ld+json">${json(structured)}</script><script type="application/ld+json">${json(crumbs)}</script></head><body>
<header class="site-header"><div class="site-header-inner"><a class="brand" href="/"><img src="/jlpt-brand.png" alt="">JLPT Master</a><nav class="header-links" aria-label="主导航"><a href="/community/">社区</a><a href="/articles/">全部文章</a><a class="header-cta" href="/#/home/questions">开始学习</a></nav></div></header>
<main><section class="hero"><div class="hero-inner"><span class="eyebrow">AI 协作 · ${escapeHtml(article.module)}模块</span><h1>${escapeHtml(article.title)}</h1><p>${escapeHtml(article.lead)}</p><div class="hero-actions"><a class="button" href="#example">看具体例子 ↓</a><a class="button secondary" href="/community/topics/ai-learning/">返回专题</a></div></div></section>
<nav class="breadcrumb" aria-label="面包屑"><a href="/">首页</a><span>›</span><a href="/community/">社区</a><span>›</span><a href="/community/topics/ai-learning/">AI 协作</a><span>›</span>${escapeHtml(article.module)}</nav>
<div class="article-layout"><article class="article"><div class="callout"><strong>这一篇只做一件事</strong><p>${escapeHtml(article.focus)}</p></div>
${article.comparison ? `<section class="article-comparison" id="difference"><h2>${escapeHtml(article.comparison.title)}</h2><div class="comparison-grid"><div><strong>固定时间</strong><p>${escapeHtml(article.comparison.scheduled)}</p></div><div><strong>持续跟进</strong><p>${escapeHtml(article.comparison.dot)}</p></div></div><p class="comparison-boundary">${escapeHtml(article.comparison.boundary)}</p></section>` : ''}
<h2 id="example">从一个具体例子开始</h2><div class="example"><span>示例素材 · 不是你的真实学习记录</span><p>${escapeHtml(article.sample)}</p></div>
<h2 id="worked">好的结果是什么样</h2><div class="example"><span>示意产出 · 请以实际素材核对</span><p>${escapeHtml(article.worked)}</p></div>
<h2 id="request">可以怎样请求 AI</h2><p>${escapeHtml(article.requestIntro ?? '先在 AI 客户端连接 JLPT Master，并完成相应授权。把下面的示例中本子、题目或时间换成自己的信息。')}</p><blockquote class="article-prompt">${escapeHtml(article.prompt)}</blockquote>
<h2 id="process">实际操作分三步</h2><ol class="steps">${article.steps.map((step) => `<li><p>${escapeHtml(step)}</p></li>`).join('')}</ol>
<h2 id="check">在哪里检查结果</h2><p>${escapeHtml(article.result)}</p><a class="button" href="${article.appHref}">打开对应模块 →</a>
<h2 id="notice">最容易忽略的地方</h2><p>${escapeHtml(article.caution)}</p>
${article.sources ? `<h2 id="sources">参考资料</h2><ul>${article.sources.map(([label, href]) => `<li><a href="${escapeHtml(href)}" rel="noopener noreferrer">${escapeHtml(label)}</a></li>`).join('')}</ul>` : ''}
<div class="article-footer"><a href="/articles/ai-integration/">先看 AI 接入指南</a>${next ? `<a href="${articleLink(next)}">下一篇：${escapeHtml(next.module)} →</a>` : `<a href="/community/topics/ai-learning/">返回 AI 协作专题 →</a>`}</div></article>
<aside class="toc" aria-label="本文目录"><strong>${escapeHtml(article.module)}模块</strong>${article.comparison ? '<a href="#difference">Dots 的优势</a>' : ''}<a href="#example">具体例子</a><a href="#worked">示意产出</a><a href="#request">示例请求</a><a href="#process">操作步骤</a><a href="#check">核对结果</a><a href="#notice">注意事项</a>${article.sources ? '<a href="#sources">参考资料</a>' : ''}<a href="/community/topics/ai-learning/">← AI 协作专题</a></aside></div></main>
<footer class="site-footer"><div class="site-footer-inner"><span>© JLPT Master · <a href="/community/">学习社区</a></span><span><a href="/articles/">全部文章</a> · <a href="/privacy/">隐私政策</a></span></div></footer></body></html>\n`;
  const directory = resolve('public/articles', article.slug);
  mkdirSync(directory, { recursive: true });
  writeFileSync(resolve(directory, 'index.html'), html);
}

console.log(`Generated ${articles.length} AI module articles.`);
