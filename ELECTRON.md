# 桌面待办 · Windows 打包指南

本项目已集成 Electron，可以打包成 Windows 桌面应用 (`.exe` 安装包 + 免安装绿色版)。

## 一、本地运行（开发模式）

```bash
pnpm install
pnpm electron:dev
```

会同时启动 Next.js dev 服务器和 Electron 窗口，支持热更新。

## 二、打包为 Windows 安装包

> **注意：** Windows 打包必须在 Windows 系统上执行（或安装 Wine 在 Linux/Mac 上交叉编译）。

```bash
# 推荐：同时生成 NSIS 安装包 (.exe) 和 portable 绿色版
pnpm electron:pack

# 仅生成绿色免安装版
pnpm electron:pack:portable
```

打包产物位于 `dist-electron/` 目录：
- `桌面待办 Setup x.x.x.exe` —— 标准安装包，会创建桌面/开始菜单快捷方式
- `桌面待办 x.x.x.exe` —— 绿色免安装版，双击即用

## 三、桌面专属功能

应用运行后会出现在系统托盘中，右键托盘图标可访问：

| 功能 | 说明 |
| --- | --- |
| **始终置顶** | 浮动在所有窗口之上，方便随时查看 |
| **贴在桌面壁纸** | 置于桌面层级，不遮挡其他窗口（类似 Rainmeter） |
| **开机自启动** | 系统启动时自动运行 |
| **显示 / 隐藏** | 切换窗口可见性（也可点击托盘图标） |
| **退出** | 完全关闭程序 |

### 全局快捷键

`Ctrl + Shift + T` —— 任意位置快速呼出/隐藏小组件。

### 窗口操作

- **拖动**：按住顶部标题栏拖动到任意位置
- **调整大小**：拖动窗口边缘或四角
- **关闭按钮**：默认隐藏到托盘而非退出（防止误关闭）

## 四、目录结构

```
electron/
  main.js       # 主进程：窗口、托盘、快捷键、IPC
  preload.js    # 预加载脚本：暴露安全的桌面 API 给渲染端
build/
  icon.png      # 应用图标 (512x512)
  tray.png      # 托盘图标 (32x32)
lib/
  use-desktop.ts # 渲染端检测/调用 Electron 桥接的 hook
```

## 五、常见问题

**Q: 打包出来的 exe 杀毒软件报毒？**
A: electron-builder 默认未签名。生产分发请购买代码签名证书并在 `package.json > build.win` 配置 `certificateFile` 和 `certificatePassword`。

**Q: 体积太大（~80MB）？**
A: Electron 应用基础体积就是这么大，因为内置了 Chromium。如需更小体积可考虑迁移到 Tauri。

**Q: 数据存哪里？**
A: 当前使用浏览器 `localStorage`，路径在：
`%APPDATA%\桌面待办\Local Storage\`
卸载应用前请先备份。
