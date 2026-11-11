# Mythpen 项目文件格式（`.mythpen`）

> 状态：v1（数据版本 12），**实验功能，默认关闭**。本文档描述 `.mythpen` 单文件项目格式，以及打开、保存、跨环境传递的约定。

## 0. 实验功能开关

`.mythpen` 属于实验功能，后续版本可能对格式做破坏性变更。开关在 **设置 → 实验功能 → 项目文件（.mythpen）**，默认关闭；对应 `config.db.app_settings` 的键 `experimental_document_mode`（`'true'` / `'false'`）。

- **关闭时**：
  - 新建项目（含 AI 导入）仍保存为应用内项目，不弹保存位置；
  - “打开项目文件 / 另存为 / 在文件夹中显示”等入口隐藏；
  - 服务端 `open-file`、带 `filePath` 的创建/导入、`save-as` 返回 `403 FEATURE_DISABLED`；
  - 已经存在的 `.mythpen` 项目仍会出现在最近项目里，可正常打开、编辑、保存（不阻止用户访问已有数据）。
- **开启时**：恢复本文件描述的完整项目文件行为。
- 文件关联是构建期注册的；关闭功能后双击 `.mythpen` 会进入应用并提示开启实验功能，不会静默失败。

## 1. 定位

`.mythpen` 是一个**像 Word `.doc` 一样的项目文件**：

- 单个文件包含项目的全部创作数据，不依赖应用目录里的其他文件；
- 双击文件由 Mythpen 打开，编辑后原地保存回同一个文件；
- 可以拷贝/发送到另一台电脑或另一个人，对方双击继续创作；
- 现有“应用内项目”（`~/.mythpen/projects/*.mythpen.db`）保持兼容，可通过“另存为项目文件”转换为 `.mythpen`。

## 2. 容器

| 项目 | 值 |
|---|---|
| 扩展名 | `.mythpen` |
| MIME | `application/x-mythpen` |
| macOS UTI | `com.mythpen.desktop.project`（conforms to `public.data`） |
| 真实容器 | 标准 SQLite 3 数据库文件 |
| 应用标识 | `PRAGMA application_id = 0x4D595448`（ASCII `MYTH`，十进制 `1297699912`） |
| 格式标记 | `project_meta` 中 `format = 'mythpen-project'`、`format_version = '1'` |
| 数据版本 | `project_meta.schema_version`，当前 `12` |

选择 SQLite 而不是 ZIP：项目文件需要“原地保存”，每次保存直接回写整个 SQLite 文件即可；ZIP 每次保存都要重新打包，代价更高。SQLite 也天然跨平台。

## 3. 文件内容

文件包含一个项目的全部表：

`project_meta`、`volumes`、`chapters`（Markdown 正文）、`characters`、`chapter_characters`、`world_entries`、`project_genres`、`project_styles`、`foreshadows`、`payoff_points`、`memories`、`character_relations`、`science_entries`、`timeline_events`、`clue_board`、`token_usage`、`chat_sessions`、`chat_messages`、`assets`。

### 3.1 二进制资源

