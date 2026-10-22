---
name: mythpen-release
description: 执行 Mythpen 发布新版本流程（更新版本号、提交、打 tag、推送）
---

# 发布新版本 — Mythpen

当需要发布 Mythpen 新版本时，按以下步骤执行：

## 一次性准备（自动更新签名）

首次发布或更换密钥时执行：

```bash
pnpm tauri signer generate -w ~/.tauri/mythpen.key
```

1. 将输出的**公钥**填入 `src-tauri/tauri.conf.json` → `plugins.updater.pubkey`
2. 在 GitHub 仓库 Secrets 中添加：
   - `TAURI_SIGNING_PRIVATE_KEY`：`~/.tauri/mythpen.key` 的文件内容
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`：生成密钥时设置的密码
3. 离线备份私钥。私钥丢失后，已安装用户将无法再接收自动更新。

CI 会在构建时自动生成 `latest.json` 与各平台更新包，客户端通过
`releases/latest/download/latest.json` 检查和安装更新。

## 步骤

1. **更新版本号（三处保持一致）**
   - `package.json` → `"version"`
   - `src-tauri/tauri.conf.json` → `"version"`
   - `docs/index.html` → `const APP_VERSION = 'X.Y.Z'`

2. **提交并打 tag**
   ```bash
   git add .
   git commit -m "chore: bump version to vX.Y.Z"
   git push origin main
   git tag vX.Y.Z
   git push origin vX.Y.Z   # ← 触发 CI 自动构建+Release
   ```

## 注意事项

- Tag 必须 `v*` 格式（如 `v0.0.2`）
- 推送后不要删除重推，会残留空 Release
- 产物：macOS → `.dmg` / Windows → `.msi` + `.exe`
