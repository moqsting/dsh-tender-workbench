# packforge

DSH-PackForge 整合包（`.dspack`）的样例清单，用来把本插件打进一个 profile 形态整合包。

- `manifest.json`：manifest v5 / pack-structure v3 契约；`type: "profile"`，`dshVersion` 与 `dshVersions` 只声明**实测过的** `0.2.0-rc.2`，`launchers` 为提示性兼容声明。
- `bundles` 按挂载顺序列出层栈：`dsh-base`、`dsh-web-app`、可选侧栏 `dsh-better-sidebar`、本插件 `dsh-tender-workbench`。
- `dependencies` 逐项钉死版本；`.dspack` 的 profile 根放机器文件（`package.json` / `pnpm-lock.yaml`），其余内容放 `overrides/`，home 级内容放 `home/`。

生成与安装（需要 DSH-PackForge 工具链）：

```sh
# 在 dsh-packforge-app / dspack CLI 环境中
dspack pack --manifest packforge/manifest.json --out .
dspack view dsh-tender-workbench-pack-0.6.1.dspack
dspack install dsh-tender-workbench-pack-0.6.1.dspack
```

安全规则（由 packforge 引擎执行）：`node_modules/`、`dist/`、密钥与凭据、嵌套压缩包、`.dshpkcfg`、`.dsh-pack` 一律不进包。本目录本身**不进入 npm 包**（见 `package.json` 的 `files` 白名单与 `scripts/verify-pack.mjs`），只随源码与导出包分发。
