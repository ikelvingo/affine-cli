# Affine CLI

**[【English】](./README-en.md)** | **[【中文】](./README.md)**

Affine CLI 是一个轻量级的命令行工具，用于管理 Affine 文档、标签、文件夹、收藏夹、文件和数据库。它提供了通过命令行与 Affine（<https://app.affine.pro）API> 交互的简化接口。

## 功能特性

- **认证**: 使用邮箱/密码登录并保存会话 Cookie（兼容 AFFiNE 0.27+）
- **工作区管理**: 列出和管理工作区
- **文档操作**: 创建、读取、更新、删除、搜索、复制和追加内容
- **标签管理**: 创建标签、向文档添加/移除标签
- **文件夹管理**: 在文件夹中组织文档
- **收藏夹管理**: 创建和管理收藏夹
- **文件管理**: 上传和管理文件附件
- **评论管理**: 添加、更新、删除和解决评论
- **数据库管理**: 创建数据表、管理列和行

## 安装

### 本地安装

```bash
# 克隆仓库
git clone https://github.com/woodcoal/affine-cli.git
cd affine-cli

# 安装依赖
npm install

# 构建项目
npm run build
```

### 全局安装（推荐）

```bash
# 从 npm 全局安装（如果已发布）
npm install -g affine-cli

# 安装完成后，可在任意目录使用 affine-cli 命令
```

> 需要 Node.js **>= 22.19**（依赖 `undici@8` 的要求）。

### Docker 部署

镜像基于 `node:24-alpine`，内含生产依赖、`affine-cli` 可执行文件与 skill（`/root/.agents/skills/affine-cli`）。

```bash
# 构建
docker build -t affine-cli:lite .

# 运行（推荐：用环境变量做无交互邮箱/密码登录）
docker run --rm \
  -e AFFINE_BASE_URL=https://affine.example.com \
  -e AFFINE_EMAIL=me@example.com \
  -e AFFINE_PASSWORD=secret \
  -e AFFINE_WORKSPACE_ID=your-workspace-id \
  affine-cli:lite doc list

# 也可使用预先获取的会话 Cookie
docker run --rm \
  -e AFFINE_BASE_URL=https://affine.example.com \
  -e AFFINE_COOKIE='affine_session=...; affine_csrf_token=...' \
  affine-cli:lite auth status
```

注意事项：
- 会话 Cookie 默认写在容器内 `/root/.affine-cli/affine-cli.env`，**容器重启即丢失**；需持久化时挂载卷：`-v affine-config:/root/.affine-cli`。
- 无人值守更推荐 `AFFINE_EMAIL` + `AFFINE_PASSWORD`（Cookie 约 7 天过期，会自动重新登录）。
- 访问自托管 Affine 时，容器需能路由到该服务（同一 Docker 网络用服务名，或 `host.docker.internal`）。

## 配置

推荐直接运行登录命令，自动写入会话 Cookie：

```bash
affine-cli auth login --url https://your-affine.example.com
```

也可手动在项目目录创建 `.env` 文件，或使用全局配置：

```bash
# 全局配置: ~/.affine-cli/affine-cli.env
# 本地配置: 项目目录中的 .env

AFFINE_BASE_URL=https://app.affine.pro
AFFINE_COOKIE=affine_session=...
AFFINE_WORKSPACE_ID=your_workspace_id
```

> AFFiNE 0.27 起不再支持 Personal Access Token（`AFFINE_API_TOKEN`），请改用会话 Cookie。
> 无人值守场景可设置 `AFFINE_EMAIL` + `AFFINE_PASSWORD`，CLI 会自动登录获取 Cookie（不建议落盘密码）。

配置优先级：环境变量 > 本地 `.env` > 全局 `~/.affine-cli/affine-cli.env`

## 使用方法

