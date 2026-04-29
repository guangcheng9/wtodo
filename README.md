# 桌面待办

一个基于 Next.js 和 Electron 的 Windows 桌面待办事项小组件。它可以像桌面挂件一样常驻屏幕，支持拖拽、固定、提醒、壁纸背景、透明度调节、贴边自动隐藏、开机自启动和全局快捷键。

## 功能特性

- 待办事项新增、完成、删除和已完成折叠展示
- 单条待办提醒，到点后触发系统通知
- 小组件拖动、调整大小、固定位置
- 明暗主题、圆角、文本省略、内容底色透明度调节
- 内置山景、海洋、森林、抽象和渐变背景，支持自定义图片背景
- Electron 桌面模式下支持始终置顶、普通窗口、贴近桌面三种窗口层级
- 支持贴边自动隐藏和动画速度调节
- 支持开机自启动、启动测试、全局快捷键显示或隐藏窗口
- 待办和小组件设置持久化保存，桌面模式下可更改数据存储目录

## 技术栈

- Next.js 16
- React 19
- TypeScript 5
- Tailwind CSS 4
- Radix UI / shadcn 风格组件
- Electron 41
- electron-builder
- pnpm

## 环境要求

- Node.js 22 或兼容版本
- pnpm
- Windows 系统用于完整桌面体验和 Windows 安装包构建

## 快速开始

安装依赖：

```bash
pnpm install
```

启动 Web 开发预览：

```bash
pnpm dev
```

启动 Electron 桌面开发模式：

```bash
pnpm electron:dev
```

Electron 开发模式会同时启动 Next.js 开发服务器和桌面窗口，适合调试桌面能力。

## 常用脚本

| 命令 | 说明 |
| --- | --- |
| `pnpm dev` | 启动 Next.js 开发服务器 |
| `pnpm build` | 构建 Next.js 应用 |
| `pnpm start` | 启动生产模式 Next.js 服务 |
| `pnpm lint` | 运行 ESLint |
| `pnpm electron:dev` | 启动 Electron 开发模式 |
| `pnpm electron:build` | 按 Electron 目标构建 Next.js 静态产物 |
| `pnpm electron:pack` | 构建 Windows NSIS 安装包和 portable 版本 |
| `pnpm electron:pack:portable` | 仅构建 Windows portable 版本 |

## 打包桌面应用

生成 Windows 安装包和免安装版：

```bash
pnpm electron:pack
```

仅生成免安装版：

```bash
pnpm electron:pack:portable
```

构建产物输出到 `dist-electron/`。更详细的 Windows 打包、托盘、快捷键和常见问题说明见 [ELECTRON.md](./ELECTRON.md)。

## 项目结构

```text
app/
  layout.tsx              # 应用布局
  page.tsx                # 页面入口
components/
  desktop-todo-widget.tsx # 桌面待办主组件
  todo-item.tsx           # 单条待办组件
  widget-settings.tsx     # 小组件设置面板
  desktop-background.tsx  # Web 预览背景
  ui/                     # 通用 UI 组件
electron/
  main.js                 # Electron 主进程：窗口、托盘、快捷键、IPC
  preload.js              # Electron 预加载脚本：暴露安全桌面 API
lib/
  todo-types.ts           # 待办、设置、壁纸和默认值定义
  use-desktop.ts          # Electron 桥接 hook 与存储适配
public/
  wallpapers/             # 内置壁纸资源
build/
  icon.png                # 应用图标
  tray.png                # 托盘图标
```

## 数据存储

Web 预览模式下，数据保存到浏览器 `localStorage`。

Electron 桌面模式下，应用通过预加载脚本暴露的安全存储 API 保存待办和小组件设置。用户可以在设置面板中查看、打开、更改或重置数据存储目录；更改目录后历史数据会自动迁移。

## 开发说明

- 路径别名 `@/*` 指向项目根目录，配置位于 `tsconfig.json`
- 主要业务状态定义在 `lib/todo-types.ts`
- 桌面专属能力通过 `window.desktop` 桥接到渲染端，类型定义位于 `lib/use-desktop.ts`
- 小组件在普通浏览器中提供 localStorage fallback，方便单独调试 UI

