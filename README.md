# DeepL Translate Selection

[English](#english) | [中文](#中文)

---

## English

DeepL Translate Selection is an [Obsidian](https://obsidian.md) plugin that translates selected text with the [DeepL API](https://www.deepl.com/pro-api) or [DeepSeek](https://platform.deepseek.com) (OpenAI-compatible LLM). Version 1.2.1 supports Windows desktop and Android mobile with Obsidian 1.5.0 or later, and fixes expanded Android selections being reduced to their initial word. The fix has automated and CodeMirror DOM regression coverage; physical-device retesting is still pending.

### Features

| Feature | Description |
|---------|-------------|
| Right-click translation | Select text, right-click, and choose Translate. |
| Mobile translation | Select text, then use the command palette, mobile toolbar, or languages ribbon button. |
| Smart language direction | Detects Chinese to English or English to Chinese. |
| Output options | Insert below, replace the selection, or copy to clipboard. |
| Command palette support | Search for `Translate selection` in the command palette. |
| Free and Pro API support | Supports DeepL Free and DeepL Pro API keys. |
| Quality-optimized model | Uses DeepL's `quality_optimized` model setting. |
| DeepSeek / LLM translation | Use DeepSeek or any OpenAI-compatible LLM as an alternative translation engine. |
| Professional translation prompt | Built-in system prompt constrains the LLM to produce clean, professional translations. |

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

### DeepSeek setup

1. Get a DeepSeek API key from [platform.deepseek.com](https://platform.deepseek.com).
2. Open Settings -> DeepL Translate Selection.
3. Change Translation provider to DeepSeek.
4. Paste your DeepSeek API key.

The default model is `deepseek-v4-flash`. You can change it or point the base URL to any OpenAI-compatible endpoint.

### Usage

1. Select text in the Markdown editor.
2. On Windows, right-click and choose `Translate`, or search for `Translate selection` in the command palette. You can also use the languages ribbon button.
3. Review the translation in the modal.
4. Choose Insert below, Replace selection, or Copy.

### Android usage

1. Install or update the plugin through Community plugins on your phone, and enable it. Configure your DeepL or DeepSeek key in that vault's plugin settings.
2. Open a note in editing mode and long-press to select text.
3. Open the Obsidian command palette and search for `Translate selection`. For quicker access, add this command in Settings -> Mobile -> Manage toolbar options.
4. Review the translation and choose Insert below, Replace selection, or Copy. If Android blocks automatic clipboard access, long-press the translated text and use the system Copy action.

For manual installation, copy the release's three plugin files into the **Android vault's** `.obsidian/plugins/deepl-translate-selection/` folder. Windows and Android use the same files. Update `main.js`, `manifest.json`, and `styles.css` together, preserving your existing `data.json` settings file.

### Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Translation provider | Choose DeepL or DeepSeek | DeepL |
| DeepL API key | Your personal DeepL API key | Empty |
| Request timeout | Maximum request time before failing | 15000 ms |
| Fallback target language | Target language when detection is inconclusive | ZH |
| Model type | DeepL model setting | quality_optimized |
| DeepSeek API key | Your DeepSeek API key | Empty |
| DeepSeek model | Model identifier | deepseek-v4-flash |
| Temperature | Controls translation consistency (lower = more consistent) | 0.3 |
| API base URL | DeepSeek or OpenAI-compatible endpoint | https://api.deepseek.com |
| Custom system prompt | Override the built-in translation prompt (advanced) | Empty |

### Privacy and network access

This plugin sends the selected text to the DeepL API or the configured LLM API only when you explicitly run a translation command. It does not perform background translation, analytics, telemetry, or tracking.

API keys are stored locally in Obsidian plugin settings. During translation requests, your key is sent only to the corresponding API endpoint for authentication. Translated text is written to the clipboard only when you choose the Copy action.

DeepL and DeepSeek are third-party services. Use of this plugin may require API accounts and is subject to each service's terms, privacy policy, and usage limits.

For more details, see [PRIVACY.md](./PRIVACY.md).

---

## 中文

DeepL Translate Selection 是一款 [Obsidian](https://obsidian.md) 插件，用于通过 [DeepL API](https://www.deepl.com/pro-api) 或 [DeepSeek](https://platform.deepseek.com)（OpenAI 兼容 LLM）翻译编辑器中选中的文本。1.2.1 版本支持 Windows 和 Android，需要 Obsidian 1.5.0 或更高版本，并修复手机上选中整段却只翻译第一个单词的问题。修复已通过自动化和 CodeMirror DOM 回归测试，尚待 Android 真机复测。

### 核心功能

| 功能 | 说明 |
|------|------|
| 右键翻译 | 选中文本后右键选择 Translate。 |
| 手机翻译 | 选中文本后通过命令面板、移动工具栏或侧边栏语言按钮翻译。 |
| 智能方向判断 | 自动判断中文到英文或英文到中文。 |
| 三种输出方式 | 插入到下方、替换选中文本、复制到剪贴板。 |
| 命令面板支持 | 可通过命令面板搜索 `Translate selection`。 |
| Free 和 Pro API | 支持 DeepL Free 与 DeepL Pro API key。 |
| 质量优化模型 | 使用 DeepL 的 `quality_optimized` 模型设置。 |
| DeepSeek / LLM 翻译 | 使用 DeepSeek 或任何 OpenAI 兼容 LLM 作为备选翻译引擎。 |
| 专业翻译提示词 | 内置系统提示词约束 LLM 输出干净、专业的翻译结果。 |

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

### DeepSeek 配置

1. 从 [platform.deepseek.com](https://platform.deepseek.com) 获取 DeepSeek API key。
2. 打开 设置 -> DeepL Translate Selection。
3. 将翻译引擎切换为 DeepSeek。
4. 粘贴 DeepSeek API key。

默认模型为 `deepseek-v4-flash`。你可以更改模型名称，或将 Base URL 指向任何 OpenAI 兼容的 API endpoint。

### 使用方法

1. 在 Markdown 编辑器中选中文本。
2. Windows 上右键选择 `Translate`，或从命令面板搜索 `Translate selection`。也可以点击侧边栏的语言按钮。
3. 在弹窗中查看译文。
4. 选择插入到下方、替换选中文本或复制到剪贴板。

### Android 手机使用

1. 在手机的 Obsidian 第三方插件中安装或更新本插件并启用，在当前仓库的插件设置中配置 DeepL 或 DeepSeek API key。
2. 打开笔记的编辑模式，长按选中文本。
3. 打开 Obsidian 命令面板，搜索 `Translate selection`。为方便使用，可以在 设置 -> 移动端 -> 管理工具栏选项 中添加该命令。
4. 查看译文，选择插入、替换或复制。如果 Android 拒绝自动复制，可以长按译文，使用系统的复制操作。

手动安装时，将发布的三个插件文件复制到 **Android 手机仓库**的 `.obsidian/plugins/deepl-translate-selection/` 目录。Windows 和 Android 使用同一套文件。更新时同时替换 `main.js`、`manifest.json`、`styles.css`，保留已有的 `data.json` 设置文件。

### 设置选项

| 设置 | 说明 | 默认值 |
|------|------|--------|
| 翻译引擎 | 选择 DeepL 或 DeepSeek | DeepL |
| DeepL API key | 你的 DeepL API key | 空 |
| 请求超时 | 请求失败前的最长等待时间 | 15000 ms |
| 备用目标语言 | 语言检测不确定时使用的目标语言 | ZH |
| 模型类型 | DeepL 模型设置 | quality_optimized |
| DeepSeek API key | 你的 DeepSeek API key | 空 |
| DeepSeek 模型 | 模型标识符 | deepseek-v4-flash |
| 温度 | 控制翻译一致性（越低越稳定） | 0.3 |
| API Base URL | DeepSeek 或 OpenAI 兼容的 API 端点 | https://api.deepseek.com |
| 自定义系统提示词 | 覆盖内置翻译提示词（高级） | 空 |

### 隐私与网络访问

插件只会在用户明确运行翻译命令时，将选中文本发送到 DeepL API 或配置的 LLM API。插件不会进行后台翻译、分析统计、遥测或跟踪。

API key 保存在本地 Obsidian 插件设置中。翻译请求发生时，API key 仅发送给对应的 API endpoint 用于认证。只有当用户选择 Copy 操作时，插件才会把译文写入剪贴板。

DeepL 和 DeepSeek 是第三方服务。使用本插件可能需要相应的 API 账户，并受各服务的条款、隐私政策和用量限制约束。

更多细节见 [PRIVACY.md](./PRIVACY.md)。

---

## Development and releases / 开发与发布

Run `npm ci`, `npm run typecheck`, and `npm test`. Tests build `main.js` and exercise selection handling, output actions, clipboard fallback, and provider requests with a mocked Obsidian host. Native selection mappings also run against actual CodeMirror editor DOMs in jsdom. They do not replace Windows or Android device testing. CodeMirror is provided by Obsidian at runtime; jsdom is used only for development tests.

Version tags trigger GitHub Actions to test, build, and publish the three Obsidian plugin files. See [release and network configuration instructions](docs/github-release.md).

## License

[MIT](./LICENSE) © 2026 Yunfeng