```bash
# 认证
affine-cli auth login
affine-cli auth status
affine-cli auth logout

# 工作区
affine-cli workspace list

# 文档
affine-cli doc list --workspace <workspace-id>
affine-cli doc create -t "我的文档" -c "./content.md"
affine-cli doc info --id <doc-id>
affine-cli doc delete --id <doc-id>
affine-cli doc search --query "关键词"

# 标签
affine-cli tags list
affine-cli tags create --tag "重要"
affine-cli tags add --id <doc-id> --tag "重要"
affine-cli tags remove --id <doc-id> --tag "重要"

# 文件夹
affine-cli folder all
affine-cli folder create --name "我的文件夹"
affine-cli folder list --id <folder-id>

# 收藏夹
affine-cli collection list
affine-cli collection create --name "我的收藏夹"

# 文件
affine-cli file upload --file "./image.png"
affine-cli file list

# 评论
affine-cli comment list --doc-id <doc-id>
affine-cli comment create --doc-id <doc-id> --content "好想法！"

# 数据库
affine-cli database create --title "任务表"
affine-cli database list --doc-id <doc-id>
affine-cli database columns --doc-id <doc-id> --db-id <db-id>
```

## 命令详解

### 认证模块 (auth)

| 命令       | 说明                  | 参数                                                                                                  |
| ---------- | --------------------- | ----------------------------------------------------------------------------------------------------- |
| **login**  | 使用邮箱/密码登录并保存会话 Cookie | `--url` 服务器地址 `--workspace` 工作区ID `--local` 保存到本地 `--force` 强制覆盖 |
| **logout** | 退出登录              | `--local` 删除本地配置                                                                                |
| **status** | 获取登录状态          | `--json` JSON格式输出                                                                                 |

### 工作区模块 (workspace)

| 命令     | 说明                   | 参数                           |
| -------- | ---------------------- | ------------------------------ |
| **list** | 获取所有工作区基本信息 | `--format` 输出格式(text/json) |

### 文档模块 (doc)

| 命令          | 说明                       | 参数                                                                                                                      |
| ------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **list**      | 列出工作区文档（支持分页） | `--count` 每页数量 `--skip` 偏移量 `--after` 游标 `--workspace` 工作区ID                                                  |
| **info**      | 获取文档详情               | `--id` 文档ID `--workspace` 工作区ID `--content` 内容模式(markdown/raw/hidden)                                            |
| **create**    | 创建新文档                 | `--title` 标题 `--content` 内容 `--file` 从文件导入 `--folder` 文件夹ID `--tags` 标签列表 `--workspace` 工作区ID          |
| **search**    | 搜索文档                   | `--query` 关键词 `--workspace` 工作区ID `--count` 返回数量 `--match-mode` 匹配模式 `--tag` 标签过滤                       |
| **delete**    | 删除文档                   | `--id` 文档ID `--workspace` 工作区ID                                                                                      |
| **copy**      | 复制文档                   | `--id` 源文档ID `--title` 新标题 `--parent` 父文档ID `--folder` 目标文件夹 `--workspace` 工作区ID                         |
| **update**    | 更新文档属性               | `--id` 文档ID `--title` 标题 `--parent` 父文档 `--folder` 文件夹 `--workspace` 工作区ID                                   |
| **replace**   | 替换文档内容               | `--id` 文档ID `--search` 搜索文本 `--replace` 替换文本 `--workspace` 工作区ID `--match-all` 替换所有 `--preview` 预览模式 |
| **append**    | 追加文档内容               | `--id` 文档ID `--content` 内容 `--file` 从文件导入 `--workspace` 工作区ID                                                 |
| **publish**   | 发布文档                   | `--id` 文档ID `--workspace` 工作区ID                                                                                      |
| **unpublish** | 取消发布文档               | `--id` 文档ID `--workspace` 工作区ID                                                                                      |

### 标签模块 (tags)

