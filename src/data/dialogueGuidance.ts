export type DialogueRegister = 'plain' | 'polite' | 'mixed';
export type DialogueRole = { name: string; identity: string; register: DialogueRegister; reason: string };
export type DialogueGuidance = { roles: DialogueRole[]; keywords: [string, string][]; illustration: string };

export const dialogueGuidance: Record<string, DialogueGuidance> = {
  'ski-advice': {
    roles: [
      { name: '林', identity: '向熟悉的同学请教旅行安排', register: 'plain', reason: '双方是熟悉、地位平等的同学。用普通体自然亲近，例如「相談したいんだけど」「どうしたの？」；请求时仍要留有余地。' },
      { name: '美咲', identity: '有旅行经验，给同学建议', register: 'plain', reason: '经验丰富并不等于身份更高。对熟悉的同学用普通体，以「〜たら？」「〜と思うよ」提出建议。' },
    ],
    keywords: [['相談する', '商量、请教'], ['移動手段', '交通方式'], ['乗り換え', '换乘'], ['送迎付き', '含接送'], ['比べてみる', '试着比较']],
    illustration: '两位同学在桌边看滑雪旅行资料，商量出行安排。',
  },
  platform: {
    roles: [
      { name: '旅客', identity: '向初次见面的乘客询问车次', register: 'polite', reason: '与陌生人保持礼貌距离，以です・ます体为主。问路时可用谦让表达「伺う」，如「伺ってもいいですか」，不必每句话都堆叠敬语。' },
      { name: '乘客', identity: '回答陌生旅客的问题', register: 'polite', reason: '双方初次见面，回答也用です・ます体，如「二番線です」。普通的礼貌表达就足够。' },
    ],
    keywords: [['伺う', '询问（谦让表达）'], ['普通・快速', '普通列车、快速列车'], ['先に着く', '先到达'], ['二番線', '二号站台'], ['確認する', '确认']],
    illustration: '旅客在站台向另一位乘客问路，对方指向列车方向。',
  },
  furniture: {
    roles: [
      { name: '林', identity: '即将回国，想把家具送给朋友', register: 'plain', reason: '熟悉朋友之间用普通体。「よかったら」「遠慮なく言ってね」让对方可以拒绝，亲近不等于强迫。' },
      { name: '健', identity: '对朋友的书架有兴趣，需要先确认尺寸', register: 'plain', reason: '朋友之间用「〜てもいい？」「ありがとう」自然回应；要拒绝不需要突然切换成非常正式的敬语。' },
    ],
    keywords: [['帰国する', '回国'], ['譲る', '转让、赠送'], ['幅', '宽度'], ['測る', '测量'], ['取りに行く', '去取']],
    illustration: '两位朋友在搬家纸箱旁查看书架和书本。',
  },
  bicycle: {
    roles: [
      { name: '陳', identity: '向不太亲密的同事询问自行车转让', register: 'polite', reason: '职场中并不亲密的同事，以です・ます体为主。提出受益请求时用「譲っていただけませんか」，拜访时用谦让语「伺う」。' },
      { name: '佐藤', identity: '即将调职，准备转让自行车的同事', register: 'polite', reason: '同事之间维持礼貌体。「使いますか」「わかりました」即可，不必因赠送物品而摆出上级语气。' },
    ],
    keywords: [['転勤', '调职'], ['譲っていただく', '请对方转让给自己'], ['通勤用', '通勤用'], ['都合', '方便的时间'], ['駐輪場', '自行车停车处']],
    illustration: '两位穿工作服装的同事在办公楼外讨论自行车交接。',
  },
  neighbor: {
    roles: [
      { name: '林', identity: '刚搬来的住户，初次向邻居问规定', register: 'polite', reason: '刚认识的邻居用です・ます体。自我介绍可说「林と申します」，询问可说「伺ってもいいですか」，都是适度的谦让表达。' },
      { name: '田中', identity: '向新邻居说明公寓规定', register: 'polite', reason: '虽然住得久，也不等于对方的上级。礼貌、友善地说明「〜ことになっています」，不要用命令口气。' },
    ],
    keywords: [['引っ越してくる', '搬来'], ['段ボール', '纸箱'], ['資源ごみ', '可回收垃圾'], ['ひもでまとめる', '用绳捆好'], ['掲示板', '公告栏']],
    illustration: '两位新邻居在公寓门前互相问候。',
  },
  roommate: {
    roles: [
      { name: '美咲', identity: '与朋友合住，想讨论客厅杂物', register: 'plain', reason: '平等的朋友兼室友，用普通体。用「相談したいんだけど」「〜てもらえる？」表达影响和请求，不把提醒说成训斥。' },
      { name: '由衣', identity: '最近忙碌，把物品留在客厅的室友', register: 'plain', reason: '对熟悉的朋友用「ごめん」「〜するね」，并说出具体处理时间。重点是回应和履行约定。' },
    ],
    keywords: [['置きっぱなし', '一直放着不收'], ['共有', '共用'], ['片づける', '收拾'], ['今夜', '今晚'], ['午前中', '上午']],
    illustration: '两位室友在摆着书和包的客厅桌边平静交谈。',
  },
  'introduce-colleague': {
    roles: [
      { name: '林', identity: '把自己的朋友王介绍给店里前辈佐藤', register: 'mixed', reason: '对佐藤说「こちら、王さんです」用礼貌体；转向朋友王说「案内するね」可用普通体。语体跟随听话人变化，不是随意混用。谈到前辈的行为可用「担当してくださる」。' },
      { name: '王', identity: '新入职，与前辈佐藤初次见面', register: 'polite', reason: '王在示范中对佐藤发言，保持礼貌体。自我介绍用「王と申します」，回应安排用「伺います」；即使林对你说普通体，也不代表对前辈可以照用。' },
      { name: '佐藤', identity: '负责带新人的店内前辈', register: 'polite', reason: '前辈也可以用温和礼貌体带新人，如「聞いてくださいね」。这里选择礼貌体，不机械地把上下关系等同于上级一定用普通体。' },
    ],
    keywords: [['こちらは〜さんです', '介绍他人'], ['同じ学校', '同一所学校'], ['研修', '入职培训'], ['緊張する', '紧张'], ['遠慮なく', '不用客气、尽管']],
    illustration: '咖啡店中三个人互相介绍，新人与朋友面对穿围裙的前辈。',
  },
  club: {
    roles: [
      { name: '林', identity: '第一次参加社团的新成员', register: 'polite', reason: '初次面向全体成员、向高年级社长说话，以礼貌体为主。对方用普通体表示亲切，你不必立刻跟着切换。' },
      { name: '山本', identity: '欢迎新成员的高年级社长', register: 'mixed', reason: '先用「山本です」礼貌自我介绍，随后用温和普通体「使ってるの？」「行こう」拉近距离。这是本场景的示范选择，始终用礼貌体也可以自然成立。' },
    ],
    keywords: [['今日から参加する', '从今天起参加'], ['風景', '风景'], ['基礎から', '从基础开始'], ['構図', '构图'], ['中庭', '中庭']],
    illustration: '带相机的新成员与摄影社团负责人在校园中庭交流。',
  },
};

export const dialogueSummaries: Record<string, string> = {
  'ski-advice': '熟悉的同学之间，请教滑雪旅行的交通安排。',
  platform: '在站台向陌生乘客问路，确认哪班列车先到。',
  furniture: '回国前向朋友赠送家具，确认需要并约定交接。',
  bicycle: '向不太亲密的同事询问自行车转让，商定交接时间。',
  neighbor: '刚搬来，与邻居初次见面，请教公寓规定。',
  roommate: '平等的朋友兼室友，协商收拾客厅的时间和办法。',
  'introduce-colleague': '林把朋友王介绍给店里前辈佐藤，说话对象会改变。',
  club: '新成员第一次参加社团，向高年级社长和成员介绍自己。',
};
