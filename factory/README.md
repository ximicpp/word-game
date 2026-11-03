# 单词小工厂（原型）

独立的构词小游戏，和单词星系分开。把词根原料放上传送带，在格子里装前缀机、后缀机和修正台（y→i、去 e），加工成订单句子要的单词（FCE 构词填空的题式）。

- 在线游玩（合并后）：https://ximicpp.github.io/word-game/factory/
- 单文件 `index.html`，无依赖；进度存在本机浏览器（key `word-factory-v1`）。

## 原型内容

| 关卡 | 机器 | 订单 |
|---|---|---|
| 1 后缀车间 | -ful -less -ness -er | helpful, useless, teacher, kindness, careful |
| 2 前缀车间 + 修正台 | un- dis- re- -ful -ness -ly y→i | unhappy, unpack, retell, disagree, happiness, beautifully |
| 3 词族大订单 | in- -ion -ive -ity -er -or 去 e | active, action, actor, activity, inactive, creative, construction |

- 机器装好后一直留着，下一张订单要改线。
- 送错了，质检小机器人用一句中文说明原因（漏了 y→i、没去 e、半成品、真单词但放进句子不通、actor 不是 acter 等），再错一次给提示。只重做这张订单。
- 送对后装车前选一次中文意思（答对 2 个⚙️，答错 1 个，不扣分）。
- 星级：整关退回 0–1 次 3 星，2–3 次 2 星，更多 1 星。

## 试玩时看两件事

孩子会不会主动要求再玩一关；玩完能不能说出 3 条构词规则。