| 命令       | 说明               | 参数                                                             |
| ---------- | ------------------ | ---------------------------------------------------------------- |
| **list**   | 列出所有标签       | `--workspace` 工作区ID                                           |
| **create** | 创建标签           | `--tag` 标签名 `--color` 颜色 `--workspace` 工作区ID             |
| **add**    | 添加标签到文档     | `-d` 文档ID `--tag` 标签名 `--workspace` 工作区ID                |
| **remove** | 从文档移除标签     | `-d` 文档ID `--tag` 标签名 `--workspace` 工作区ID                |
| **delete** | 删除标签           | `--tag` 标签名 `--workspace` 工作区ID                            |
| **info**   | 获取标签关联的文档 | `--tag` 标签名 `--workspace` 工作区ID `--ignore-case` 忽略大小写 |

### 文件夹模块 (folder)

| 命令       | 说明                 | 参数                                                                                    |
| ---------- | -------------------- | --------------------------------------------------------------------------------------- |
| **all**    | 所有文件夹列表       | `--workspace` 工作区ID                                                                  |
| **list**   | 文件夹内容列表       | `--id` 文件夹ID `--folder` 仅文件夹 `--workspace` 工作区ID                              |
| **create** | 创建文件夹           | `--name` 文件夹名 `--parent` 父文件夹ID `--index` 排序索引 `--workspace` 工作区ID       |
| **delete** | 删除文件夹           | `--id` 文件夹ID `--workspace` 工作区ID                                                  |
| **update** | 更新文件夹属性       | `--id` 文件夹ID `--name` 名称 `--parent` 父文件夹 `--index` 排序 `--workspace` 工作区ID |
| **clear**  | 清除空文件夹         | `--workspace` 工作区ID                                                                  |
| **add**    | 添加文档到文件夹     | `--id` 文件夹ID `--doc` 文档ID `--index` 排序 `--workspace` 工作区ID                    |
| **move**   | 移动文档到目标文件夹 | `--id` 目标文件夹ID `--doc` 文档ID `--workspace` 工作区ID                               |
| **remove** | 从文件夹移除文档     | `--id` 文件夹ID `--doc` 文档ID `--workspace` 工作区ID                                   |

### 收藏夹模块 (collection)

| 命令       | 说明             | 参数                                                   |
| ---------- | ---------------- | ------------------------------------------------------ |
| **list**   | 所有收藏夹列表   | `--workspace` 工作区ID                                 |
| **info**   | 收藏夹内文档列表 | `--id` 收藏夹ID `--workspace` 工作区ID                 |
| **create** | 创建收藏夹       | `--name` 收藏夹名 `--workspace` 工作区ID               |
| **update** | 更新收藏夹名称   | `--id` 收藏夹ID `--name` 新名称 `--workspace` 工作区ID |
| **delete** | 删除收藏夹       | `--id` 收藏夹ID `--workspace` 工作区ID                 |
| **add**    | 添加文档到收藏夹 | `--id` 收藏夹ID `--doc` 文档ID `--workspace` 工作区ID  |
| **remove** | 从收藏夹移除文档 | `--id` 收藏夹ID `--doc` 文档ID `--workspace` 工作区ID  |

### 文件模块 (file)

| 命令       | 说明           | 参数                                                                                                          |
| ---------- | -------------- | ------------------------------------------------------------------------------------------------------------- |
| **upload** | 上传附件       | `--file` 文件路径 `--content` Base64内容 `--filename` 文件名 `--content-type` MIME类型 `--workspace` 工作区ID |
| **delete** | 删除附件       | `--id` 附件ID `--permanently` 永久删除 `--workspace` 工作区ID                                                 |
| **clean**  | 清理已删除附件 | `--workspace` 工作区ID                                                                                        |

### 评论模块 (comment)

