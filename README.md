# M5Docs_Team_VSCode_Helper

M5Stack 文档团队内部使用的 VS Code 扩展，提升多语言 Markdown 文档编辑效率。

## 功能（Features）
- 在 `.md` 文件上右键：打开同路径的其它语言版本（zh_CN / en / ja）。
- 在 `.md` 文件上右键：一键打开线上页面与本地预览页面。
- 从 URL（线上或本地）反查并打开对应的 `.md` 文件，若不存在可选择创建。

## 使用方法（Commands）
- **Docs: 打开中文版本 (zh_CN)** — `m5docs.openSibling.zh_CN`
- **Docs: 打开英文版本 (en)** — `m5docs.openSibling.en`
- **Docs: 打开日文版本 (ja)** — `m5docs.openSibling.ja`
- **Docs: 打开线上页面 (Open Online URL)** — `m5docs.openOnline`
- **Docs: 打开本地预览 (Open Local Preview)** — `m5docs.openPreview`
- **Docs: 从 URL 打开文档 (Open File from URL)** — `m5docs.openFromUrl`

## 配置（Settings）
- `m5docs.languages`（默认 `["zh_CN","en","ja"]`）  
  支持的语言列表。
- `m5docs.docsRootName`（默认 `nuxt-m5-docs`）  
  多根工作区时，优先作为文档根目录的文件夹名。
- `m5docs.staticDirName`（默认 `static`）  
  静态文档目录名。
- `m5docs.onlineBaseUrl`（默认 `https://docs.m5stack.com`）  
  线上基址。
- `m5docs.previewBaseUrl`（默认 `http://127.0.0.1:3000`）  
  本地预览基址（请改成你的局域网 IP，比如 `http://192.168.x.x:3000`）。
- `m5docs.createTemplate`（默认 `# ${BASENAME}\n\n> TODO: 内容待补充。`）  
  自动创建文件的初始模板。
- `m5docs.treatReadmeAsIndex`（默认 `true`）  
  生成 URL 时将 `README.md` 视为目录首页。

## 目录结构（Docs Repo）
```
nuxt-m5-docs/
static/
zh_CN/<具体路径>.md
en/<具体路径>.md
ja/<具体路径>.md
```

## 已知问题（Known Issues）
- 目前菜单总是显示三种语言；如需“只显示另外两种”，可后续用 `setContext + when` 动态隐藏。

## 版本历史（Release Notes）
### 0.0.1
- 初始版本：多语言跳转、线上/预览打开、URL 反查与自动创建。