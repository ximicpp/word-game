// 单词小侦探 案件数据
// 文本标记：[显示词|词条] 是本案生词（要认出意思）；{显示词|词条} 是以前案件学过的“老朋友”。
// 词条一样时可以只写 [词]。
// steps.type: 'pick' 在材料里点句子（ans 是句子里的一段原文，可以给数组）；'choice' 选择题（a 是正确选项下标）。
const CASES = [
// ───────────── KET ─────────────
{
  id: 'cake', lv: 'KET', emoji: '🎂', title: '生日蛋糕去哪儿了？', client: '🐰 兔奶奶',
  brief: '兔奶奶做好的巧克力蛋糕，转眼就从桌上消失了。派对下午就开始，快帮她找找！',
  docs: [
    { kind: 'letter', from: '🐰 兔奶奶的求助信', text: 'Dear Detective, please help me! This morning I made a big chocolate cake for my birthday party. At ten o\'clock I put it on the kitchen table, next to the window. It was a very hot day. At twelve o\'clock the plate was [empty]! But the plate was very clean, and there was no cake on the floor. I didn\'t look in the fridge, because I never put cakes there.' },
    { kind: 'chat', from: '🐻 熊大叔', text: 'I am Grandma Rabbit\'s [neighbour]. I live in the green house next to hers. At eleven I came to give her some flowers. I saw her grandson Leo in the kitchen. He touched the cake and said, "Oh no, the chocolate is too [soft]!"' },
    { kind: 'note', from: '📝 在花园里捡到的纸条', text: 'Grandma, don\'t worry! I [carried|carry] your cake to the coldest place in the kitchen. And there is a [surprise] on it now: strawberries! Love, Leo' },
  ],
  words: [
    { k: 'empty', m: '空的', e: '🫙' },
    { k: 'neighbour', m: '邻居', e: '🏡' },
    { k: 'soft', m: '软的', e: '🧸' },
    { k: 'carry', m: '拿着走，搬运', e: '📦' },
    { k: 'surprise', m: '惊喜', e: '🎁' },
  ],
  extra: [{ m: '甜的', e: '🍬' }, { m: '安静的', e: '🤫' }],
  steps: [
    { type: 'pick', q: '哪句话说明蛋糕不是被吃掉的？', ans: 'the plate was very clean', hint: '吃蛋糕会留下什么？找找说盘子和地板的那句。', why: '盘子很干净，地上也没有蛋糕渣。蛋糕是被整个拿走的，不是被吃掉的。' },
    { type: 'choice', q: 'Leo 说 the chocolate is too soft，他在担心什么？', opts: ['天太热，巧克力快化了', '巧克力太硬，切不动', '巧克力不够甜'], a: 0, hint: 'soft 是什么意思？那天天气怎么样？', why: 'soft 是“软的”。那天很热，巧克力变软，快要化了。' },
    { type: 'choice', q: '蛋糕现在在哪里？', opts: ['🧊 冰箱里', '🌷 花园里', '🏡 熊大叔家'], a: 0, hint: '再读 Leo 的纸条：the coldest place in the kitchen 是哪里？', why: 'Leo 把蛋糕搬到了厨房里最冷的地方，就是冰箱。兔奶奶从来不把蛋糕放冰箱，所以没去看。' },
  ],
  ending: '兔奶奶打开冰箱，蛋糕好好地待在里面，上面还多了一圈草莓🍓。原来 Leo 怕巧克力化掉，把蛋糕搬进了冰箱，可他的纸条被风吹进了花园。生日派对准时开始啦！',
},
{
  id: 'puppy', lv: 'KET', emoji: '🐶', title: '小狗饼干去哪儿了？', client: '🐐 山羊爷爷',
  brief: '一早起来，山羊爷爷的小狗“饼干”不见了，草地上只剩下它的红项圈。',
  docs: [
    { kind: 'letter', from: '🐐 山羊爷爷的求助信', text: 'My puppy Biscuit is [lost]! Last night he slept in his basket by the door. This morning the garden [gate] was open, and Biscuit wasn\'t there. I found his red collar on the grass near the gate. The collar was very [loose]. It was too big for his little neck. I hope he is OK.' },
    { kind: 'chat', from: '🦆 鸭太太（住在马路对面）', text: 'At seven o\'clock I heard a dog [bark] three times. Then the bread van went down our road. The baker drives it to his shop every morning. A small brown dog was [following|follow] the van!' },
    { kind: 'chat', from: '🐷 面包店猪师傅', text: 'Every morning my van is full of warm bread. Dogs love the [smell]! Today a little puppy ran into my shop after me. He is sleeping under the table now. He has no collar, so I don\'t know his name.' },
  ],
  words: [
    { k: 'lost', m: '走丢了', e: '❓' },
    { k: 'gate', m: '（院子的）大门', e: '🚪' },
    { k: 'loose', m: '松的', e: '〰️' },
    { k: 'bark', m: '（狗）叫', e: '🐕' },
    { k: 'follow', m: '跟着', e: '👣' },
    { k: 'smell', m: '气味；闻', e: '👃' },
  ],
  extra: [{ m: '睡觉', e: '😴' }, { m: '很紧的', e: '🔒' }],
  steps: [
    { type: 'choice', q: '项圈为什么掉在草地上？', opts: ['项圈太松，自己滑掉了', '有人把项圈摘走了', '饼干不喜欢红色'], a: 0, hint: '山羊爷爷说项圈 very loose，还说 too big。', why: 'loose 是“松的”。项圈又大又松，饼干一跑就滑掉了。' },
    { type: 'pick', q: '哪句话告诉你饼干往哪儿跑了？', ans: 'A small brown dog was following the van', hint: '鸭太太看到了什么？', why: 'follow 是“跟着”。饼干跟着面包车跑了。' },
    { type: 'choice', q: '饼干现在在哪儿？', opts: ['🥖 面包店里', '🦆 鸭太太家', '🌳 公园里'], a: 0, hint: '面包车开去了哪里？谁说店里来了一只小狗？', why: '饼干闻到面包的香味（smell），一路跟着面包车跑进了面包店，现在正在桌子下面睡觉。' },
  ],
  ending: '山羊爷爷赶到面包店，饼干一下子醒了，摇着尾巴扑过来。猪师傅送了它一个小面包，山羊爷爷给它换了一个大小正好的新项圈。',
},
{
  id: 'book', lv: 'KET', emoji: '📕', title: '恐龙书是谁的？', client: '🦜 鹦鹉波莉',
  brief: '波莉和小猫汤姆都说恐龙书是自己的，两个好朋友吵起来了。到底谁说得对？',
  docs: [
    { kind: 'chat', from: '🦜 波莉', text: 'Tom has my dinosaur book! Last week I [lent|lend] it to him for two days. Now he says it\'s his book. I want it back!' },
    { kind: 'chat', from: '🐱 汤姆', text: 'That\'s not true! Polly didn\'t give me the book. I [borrowed|borrow] it from her, so now it\'s mine. I\'m [sure] about that.' },
    { kind: 'radio', from: '📞 电话留言', text: 'Hello, this is Miss Owl from the town [library]. This is a message for Polly Parrot. A book about dinosaurs is on your library card. Please [return] it to us before five o\'clock today. Thank you!' },
  ],
  words: [
    { k: 'lend', m: '借出（给别人）', e: '📤' },
    { k: 'borrow', m: '借入（从别人那里）', e: '📥' },
    { k: 'sure', m: '确定的', e: '👍' },
    { k: 'library', m: '图书馆', e: '🏛️' },
    { k: 'return', m: '归还', e: '↩️' },
  ],
  extra: [{ m: '送给', e: '🎀' }, { m: '买', e: '🛒' }],
  steps: [
    { type: 'choice', q: '汤姆说 I borrowed it from her。这说明书是谁的？', opts: ['不是汤姆的，他只是借来看', '是汤姆的，波莉送给他了', '是汤姆自己买的'], a: 0, hint: 'borrow 是“借”还是“送”？借来的东西要怎样？', why: 'borrow 是“借入”。借来的东西要还，不会变成自己的。汤姆把“借”和“送”弄混了。' },
    { type: 'pick', q: '可这本书真的是波莉的吗？找到说出真正主人的那句话。', ans: ['A book about dinosaurs is on your library card', 'Please return it to us'], hint: '电话留言是谁打来的？', why: '书是用波莉的借书卡从图书馆借的，真正的主人是图书馆。' },
    { type: 'choice', q: '现在应该怎么做？', opts: ['汤姆还给波莉，波莉五点前还给图书馆', '汤姆把书留下', '波莉再买一本'], a: 0, hint: 'return 是什么意思？什么时候之前？', why: 'return 是“归还”。书要先回到波莉手里，再在五点前还给图书馆。' },
  ],
  ending: '汤姆不好意思地挠挠头：“原来 borrow 是借来，要还的！” 两个好朋友一起把书送回图书馆。猫头鹰馆长又给他们推荐了一本新的恐龙书，这次他们决定一起看。',
},
{
  id: 'egg', lv: 'KET', emoji: '🥚', title: '鸡窝里的蓝色蛋', client: '🐔 母鸡太太',
  brief: '母鸡太太的窝里突然多了一个又大又蓝的蛋。这是谁放进来的？',
  docs: [
    { kind: 'letter', from: '🐔 母鸡太太的求助信', text: 'Every morning I [lay] one white egg in my [nest]. But today there were two eggs! One was mine. The other egg was bigger, and it was light blue. It is very [different] from my eggs. Who put it there?' },
    { kind: 'chat', from: '🐄 奶牛', text: 'I was [lying|lie] in the grass all morning, so I didn\'t see much. But I can tell you one thing. There are small [wet] footprints from the pond to the hen house.' },
    { kind: 'chat', from: '🦆 鸭子黛西', text: 'Hello... I\'m a bit [shy], sorry. The pond is very noisy these days, because the frogs sing all day and all night. I wanted a warm, quiet place for something very important.' },
  ],
  words: [
    { k: 'lay', m: '下（蛋）', e: '🥚' },
    { k: 'nest', m: '窝，巢', e: '🪺' },
    { k: 'different', m: '不一样的', e: '🔀' },
    { k: 'lie', m: '躺', e: '🛌' },
    { k: 'wet', m: '湿的', e: '💧' },
    { k: 'shy', m: '害羞的', e: '😳' },
  ],
  extra: [{ m: '说谎', e: '🤥' }, { m: '一样的', e: '🟰' }],
  steps: [
    { type: 'choice', q: '奶牛说 I was lying in the grass。她在做什么？', opts: ['躺在草地上', '在草地上说谎', '在草地上下蛋'], a: 0, hint: 'lie 有好几个意思，在草地上的话是哪一个？', why: '这里的 lie 是“躺”，lying 是正在躺着。“下蛋”是 lay，别和 lie 弄混了。' },
    { type: 'pick', q: '哪句话告诉你蛋的主人是从哪儿来的？', ans: 'small wet footprints from the pond', hint: '找找和脚印有关的那句。', why: '脚印是湿的（wet），从池塘一路走到鸡窝。' },
    { type: 'choice', q: '蓝色的蛋是谁的？', opts: ['🦆 鸭子黛西', '🐄 奶牛', '🐔 母鸡太太自己'], a: 0, hint: '谁住在池塘边？谁说想找个安静地方？', why: '黛西住在池塘，池塘太吵了，她悄悄把蛋下在了安静暖和的鸡窝里。' },
  ],
  ending: '黛西红着脸说出了原因。母鸡太太笑了：“没关系，我帮你一起孵！” 几个星期后，一只小鸭子破壳啦，它有两个妈妈一起照顾。',
},
// ───────────── PET ─────────────
{
  id: 'garden', lv: 'PET', emoji: '🌻', title: '花园怎么乱成这样？', client: '🐑 羊太太',
  brief: '明天就是小镇花展，羊太太的花园却一夜之间乱成一团。熊先生说的话好像有点不对劲……',
  docs: [
    { kind: 'letter', from: '🐑 羊太太的求助信', text: 'The town flower show is tomorrow, but my garden is a [mess]! My tall sunflowers are {lying|lie} on the ground, and two flower pots are broken. There is [damage] everywhere. Did somebody walk through my garden last night?' },
    { kind: 'chat', from: '🐻 熊先生（第一次）', text: 'It wasn\'t me! Last night I was [exhausted] after work, so I went jogging for two hours. Then I slept very well. My windows were shut, so I didn\'t hear anything.' },
    { kind: 'radio', from: '📻 小镇电台', text: 'Good morning! Last night a [storm] came over the hills. The wind was very strong and [blew|blow] down some small trees in the park. It stopped at about three o\'clock. Today will be sunny and warm.' },
    { kind: 'chat', from: '🐻 熊先生（第二次）', text: 'Oh dear, I\'m so [confused]. The jogging was on Monday! Last night I just went to bed early, because I was so tired.' },
  ],
  words: [
    { k: 'mess', m: '乱七八糟', e: '🌀' },
    { k: 'damage', m: '损坏', e: '💔' },
    { k: 'exhausted', m: '累极了', e: '😩' },
    { k: 'storm', m: '暴风雨', e: '⛈️' },
    { k: 'blow', m: '（风）吹', e: '🌬️' },
    { k: 'confused', m: '糊涂的，弄混了', e: '😵‍💫' },
  ],
  extra: [{ m: '精神十足的', e: '💪' }, { m: '整齐的', e: '🧺' }],
  steps: [
    { type: 'pick', q: '熊先生第一次说的话里，哪句说不通？', ans: 'so I went jogging for two hours', hint: 'exhausted 是什么意思？累的时候会做什么？', why: 'exhausted 是“累极了”。累坏了还去跑步两个小时？说不通！' },
    { type: 'choice', q: '熊先生为什么前后说的不一样？', opts: ['他把周一和昨晚记混了', '他是故意编故事', '他在开玩笑'], a: 0, hint: '看看熊先生第二次说的话。', why: 'confused 是“弄混了”。他不是故意的，只是记错了日子。' },
    { type: 'choice', q: '花园到底是怎么乱的？', opts: ['🌬️ 夜里的暴风雨', '🐻 熊先生踩坏的', '🐑 羊太太自己弄的'], a: 0, hint: '听听小镇电台说了什么。', why: '夜里有暴风雨（storm），大风把小树都吹倒了（blew down），向日葵当然也被吹倒了。' },
  ],
  ending: '熊先生不好意思地挠挠头，第一个跑来帮忙。大家用木棍把向日葵一棵棵扶起来，换上新花盆。第二天花展上，“风雨里重新站起来的向日葵”拿到了最受欢迎奖！',
},
{
  id: 'violin', lv: 'PET', emoji: '🎻', title: '琴盒里的吉他', client: '🐱 小提琴手莉莉',
  brief: '晚上就要演出了，莉莉打开琴盒，里面竟然是一把吉他！她的小提琴去哪儿了？',
  docs: [
    { kind: 'letter', from: '🐱 莉莉的求助信', text: 'Tonight is the town concert, and I\'m very [nervous]. Our [rehearsal] starts at four, but I can\'t find my violin! Yesterday I left it in its black case by the door of the music hall. This morning there was a {different} black case there, and inside it was a guitar.' },
    { kind: 'chat', from: '🐴 快递员马先生', text: 'Yesterday I had to [deliver] a black case from the music hall to Max\'s house. There were two black cases by the door. They looked very [similar], and neither of them had a [label] with a name on it. So I took the smaller one.' },
    { kind: 'chat', from: '🐶 吉他手马克斯', text: 'The delivery man brought my case last night. When I opened it this morning, I didn\'t [recognise] the thing inside! It\'s far too small to be my guitar. I think it\'s a violin.' },
  ],
  words: [
    { k: 'nervous', m: '紧张的', e: '😬' },
    { k: 'rehearsal', m: '彩排，排练', e: '🎭' },
    { k: 'deliver', m: '送（货）', e: '🚚' },
    { k: 'similar', m: '相似的', e: '👯' },
    { k: 'label', m: '标签', e: '🏷️' },
    { k: 'recognise', m: '认出', e: '🧐' },
  ],
  extra: [{ m: '修理', e: '🔧' }, { m: '很贵的', e: '💰' }],
  steps: [
    { type: 'pick', q: '马先生为什么会拿错？找到原因那句话。', ans: 'They looked very similar', hint: '两个琴盒看起来怎么样？', why: 'similar 是“相似的”。两个黑琴盒长得太像了。' },
    { type: 'choice', q: '还有什么让马先生分不清？', opts: ['琴盒上都没有写名字的标签', '琴盒太重了', '天太黑了'], a: 0, hint: '马先生还提到了 label。', why: 'label 是“标签”。两个琴盒都没贴名字标签，马先生只好随手拿了小的那个。' },
    { type: 'choice', q: '小提琴现在在哪儿？', opts: ['🐶 马克斯家', '🐴 马先生的车上', '🎵 音乐厅门口'], a: 0, hint: '谁说打开盒子没认出（recognise）里面的东西？', why: '小提琴被当成吉他送到了马克斯家。' },
  ],
  ending: '马克斯抱着琴盒一路跑到音乐厅，两人换回了自己的乐器。彩排准时开始，晚上他们还合奏了一首曲子。从那以后，小镇乐队的每个琴盒都贴上了名字标签🏷️。',
},
{
  id: 'bakery', lv: 'PET', emoji: '🥐', title: '面包店的夜里声音', client: '🐷 猪师傅',
  brief: '面包店每天夜里都有奇怪的沙沙声，早上柜门还开着一条缝。会是谁呢？',
  docs: [
    { kind: 'letter', from: '🐷 猪师傅的求助信', text: 'Something strange is happening in my bakery. Every night I hear a [noise] from the kitchen: a soft [scratching|scratch] sound. In the morning the [cupboard] door is open a little, and there is [flour] on the floor. But nothing is missing, only a few biscuit crumbs.' },
    { kind: 'chat', from: '🐐 山羊爷爷', text: 'Don\'t worry, Pig. It\'s autumn, and the nights are getting cold. Small animals [search] for warm places to sleep. Maybe one of them likes the {smell} of your biscuits. Did you see any dry leaves on the floor?' },
    { kind: 'chat', from: '🐷 猪师傅（第二天）', text: 'Yes! There were some dry leaves, and tiny footprints in the flour. They are much smaller than a cat\'s. And look what I found behind the flour bags: a [prickly] brown ball. It is breathing slowly.' },
  ],
  words: [
    { k: 'noise', m: '声音，响动', e: '🔊' },
    { k: 'scratch', m: '抓，挠', e: '🐾' },
    { k: 'cupboard', m: '柜子，橱柜', e: '🗄️' },
    { k: 'flour', m: '面粉', e: '🌾' },
    { k: 'search', m: '寻找', e: '🔍' },
    { k: 'prickly', m: '多刺的，扎手的', e: '🌵' },
  ],
  extra: [{ m: '花朵', e: '🌸' }, { m: '光滑的', e: '🫧' }],
  steps: [
    { type: 'pick', q: '哪句话说明来的是一只很小的动物？', ans: 'tiny footprints in the flour', hint: '找找脚印在哪儿、有多大。', why: '面粉上的脚印很小（tiny），比猫的还小得多。' },
    { type: 'choice', q: '柜子后面那个 prickly brown ball 是什么？', opts: ['🦔 一只蜷成球的小刺猬', '🌰 一颗栗子', '🧶 一团毛线'], a: 0, hint: 'prickly 是什么意思？它还在呼吸呢。', why: '浑身是刺、会慢慢呼吸的棕色小球，是一只蜷起来的小刺猬。' },
    { type: 'choice', q: '小刺猬为什么跑进面包店？', opts: ['天冷了，它在找暖和的地方睡觉', '它想学做面包', '它在等朋友'], a: 0, hint: '山羊爷爷说秋天的小动物会做什么？', why: 'search 是“寻找”。秋天夜里冷，小动物会找暖和的地方睡觉，面包店厨房又暖又香。' },
  ],
  ending: '猪师傅在后院搭了个铺满落叶的小木箱，把小刺猬轻轻放了进去。从此面包店夜里安安静静。春天小刺猬醒来，在面包店门口留下了一片新叶子🍃。',
},
// ───────────── FCE ─────────────
{
  id: 'snowman', lv: 'FCE', emoji: '⛄', title: '雪人去哪儿了？', client: '🐰 小兔露西',
  brief: '公园里的大雪人一夜之间不见了，镇上都在传是巨人把它搬走了。真的是这样吗？',
  docs: [
    { kind: 'letter', from: '🐰 露西的求助信', text: 'Yesterday morning my friends and I built a huge snowman in the park. This morning it had [vanished|vanish]! Everyone is talking about it, and there\'s a [rumour] that a giant carried it away in the night. Can you find out the truth?' },
    { kind: 'chat', from: '🦡 公园管理员獾先生', text: 'I don\'t believe that rumour. We need [evidence], not stories. Where the snowman stood, there is a big [puddle] now. In the water I found two black stones, a carrot and Lucy\'s red scarf. There are no giant footprints anywhere.' },
    { kind: 'radio', from: '📻 小镇天气预报', text: 'Yesterday afternoon the [temperature] rose from minus two to eight degrees. The snow in town [gradually|gradual] disappeared during the night. Tomorrow it will be cold again, with more snow in the evening.' },
    { kind: 'chat', from: '🦡 獾先生', text: 'Put everything together, and we can only [conclude] one thing.' },
  ],
  words: [
    { k: 'vanish', m: '消失', e: '🫥' },
    { k: 'rumour', m: '传言', e: '🗣️' },
    { k: 'evidence', m: '证据', e: '🔎' },
    { k: 'puddle', m: '水坑', e: '🌊' },
    { k: 'temperature', m: '温度', e: '🌡️' },
    { k: 'gradual', m: '慢慢地，逐渐地', e: '🐢' },
    { k: 'conclude', m: '得出结论', e: '✅' },
  ],
  extra: [{ m: '突然地', e: '⚡' }, { m: '巨大的', e: '🏔️' }],
  steps: [
    { type: 'choice', q: '大家说“巨人把雪人搬走了”，这个 rumour 可信吗？', opts: ['不一定，要用证据来检查', '一定是真的，大家都这么说', '一定是假的，根本不用查'], a: 0, hint: '獾先生说了 We need evidence, not stories.', why: 'rumour 是“传言”，大家都在说不代表是真的，要找证据（evidence）来检查。' },
    { type: 'pick', q: '哪句话是最有力的证据？', ans: ['there is a big puddle now', 'the temperature rose from minus two to eight degrees'], hint: '雪人站的地方现在有什么？天气发生了什么变化？', why: '雪人原来的地方变成了一个大水坑，而且气温升到了 8 度。雪会怎样？' },
    { type: 'choice', q: '雪人到底怎么了？', opts: ['💧 天气变暖，慢慢化成了水', '👣 被巨人搬走了', '🌬️ 被大风吹跑了'], a: 0, hint: 'gradually disappeared，再加上水坑、石头、胡萝卜和围巾……', why: '气温升高，雪人一点点（gradually）化成了水坑，只留下当眼睛的石头、当鼻子的胡萝卜和露西的围巾。' },
  ],
  ending: '露西捡起湿漉漉的围巾和胡萝卜，忍不住笑了：“原来巨人就是太阳！” 天气预报说明天又会下雪，大家约好再堆一个更大的雪人，这次堆在大树的阴凉里。',
},
{
  id: 'lighthouse', lv: 'FCE', emoji: '🗼', title: '灯塔为什么一闪一闪？', client: '🦭 海豹船长',
  brief: '海边灯塔的灯连续三晚忽明忽暗，渔船回港都快看不清路了。',
  docs: [
    { kind: 'letter', from: '🦭 海豹船长的求助信', text: 'For three nights the lighthouse light has been [flickering|flicker]: on, off, on, off. Our fishing boats need it to find the harbour safely. It is [essential] that we fix it before the fog comes back on Friday.' },
    { kind: 'chat', from: '🐦 灯塔看守海鸥奶奶', text: 'I checked the electricity myself, and it\'s fine. The bulb is new, too. So it\'s [obvious] that something is blocking the light. But I\'m too old to climb up and [investigate]. It\'s [approximately] forty metres to the top!' },
    { kind: 'chat', from: '🐦 小海鸥山姆', text: 'I flew past the top yesterday. There was a pile of sticks and soft feathers on the glass, and it moved a little in the wind. Two birds were sitting in it. They looked very [reluctant] to leave, and I think I saw some eggs!' },
  ],
  words: [
    { k: 'flicker', m: '忽明忽暗地闪', e: '💡' },
    { k: 'essential', m: '非常必要的', e: '❗' },
    { k: 'obvious', m: '明显的', e: '👀' },
    { k: 'investigate', m: '调查', e: '🕵️' },
    { k: 'approximately', m: '大约', e: '≈' },
    { k: 'reluctant', m: '不情愿的', e: '🙅' },
  ],
  extra: [{ m: '准确地', e: '🎯' }, { m: '高兴的', e: '😄' }],
  steps: [
    { type: 'pick', q: '哪句话说明不是电的问题？', ans: 'I checked the electricity myself', hint: '海鸥奶奶检查过什么？', why: '海鸥奶奶亲自检查过电，没问题，灯泡也是新的。' },
    { type: 'choice', q: '那两只鸟为什么 reluctant to leave？', opts: ['它们在孵蛋，不想离开', '它们很怕灯光', '它们在等鱼游过来'], a: 0, hint: 'reluctant 是“不情愿的”。山姆还看到了什么？', why: '它们在灯罩上搭了窝，正在孵蛋，当然不愿意离开。窝被风吹得一晃一晃，灯光就一闪一闪。' },
    { type: 'choice', q: '最好的办法是什么？', opts: ['在灯塔旁边给鸟一家搭个新窝，再把灯擦干净', '把灯关掉，等它们走', '让渔船以后别出海'], a: 0, hint: '灯光很必要（essential），鸟一家也需要地方住。', why: '灯塔必须亮，鸟一家也要有安全的家。给它们搬个新窝，两边都照顾到了。' },
  ],
  ending: '大家在灯塔旁的平台上搭了个结实的新窝，小心地把蛋搬过去。当晚灯光又稳稳亮起，渔船全都平安回港。小海鸥破壳那天，灯塔特意为它们闪了三下✨。',
},
];
