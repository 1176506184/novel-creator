# 作者管家官网

这是一个无需构建步骤的静态官网，GitHub Pages 会直接发布本目录。

## 页面结构

- `index.html`：官网内容与产品预览
- `styles.css`：响应式视觉样式
- `script.js`：移动导航、滚动呈现和最新 Release 检测
- `assets/`：应用品牌图标

下载按钮默认指向仓库的 `releases/latest`。发布 GitHub Release 后，页面会自动读取最新版本号，并优先链接到其中的 Windows `.exe` 文件。

## 发布

推送到 `main` 分支后，`.github/workflows/deploy-website.yml` 会自动部署此目录。
