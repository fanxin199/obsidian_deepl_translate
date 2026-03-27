"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => DeepLTranslateSelectionPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var DEFAULT_SETTINGS = {
  apiKey: "",
  requestTimeoutMs: 15e3,
  fallbackTargetLang: "ZH",
  modelType: "quality_optimized"
};
var DEBUG = false;
var BUILD_ID = "v2-20260319-1540";
function debugLog(...args) {
  if (DEBUG) {
    console.debug(`[DeepL Translate ${BUILD_ID}]`, ...args);
  }
}
var DeepLError = class extends Error {
  constructor(message, status) {
    super(message);
    this.name = "DeepLError";
    this.status = status;
  }
};
function sanitizeText(value) {
  if (typeof value !== "string") {
    return "";
  }
  if (value === "undefined" || value === "null" || value === "[object Object]") {
    return "";
  }
  if (!value.trim()) {
    return "";
  }
  return value;
}
var DeepLTranslateSelectionPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
    /**
     * Cache for editor selection, captured at the earliest possible
     * moment (mousedown / contextmenu) before Obsidian clears it.
     */
    this.cachedText = "";
    this.cachedFrom = { line: 0, ch: 0 };
    this.cachedTo = { line: 0, ch: 0 };
  }
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new DeepLTranslateSettingTab(this.app, this));
    this.addCommand({
      id: "translate-selection",
      name: "Translate selection",
      editorCallback: (editor) => {
        debugLog("editorCallback triggered");
        void this.openTranslationModal(editor);
      }
    });
    this.registerDomEvent(document, "mousedown", (evt) => {
      if (evt.button === 2) {
        this.captureCurrentSelection("mousedown");
      }
    });
    this.registerDomEvent(document, "contextmenu", () => {
      this.captureCurrentSelection("contextmenu");
    });
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor) => {
        debugLog("editor-menu triggered");
        const text = this.getSelectedText(editor, "editor-menu");
        if (!text) {
          debugLog("No text found \u2192 menu item not added");
          return;
        }
        const snapshot = {
          editor,
          from: { ...this.cachedFrom },
          to: { ...this.cachedTo },
          text
        };
        menu.addItem((item) => {
          item.setTitle("Translate").setIcon("languages").onClick(() => {
            debugLog("Menu item clicked, text =", JSON.stringify(snapshot.text));
            void this.openTranslationModal(editor, snapshot);
          });
        });
      })
    );
  }
  // ───────────────────────── Selection capture ──────────────────
  /**
   * Capture the selection from the active MarkdownView editor.
   * Called as early as possible (mousedown / contextmenu).
   */
  captureCurrentSelection(source) {
    const view = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
    if (!view?.editor) {
      debugLog(`captureCurrentSelection(${source}): no active MarkdownView`);
      return;
    }
    const editor = view.editor;
    let text = sanitizeText(editor.getSelection());
    debugLog(
      `captureCurrentSelection(${source}): getSelection() \u2192`,
      JSON.stringify(editor.getSelection()),
      "sanitized \u2192",
      JSON.stringify(text)
    );
    if (!text) {
      const from = editor.getCursor("from");
      const to = editor.getCursor("to");
      if (from.line !== to.line || from.ch !== to.ch) {
        text = sanitizeText(editor.getRange(from, to));
        debugLog(
          `captureCurrentSelection(${source}): getRange() \u2192`,
          JSON.stringify(text)
        );
      }
    }
    if (!text) {
      text = sanitizeText(window.getSelection()?.toString());
      debugLog(
        `captureCurrentSelection(${source}): DOM selection \u2192`,
        JSON.stringify(text)
      );
    }
    if (text) {
      this.cachedText = text;
      this.cachedFrom = editor.getCursor("from");
      this.cachedTo = editor.getCursor("to");
      debugLog(`captureCurrentSelection(${source}): cached "${text.slice(0, 60)}\u2026"`);
    }
  }
  /**
   * Get the selected text, trying the live editor first,
   * then falling back to the cache.
   */
  getSelectedText(editor, source) {
    let text = sanitizeText(editor.getSelection());
    if (text) {
      debugLog(`getSelectedText(${source}): got from editor.getSelection()`);
      this.cachedFrom = editor.getCursor("from");
      this.cachedTo = editor.getCursor("to");
      return text;
    }
    const from = editor.getCursor("from");
    const to = editor.getCursor("to");
    if (from.line !== to.line || from.ch !== to.ch) {
      text = sanitizeText(editor.getRange(from, to));
      if (text) {
        debugLog(`getSelectedText(${source}): got from editor.getRange()`);
        this.cachedFrom = from;
        this.cachedTo = to;
        return text;
      }
    }
    text = sanitizeText(window.getSelection()?.toString());
    if (text) {
      debugLog(`getSelectedText(${source}): got from DOM selection`);
      return text;
    }
    if (this.cachedText) {
      debugLog(`getSelectedText(${source}): using cached text`);
      text = this.cachedText;
      this.cachedText = "";
      return text;
    }
    debugLog(`getSelectedText(${source}): nothing found`);
    return "";
  }
  // ───────────────────────── Modal entry point ──────────────────
  async openTranslationModal(editor, snapshot) {
    const resolvedSnapshot = snapshot ?? this.buildSnapshot(editor);
    if (!resolvedSnapshot) {
      new import_obsidian.Notice("Select some text first.");
      return;
    }
    if (!this.settings.apiKey.trim()) {
      new import_obsidian.Notice("API key is not configured.");
      this.openPluginSettings();
      return;
    }
    debugLog("Opening modal with text:", JSON.stringify(resolvedSnapshot.text.slice(0, 100)));
    const modal = new TranslationResultModal(this.app, this, resolvedSnapshot);
    modal.open();
    await modal.translate();
  }
  /**
   * Build a snapshot for the command-palette / hotkey path
   * (where no snapshot is pre-built by the menu handler).
   */
  buildSnapshot(editor) {
    const text = this.getSelectedText(editor, "buildSnapshot");
    if (!text) {
      return null;
    }
    return {
      editor,
      from: { ...this.cachedFrom },
      to: { ...this.cachedTo },
      text
    };
  }
  // ───────────────────────── Settings helpers ───────────────────
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
  openPluginSettings() {
    const appWithSettings = this.app;
    appWithSettings.setting?.open();
    appWithSettings.setting?.openTabById(this.manifest.id);
  }
  // ───────────────────────── Translation logic ──────────────────
  getTargetLanguage(text) {
    if (/\p{Script=Han}/u.test(text)) {
      return "EN-US";
    }
    if (/[A-Za-z]/.test(text)) {
      return "ZH";
    }
    return this.settings.fallbackTargetLang;
  }
  async translateText(text) {
    const apiKey = this.settings.apiKey.trim();
    const endpoint = apiKey.endsWith(":fx") ? "https://api-free.deepl.com/v2/translate" : "https://api.deepl.com/v2/translate";
    const params = new URLSearchParams();
    params.append("text", text);
    params.append("target_lang", this.getTargetLanguage(text));
    params.append("model_type", this.settings.modelType);
    try {
      const response = await this.withTimeout(
        (0, import_obsidian.requestUrl)({
          url: endpoint,
          method: "POST",
          headers: {
            Authorization: `DeepL-Auth-Key ${apiKey}`
          },
          contentType: "application/x-www-form-urlencoded",
          body: params.toString(),
          throw: false
        }),
        this.settings.requestTimeoutMs
      );
      if (response.status >= 400) {
        throw new DeepLError(this.getErrorMessage(response), response.status);
      }
      const payload = response.json;
      const translation = payload.translations?.[0]?.text;
      if (!translation) {
        throw new DeepLError("DeepL returned an empty translation.");
      }
      return translation;
    } catch (error) {
      if (error instanceof DeepLError) {
        throw error;
      }
      throw new DeepLError("DeepL request failed. Check your network connection and try again.");
    }
  }
  getErrorMessage(response) {
    const payload = response.json;
    if (response.status === 401 || response.status === 403) {
      return "DeepL rejected the API key. Check the key in plugin settings.";
    }
    if (response.status === 429) {
      return "DeepL rate limit reached. Wait a moment and try again.";
    }
    if (response.status >= 500) {
      return "DeepL is temporarily unavailable. Try again later.";
    }
    return payload?.message ?? payload?.detail ?? response.text ?? `DeepL request failed with status ${response.status}.`;
  }
  async withTimeout(promise, timeoutMs) {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = window.setTimeout(() => {
        reject(new DeepLError("DeepL request timed out."));
      }, timeoutMs);
    });
    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timeoutId !== void 0) {
        window.clearTimeout(timeoutId);
      }
    }
  }
};
var TranslationResultModal = class extends import_obsidian.Modal {
  constructor(app, plugin, snap) {
    super(app);
    this.translatedText = "";
    this.plugin = plugin;
    this._snap = {
      editor: snap.editor,
      from: { ...snap.from },
      to: { ...snap.to },
      text: typeof snap.text === "string" ? snap.text : ""
    };
    debugLog("Modal constructor: _snap.text =", JSON.stringify(this._snap.text.slice(0, 80)));
  }
  onOpen() {
    this.modalEl.addClass("deepl-translate-modal");
    this.titleEl.setText("Translate");
    this.contentEl.empty();
    this.contentEl.addClass("deepl-translate-modal-content");
    debugLog("onOpen: _snap.text =", JSON.stringify(this._snap.text.slice(0, 80)));
    this.sourceTextArea = this.createTextAreaField("Original text", this._snap.text);
    this.translationTextArea = this.createTextAreaField("Translated text", "Translating...");
    this.statusEl = this.contentEl.createDiv({
      cls: "deepl-translate-status",
      text: "Sending text to DeepL..."
    });
    const actions = this.contentEl.createDiv({ cls: "deepl-translate-actions" });
    this.insertButton = actions.createEl("button", {
      text: "Insert below",
      cls: "mod-cta"
    });
    this.insertButton.disabled = true;
    this.insertButton.addEventListener("click", () => {
      this.insertBelow();
    });
    this.replaceButton = actions.createEl("button", {
      text: "Replace selection"
    });
    this.replaceButton.disabled = true;
    this.replaceButton.addEventListener("click", () => {
      this.replaceSelection();
    });
    this.copyButton = actions.createEl("button", {
      text: "Copy"
    });
    this.copyButton.disabled = true;
    this.copyButton.addEventListener("click", () => {
      void this.copyTranslation();
    });
    const cancelButton = actions.createEl("button", {
      text: "Cancel"
    });
    cancelButton.addEventListener("click", () => this.close());
  }
  async translate() {
    try {
      debugLog("translate(): sending to DeepL:", JSON.stringify(this._snap.text.slice(0, 100)));
      const translatedText = await this.plugin.translateText(this._snap.text);
      this.translatedText = translatedText;
      this.translationTextArea.value = translatedText;
      this.statusEl.removeClass("is-error");
      this.statusEl.setText("Translation ready.");
      this.enableActions();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Translation failed.";
      this.translationTextArea.value = "";
      this.statusEl.addClass("is-error");
      this.statusEl.setText(message);
      new import_obsidian.Notice(message);
    }
  }
  createTextAreaField(label, value) {
    const wrapper = this.contentEl.createDiv({ cls: "deepl-translate-field" });
    wrapper.createDiv({
      cls: "deepl-translate-field-label",
      text: label
    });
    const textArea = wrapper.createEl("textarea", {
      cls: "deepl-translate-textarea"
    });
    textArea.readOnly = true;
    textArea.value = value;
    return textArea;
  }
  enableActions() {
    this.insertButton.disabled = false;
    this.replaceButton.disabled = false;
    this.copyButton.disabled = false;
  }
  insertBelow() {
    const insertion = `
${this.translatedText}`;
    this._snap.editor.replaceRange(insertion, this._snap.to);
    new import_obsidian.Notice("Inserted translation below the selection.");
    this.close();
  }
  replaceSelection() {
    this._snap.editor.replaceRange(this.translatedText, this._snap.from, this._snap.to);
    new import_obsidian.Notice("Replaced the selected text with the translation.");
    this.close();
  }
  async copyTranslation() {
    try {
      await navigator.clipboard.writeText(this.translatedText);
      new import_obsidian.Notice("Translation copied to clipboard.");
    } catch {
      new import_obsidian.Notice("Could not copy the translation to the clipboard.");
    }
  }
};
var DeepLTranslateSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian.Setting(containerEl).setName("General").setHeading();
    new import_obsidian.Setting(containerEl).setName("API key").setDesc("Stored in this vault's plugin data. Keys ending in :fx use the free endpoint automatically.").addText((text) => {
      text.setPlaceholder("Paste your API key");
      text.setValue(this.plugin.settings.apiKey);
      text.inputEl.type = "password";
      text.inputEl.addClass("deepl-setting-api-key-input");
      text.onChange(async (value) => {
        this.plugin.settings.apiKey = value.trim();
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian.Setting(containerEl).setName("Request timeout (ms)").setDesc("How long to wait before failing the request.").addText((text) => {
      text.setPlaceholder(String(DEFAULT_SETTINGS.requestTimeoutMs));
      text.setValue(String(this.plugin.settings.requestTimeoutMs));
      text.onChange(async (value) => {
        const parsed = Number.parseInt(value, 10);
        this.plugin.settings.requestTimeoutMs = Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SETTINGS.requestTimeoutMs;
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian.Setting(containerEl).setName("Fallback target language").setDesc("Used when the source language cannot be detected automatically.").addDropdown((dropdown) => {
      dropdown.addOption("ZH", "Chinese (ZH)").addOption("EN-US", "English (EN-US)").setValue(this.plugin.settings.fallbackTargetLang).onChange(async (value) => {
        this.plugin.settings.fallbackTargetLang = value;
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian.Setting(containerEl).setName("Model type").setDesc("Pinned to quality_optimized for v1.").addDropdown((dropdown) => {
      dropdown.addOption("quality_optimized", "Quality optimized").setValue(this.plugin.settings.modelType).onChange(async (value) => {
        this.plugin.settings.modelType = value;
        await this.plugin.saveSettings();
      });
    });
  }
};
