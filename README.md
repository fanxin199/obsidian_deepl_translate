# DeepL Translate Selection

[English](#english) | [中文](#中文)

---

## English

An [Obsidian](https://obsidian.md) plugin that translates selected text instantly using the [DeepL API](https://www.deepl.com/pro-api) — the world's most accurate machine translation engine.

### ✨ Why This Plugin?

| Feature | Description |
|---------|-------------|
| 🖱️ **Right-click to translate** | Select any text → right-click → "DeepL Translate". No switching apps. |
| 🌐 **Smart language detection** | Automatically detects Chinese → English or English → Chinese |
| 📋 **Three output options** | Insert below, replace selection, or copy to clipboard |
| ⌨️ **Hotkey support** | Also available via Command Palette (`Ctrl/Cmd+P` → "DeepL: Translate Selection") |
| 🔑 **Free & Pro API** | Supports both DeepL Free (500,000 chars/month) and Pro keys |
| 🧠 **Quality-optimized model** | Uses DeepL's latest `quality_optimized` engine for best results |

### Use Cases

- 📝 **Academic writing** — Translate references or draft paragraphs between Chinese and English
- 📖 **Reading notes** — Instantly translate clipped foreign-language text in your vault
- 🌍 **Multilingual knowledge base** — Maintain notes in multiple languages effortlessly
- ✍️ **Writing assistance** — Quickly check how a sentence reads in another language

### Installation

#### From Obsidian Community Plugins (Recommended)

1. Open **Settings** → **Community Plugins** → **Browse**
2. Search for **"DeepL Translate Selection"**
3. Click **Install** → **Enable**

#### Manual Installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/fanxin199/obsidian_deepl_translate/releases)
2. Create folder `deepl-translate-selection/` in your vault's `.obsidian/plugins/` directory
3. Copy the 3 downloaded files into that folder
4. Restart Obsidian → Enable the plugin in **Settings** → **Community Plugins**

### Setup

1. **Get a free DeepL API key** at [deepl.com/pro-api](https://www.deepl.com/pro-api) (the free tier gives you 500,000 characters/month)
2. Open **Settings** → **DeepL Translate Selection**
3. Paste your API key

> 💡 Keys ending in `:fx` are automatically recognized as free-tier keys and routed to the correct endpoint.

### Usage

1. Select any text in your Markdown editor
2. **Right-click** → click **"DeepL Translate"** in the context menu
3. Review the translation in the popup modal
4. Choose one of three actions:
   - **Insert Below** — Adds the translation below your selected text
   - **Replace Selection** — Replaces the original text with the translation
   - **Copy** — Copies the translation to your clipboard

### Settings

| Setting | Description | Default |
|---------|-------------|---------|
| DeepL API key | Your personal API key from DeepL | (empty) |
| Request timeout | Max wait time before failing | 15000 ms |
| Fallback target language | Used when auto-detection is inconclusive | ZH (Chinese) |
| Model type | Translation quality model | quality_optimized |

---

## 中文

一款 [Obsidian](https://obsidian.md) 插件，使用 [DeepL API](https://www.deepl.com/pro-api)（全球最准确的机器翻译引擎）即时翻译选中文本。

### ✨ 核心特性

| 功能 | 说明 |
|------|------|
| 🖱️ **右键即翻译** | 选中文本 → 右键 → "DeepL Translate"，无需切换应用 |
| 🌐 **智能语言检测** | 自动识别中→英 / 英→中，无需手动选择 |
| 📋 **三种输出方式** | 插入到选中文本下方、替换选中文本、复制到剪贴板 |
| ⌨️ **快捷键支持** | 支持命令面板（`Ctrl/Cmd+P` → "DeepL: Translate Selection"） |
| 🔑 **免费和专业版** | 同时支持 DeepL Free（每月 50 万字符免费）和 Pro API |
| 🧠 **质量优化模型** | 使用 DeepL 最新的 `quality_optimized` 引擎，翻译质量最佳 |

### 使用场景

- 📝 **学术写作** — 在中英文之间翻译参考文献或草稿段落
- 📖 **阅读笔记** — 即时翻译在库中剪辑的外文文本
- 🌍 **多语言知识库** — 轻松维护多语言笔记
- ✍️ **写作辅助** — 快速查看一段话在另一种语言中的表达

### 安装方法

#### 从 Obsidian 社区插件安装（推荐）

1. 打开 **设置** → **第三方插件** → **浏览**
2. 搜索 **"DeepL Translate Selection"**
3. 点击 **安装** → **启用**

#### 手动安装

1. 从 [最新 Release](https://github.com/fanxin199/obsidian_deepl_translate/releases) 下载 `main.js`、`manifest.json`、`styles.css`
2. 在 Vault 的 `.obsidian/plugins/` 目录下创建 `deepl-translate-selection` 文件夹
3. 将下载的 3 个文件复制到该文件夹
4. 重启 Obsidian → 在 **设置** → **第三方插件** 中启用

### 配置

1. **获取免费 DeepL API 密钥**：访问 [deepl.com/pro-api](https://www.deepl.com/pro-api)（免费版每月 50 万字符）
2. 打开 **设置** → **DeepL Translate Selection**
3. 粘贴你的 API 密钥

> 💡 以 `:fx` 结尾的密钥会自动识别为免费版并路由到正确的端点。

### 使用方法

1. 在 Markdown 编辑器中选中任意文本
2. **右键** → 点击右键菜单中的 **"DeepL Translate"**
3. 在弹出窗口中查看翻译结果
4. 选择操作：
   - **Insert Below** — 将翻译插入到选中文本下方
   - **Replace Selection** — 用翻译替换原文
   - **Copy** — 将翻译复制到剪贴板

### 设置项

| 设置 | 说明 | 默认值 |
|------|------|--------|
| DeepL API key | 你的 DeepL API 密钥 | （空） |
| Request timeout | 最长等待时间 | 15000 ms |
| Fallback target language | 自动检测不确定时的目标语言 | ZH（中文） |
| Model type | 翻译质量模型 | quality_optimized |

---

## License

[MIT](./LICENSE) © 2026 Yunfeng