```sql
CREATE TABLE assets (
  key        TEXT PRIMARY KEY,
  mime       TEXT NOT NULL,
  data       BLOB NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

- 封面：`key = 'cover'`，`mime` 为 `image/png` / `image/jpeg` / `image/webp` / `image/gif`；
- 封面优先从 `assets` 读取；旧项目的磁盘封面（`~/.mythpen/projects/<name>/cover.*`）作为兼容兜底；新上传会双写 DB 与旧路径。

### 3.2 不包含的内容

以下属于“这台机器”的状态，**不写入**项目文件：

- API Key、Provider 配置、App 设置（`config.db.app_settings`）；
- 最近项目列表（`config.db.recent_projects`）；
- 编辑器崩溃恢复快照；
- `~/.mythpen/exports/` 导出缓存。

因此把文件发给别人不会泄露 API Key；对方打开后使用自己的 AI 配置。

## 4. 打开校验

`POST /api/projects/open-file` 在加载/迁移之前完成：

1. 路径为绝对路径、扩展名 `.mythpen`（大小写不敏感）、`realpath` 后是普通文件；
2. 文件大小 100 B ～ 512 MB（>64 MB 建议提示，sql.js 会全量载入内存）；
3. 前 16 字节为 `SQLite format 3\0`；
4. 头偏移 68 的 `application_id` 等于 `0x4D595448`；
   - 若 `application_id == 0`，用临时 sql.js 实例确认存在 `project_meta`（`name`/`schema_version`），兼容旧库直接改名；
5. 非变更式读取 `schema_version`，若大于当前应用支持的版本，拒绝打开（`PROJECT_SCHEMA_TOO_NEW`），**不迁移、不写盘**；
6. 校验通过后才加载、迁移、登记最近项目。

## 5. 版本兼容

- 旧文件 → 新 App：打开时自动执行现有迁移链（`server/db.js` 的 `projectMigrations`），升级后原地保存。
- 新文件 → 旧 App：旧 App 不认识 `schema_version > 12`，必须拒绝并提示升级；当前实现已在迁移前加了硬守卫。
- v12 迁移只做加法（新增 `assets` 表、`application_id`、`format` 键），不改旧表/旧键，避免旧版本误读新文件。
- 跨环境打开不依赖绝对路径；SQLite + Markdown 在 macOS/Windows/Linux 之间通用。

## 6. 保存语义

- 文件即工作库：编辑器自动保存（默认 30s）→ 内存 DB → 文档路径 1.5s 合并后整文件回写。
- 回写使用 **临时文件 + fsync + rename** 原子替换，避免写一半崩溃损坏文档；`db.export()` 整库导出是 O(文件大小)。
- 打开时记录文件的 `dev/ino/mtime`；每次写前比对。若文件被移动、删除或被其他程序替换，**不写盘**并返回 `PROJECT_FILE_CHANGED`，引导“另存为”，避免复活已删文件或覆盖外部修改。
- 显式保存：⌘S / 菜单“保存” → 先 flush 编辑器，再 `POST /api/projects/:name/save`，把磁盘错误（只读目录、磁盘满、文件被移走）反馈给用户。
- 打开另一个文件、另存为、退出、在文件夹中显示之前都先 flush。
- 本机单实例运行（`tauri-plugin-single-instance`）；双击另一个文件会先保存当前项目再切换，不开新窗口。
- v1 不实现跨进程/跨机器文件锁。两台机器同时编辑同一份同步盘文件仍是“后写覆盖”。

## 7. 另存为

`POST /api/projects/:name/save-as`：

1. flush 当前 DB（并把旧磁盘封面导入 `assets`）；
2. 复制到 `${dest}.tmp` → fsync → rename（可安全覆盖，原生保存对话框已确认）；
3. 打开副本，把 `project_meta.name` 改为最终注册名并 flush；
4. 以新文件名分配唯一注册名（同名追加 `（2）`），原项目保留在最近列表；
5. 前端切换到副本。

## 8. 删除语义

- 外部 `.mythpen` 项目：`DELETE /api/projects/:name` 默认**只移出最近列表，不动文件**；`?deleteFile=1` 才在 flush/close 后删除文件。
- 应用内托管项目（路径在 `~/.mythpen/projects` 下）：UI 默认勾选“同时删除文件”，保持旧行为。
- 删除文件失败时保留最近项目记录并返回错误，不能假装成功。

## 9. 已知限制

- 整文件回写：大文件每次 flush 是 O(size)，>512 MB 拒绝打开；文档路径使用 1.5s 合并。
- 无跨进程锁；同机由单实例插件避免双开，跨机器同步盘冲突未处理。
- 单窗口：打开另一个文件会切换当前项目。
- 不做 `.mythpen` 拖拽打开（现有 `dragDropEnabled: false` 服务于 HTML5 旧书导入面板）。
- 文件被移动/替换后需“另存为”恢复；不会自动跟随新路径。

## 10. 相关实现

- `server/db.js`：原子写、文档 flush、`dev/ino` 守卫、迁移 v12、`assets`、注册名分配
- `server/project-file.js`：路径/header/大小/版本校验
- `server/routes/api.js`：`open-file` / `save` / `save-as` / `delete` / cover
- `src/lib/projectFiles.ts`、`src/lib/dialogs.ts`、`src/lib/openFiles.ts`
- `src-tauri/src/lib.rs`、`src-tauri/tauri.conf.json`（文件关联、单实例、打开队列）
- `server/test-project-file.js`：端到端回归测试
