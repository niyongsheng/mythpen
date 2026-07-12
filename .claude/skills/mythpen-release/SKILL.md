---
name: mythpen-release
description: 执行 Mythpen 发布新版本流程（更新版本号、提交、打 tag、推送）
---

# 发布新版本 — Mythpen

当需要发布 Mythpen 新版本时，按以下步骤执行：

## 步骤

1. **更新版本号（三处保持一致）**
   - `package.json` → `"version"`
   - `src-tauri/tauri.conf.json` → `"version"`
   - `doc/index.html` → `const APP_VERSION = 'X.Y.Z'`

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
