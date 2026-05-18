# DeepL Translate Selection

[English](#english) | [中文](#中文)

---

## English

DeepL Translate Selection is an [Obsidian](https://obsidian.md) plugin that translates selected text with the [DeepL API](https://www.deepl.com/pro-api). It is designed for quick Chinese-English translation from the editor context menu or command palette.

### Features

| Feature | Description |
|---------|-------------|
| Right-click translation | Select text, right-click, and run DeepL Translate. |
| Smart language direction | Detects Chinese to English or English to Chinese. |
| Output options | Insert below, replace the selection, or copy to clipboard. |
| Command palette support | Run `DeepL: Translate Selection` from the command palette. |
| Free and Pro API support | Supports DeepL Free and DeepL Pro API keys. |
| Quality-optimized model | Uses DeepL's `quality_optimized` model setting. |

### Installation

#### From Obsidian Community Plugins

1. Open Settings -> Community plugins -> Browse.
2. Search for `DeepL Translate Selection`.
3. Click Install, then Enable.

#### Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/fanxin199/obsidian_deepl_translate/releases).
2. Create a `deepl-translate-selection/` folder in your vault's `.obsidian/plugins/` directory.
3. Copy the three files into that folder.
4. Restart Obsidian and enable the plugin.

### Setup

1. Get a DeepL API key from [deepl.com/pro-api](https://www.deepl.com/pro-api).
2. Open Settings -> DeepL Translate Selection.
3. Paste your API key.

Keys ending in `:fx` are treated as DeepL Free API keys and routed to the DeepL Free endpoint.

### Usage

1. Select text in the Markdown editor.
2. Right-click and choose `DeepL Translate`, or run `DeepL: Translate Selection` from the command palette.
3. Review the translation in the modal.
4. Choose Insert below, Replace selection, or Copy.

### Settings

| Setting | Description | Default |
|---------|-------------|---------|
| DeepL API key | Your personal DeepL API key | Empty |
| Request timeout | Maximum request time before failing | 15000 ms |
| Fallback target language | Target language when detection is inconclusive | ZH |
| Model type | DeepL model setting | quality_optimized |

### Privacy and network access

This plugin sends the selected text to the DeepL API only when you explicitly run a translation command. It does not perform background translation, analytics, telemetry, or tracking.

The DeepL API key is stored locally in Obsidian plugin settings. During translation requests, the key is sent only to DeepL API endpoints for authentication. Translated text is written to the clipboard only when you choose the Copy action.

DeepL is a third-party service. Use of this plugin may require a DeepL Free or Pro API account and is subject to DeepL's terms, privacy policy, and usage limits.

For more details, see [PRIVACY.md](./PRIVACY.md).

---

## 中文

DeepL Translate Selection 是一款 [Obsidian](https://obsidian.md) 插件，用于通过 [DeepL API](https://www.deepl.com/pro-api) 翻译编辑器中选中的文本，适合在中文和英文之间快速翻译。

### 核心功能

| 功能 | 说明 |
|------|------|
| 右键翻译 | 选中文本后右键运行 DeepL Translate。 |
| 智能方向判断 | 自动判断中文到英文或英文到中文。 |
| 三种输出方式 | 插入到下方、替换选中文本、复制到剪贴板。 |
| 命令面板支持 | 可通过命令面板运行 `DeepL: Translate Selection`。 |
| Free 和 Pro API | 支持 DeepL Free 与 DeepL Pro API key。 |
| 质量优化模型 | 使用 DeepL 的 `quality_optimized` 模型设置。 |

### 安装方法

#### 从 Obsidian 社区插件安装

1. 打开 设置 -> 第三方插件 -> 浏览。
2. 搜索 `DeepL Translate Selection`。
3. 点击安装，然后启用。

#### 手动安装

1. 从 [latest release](https://github.com/fanxin199/obsidian_deepl_translate/releases) 下载 `main.js`、`manifest.json` 和 `styles.css`。
2. 在 vault 的 `.obsidian/plugins/` 目录下创建 `deepl-translate-selection/` 文件夹。
3. 将三个文件复制到该文件夹。
4. 重启 Obsidian 并启用插件。

### 配置

1. 从 [deepl.com/pro-api](https://www.deepl.com/pro-api) 获取 DeepL API key。
2. 打开 设置 -> DeepL Translate Selection。
3. 粘贴 API key。

以 `:fx` 结尾的 key 会被识别为 DeepL Free API key，并路由到 DeepL Free endpoint。

### 使用方法

1. 在 Markdown 编辑器中选中文本。
2. 右键选择 `DeepL Translate`，或从命令面板运行 `DeepL: Translate Selection`。
3. 在弹窗中查看译文。
4. 选择插入到下方、替换选中文本或复制到剪贴板。

### 隐私与网络访问

插件只会在用户明确运行翻译命令时，将选中文本发送到 DeepL API。插件不会进行后台翻译、分析统计、遥测或跟踪。

DeepL API key 保存在本地 Obsidian 插件设置中。翻译请求发生时，API key 仅发送给 DeepL API endpoint 用于认证。只有当用户选择 Copy 操作时，插件才会把译文写入剪贴板。

DeepL 是第三方服务。使用本插件可能需要 DeepL Free 或 Pro API 账户，并受 DeepL 的服务条款、隐私政策和用量限制约束。

更多细节见 [PRIVACY.md](./PRIVACY.md)。

---

## License

[MIT](./LICENSE) © 2026 Yunfeng
