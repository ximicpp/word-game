# 单词小侦探（原型）

独立的阅读推理小游戏，和单词星系分开。小镇上每天都有小谜题（谁拿走了蛋糕、小狗跑到哪去了），孩子读 80–200 词的英文材料（求助信、聊天、纸条、电台），根据上下文猜出生词的意思，再用这些词义推理破案。

- 在线游玩（合并后）：https://ximicpp.github.io/word-game/detective/
- `index.html` + `cases.js`，无依赖；进度存在本机浏览器（key `word-detective-v1`）。
- 加案件只改 `cases.js`，然后运行 `node detective/check.js` 检查字数（80–200）、生词标记、老朋友顺序和答案句子。

## 原型内容（9 个案件，53 个生词）

| 级别 | 案件 | 生词 |
|---|---|---|
| KET | 生日蛋糕去哪儿了？ | empty, neighbour, soft, carry, surprise |
| KET | 小狗饼干去哪儿了？ | lost, gate, loose, bark, follow, smell |
| KET | 恐龙书是谁的？（borrow / lend） | lend, borrow, sure, library, return |
| KET | 鸡窝里的蓝色蛋（lay / lie） | lay, nest, different, lie, wet, shy |
| PET | 花园怎么乱成这样？ | mess, damage, exhausted, storm, blow, confused |
| PET | 琴盒里的吉他 | nervous, rehearsal, deliver, similar, label, recognise |
| PET | 面包店的夜里声音 | noise, scratch, cupboard, flour, search, prickly |
| FCE | 雪人去哪儿了？ | vanish, rumour, evidence, puddle, temperature, gradual, conclude |
| FCE | 灯塔为什么一闪一闪？ | flicker, essential, obvious, investigate, approximately, reluctant |

## 玩法

1. **认出生词**：点材料里的黄色生词，底部出现它所在的句子和含义卡（本案所有生词的意思 + 2 张干扰卡）。选错会摇一下、句子闪黄光；同一个词错两次自动划掉一张卡。认出的词在原文旁显示中文。
2. **推理**：每案 3 个问题。选择题，或者“在材料里点出那句话”（找矛盾、找关键线索）。答错只说“再试一次”并给提示，第二次错会把答案所在的那段材料闪出来。
3. **结案**：讲出温暖的结局（没有坏人，都是误会或小动物），整案错 0–1 次 3 星，2–3 次 2 星，更多 1 星。
4. **侦探笔记本**：认识的词按案件收进笔记本，带原句。以后的案件里再出现时显示为紫色虚线“老朋友”，点一下想起意思。
5. **侦探等级**：按总星数升级（见习小侦探 → 小侦探 → 金牌小侦探 → 小镇大侦探）。KET / PET / FCE 每个区的第一个案件一开始就能玩。

## 试玩时看两件事

孩子是先读材料再点词，还是直接乱点卡片；破案后能不能用自己的话说出 2–3 个生词的意思。
