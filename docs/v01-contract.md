# 礼物簿 V0.1 实施与设计规范

## 目标与验收
用户以 TA 为中心建立私人的送礼记忆。只包含登录、TA 资料、送礼记录 CRUD、我的、退出与注销。新建只需称呼与关系，记礼物只需名称与主动选择的五档反应，日期默认今天。首页最多五条最近记录；历史按送礼日期、创建时间倒序，刚保存的记录突出显示。空态、失败重试、保存中、二次删除确认均需落实。两端共用 domain.js 字段校验及枚举，小程序保持原生页面。

完成门槛：PostgreSQL migration 实跑，真实 API 集成测试（隔离、幂等、删除），小程序结构与页面逻辑测试，H5 320/390/430 手机尺寸与完整操作测试，局域网 HTTP 访问。微信实际授权及 iOS/Android 微信真机需有效 AppID/Secret 与设备，无法替代为模拟通过。

## 设计语言
主题是私人通讯录式的礼物簿，以人为第一层级。使用 iOS 大标题、分组表单、底部固定操作和安静的细分隔；以少量书脊/书签形态作为品牌记忆。拒绝大搜索框、首页统计面板、花哨渐变、图标表情堆叠和内部验收文字。

- 画布 #F6F5F7，表面 #FFFFFF，主文字 #29252B，次文字 #77717A，强调色 #9E4762，淡强调 #F3E8ED。
- 标题使用系统字体 32px/700（中文 PingFang SC 优先）；正文 16px/400；辅助 13px；数值使用等宽数字。
- 间距 4/8/12/16/24/32；页面边距 24px；卡片圆角 20px，表单分组 16px；不靠大阴影区分所有内容。
- 点击目标至少 44px，主操作高度 52px。底栏与安全区域留白，文本允许换行，错误就地显示。
- 首页：大标题 → 我的人与新建入口 → 人物卡 → 最近记录；没有 TA 时仅呈现一个清楚的新建入口。
- 新建 TA：称呼、关系优先；年龄、性别、最多八个标签与备注折叠在“再补充一点”。
- TA 主页：称呼及关系 → 喜好 → 历史；底部“记一份礼物”。
- 记录页：归属 TA → 礼物名称 → 五档单选反应 → 日期 → 折叠可选信息。
- 我的：用户昵称、两项个人统计、隐私说明与账号操作；没有未来版本入口。

## 共享 API / 数据契约
所有 API 返回 JSON `{ data: ... , request_id }`，失败 `{ error: { code, message }, request_id }`。会话为 Authorization Bearer token；所有 user_id 从服务端会话取得。

Recipient: `{ id, display_name, relation_type, age_range, gender, tags: string[], note, created_at, updated_at }`。tags 是共享 domain.TAGS 中的标签名称（数据库映射 tags 表）。
Gift: `{ id, recipient_id, gift_name, reaction_level: 1..5, gifted_at: YYYY-MM-DD, occasion, price_fen: null|integer, note, created_at, updated_at }`。
User: `{ id, display_name, ... }`。
GET /v1/home: `{ recipients: Recipient[], recent_gifts: Gift[], stats: { recipients, gifts } }`。
GET /v1/me: `{ user: User, stats: { recipients, gifts } }`。
GET /v1/recipients: Recipient[]；GET /v1/recipients/:id: Recipient。
GET /v1/recipients/:id/gifts: `{ items: Gift[], next_cursor: string|null }`。
GET /v1/tags: string[]。
POST/PATCH recipient/gift: 对应实体。POST gifts 携带 request_id（UUID）用于幂等；PATCH 不改变 recipient_id。DELETE 返回 null。
POST /v1/auth/wechat/login `{code}` → `{token, user}`。
H5 专用开发账号 POST /v1/auth/local/login `{device_key}` → `{token,user}`，仅显式 development + ALLOW_LOCAL_LOGIN 开启；device_key 为浏览器生成的高熵随机值，不能由公开名称猜测，不伪装微信登录。生产关闭并拒绝该路径。

共享 domain 导出：REACTIONS [{value:number,label}], RELATIONS, AGE_BUCKETS, GENDERS, OCCASIONS, TAGS；today(), reaction(level), validateRecipient(input), validateGift(input), parsePrice(input), formatPrice(fen), formatDate(date)。校验返回规范化实体字段，非法抛 Error；price_fen API 为整数分，UI 用 parsePrice 转换。保留旧本地存储不覆盖，旧版本快照在 /tmp/giftbook-before-v01-20260920.tar.gz，不自动将旧样例上传为私人记录。
