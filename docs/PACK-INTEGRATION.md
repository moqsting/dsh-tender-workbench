# 把 dsh-tender-workbench 打进 DSH-PackForge 整合包

> **面向对象**：整合包（`.dspack`）作者与分发者。
> **适用版本**：DSH `0.2.0-rc.2` · 本插件 `0.6.1` · packforge manifest v5 / pack-structure v3。
> **上游**：[duhu2000/dsh-tender-workbench](https://github.com/duhu2000/dsh-tender-workbench)（MIT，作者 Sunhh3221）｜**本发行维护**：moqsting
> **最后更新**：2026-10-04

[English summary](#english-summary)

---

## 1. 这份文档解决什么

招投标工作台**自己不提供数据**：它只按固定工具名调用企查查（Qichacha）的 MCP 服务。把它打进整合包时，真正容易出错的地方不是插件本身，而是**依赖谁、挂载顺序、以及鉴权由谁完成**。本文给出：依赖矩阵、七条硬约束、`.dspack` 容器布局与可直接复制的 `manifest.json`、导入后的验收清单、失败消息解读、以及回滚与合规要求。

若只想手工装到某个 profile（不做整合包），看 [README](../README.md) 的「30 秒开始」即可。

## 2. 依赖矩阵（谁必须一起装）

| 组件 | 角色 | 必须 | 实测坐标 | 说明 |
| --- | --- | --- | --- | --- |
| `@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-web-app` | 宿主层栈底座 | ✅ | 随 DSH 版本 | 由 `dshVersion` 决定，**不进包** |
| `dsh-mcp-connector` | **来源连接器**：连接 MCP 服务并把工具暴露给模型 | ✅ | `0.2.64` | 提供 `mcp__qcc-tender__*` 两个工具；缺失时查询必然失败 |
| 企查查·招投标（连接器**内置目录**里的卡片） | 实际数据来源（企查查官方托管） | ✅ | 随连接器 | 非独立 npm 包，无需单独坐标；用 OAuth 授权 |
| `dsh-tender-workbench` | 本插件：工作台、规则初筛、复核、Excel/PDF | ✅ | `0.6.1`（或 git commit） | 消费上面两个工具 |
| `dsh-better-sidebar` | 可视化工作台 Tab 容器 | ⭕ 可选 | `0.24.1` | 不装则只有对话入口 + Host 工具，功能仍可用 |

> 本插件**不内置、不分发共享密钥**，也**不自动安装**连接器（与上游插件一致：仅把 `dsh-mcp-connector` 声明为非可选 peer；官方 Profile 模板是 `autoInstallPeers: false`，peer 由完整宿主提供，不会自动落盘）。

## 3. 本插件在整合包中的形态

- 标准「方案 B」插件 bundle：`cordis.patch.yml` **只 insert 一行**（`id: tender-workbench`），不覆盖、不 disabled 任何已有行，因此不会顶掉别人注册的 Server 或工具。
- `package.json` 的 `dsh` 字段声明 `manifestVersion: 1` + `bundle.patch` + `client{ platform: web, inject: [...] }`；client 运行时 external 全部位于 DSH 外壳的 `PLATFORM_MODULES` 基座内，因此 **`dsh.client.external` 保持缺省**。
- **不注册 MCP Server、不含任何凭据**：它只调用 `mcp__qcc-tender__search_tenders` 与 `mcp__qcc-tender__search_proposed_projects` 这两个工具名。

## 4. 七条硬约束（打包前逐条确认）

1. **挂载顺序**：`dsh-mcp-connector` 必须排在 `dsh-tender-workbench` **之前**（提供方先于消费方）。当前实测顺序：`dsh-base → dsh-web-app → dsh-mcp-connector → dsh-better-sidebar → dsh-tender-workbench`。
2. **连接器要同时出现在 `bundles` 与 `dependencies`**：`dependencies` 只负责*安装*，`bundles` 才是*挂载层栈*。只写 `dependencies` 会「装了但没挂载」，工具依然不存在——这是最容易踩的坑。
3. **鉴权不进包**：企查查·招投标卡片用 OAuth 2.0 PKCE（发行方 `https://agent.qcc.com`，scope `mcp:tools`），授权令牌由连接器保存在**本机**并自动刷新。**不要**把 Token/API Key/授权缓存打进整合包，也不要写进 `manifest.json` 或 `cordis.patch.yml`。
4. **服务名必须是 `qcc-tender`**：工具名前缀规则是 `mcp__<serverName>__<toolName>`。连接器内置卡片已正确；若你自建连接，务必保持该 serverName。
5. **插件只认两个工具名**：`search_tenders`、`search_proposed_projects`（服务端改名即不可用）。
6. **不要为 peer 依赖"补齐"**：官方 profile 模板固定 `nodeLinker: hoisted` + `autoInstallPeers: false`，核心 peer 由完整宿主运行时提供；强行放宽解析参数属于不受支持的安装路径。
7. **git 源码安装需要 `allowBuilds`**：pnpm 11+ 默认阻止包执行构建脚本，而 git 形态的插件正是靠 `prepare` 在本地构建出 `lib/`。首次安装时 `dsh plugin add` 会打印需要粘进 profile `pnpm-workspace.yaml` 的**精确键**；npm 发行版（已含构建产物）不需要这一步。

## 5. 打包成 `.dspack`（profile 形态）

### 5.1 容器布局（pack-structure v3）

```
dsh-tender-workbench-pack-0.6.1.dspack        # 标准 ZIP（PK\x03\x04 开头）
├── dspack.json              # ★ 必有：{"format":"dspack","version":3}
├── manifest.json            # ★ 必有：manifest v5（type: "profile"）
├── package.json             # 可选：profile 机器文件快照（被 manifest 权威重建）
├── pnpm-workspace.yaml       # 可选
├── pnpm-lock.yaml            # 可选：传递依赖锁定
├── overrides/                # ★ 必有目录 → 落 $DSH_HOME/profiles/<profileName>/
│   └── cordis.patch.yml      #   仅在需要覆盖/固定顺序时提供（见 §5.4）
└── home/                     # 可选 → 落 $DSH_HOME/（全局 skill、.agent-presets）
    └── skills/<name>/SKILL.md
```

不要打包：`node_modules/`（依赖由 `pnpm install` 重建）、`.git/`、凭据文件、`.dshpkcfg`、嵌套压缩包、任何密钥。

### 5.2 `dspack.json`

```json
{ "format": "dspack", "version": 3 }
```

导入端会先读它：缺失、不是对象、`format` 不是 `dspack`、或 `version` 不是 `3` 都会被拒载。

### 5.3 `manifest.json`（可直接复制；与仓库 [`packforge/manifest.json`](../packforge/manifest.json) 一致）

```json
{
  "manifestVersion": 5,
  "type": "profile",
  "name": "dsh-tender-workbench-pack",
  "version": "0.6.1",
  "displayName": {
    "en": "Tender workbench (0.2.0-rc.2)",
    "zh": "招投标工作台（0.2.0-rc.2）"
  },
  "description": {
    "en": "Profile pack that installs and mounts dsh-tender-workbench together with its authorized Qichacha MCP connector.",
    "zh": "一次导入即安装并挂载 dsh-tender-workbench 与其授权的企查查 MCP 连接器。"
  },
  "author": "moqsting",
  "dshVersion": "0.2.0-rc.2",
  "dshVersions": ["0.2.0-rc.2"],
  "launchers": ["dshl", "dsh-packforge-app"],
  "profileName": "tender",
  "bundles": [
    "@deepseek-ai/dsh-base",
    "@deepseek-ai/dsh-web-app",
    "dsh-mcp-connector",
    "dsh-better-sidebar",
    "dsh-tender-workbench"
  ],
  "dependencies": {
    "dsh-mcp-connector": "0.2.64",
    "dsh-better-sidebar": "0.24.1",
    "dsh-tender-workbench": "github:moqsting/dsh-tender-workbench#ab300229f3a79b8a553ec3e6bb3dfe973e521ec3"
  }
}
```

字段要点：

- `dshVersion` 写**精确版本**；`dshVersions` 是**实测兼容的枚举集**（不是 semver range——只列你真跑过的版本）。
- `dshVersion` 若同时出现，必须 ∈ `dshVersions`。
- `launchers` 用**规范注册的启动器 ID**（`dshl` / `hdsl` / `dsh-packforge-app`）；非注册 ID 会被判为"未声明兼容"，只警告放行不拒载。本项目实测启动器为 `dshl`。
- `dependencies` **逐项钉死**：npm 包写精确版本；源码形态写 `github:owner/repo#<commit sha>`。
- `files[]` 仅在需要随包分发**重内容**（数据文件、离线依赖等）时使用，逐项附 `sha256` 与 `size`；本插件不需要。
- 不想要的层可在 `dependencies`/`bundles` 里去掉，例如去掉 `dsh-better-sidebar` → 只有对话入口与 Host 工具，功能仍完整。

### 5.4 需要手写 `overrides/cordis.patch.yml` 吗？

**通常不需要**：`dsh-mcp-connector` 与本插件各自带着自己的 bundle patch，`bundles` 顺序决定挂载顺序。只有在下面两种情况才写：

- 你要**覆盖连接器的默认配置**（例如把 `catalogUrl` 置空以走离线/私有目录，或关掉 `showSidebarEntry`）；
- 你要在某层被禁用时显式写 `disabled:` 表达式（参考 DSH 与各插件自带 patch 的写法）。

需要时示例（仅覆盖，不新增重复行）：

```yaml
- id: mcp-connector
  name: dsh-mcp-connector
  config:
    catalogUrl: ''          # 离线/私有目录示例：显式置空
    showSidebarEntry: true
```

### 5.5 产出与自查

用 DSH-PackForge 的生成端（`dsh-packforge-app` / pack 插件的「导出」面板）产出即可；规范只约定容器内容，因此**手工组装一个合规 ZIP 也是合法的**：把上述文件按 §5.1 摆好、压缩成 `.dspack`。自查 4 项：

1. ZIP 根同时存在 `dspack.json`（`format: dspack`、`version: 3`）与 `manifest.json`（`manifestVersion: 5`）。
2. 无 `node_modules/`、无凭据、无嵌套压缩包。
3. `bundles` 顺序里提供方先于消费方，且 `dsh-mcp-connector` 同时在 `dependencies`。
4. `dshVersion` ∈ `dshVersions`；`launchers` 只用注册 ID。

## 6. 插件坐标的两种写法

**A. npm 发行版（推荐，发布后可用）**

```json
"dsh-tender-workbench": "0.6.1"
```

**B. git 源码（当前仓库尚未发布 npm 时的可用形态）**

```json
"dsh-tender-workbench": "github:moqsting/dsh-tender-workbench#ab300229f3a79b8a553ec3e6bb3dfe973e521ec3"
```

git 形态依赖 `prepare` 在本机构建（`tsc` + `tsdown` 产出 `lib/`），因此 profile 的 `pnpm-workspace.yaml` 需要：

```yaml
allowBuilds:
  "dsh-tender-workbench@https://codeload.github.com/moqsting/dsh-tender-workbench/tar.gz/ab300229f3a79b8a553ec3e6bb3dfe973e521ec3": true
```

该键**跟随 commit**：换 commit 后 `dsh plugin add` 会打印新键，替换即可。若你的整合包已把构建好的 tarball 作为 `files[]` 随包分发，则走 tarball 安装路径，不需要 `allowBuilds`。

## 7. 导入后的验收清单

```sh
# 1) 层栈里两行都在（无报错、无 duplicate）
dsh --profile <profileName> --dump-config | grep -E "mcp-connector|tender-workbench"
```

2. **工具可见**：`🧩 MCP连接器 → 工具` 页应出现 `mcp__qcc-tender__search_tenders` 与 `mcp__qcc-tender__search_proposed_projects`。
3. **业务链路**：`招投标` 入口 → 找机会 → 筛候选（影响预览 → 确认）→ 人工定案 → 形成交付（Excel/PDF 下载）。
4. **失败消息解读**（0.6.1 起，四类明确分开）：

| 消息 | 含义 | 该做什么 |
| --- | --- | --- |
| `缺来源工具 mcp__qcc-tender__…（不可重试）` | 连接器没装/没挂载/未授权 | 检查 §4 第 1、2 条与授权状态；**直接重试无效** |
| `…拒绝调用：MCP 授权或额度不可用` | 授权或额度问题 | 到连接器恢复授权 / 检查企查查账号额度 |
| `来源工具调用失败，请检查连接后重试` | 真的调用失败（网络/服务端） | 这类才值得重试 |
| `来源返回结构未知` | 返回了不符合契约的载荷 | 报给来源服务方，插件不会把它当成"零记录" |

## 8. 版本与兼容声明

- 层栈依赖逐项钉死（`dependencies`），运行时版本在**实测枚举集** `dshVersions` 内有界浮动。
- 本包声明：`dshVersion` = `dshVersions` = `0.2.0-rc.2`；启动器 `dshl`、`dsh-packforge-app`。
- 插件自身在 `package.json` 里声明 `engines.dsh = "~0.2.0-rc.2"` 与 `peerDependencies`（core 全部 `~0.2.0-rc.2`，`dsh-better-sidebar ~0.24.1` 可选，`dsh-mcp-connector >=0.2.31`）。

## 9. 回滚

1. 停止实例；
2. 从 `manifest.json` 的 `dependencies`/`bundles` 移除本插件（或改回旧坐标），重新导入；
3. 若 profile 已被就地修改，恢复导入前备份的 `package.json` 与 `pnpm-workspace.yaml`，再 `pnpm install`；
4. 完整重启实例。

不要在**只装了新版宿主的机器上**单独回退到 0.5.x 插件（其 peer 与客户端面面向 DSH 0.1.x）。

## 10. 安全与合规

- 仓库与整合包**不得**包含 npm/GitHub Token、企查查凭据、OAuth 授权缓存、源数据集或会话私有 Artifact；连接器导出配置时会自动脱敏。
- 本插件 MIT 许可，上游版权与变更说明见 [`LICENSE`](../LICENSE) 与 [`NOTICE`](../NOTICE)；二次分发请保留二者。
- 企查查数据的授权范围、额度与费用由使用者自己的企查查账号/合同决定；本插件不内置、不代理、不代结算。

## 11. 已知未验证项（诚实边界）

- **未做真实企查查端到端签收**：本次集成验证到"连接器 + 插件挂载、工具名匹配、错误归因正确"；真实授权与额度需要在你的账号下完成一次 `outcome: succeeded` 才算闭环。
- `dsh-better-sidebar@0.24.1` 的能力探测与契约测试已通过，但**未在本机 profile 上做宿主级 UI 冒烟**。
- 仓库内 `scripts/native-host-smoke.mjs` 仍固定 DSH 0.1.2-rc.1（依赖该代已移除的私有探针），移植到 0.2.0-rc.2 是独立任务；它不参与整合包验收。

## 12. 参考

- 插件说明与安装：[README](../README.md) · [English](../README.en.md)
- 本发行变更：[RELEASE-0.6.1](RELEASE-0.6.1.md) · [RELEASE-0.6.0](RELEASE-0.6.0.md) · [CHANGELOG](../CHANGELOG.md)
- 可直接复制的包清单：[`packforge/manifest.json`](../packforge/manifest.json) · [packforge 说明](../packforge/README.md)
- DSH-PackForge 规范：[DSH-PackForge](https://github.com/DSH-PackForge/DSH-PackForge)（manifest v5 / pack-structure v3 / index schemaVersion 2 / launcher-registry）
- 来源连接器：[dsh-mcp-connector](https://www.npmjs.com/package/dsh-mcp-connector) · [连接器目录仓库](https://github.com/duhu2000/dsh-mcp-connector-registry)
- 上游插件：[duhu2000/dsh-tender-workbench](https://github.com/duhu2000/dsh-tender-workbench)

---

## English summary

`dsh-tender-workbench` is a self-contained DSH "plan B" plugin bundle: its `cordis.patch.yml` inserts exactly one loader row, its client half is injected through `dsh.client`, and it ships no MCP server and no credentials. It only *consumes* two tools, `mcp__qcc-tender__search_tenders` and `mcp__qcc-tender__search_proposed_projects`, which are provided by the **Qichacha tender MCP service** through the `dsh-mcp-connector` plugin.

To wrap it into a DSH-PackForge `.dspack` (manifest v5, pack-structure v3, profile form):

1. Keep `dsh-mcp-connector` in **both** `bundles` (mount) and `dependencies` (install) — installing without mounting leaves the tools missing.
2. Order the bundle stack so the connector precedes `dsh-tender-workbench`.
3. Pin coordinates exactly: `dsh-mcp-connector@0.2.64`, `dsh-better-sidebar@0.24.1` (optional), and this plugin either as an npm version or `github:moqsting/dsh-tender-workbench#<commit sha>`.
4. Never package credentials: the Qichacha authorization is an OAuth 2.0 PKCE grant performed per machine and stored locally by the connector.
5. Declare `dshVersion` / `dshVersions` as the tested enumeration (`0.2.0-rc.2`) and use registered launcher IDs only (`dshl`, `dsh-packforge-app`).
6. Validate after import: `dsh --profile <name> --dump-config` shows both rows, the connector's Tools page lists the two `mcp__qcc-tender__*` tools, and a workbench query returns `outcome: succeeded` or `partial`.

A ready-to-copy manifest lives at [`packforge/manifest.json`](../packforge/manifest.json). Licence: MIT (see [`LICENSE`](../LICENSE) and [`NOTICE`](../NOTICE)).
