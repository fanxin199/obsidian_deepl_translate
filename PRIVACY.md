# Privacy and network access

DeepL Translate Selection translates text by sending the selected text to the DeepL API only when the user explicitly runs a translation command.

## Data sent to DeepL

- The selected text is sent to DeepL for translation.
- The configured DeepL API key is sent only to DeepL translation endpoints for authentication.
- The plugin does not run background translation, indexing, analytics, telemetry, or tracking.

## API key storage

The DeepL API key is stored locally in Obsidian plugin settings. It is not uploaded to the plugin author or to any service other than DeepL API endpoints during translation requests.

## Clipboard access

The plugin writes translated text to the clipboard only when the user chooses the Copy action.

## Third-party service

DeepL is a third-party translation service. Use of this plugin may require a DeepL Free or Pro API account and is subject to DeepL's terms, privacy policy, and usage limits.

## Network access

The plugin connects to DeepL API endpoints to perform translations. Free-tier API keys are routed to the DeepL Free API endpoint, and Pro keys are routed to the DeepL Pro API endpoint.
