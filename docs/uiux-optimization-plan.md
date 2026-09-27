# 礼物簿 UI/UX 优化落地指南 (P0 阶段)

本文档由架构设计制定，用于指导在 `project_1` 工作区内的工程落地与验收。

## 目标与原则
1. **符合 Brain & Hands 与现有架构规范**：修改遵循 `AGENTS.md`，小程序与 H5 保持双端一致（业务逻辑共享 `miniprogram/utils/domain.js`）。
2. **P0 阶段核心目标**：低成本、高收益、零破坏性变更，保持已有数据库和 API 契约不变。

---

## 具体实施任务清单 (P0)

### 任务 1：首页动作层级与文案重构 (Hero & Actions)
- **文件**：`miniprogram/pages/giftbook/index.wxml`, `miniprogram/pages/giftbook/index.wxss`, `h5/app.js`, `h5/styles.css`
- **改造内容**：
  1. 将弱化的 `找礼物 ›` 链接重构成突出主按钮 `✦ 给 TA 找灵感`（主强调色，高点击热区）。
  2. 记录次级按钮改为 `＋ 记一份`。
  3. 二级切换 Tab 文案由「记录 / 想送」改为 **「送过 (N) / 想送 (M)」**，直观展示数量统计与生命周期闭环。
  4. 优化「想送」卡片底部动作：将陈述句「已经送了」修改为明确的动作文案 **「记为已送」**。

### 任务 2：视觉 Token 与冷暖质感微调
- **文件**：`miniprogram/app.wxss`, `miniprogram/pages/giftbook/index.wxss`, `h5/styles.css`
- **改造内容**：
  1. 背景底色由冷灰 `#F7F7F9` 微调为暖白/浅米白 `#FAF8F5`，提升“心意簿”质感温度。
  2. 规范触控目标（Touch Target）：核心按钮、操作条与列表点击区确保满足至少 44×44px（88rpx）规范。
  3. 卡片与时间线分层：「送过」维持连续性时间线样式，「想送」采用轻卡片容器。

### 任务 3：手势与可用性兜底 (Affordance & A11y)
- **文件**：`miniprogram/pages/giftbook/index.wxml`, `miniprogram/pages/giftbook/index.js`, `h5/app.js`
- **改造内容**：
  1. **TA 排序兜底**：在长按拖拽排序基础上，在 TA 管理（`•••`）弹窗中增加「调整排序」显式点选入口（上移/下移），满足非拖拽单指针无障碍规范。
  2. **列表左滑收起**：记录列表保证单条滑动展开，触碰其他区域或向右滑平滑回弹收回。

### 任务 4：空状态情感化重写
- **文件**：`miniprogram/pages/giftbook/index.wxml`, `h5/app.js`
- **改造内容**：
  1. 暂无 TA：引导“先把一个重要的人放进礼物簿” + [添加 TA]。
  2. 暂无送礼记录：引导“第一份不用记得很完整，礼物名字和 TA 的反应就够了” + [记第一份]。
  3. 暂无想送：引导“看到合适的礼物先放这里，真正送出后再变成一段记录” + [给 TA 找灵感]。

---

## 验证与验收门禁
1. `npm run check`
2. `npm test`
3. 检查 H5 移动端（320px / 390px / 430px）渲染正常且无水平溢出。
