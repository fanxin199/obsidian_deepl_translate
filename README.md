# DeepL Translate Selection

[English](#english) | [中文](#中文)

---

## English

DeepL Translate Selection is an [Obsidian](https://obsidian.md) plugin that translates selected text with the [DeepL API](https://www.deepl.com/pro-api) or [DeepSeek](https://platform.deepseek.com) (OpenAI-compatible LLM). It is designed for quick Chinese-English translation from the editor context menu or command palette.

### Features

| Feature | Description |
|---------|-------------|
| Right-click translation | Select text, right-click, and run DeepL Translate. |
| Smart language direction | Detects Chinese to English or English to Chinese. |
| Output options | Insert below, replace the selection, or copy to clipboard. |
| Command palette support | Run `DeepL: Translate Selection` from the command palette. |
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
2. Right-click and choose `DeepL Translate`, or run `DeepL: Translate Selection` from the command palette.
3. Review the translation in the modal.
4. Choose Insert below, Replace selection, or Copy.

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

DeepL Translate Selection 是一款 [Obsidian](https://obsidian.md) 插件，用于通过 [DeepL API](https://www.deepl.com/pro-api) 或 [DeepSeek](https://platform.deepseek.com)（OpenAI 兼容 LLM）翻译编辑器中选中的文本，适合在中文和英文之间快速翻译。

### 核心功能

| 功能 | 说明 |
|------|------|
| 右键翻译 | 选中文本后右键运行 DeepL Translate。 |
| 智能方向判断 | 自动判断中文到英文或英文到中文。 |
| 三种输出方式 | 插入到下方、替换选中文本、复制到剪贴板。 |
| 命令面板支持 | 可通过命令面板运行 `DeepL: Translate Selection`。 |
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
2. 右键选择 `DeepL Translate`，或从命令面板运行 `DeepL: Translate Selection`。
3. 在弹窗中查看译文。
4. 选择插入到下方、替换选中文本或复制到剪贴板。

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

## License

[MIT](./LICENSE) © 2026 Yunfeng