| 命令        | 说明          | 参数                                                                                                                              |
| ----------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **list**    | 列出文档评论  | `--doc-id` 文档ID `--workspace` 工作区ID `--first` 返回数量 `--offset` 偏移量 `--full` 完整数据                                   |
| **create**  | 创建评论      | `--doc-id` 文档ID `--content` 评论内容 `--workspace` 工作区ID `--selection` 引用文本 `--doc-title` 文档标题 `--doc-mode` 文档模式 |
| **update**  | 更新评论      | `--id` 评论ID `--content` 新内容                                                                                                  |
| **delete**  | 删除评论      | `--id` 评论ID `--workspace` 工作区ID `--doc-id` 文档ID                                                                            |
| **resolve** | 解决/取消解决 | `--id` 评论ID `--resolved` true/false                                                                                             |

### 数据库模块 (database)

| 命令        | 说明             | 参数                                                                                                                              |
| ----------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **list**    | 列出文档中数据库 | `--doc` 文档ID `--workspace` 工作区ID                                                                                             |
| **columns** | 读取列定义       | `--doc` 文档ID `--id` 数据库ID `--workspace` 工作区ID                                                                             |
| **query**   | 查询数据         | `--doc` 文档ID `--id` 数据库ID `--rows` 行ID列表 `--columns` 列名列表 `--query` 筛选条件 `--full` 完整输出 `--workspace` 工作区ID |
| **remove**  | 删除行           | `--doc` 文档ID `--id` 数据库ID `--row` 行ID `--query` 筛选条件 `--workspace` 工作区ID                                             |
| **update**  | 更新行           | `--doc` 文档ID `--id` 数据库ID `--values` 单元格数据 `--row` 行ID `--query` 筛选条件 `--workspace` 工作区ID                       |
| **create**  | 创建数据库       | `--content` 数据(JSON) `--doc` 文档ID `--title` 标题 `--view-mode` 视图模式 `--workspace` 工作区ID                                |
| **delete**  | 删除数据库       | `--doc` 文档ID `--id` 数据库ID `--workspace` 工作区ID                                                                             |
| **insert**  | 插入数据         | `--doc` 文档ID `--id` 数据库ID `--content` 数据 `--workspace` 工作区ID                                                            |

## 命令帮助

```bash
# 显示主帮助
affine-cli help

# 显示模块帮助
affine-cli doc --help

# 显示特定命令帮助
affine-cli doc create --help
```

## 项目结构

```
src/
├── index.ts              # CLI 入口点
├── cli/                # CLI 命令模块
│   ├── auth.ts
│   ├── workspace.ts
│   ├── doc.ts
│   ├── tags.ts
│   ├── folder.ts
│   ├── collection.ts
│   ├── file.ts
│   ├── comments.ts
│   └── database.ts
├── core/               # 核心业务逻辑
│   ├── auth.ts
│   ├── workspace.ts
│   ├── docs.ts
│   ├── tags.ts
│   ├── folder.ts
│   ├── collection.ts
│   ├── file.ts
│   ├── comments.ts
│   ├── database.ts
│   └── constants.ts
└── utils/              # 工具函数
    ├── config.ts
    ├── auth.ts
    ├── authSession.ts
    ├── graphqlClient.ts
    ├── wsClient.ts
    ├── cliUtils.ts
    ├── docsUtil.ts
    ├── fileConverter.ts
    └── misc.ts
```

## 技术栈

- **语言**: TypeScript
- **运行时**: Node.js
- **GraphQL 客户端**: undici
- **WebSocket**: socket.io-client
- **CRDT**: Yjs

## 致谢

本项目参考了 [dawncr0w/affine-mcp-server](https://github.com/dawncr0w/affine-mcp-server) 的实现。我们感谢原作者奠定的基础。

## 许可证

MIT © [The AFFiNE CLI Contributors](LICENSE) & [木炭](https://github.com/woodcoal/affine-cli) <woodcoal@qq.com>

## 作者

- **作者**: 木炭
- **邮箱**: <woodcoal@qq.com>
- **GitHub**: <https://github.com/woodcoal/affine-cli>
