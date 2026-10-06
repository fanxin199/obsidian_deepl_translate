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
var import_view = require("@codemirror/view");

// reading-selection.ts
var READING_BLOCKS = "p,h1,h2,h3,h4,h5,h6,li,td,th";
var EXCLUDED = "button,input,textarea,script,style,svg,[aria-hidden='true'],.metadata-container,.deepl-reading-actions,.deepl-translate-block-action,.collapse-indicator,.heading-collapse-indicator";
function renderedText(node, trim = true) {
  const visit = (current) => {
    if (current.nodeType === 3) return current.textContent ?? "";
    const element = current.nodeType === 1 ? current : null;
    if (element?.matches(EXCLUDED)) return "";
    if (element?.tagName === "BR") return "\n";
    const text2 = Array.from(current.childNodes).map(visit).join("");
    return element?.matches("p,h1,h2,h3,h4,h5,h6,li,tr,div") ? `${text2}
` : text2;
  };
  const text = visit(node).replace(/\n{3,}/g, "\n\n");
  return trim ? text.trim() : text;
}
function readingBlock(root, node) {
  const element = node.nodeType === 1 ? node : node.parentElement;
  if (!element || element.closest(EXCLUDED)) return null;
  const block = element.closest(READING_BLOCKS);
  return block && root.contains(block) ? block : null;
}
function blockContext(block) {
  const text = renderedText(block);
  return text ? { text, sentenceText: text, paragraphText: text, blockText: text, block } : null;
}
function isEnglishReadingText(text) {
  return /[A-Za-z]/.test(text) && !/\p{Script=Han}/u.test(text);
}
function containingSentence(text, start, end) {
  if (typeof Intl.Segmenter !== "function") return text;
  const segments = new Intl.Segmenter(void 0, { granularity: "sentence" }).segment(text);
  return Array.from(segments).filter((segment) => segment.index < end && segment.index + segment.segment.length > start).map((segment) => segment.segment).join("").trim() || text;
}
function selectedReadingContext(root) {
  const selection = root.ownerDocument.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount !== 1) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const intersecting = Array.from(root.querySelectorAll(READING_BLOCKS)).filter((block2) => readingBlock(root, block2) && range.intersectsNode(block2));
  const block = readingBlock(root, range.startContainer) ?? intersecting[0];
  const endBlock = readingBlock(root, range.endContainer) ?? intersecting[intersecting.length - 1];
  if (!block || !endBlock) return null;
  const text = renderedText(range.cloneContents());
  const blockText = renderedText(block);
  if (!text || !blockText) return null;
  if (block !== endBlock) {
    return { text, sentenceText: text, paragraphText: text, blockText, block };
  }
  const prefix = root.ownerDocument.createRange();
  prefix.selectNodeContents(block);
  prefix.setEnd(range.startContainer, range.startOffset);
  const rawBlock = renderedText(block, false);
  const leadingWhitespace = rawBlock.length - rawBlock.trimStart().length;
  const start = Math.max(0, renderedText(prefix.cloneContents(), false).length - leadingWhitespace);
  return {
    text,
    paragraphText: blockText,
    blockText,
    block,
    sentenceText: containingSentence(blockText, start, start + text.length)
  };
}

