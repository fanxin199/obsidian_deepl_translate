# Privacy and network access

This plugin translates text by sending the selection, sentence, heading or paragraph the user explicitly chooses to translate to a third-party translation API. Installing buttons or selecting text does not send a request.

## Translation providers

The plugin supports two translation providers. Only the currently selected provider receives data.

### DeepL

- The text explicitly chosen for translation is sent to DeepL for translation.
- The configured DeepL API key is sent only to DeepL translation endpoints for authentication.
- Free-tier API keys (ending in `:fx`) are routed to the DeepL Free API endpoint; Pro keys are routed to the DeepL Pro API endpoint.

### DeepSeek / OpenAI-compatible LLM

- The text explicitly chosen for translation is sent to the configured LLM API endpoint for translation.
- A system prompt is included with each request to instruct the model to act as a translator.
- The configured API key is sent only to the configured API endpoint for authentication.
- The default endpoint is `https://api.deepseek.com`. Users may configure a custom base URL to use other OpenAI-compatible services.

## Common

- The plugin does not run background translation, indexing, analytics, telemetry, or tracking.
- API keys are stored locally in Obsidian plugin settings. They are not uploaded to the plugin author or to any service other than the configured API endpoints during translation requests.
- The plugin writes translated text to the clipboard only when the user chooses the Copy action.

## Third-party services

DeepL and DeepSeek are third-party services. Use of this plugin may require API accounts and is subject to each service's terms, privacy policy, and usage limits.
