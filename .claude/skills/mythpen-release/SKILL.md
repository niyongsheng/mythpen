---
name: mythpen-release
description: 发布 Mythpen 新版本：统一版本号、提交、打 tag、监控三平台 CI、验证 GitHub Release 与 latest.json
---

# 发布新版本 — Mythpen

当用户要求「发版 / 发布新版本 / release」时执行本流程。

## 发布模型

- 版本号以 tag 为准：`vX.Y.Z`。
- 推送 tag → `.github/workflows/build.yml`（Build & Release）自动构建 macOS / Windows / Linux 并创建 GitHub Release。
- 推送 main 且 `docs/**` 有变更 → `.github/workflows/deploy-pages.yml` 自动部署落地页。
- 客户端通过 `releases/latest/download/latest.json` 检查并安装更新。

## 0. 前置检查

```bash
git status --short          # 必须干净；有改动先确认是否属于本次发布
git branch --show-current   # 应为 main
git fetch origin && git status -sb   # 确认与 origin/main 同步
```

不要用 `git add .` 盲提交；只暂存版本文件。

## 1. 确定版本号

```bash
node -p "require('./package.json').version"
git tag --sort=-v:refname | head -5
```

- 默认 patch +1（仓库历史：0.0.9 → … → 0.0.16 → 0.0.17）。
- 用户指定版本则按指定值。
- 记新版本为 `X.Y.Z`，tag 为 `vX.Y.Z`。

## 2. 更新五处版本号

| 文件 | 位置 |
|---|---|
| `package.json` | 顶层 `"version"` |
| `src-tauri/tauri.conf.json` | 顶层 `"version"` |
| `src-tauri/Cargo.toml` | `[package]` 下 `version` |
| `src-tauri/Cargo.lock` | `[[package]] name = "mythpen"` 下的 `version` |
| `docs/index.html` | `const APP_VERSION = 'X.Y.Z'` |

CI 的 `Verify version` job 校验前四处；`Cargo.lock` 必须同步，否则本地 Rust 构建会漂移。

## 3. 本地校验

```bash
node scripts/check-release-version.mjs vX.Y.Z
git diff --check
```

如果本次发布包含代码改动，再跑：

```bash
pnpm tsc --project tsconfig.app.json --noEmit
pnpm build
```

## 4. 提交并推送 main

```bash
git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock docs/index.html
git commit -m "chore: bump version to vX.Y.Z"
git push origin main
```

## 5. 打 tag 并推送

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

- tag 必须是 `v*` 格式。
- 这一步触发 Build & Release。
- **推送后不要删除或重推 tag**：会残留空 Release 或产生重复运行。

## 6. 监控 CI

```bash
gh run list --workflow build.yml --limit 1
gh run watch <run-id> --exit-status
```

Job 顺序：`Verify version` → `Build (macOS ARM)` / `Build (Windows x86_64)` / `Build (Linux x86_64)` → `Create Release`。每个构建 30 分钟超时。

`gh` 偶发网络 EOF，可用带重试的轮询：

```bash
for i in $(seq 1 30); do
  out=$(gh run view <run-id> --json status,conclusion -q '"\(.status) \(.conclusion // "")"' 2>/dev/null) || out=retry
  case "$out" in
    "completed success") echo "CI SUCCESS"; break;;
    "completed "*) echo "CI FAILED: $out"; break;;
  esac
  sleep 20
done
```

### 已知问题：Linux apt 卡住

`Build (Linux x86_64)` 的 `Install system dependencies (Linux)`（apt-get）偶发卡住，30 分钟后被 runner 判为 `cancelled`，`Create Release` 随之跳过。

恢复方式：**不要动 tag**，重跑失败的 job：

```bash
gh run rerun <run-id> --failed
```

重跑会复用已成功的 macOS / Windows 产物，只重建失败平台。重跑后继续监控直到 `Create Release` 成功。

## 7. 验证发布

```bash
gh release view vX.Y.Z --json name,tagName,isDraft,isPrerelease,publishedAt,assets \
  -q '.name, .tagName, .isDraft, .isPrerelease, .publishedAt, (.assets[].name)'
```

预期资产：

- macOS：`Mythpen_X.Y.Z_aarch64.dmg`、`Mythpen.app.tar.gz` + `.sig`
- Windows：`Mythpen_X.Y.Z_x64-setup.exe` + `.sig`（只发布 NSIS exe，不发布 msi）
- Linux：`.deb`、`.rpm`、`.AppImage` + `.sig`
- `latest.json`

校验自动更新清单：

```bash
curl -sL https://github.com/niyongsheng/mythpen/releases/latest/download/latest.json \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('version:', d['version']); print('\n'.join(sorted(d['platforms'])))"
```

应满足：

- `version` 等于 `X.Y.Z`
- 平台键包含 `darwin-aarch64`、`windows-x86_64`、`linux-x86_64-appimage`、`linux-x86_64-deb`、`linux-x86_64-rpm`、`linux-x86_64`

落地页（版本提交修改了 `docs/index.html`，会触发 Deploy Landing Page）：

```bash
gh run list --workflow deploy-pages.yml --limit 1
```

## 8. 失败处理

- **Verify version 失败**：tag 已指向错误提交。不要删 tag；修复后发布下一个 patch。
- **构建失败**：先看 `gh run view <run-id> --log-failed`。代码问题 → 在 main 修复后发布新 patch；偶发/网络问题 → `gh run rerun <run-id> --failed`。
- **Tag 已推送但 Release 未生成**：优先重跑失败 job（`--failed`），不要重推 tag。
- **Push 失败**：如实报告错误，不静默重试。
- 永远不要 `git push --force` tag。

## 9. 一次性准备（自动更新签名）

首次发布或更换密钥时执行：

```bash
pnpm tauri signer generate -w ~/.tauri/mythpen.key
```

1. 将输出的**公钥**填入 `src-tauri/tauri.conf.json` → `plugins.updater.pubkey`。
2. 在 GitHub 仓库 Secrets 中添加：
   - `TAURI_SIGNING_PRIVATE_KEY`：`~/.tauri/mythpen.key` 的文件内容
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`：生成密钥时设置的密码
3. 离线备份私钥。私钥丢失后，已安装用户将无法再接收自动更新。

## 10. 快速清单

- [ ] 工作区干净，main 与 origin 同步
- [ ] 五处版本号一致
- [ ] `check-release-version.mjs` 通过
- [ ] 提交并推送 main
- [ ] tag 已推送
- [ ] CI 全绿（含 Create Release）
- [ ] Release 资产齐全
- [ ] `latest.json` 版本与平台键正确
- [ ] 落地页部署成功