// main.ts
var DEFAULT_SETTINGS = {
  translationProvider: "deepl",
  apiKey: "",
  requestTimeoutMs: 15e3,
  fallbackTargetLang: "ZH",
  modelType: "quality_optimized",
  deepseekApiKey: "",
  deepseekModel: "deepseek-v4-flash",
  deepseekTemperature: 0.3,
  deepseekBaseUrl: "https://api.deepseek.com",
  deepseekCustomSystemPrompt: ""
};
var DEFAULT_TRANSLATION_SYSTEM_PROMPT = `You are a professional, native-speaking {{targetLang}} translator.

## Rules
1. Output ONLY the translated text. No explanations, notes, preamble, or meta-commentary.
2. Preserve the original paragraph structure, line breaks, and formatting exactly.
3. Keep the following UNTRANSLATED:
   - Code blocks (\`\`\` ... \`\`\`) and inline code (\` ... \`)
   - LaTeX formulas ($...$, $$...$$)
   - Obsidian wikilinks ([[...]])
   - URLs, file paths, proper nouns, brand names
   - YAML frontmatter
4. Translate naturally and fluently, not word-by-word. Use idiomatic expressions appropriate for the target language.
5. For academic or technical content, use standard terminology in the target field.
6. If the source text is a single paragraph, output the translation directly. If it contains multiple paragraphs, maintain the same paragraph separations.`;
var DEBUG = false;
var BUILD_ID = "v1.3.1";
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
    // Keep positions and editor identity together when a toolbar or menu takes focus.
    this.cachedSelection = null;
    this.preserveSelectionForUI = false;
    this.editorViews = /* @__PURE__ */ new Set();
    this.cachedReadingSelection = null;
    this.readingActions = null;
    this.readingPointerInNote = false;
    this.translationModalOpen = false;
  }
  async onload() {
    await this.loadSettings();
    this.addSettingTab(new DeepLTranslateSettingTab(this.app, this));
    this.addCommand({
      id: "translate-selection",
      name: "Translate selection",
      checkCallback: (checking) => {
        const available = !!this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView) || !!this.getActiveEditor();
        if (!checking && available) void this.openActiveTranslation();
        return available;
      }
    });
    this.registerDomEvent(document, "pointerdown", (evt) => {
      const view = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
      const root = view ? this.getReadingRoot(view) : null;
      this.readingPointerInNote = !!root && evt.target instanceof HTMLElement && root.contains(evt.target) && !evt.target.closest(".deepl-translate-block-action");
      this.preserveSelectionForUI = !(evt.target instanceof HTMLElement && evt.target.closest(".cm-editor"));
      this.captureCurrentSelection("pointerdown");
    }, true);
    this.registerDomEvent(document, "contextmenu", () => {
      this.captureCurrentSelection("contextmenu");
    }, true);
    const scheduleCapture = () => {
      window.clearTimeout(this.selectionCaptureTimer);
      this.selectionCaptureTimer = window.setTimeout(() => {
        this.selectionCaptureTimer = void 0;
        this.captureCurrentSelection("selection change", true);
      }, 0);
    };
    const plugin = this;
    this.registerEditorExtension(import_view.ViewPlugin.fromClass(class {
      constructor(view) {
        this.view = view;
        plugin.editorViews.add(view);
      }
      update(update) {
        if (update.selectionSet || update.docChanged) scheduleCapture();
      }
      destroy() {
        plugin.editorViews.delete(this.view);
      }
    }));
    this.registerDomEvent(document, "selectionchange", scheduleCapture);
    this.registerDomEvent(document, "pointerup", scheduleCapture);
    this.registerDomEvent(document, "keyup", scheduleCapture);
    this.register(() => window.clearTimeout(this.selectionCaptureTimer));
    const clearSelection = () => {
      this.cachedSelection = null;
      this.preserveSelectionForUI = false;
      this.cachedReadingSelection = null;
      this.readingPointerInNote = false;
      this.hideReadingActions();
    };
    this.registerEvent(this.app.workspace.on("active-leaf-change", clearSelection));
    this.registerEvent(this.app.workspace.on("file-open", clearSelection));
    this.addRibbonIcon("languages", "Translate selection", () => {
      void this.openActiveTranslation();
    });
    this.registerMarkdownPostProcessor((element) => this.installReadingButtons(element));
    this.registerEvent(this.app.workspace.on("layout-change", () => this.installActiveReadingButtons()));
    this.installActiveReadingButtons();
    this.register(() => this.hideReadingActions());
    this.register(() => document.querySelectorAll?.(".deepl-translate-block-action").forEach((button) => button.remove()));
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor) => {
        debugLog("editor-menu triggered");
        const snapshot = this.buildSnapshot(editor);
        if (!snapshot) {
          debugLog("No text found \u2192 menu item not added");
          return;
        }
        this.cachedSelection = snapshot;
        this.preserveSelectionForUI = true;
        menu.addItem((item) => {
          item.setTitle("Translate").setIcon("languages").onClick(() => {
            void this.openTranslationModal(editor);
          });
        });
      })
    );
  }
  // ───────────────────────── Selection capture ──────────────────
  getActiveEditor() {
    const view = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
    if (view?.getMode?.() === "preview") return null;
    return this.app.workspace.activeEditor?.editor ?? view?.editor ?? null;
  }
  readEditorSelection(editor) {
    const from = { ...editor.getCursor("from") };
    const to = { ...editor.getCursor("to") };
    if (from.line === to.line && from.ch === to.ch) {
      return null;
    }
    const text = sanitizeText(editor.getRange(from, to));
    return text ? { editor, filePath: this.getEditorFilePath(editor), from, to, text, source: "editor" } : null;
  }
  readNativeSelection(editor) {
    for (const view of this.editorViews) {
      if (view.state.field(import_obsidian.editorInfoField, false)?.editor !== editor) continue;
      const selection = view.contentDOM.ownerDocument.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount !== 1) continue;
      const range = selection.getRangeAt(0);
      if (!view.contentDOM.contains(range.startContainer) || !view.contentDOM.contains(range.endContainer)) continue;
      try {
        const start = view.posAtDOM(range.startContainer, range.startOffset);
        const end = view.posAtDOM(range.endContainer, range.endOffset);
        const from = editor.offsetToPos(Math.min(start, end));
        const to = editor.offsetToPos(Math.max(start, end));
        const text = sanitizeText(editor.getRange(from, to));
        if (text) {
          return { editor, filePath: this.getEditorFilePath(editor), from, to, text, source: "native" };
        }
      } catch {
      }
    }
    return null;
  }
  readCurrentSelection(editor) {
    const native = this.readNativeSelection(editor);
    if (native) return native;
    const live = this.readEditorSelection(editor);
    const cached = this.cachedSelection;
    if (live && (this.preserveSelectionForUI || !editor.hasFocus()) && cached?.source === "native" && this.isSnapshotValid(cached)) {
      const beforeOrEqual = (a, b) => a.line < b.line || a.line === b.line && a.ch <= b.ch;
      if (beforeOrEqual(cached.from, live.from) && beforeOrEqual(live.to, cached.to)) {
        return cached;
      }
    }
    return live;
  }
  getEditorFilePath(editor) {
    const active = this.app.workspace.activeEditor;
    if (active?.editor === editor) return active.file?.path ?? null;
    const view = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
    return view?.editor === editor ? view.file?.path ?? null : null;
  }
  isSnapshotValid(snapshot) {
    return this.getActiveEditor() === snapshot.editor && this.getEditorFilePath(snapshot.editor) === snapshot.filePath && snapshot.editor.getRange(snapshot.from, snapshot.to) === snapshot.text;
  }
  captureCurrentSelection(source, clearEmptySelection = false) {
    if (this.translationModalOpen) {
      this.hideReadingActions();
      return;
    }
    const view = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
    const root = view ? this.getReadingRoot(view) : null;
    if (view && root) {
      const context = selectedReadingContext(root);
      if (context) {
        this.cachedReadingSelection = { ...context, source: "reading", view, filePath: view.file?.path ?? null };
        this.showReadingActions();
      } else if (!this.cachedReadingSelection || !this.isReadingSnapshotValid(this.cachedReadingSelection) || clearEmptySelection && this.readingPointerInNote) {
        this.cachedReadingSelection = null;
        this.hideReadingActions();
      }
      return;
    }
    this.cachedReadingSelection = null;
    this.hideReadingActions();
    const editor = this.getActiveEditor();
    if (!editor) {
      this.cachedSelection = null;
      return;
    }
    const snapshot = this.readCurrentSelection(editor);
    if (snapshot) {
      this.cachedSelection = snapshot;
      debugLog(`captureCurrentSelection(${source}): cached editor range`);
    } else if (clearEmptySelection && editor.hasFocus() && !this.preserveSelectionForUI || this.cachedSelection?.editor !== editor) {
      this.cachedSelection = null;
    }
  }
  // ───────────────────────── Modal entry point ──────────────────
  installActiveReadingButtons() {
    const view = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
    const root = view ? this.getReadingRoot(view) : null;
    if (root) this.installReadingButtons(root);
  }
  installReadingButtons(element) {
    const blocks = Array.from(element.querySelectorAll(READING_BLOCKS));
    if (element.matches(READING_BLOCKS)) blocks.unshift(element);
    for (const block of blocks) {
      if (block.closest(".metadata-container,.frontmatter")) continue;
      if (block.matches("li,td,th") && block.querySelector("p")) continue;
      const existingButton = Array.from(block.children).find((child) => child.matches(".deepl-translate-block-action"));
      if (!isEnglishReadingText(renderedText(block))) {
        existingButton?.remove();
        continue;
      }
      if (existingButton) continue;
      const button = block.ownerDocument.createElement("button");
      button.className = "deepl-translate-block-action";
      button.type = "button";
      button.textContent = this.isChinese() ? "\u8BD1" : "Tr";
      button.title = this.isChinese() ? "\u7FFB\u8BD1\u6574\u4E2A\u6807\u9898\u6216\u6BB5\u843D" : "Translate this heading or paragraph";
      button.setAttribute("aria-label", button.title);
      button.addEventListener("pointerdown", (event) => event.stopPropagation());
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const view = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
        const root = view ? this.getReadingRoot(view) : null;
        const context = blockContext(block);
        if (view && root?.contains(block) && context && isEnglishReadingText(context.text)) {
          void this.openSnapshot({ ...context, source: "reading", view, filePath: view.file?.path ?? null });
        }
      });
      block.prepend(button);
    }
  }
  isChinese() {
    return (0, import_obsidian.getLanguage)().startsWith("zh");
  }
  getReadingRoot(view) {
    return view.getMode?.() === "preview" ? view.previewMode?.containerEl ?? null : null;
  }
  isReadingSnapshotValid(snapshot) {
    const view = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
    const root = view ? this.getReadingRoot(view) : null;
    return view === snapshot.view && (view?.file?.path ?? null) === snapshot.filePath && !!root?.contains(snapshot.block) && snapshot.block.isConnected && renderedText(snapshot.block) === snapshot.blockText;
  }
  hideReadingActions() {
    this.readingActions?.remove();
    this.readingActions = null;
  }
  showReadingActions() {
    if (this.readingActions || !this.cachedReadingSelection) return;
    const doc = this.cachedReadingSelection.block.ownerDocument;
    const actions = doc.createElement("div");
    actions.className = "deepl-reading-actions";
    actions.setAttribute("role", "toolbar");
    actions.setAttribute("aria-label", this.isChinese() ? "\u7FFB\u8BD1" : "Translate");
    for (const [scope, label] of [
      ["text", this.isChinese() ? "\u7FFB\u8BD1\u9009\u4E2D" : "Selection"],
      ["sentenceText", this.isChinese() ? "\u7FFB\u8BD1\u6574\u53E5" : "Sentence"],
      ["paragraphText", this.isChinese() ? "\u7FFB\u8BD1\u6574\u6BB5" : "Paragraph"]
    ]) {
      const button = doc.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      button.addEventListener("click", () => {
        const snapshot = this.cachedReadingSelection;
        if (snapshot && this.isReadingSnapshotValid(snapshot)) {
          void this.openSnapshot({ ...snapshot, text: snapshot[scope] });
        } else {
          this.hideReadingActions();
        }
      });
      actions.append(button);
    }
    doc.body.append(actions);
    this.readingActions = actions;
  }
  async openActiveTranslation() {
    const view = this.app.workspace.getActiveViewOfType(import_obsidian.MarkdownView);
    const root = view ? this.getReadingRoot(view) : null;
    if (view && root) {
      const context = selectedReadingContext(root);
      const snapshot = context ? { ...context, source: "reading", view, filePath: view.file?.path ?? null } : this.cachedReadingSelection;
      if (snapshot && this.isReadingSnapshotValid(snapshot)) {
        await this.openSnapshot(snapshot);
      } else {
        new import_obsidian.Notice(this.isChinese() ? "\u957F\u6309\u9009\u4E2D\u6587\u5B57\uFF0C\u6216\u70B9\u51FB\u6807\u9898/\u6BB5\u843D\u65C1\u7684\u201C\u8BD1\u201D\u6309\u94AE\u3002" : "Select text, or tap Tr beside a heading or paragraph.");
      }
      return;
    }
    const editor = this.getActiveEditor();
    if (editor) await this.openTranslationModal(editor);
    else new import_obsidian.Notice("Open a note and select some text first.");
  }
  async openTranslationModal(editor) {
    const resolvedSnapshot = this.buildSnapshot(editor);
    if (!resolvedSnapshot) {
      new import_obsidian.Notice("Select some text first.");
      return;
    }
    await this.openSnapshot(resolvedSnapshot);
  }
  async openSnapshot(resolvedSnapshot) {
    if (this.translationModalOpen) return;
    if (resolvedSnapshot.source === "reading" && !this.isReadingSnapshotValid(resolvedSnapshot)) return;
    const activeApiKey = this.settings.translationProvider === "deepl" ? this.settings.apiKey.trim() : this.settings.deepseekApiKey.trim();
    if (!activeApiKey) {
      new import_obsidian.Notice("API key is not configured.");
      this.openPluginSettings();
      return;
    }
    debugLog("Opening modal with text:", JSON.stringify(resolvedSnapshot.text.slice(0, 100)));
    this.hideReadingActions();
    this.cachedReadingSelection = null;
    const modal = new TranslationResultModal(this.app, this, resolvedSnapshot);
    this.translationModalOpen = true;
    modal.open();
    await modal.translate();
  }
  onTranslationModalClosed() {
    this.translationModalOpen = false;
    this.cachedReadingSelection = null;
    this.cachedSelection = null;
    this.hideReadingActions();
  }
  /**
   * Build a snapshot for the command-palette / hotkey path
   * (where no snapshot is pre-built by the menu handler).
   */
  buildSnapshot(editor) {
    const live = this.readCurrentSelection(editor);
    const cached = this.cachedSelection;
    this.cachedSelection = null;
    this.preserveSelectionForUI = false;
    if (live) return live;
    if (!cached || cached.editor !== editor) return null;
    const cursor = editor.getCursor();
    const atBoundary = [cached.from, cached.to].some(
      (pos) => pos.line === cursor.line && pos.ch === cursor.ch
    );
    if (!atBoundary || !this.isSnapshotValid(cached)) {
      return null;
    }
    return cached;
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
  getTargetLanguageLabel(targetLang) {
    switch (targetLang) {
      case "ZH":
        return "Chinese";
      case "EN-US":
        return "English";
      default:
        return "Chinese";
    }
  }
  getProviderLabel() {
    return this.settings.translationProvider === "deepl" ? "DeepL" : "LLM";
  }
  async translateText(text) {
    if (this.settings.translationProvider === "deepseek") {
      return this.translateWithDeepSeek(text);
    }
    return this.translateWithDeepL(text);
  }
  // ── DeepL translation ─────────────────────────────────────────
  async translateWithDeepL(text) {
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
        throw new DeepLError(this.getDeepLErrorMessage(response), response.status);
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
  // ── DeepSeek / OpenAI-compatible translation ──────────────────
  async translateWithDeepSeek(text) {
    const apiKey = this.settings.deepseekApiKey.trim();
    const baseUrl = this.settings.deepseekBaseUrl.replace(/\/+$/, "");
    const endpoint = `${baseUrl}/chat/completions`;
    const targetLang = this.getTargetLanguage(text);
    const targetLangLabel = this.getTargetLanguageLabel(targetLang);
    const systemPrompt = this.buildTranslationSystemPrompt(targetLangLabel);
    const requestBody = {
      model: this.settings.deepseekModel,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Translate the following text to ${targetLangLabel}:

${text}`
        }
      ],
      temperature: this.settings.deepseekTemperature,
      stream: false
    };
    try {
      const timeoutMs = Math.max(this.settings.requestTimeoutMs, 6e4);
      const response = await this.withTimeout(
        (0, import_obsidian.requestUrl)({
          url: endpoint,
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(requestBody),
          throw: false
        }),
        timeoutMs
      );
      if (response.status >= 400) {
        throw new DeepLError(this.getLLMErrorMessage(response), response.status);
      }
      const payload = response.json;
      const translation = payload.choices?.[0]?.message?.content?.trim();
      if (!translation) {
        throw new DeepLError("LLM returned an empty translation.");
      }
      return translation;
    } catch (error) {
      if (error instanceof DeepLError) {
        throw error;
      }
      throw new DeepLError("LLM request failed. Check your network connection and try again.");
    }
  }
  buildTranslationSystemPrompt(targetLangLabel) {
    const customPrompt = this.settings.deepseekCustomSystemPrompt.trim();
    if (customPrompt) {
      return customPrompt.replace(/\{\{targetLang\}\}/g, targetLangLabel);
    }
    return DEFAULT_TRANSLATION_SYSTEM_PROMPT.replace(
      /\{\{targetLang\}\}/g,
      targetLangLabel
    );
  }
  // ── Error helpers ─────────────────────────────────────────────
  getDeepLErrorMessage(response) {
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
  getLLMErrorMessage(response) {
    const payload = response.json;
    const apiMessage = payload?.error?.message;
    if (apiMessage) {
      return apiMessage;
    }
    if (response.status === 401 || response.status === 403) {
      return "LLM API rejected the API key. Check the key in plugin settings.";
    }
    if (response.status === 429) {
      return "LLM API rate limit reached. Wait a moment and try again.";
    }
    if (response.status >= 500) {
      return "LLM API is temporarily unavailable. Try again later.";
    }
    return response.text ?? `LLM request failed with status ${response.status}.`;
  }
  async withTimeout(promise, timeoutMs) {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = window.setTimeout(() => {
        reject(new DeepLError("Translation request timed out."));
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
    this._snap = snap.source === "reading" ? { ...snap } : {
      ...snap,
      from: { ...snap.from },
      to: { ...snap.to }
    };
    debugLog("Modal constructor: _snap.text =", JSON.stringify(this._snap.text.slice(0, 80)));
  }
  onOpen() {
    this.modalEl.addClass("deepl-translate-modal");
    this.titleEl.setText("Translate");
    this.contentEl.empty();
    this.contentEl.addClass("deepl-translate-modal-content");
    debugLog("onOpen: _snap.text =", JSON.stringify(this._snap.text.slice(0, 80)));
    const providerLabel = this.plugin.getProviderLabel();
    this.sourceTextArea = this.createTextAreaField("Original text", this._snap.text);
    this.translationTextArea = this.createTextAreaField("Translated text", "Translating...");
    this.statusEl = this.contentEl.createDiv({
      cls: "deepl-translate-status",
      text: `Sending text to ${providerLabel}...`
    });
    const actions = this.contentEl.createDiv({ cls: "deepl-translate-actions" });
    if (this._snap.source !== "reading") {
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
    }
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
  onClose() {
    this.plugin.onTranslationModalClosed();
    this.contentEl.empty();
  }
  async translate() {
    try {
      const providerLabel = this.plugin.getProviderLabel();
      debugLog(`translate(): sending to ${providerLabel}:`, JSON.stringify(this._snap.text.slice(0, 100)));
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
    if (this.insertButton) this.insertButton.disabled = false;
    if (this.replaceButton) this.replaceButton.disabled = false;
    this.copyButton.disabled = false;
  }
  insertBelow() {
    if (this._snap.source === "reading") return;
    if (!this.isSelectionUnchanged()) return;
    const insertion = `
${this.translatedText}`;
    this._snap.editor.replaceRange(insertion, this._snap.to);
    new import_obsidian.Notice("Inserted translation below the selection.");
    this.close();
  }
  replaceSelection() {
    if (this._snap.source === "reading") return;
    if (!this.isSelectionUnchanged()) return;
    this._snap.editor.replaceRange(this.translatedText, this._snap.from, this._snap.to);
    new import_obsidian.Notice("Replaced the selected text with the translation.");
    this.close();
  }
  async copyTranslation() {
    try {
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(this.translatedText);
          new import_obsidian.Notice("Translation copied to clipboard.");
          return;
        } catch {
        }
      }
      const doc = this.translationTextArea.ownerDocument;
      const previousFocus = doc.activeElement;
      this.translationTextArea.focus();
      this.translationTextArea.select();
      const copied = typeof doc.execCommand === "function" && doc.execCommand("copy");
      if (copied) {
        if (previousFocus instanceof HTMLElement) previousFocus.focus();
        new import_obsidian.Notice("Translation copied to clipboard.");
        return;
      }
      new import_obsidian.Notice("Could not copy automatically. Long-press or select the translated text to copy it.");
    } catch {
      new import_obsidian.Notice("Could not copy automatically. Long-press or select the translated text to copy it.");
    }
  }
  isSelectionUnchanged() {
    if (this._snap.source === "reading") return false;
    if (this.plugin.isSnapshotValid(this._snap)) {
      return true;
    }
    new import_obsidian.Notice("The original note or text changed. Select it again and retry the translation.");
    return false;
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
    new import_obsidian.Setting(containerEl).setName("Translation provider").setDesc("Choose the translation engine to use.").addDropdown((dropdown) => {
      dropdown.addOption("deepl", "DeepL").addOption("deepseek", "DeepSeek / OpenAI compatible").setValue(this.plugin.settings.translationProvider).onChange(async (value) => {
        this.plugin.settings.translationProvider = value;
        await this.plugin.saveSettings();
        this.toggleProviderSections();
      });
    });
    this.deeplSection = containerEl.createDiv({ cls: "deepl-translate-provider-section" });
    new import_obsidian.Setting(this.deeplSection).setName("DeepL").setHeading();
    new import_obsidian.Setting(this.deeplSection).setName("API key").setDesc(
      "Stored in this vault's plugin data. Keys ending in :fx use the free endpoint automatically."
    ).addText((text) => {
      text.setPlaceholder("Paste your DeepL API key");
      text.setValue(this.plugin.settings.apiKey);
      text.inputEl.type = "password";
      text.inputEl.addClass("deepl-setting-api-key-input");
      text.onChange(async (value) => {
        this.plugin.settings.apiKey = value.trim();
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian.Setting(this.deeplSection).setName("Model type").setDesc("Pinned to quality_optimized for v1.").addDropdown((dropdown) => {
      dropdown.addOption("quality_optimized", "Quality optimized").setValue(this.plugin.settings.modelType).onChange(async (value) => {
        this.plugin.settings.modelType = value;
        await this.plugin.saveSettings();
      });
    });
    this.deepseekSection = containerEl.createDiv({ cls: "deepl-translate-provider-section" });
    new import_obsidian.Setting(this.deepseekSection).setName("DeepSeek / OpenAI compatible").setHeading();
    new import_obsidian.Setting(this.deepseekSection).setName("API key").setDesc("Your DeepSeek or OpenAI-compatible API key.").addText((text) => {
      text.setPlaceholder("Paste your API key");
      text.setValue(this.plugin.settings.deepseekApiKey);
      text.inputEl.type = "password";
      text.inputEl.addClass("deepl-setting-api-key-input");
      text.onChange(async (value) => {
        this.plugin.settings.deepseekApiKey = value.trim();
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian.Setting(this.deepseekSection).setName("Model").setDesc("Model identifier (e.g. deepseek-v4-flash, gpt-4o).").addText((text) => {
      text.setPlaceholder(DEFAULT_SETTINGS.deepseekModel);
      text.setValue(this.plugin.settings.deepseekModel);
      text.onChange(async (value) => {
        this.plugin.settings.deepseekModel = value.trim() || DEFAULT_SETTINGS.deepseekModel;
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian.Setting(this.deepseekSection).setName("Temperature").setDesc(
      "Lower values produce more consistent translations (0.0\u20132.0). Recommended: 0.3."
    ).addText((text) => {
      text.setPlaceholder(String(DEFAULT_SETTINGS.deepseekTemperature));
      text.setValue(String(this.plugin.settings.deepseekTemperature));
      text.onChange(async (value) => {
        const parsed = Number.parseFloat(value);
        this.plugin.settings.deepseekTemperature = Number.isFinite(parsed) && parsed >= 0 && parsed <= 2 ? parsed : DEFAULT_SETTINGS.deepseekTemperature;
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian.Setting(this.deepseekSection).setName("API base URL").setDesc("DeepSeek or any OpenAI-compatible endpoint.").addText((text) => {
      text.setPlaceholder(DEFAULT_SETTINGS.deepseekBaseUrl);
      text.setValue(this.plugin.settings.deepseekBaseUrl);
      text.onChange(async (value) => {
        this.plugin.settings.deepseekBaseUrl = value.trim() || DEFAULT_SETTINGS.deepseekBaseUrl;
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian.Setting(this.deepseekSection).setName("Custom system prompt").setDesc(
      "Override the built-in translation prompt. Use {{targetLang}} as a placeholder for the target language. Leave empty to use the default."
    ).addTextArea((textArea) => {
      textArea.setPlaceholder("Leave empty to use the built-in prompt");
      textArea.setValue(this.plugin.settings.deepseekCustomSystemPrompt);
      textArea.inputEl.addClass("deepl-translate-system-prompt-textarea");
      textArea.onChange(async (value) => {
        this.plugin.settings.deepseekCustomSystemPrompt = value;
        await this.plugin.saveSettings();
      });
    });
    new import_obsidian.Setting(containerEl).setName("Common").setHeading();
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
      dropdown.addOption("ZH", "Chinese").addOption("EN-US", "English").setValue(this.plugin.settings.fallbackTargetLang).onChange(async (value) => {
        this.plugin.settings.fallbackTargetLang = value;
        await this.plugin.saveSettings();
      });
    });
    this.toggleProviderSections();
  }
  toggleProviderSections() {
    const isDeepL = this.plugin.settings.translationProvider === "deepl";
    this.deeplSection.style.display = isDeepL ? "block" : "none";
    this.deepseekSection.style.display = isDeepL ? "none" : "block";
  }
};
