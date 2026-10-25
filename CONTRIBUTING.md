# 贡献指南

感谢关注 dsh-weekstrip！这是一个针对 **DSH Desktop**（DeepSeek Harness）的社区补丁，在
**设置 → 账号与余额** 下方增加本地用量面板。欢迎 issue、讨论与 PR。

英文版：[CONTRIBUTING_en.md](CONTRIBUTING_en.md)

## 行为准则

保持友善与专业。讨论聚焦在技术本身；与 DeepSeek 官方无关，请勿在仓库内冒充官方或发布未经证实的信息。

## 报告问题

提 issue 时请尽量附上：

1. **DSH Desktop 版本号**（设置页或安装目录属性中可见）；
2. 操作系统与安装方式（Desktop 安装包 / 源码启动 / 全局 npm）；
3. 复现步骤与期望结果；
4. 相关报错输出。`patch.mjs` 的报错（如 `anchor "<name>" matched 0 time(s)`）请贴完整文本，
   但**不要**粘贴你本机的 `client.js` 内容或任何会话数据。

## 开发环境

- Node.js **18 或更高**；
- 无需安装 DSH Desktop 即可开发与跑大部分测试；需要真实安装的测试会自动跳过。

```powershell
git clone <你的 fork>
cd dsh-weekstrip
npm run check        # CI 门禁：语法 + 补丁引擎测试 + 聚合逻辑测试
```

## 常用命令

```powershell
npm run engine-test    # 锚点处理、插入、幂等、拒绝路径、安装路径探测
npm run logic-test     # 窗口 / 连续天数 / 四桶 / 敌意数据降级
npm run load-test      # 按 __ModuleLoader__ 协议执行补丁后 bundle（需要本机安装 DSH）
npm run render-test    # 用 React 垫片渲染面板并断言文案与数字
npm run preview        # 重新生成 docs/preview.html（浅色 + 深色，中文）
npm run preview -- --locale en   # 生成英文版预览
```

`npm run check` 必须在提交前通过；CI 会跑同样的门禁。

## 提交 PR

1. 从 `main` 拉出功能分支，一个 PR 聚焦一件事；
2. 确保以下全部通过：
   - `npm run check`；
   - 若改动涉及聚合逻辑：`npm run logic-test`；
   - 若改动涉及插入方式或锚点：`npm run engine-test`，并在你本机的 DSH 安装上
     `verify → apply → 重启 DSH` 走通一遍；
3. 若改动改变了面板文案或数字口径，请同步更新：
   - `src/snippet.js` 中 `en` / `zh` 两套文案；
   - `npm run render-test` 的断言；
   - `docs/preview.html`（重跑 `npm run preview`）；
   - 中英文 README 与本文档中的相关描述；
4. 提交信息用简洁的英文祈使句（如 `fix: clamp negative day totals`），PR 描述说明动机与验证方式。

### 新版本锚点适配

DSH Desktop 升级后 bundle 结构可能变化，`apply` 会以 `anchor "<name>" matched 0 time(s)` 安全中止。
适配方式：

1. 在新版 `client.js` 中定位对应代码区域（改动的区域一般很小）；
2. 更新 `src/anchors.mjs` 中的锚点表，并把新版本号加入 `VERIFIED_VERSIONS`；
3. `npm run engine-test` + 本机 `verify` / `apply` / `load-test` 全部通过后提 PR。

不要提交任何 DSH 的源码或 bundle 片段来“证明”锚点——用文字描述区域特征即可。

## 硬性约束

以下要求来自项目“只改本机一个文件、不携带 DSH 代码”的定位，PR 违反时无法合并：

- **不提交** DSH 官方代码、编译产物、修改后的 `client.js` 或任何二进制；
- **不提交** `backups/` 下的备份文件（已在 .gitignore 忽略）；
- 面板只读本机会话投影，**不新增网络请求**；唯一允许的外部请求是同源、可选的
  `POST api/dsh-context/backfill`；
- 不加入遥测、统计上报或远程存储；
- 补丁失败必须保持现状：任何写入前都要有备份与 `node --check` 语法门禁，锚点不匹配时中止且不碰文件；
- 第三方依赖需登记到 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 并使用兼容 MIT 的许可。

## 文档

- 主 README 为中文（`README.md`），英文版为 `README.en.md`，两份内容需保持同步；
- 新增面向用户的功能时，同步更新两份 README 与 `docs/preview.html`。

## 许可

提交即表示你同意以 [MIT](LICENSE) 许可发布你的贡献。
