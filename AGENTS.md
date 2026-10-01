# AGENTS.md - Affine Skill CLI

## 项目概述

Affine 基础版命令行工具，用于管理 Affine 文档、标签、文件夹、收藏夹、文件等。

## 技术文档及疑难解答

可以使用 deepwiki 技能，访问 deepwiki 文档，获取详细的技术文档和疑难解答。
项目知识库地址：https://deepwiki.com/toeverything/AFFiNE

## 代码规范

- **结构化模块化**：将功能拆分为独立模块
- **公共操作独立**：通用的认证、GraphQL 请求、WebSocket 等操作放在 `utils/` 目录
- **核心功能分离**：`core/` 目录存放业务逻辑核心，调用 utils 中的工具函数
- **CLI 命令解耦**：`cli/` 目录只负责命令行参数解析和结果输出，调用 core 层实现具体功能

## 核心命令

```bash
npm run build    # TypeScript 编译
npm run dev      # TypeScript 监听模式
npm run start    # 运行 CLI (node dist/index.js)
npm run clean    # 清理 dist 目录
```

## CLI 用法

```
affine-cli <模块> <操作> [选项]

模块: auth, workspace, doc, tags, folder, collection, file, database
示例:
  affine-cli auth login
  affine-cli doc list --workspace <workspace-id>
  affine-cli doc create -t "标题" -c "./content.md"
```

## 配置加载优先级

**环境变量 > 本地 .env > 全局 ~/.affine-cli/affine-cli.env**

关键配置项：

- `AFFINE_BASE_URL` - Affine 服务器地址（默认 https://app.affine.pro）
- `AFFINE_COOKIE` - 会话 Cookie（AFFiNE 0.27+ 认证凭据）
- `AFFINE_EMAIL` / `AFFINE_PASSWORD` - 可选，非交互式自动登录
- `AFFINE_WORKSPACE_ID` - 默认工作区 ID

## 目录结构

```
src/
├── cli/              # 命令模块 (auth, workspace, doc, tags, folder, collection, file)
│   └── 每个模块一个文件，负责参数解析和 CLI 输出
├── core/             # 核心业务逻辑
│   ├── auth.ts       # 认证核心逻辑
│   ├── workspace.ts  # 工作区操作
│   ├── docs.ts       # 文档操作
│   ├── tags.ts       # 标签操作
│   ├── folder.ts     # 文件夹操作
│   ├── collection.ts # 收藏夹操作
│   └── file.ts       # 文件操作
└── utils/            # 工具函数
    ├── config.ts     # 配置加载
    ├── auth.ts       # 登录请求（邮箱/密码 → 会话 Cookie）
    ├── authSession.ts    # 统一认证解析（Cookie / 自动登录，单飞）
    ├── graphqlClient.ts  # GraphQL 请求封装
    ├── wsClient.ts   # WebSocket 客户端
    └── cliUtils.ts   # CLI 辅助工具
```

## 注意事项

- 使用 ES Module (`"type": "module"`)
- 编译输出到 `dist/` 目录
- 依赖：`yjs`, `undici`, `socket.io-client`, `node-fetch`
