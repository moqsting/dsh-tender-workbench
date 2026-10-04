# dsh-tender-workbench 0.6.0

Version: **0.6.0**
Status: **release candidate**

## 范围

本版把插件从 DSH 0.1.2-rc.1 迁移到 **DSH 0.2.0-rc.2**，并关闭一次针对上游源码的安全审查发现的问题。业务功能、业务 Skill、Host 工具集合、会话私有 Artifact 与 Excel/PDF 交付契约保持不变。

## 迁移到 0.2.0-rc.2 公开面

| 位置 | 0.1.2 写法 | 0.6.0 写法 |
| --- | --- | --- |
| 当前会话 | `sessions.list.getSnapshot().current` | 主视图保留事实 `SessionSummary.retainedBy.mainView` |
| 会话导航 | `sessions.open(id)` | `uiWorkspace.openSession(target)` |
| 会话创建 | 探测私有 `create` 能力 | 公开 `ISessions.create({ workspaceId, sessionId })` |
| 工具结果 | 嵌套 `{ content: [{ content, isError }] }` | `ToolResultMessage{ isError, content: ContentBlock[] }` |
| 一次性原生引导 | `input.shell(id).editor` + `imageIds` | 公开 `conversation.input.for().setDraft()` + `InputState.attachmentIds`（旧编辑器句柄仅作可选只读提示） |
| 图标 | `Icon*Outline14/16` | `Icon*OutlineMedium` |
| 侧边栏 | 自管分屏状态与展开控制器 | `openTab(seed, scope)`（0.24 负责落位与展开） |

peer 依赖全部改为 `~0.2.0-rc.2`，可选侧栏升级为 `~0.24.1`。客户端 bundle 的运行时 external（react、react/jsx-runtime、react-dom、`@deepseek-ai/dsh-client-ui-primitives`）全部位于官方 `PLATFORM_MODULES` 基座内，因此 `dsh.client.external` 保持缺省。

## 安全修复

1. **M1 围栏伪造**（中）：模型可见工具结果的序列化把 `<`/`>` 与 U+2028/U+2029 转义为 JSON unicode 转义，围栏内声明“数据非指令”；所有外部来源文本在管道入口统一净化，诊断预览同样受限。
2. **L1 Intent 纯文本授权**（低）：新增 loopback-only Intent 注册路由与会话级授权闸门（15 分钟、每会话 64 条、intentId + 类型 + 指纹精确匹配）；客户端先注册后发送，注册失败即取消提交。
3. **L2 探针路由仅凭 Origin 头**（低）：`scripts/native-host-smoke.mjs` 的探针路由改为需要每次运行随机生成的 token。
4. **L3 发布工作流持发布身份而未锁定 action**（低）：CI 与发布工作流内所有 action 固定到 commit SHA。
5. **I1 Excel 转义层次错误**：文本净化统一，去掉会显示在单元格里的撇号前缀；分布标签在生成处净化。
6. **I2 工件边界**：`mediaType` 由工件类型推导并白名单校验；manifest 收据裁剪到最新 128 条；下载 Blob URL 延后一个宏任务释放。
7. **I3 核心对象 monkey-patch**：删除 `uiWorkspace.connectWorkspace` 覆盖与 `Session.beginSubmission` 包装。

## 规范化与可移植

- `dsh.manifestVersion: 1`、`dsh.bundle.patch`、`dsh.client.{platform,inject}`、`engines.dsh`、`NOTICE` 来源声明齐备。
- `pnpm-workspace.yaml` 固定 `nodeLinker: hoisted`，与 DSH Profile 的扁平安装一致，并规避 Windows junction 导致的 Node ESM 解析失败。
- 新增 packforge 样例清单 `packforge/manifest.json`（manifest v5 / pack v3，`dshVersions: ["0.2.0-rc.2"]`）；该目录不进 npm 包。
- 版本、仓库地址、发布工作流、兼容性预检基线（0.2.0-rc.2 + Better Sidebar 0.24.1）全部同步。

## 验证

- `tsc --project tsconfig.json`：0 错误。
- `vitest run`：47 个测试文件、301 passed / 1 skipped（缺 PowerShell 7 时跳过 Windows 挂载自检）。
- 构建：`lib/index.js`（ESM Host Loader）、`lib/client.js`（浏览器 bundle，`window.__ModuleLoader__.load` 注册）与 `lib/types/` 声明。
- `npm pack --dry-run`：文件清单与白名单一致（`verify-pack`）。

## 未验证 / 已知差距

- **未跑真实宿主端到端**：本机没有 0.2.0-rc.2 的 Web 会话环境，未执行真实 UI 冒烟。`scripts/native-host-smoke.mjs` 仍固定 0.1.2-rc.1（依赖该代已移除的私有探针），在 0.2.0-rc.2 宿主上会立即拒绝运行；移植为独立任务。
- **未连真实 QCC MCP**：查询、规则、分析、复核、报告均为 fixture 级验证，额度与授权属于客户环境。
- **未做上游依赖 CVE 比对**：仅锁定了既有直接依赖版本。
- 本版未向 npm 发布，也未创建 git tag。

## 回滚

恢复备份的完整宿主/插件组合。不要在新宿主上单独安装 0.5.x 插件包：其 peer 与客户端面面向 0.1.2-rc.1。
