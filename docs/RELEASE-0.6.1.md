# dsh-tender-workbench 0.6.1

Version: **0.6.1**
Status: **release candidate**

## 范围

修一个来源能力缺失时的**错误归因**缺陷：当 profile 未安装/未启用/未授权来源连接器时，插件把这类失败混报成"来源工具调用失败，请检查连接与授权"并标记 `retryable`，导致用户反复重试一个不可能成功的动作，且看不出真正原因是"工具不存在"。

## 根因（已实测）

- 运行实例 profile 未安装来源连接器：`dsh-mcp-connector`、`@deepseek-ai/dsh-mcp-client`、`@deepseek-ai/dsh-mcp-resources` 均不存在，profile `cordis.patch.yml` 中也没有 MCP 行 → `mcp__qcc-tender__search_tenders`、`mcp__qcc-tender__search_proposed_projects` 在会话中不可见。
- DSH 工具运行时对"定义不存在"和"对调用者不可见"统一报 `UNKNOWN_TOOL`（`@deepseek-ai/dsh-tools` 的 `HarnessError`），旧实现只识别 401/403，其余一律归为 `failed` 并要求"检查连接与授权"。

## 变更

1. 结局词汇新增 **`not-installed`（来源未安装/不可见）**，与 `failed`、`no-permission` 明确分离；`TenderExecution.counts` 新增可选计数器 `notInstalled`（可选是为了让本次改动前记录的会话仍然可解析，读取端把缺省视为 0）。
2. 新增分类模块 `src/host/pipeline/source-tool-failure.ts`：`UNKNOWN_TOOL → not-installed`（不可重试，消息点名缺失工具与连接器、给出安装/授权指引）、401/403/FORBIDDEN/UNAUTHORIZED/NO_PERMISSION → `no-permission`（可重试）、其余 → `failed`（可重试）。
3. `allSourcesFailedResult()`：全部来源都是"不可见"时 `reasonCode = source-tool-missing` 且 `control.retryable = false`；混合或瞬时失败保持 `all-sources-failed` + 可重试。失败状态与 `lastFailure` 的 `errorCode` 同步使用该 reasonCode。
4. 执行终态判定抽为 `terminalExecutionStatus()`，把 `notInstalled` 计入非成功来源 → 这类运行显示为 `partial` 而不是 `succeeded`。
5. 工作台真实进度条：新增"未安装/不可见来源"计数、`data-source-missing` 标记，并在命中时显示"请先安装并授权来源连接器；直接重试不会成功"的告警行。

## 验证

- `tsc --project tsconfig.json`：0 错误。
- `vitest run`：48 个测试文件、306 passed / 1 skipped（新增 `tests/source-tool-failure.spec.ts` 3 例；`tests/query-tool.spec.ts` 新增 2 例：缺工具时 `reasonCode=source-tool-missing`、`retryable=false`、`counts.notInstalled=2`、消息点名两个工具；混合失败保持可重试且仍点名缺失工具）。
- 既有断言不变：真实调用失败仍为 `all-sources-failed` + `retryable=true`；401/403 仍归 `no-permission`。

## 未覆盖

- 仍未连真实 企查查 MCP：连接器装上并授权后，需在真实宿主再验一次 `outcome: succeeded/partial`。
- 0.6.0 的其它未验证项（真实宿主端到端 UI 冒烟、`native-host-smoke.mjs` 移植）同 0.6.0 发布记录。
