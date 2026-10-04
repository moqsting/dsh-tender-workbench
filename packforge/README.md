# packforge

DSH-PackForge 整合包（`.dspack`）的样例清单，用来把本插件打进一个 profile 形态整合包。

- `manifest.json`：manifest v5 / pack-structure v3 契约；`type: "profile"`；`dshVersion` 与 `dshVersions` 只声明**实测过的** `0.2.0-rc.2`；`launchers` 用规范注册 ID（`dshl`、`dsh-packforge-app`），属提示性兼容声明。
- `bundles` 按**挂载顺序**列出层栈：`dsh-base` → `dsh-web-app` → **`dsh-mcp-connector`（来源连接器，必须排在消费方之前）** → 可选侧栏 `dsh-better-sidebar` → 本插件 `dsh-tender-workbench`。
- `dependencies` **逐项钉死**坐标；注意连接器必须同时出现在 `bundles` 与 `dependencies`（前者决定挂载，后者只决定安装）。
- 容器布局：`.dspack` 的 ZIP 根需有 `dspack.json`（`{"format":"dspack","version":3}`）与 `manifest.json`；profile 机器文件（`package.json` / `pnpm-workspace.yaml` / `pnpm-lock.yaml`）放根，其余内容放 `overrides/`（落 profile 根），home 级内容放 `home/`（落 `$DSH_HOME`）。

**完整的打包说明（依赖矩阵、七条硬约束、可复制的 `manifest.json`、验收清单、故障解读、回滚与合规）见 [docs/PACK-INTEGRATION.md](../docs/PACK-INTEGRATION.md)。**

产出方式：使用 DSH-PackForge 生成端（`dsh-packforge-app` 或 pack 插件的「导出」面板）产出 `.dspack`；规范只约定容器内容，因此按上述布局手工压缩成合规 ZIP 同样有效。具体命令行参数以 DSH-PackForge 官方文档为准。

安全规则：`node_modules/`、`dist/`、密钥与凭据、嵌套压缩包、`.dshpkcfg`、`.dsh-pack` 一律不进包。本目录本身**不进入 npm 包**（见 `package.json` 的 `files` 白名单与 `scripts/verify-pack.mjs`），只随源码与导出包分发。
