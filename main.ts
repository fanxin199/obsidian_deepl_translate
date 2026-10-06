import {
  App,
  Editor,
  EditorPosition,
  MarkdownView,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  RequestUrlResponse,
  Setting,
  editorInfoField,
  getLanguage,
  requestUrl,
} from "obsidian";
import { EditorView, ViewPlugin, ViewUpdate } from "@codemirror/view";
import {
  READING_BLOCKS, blockContext, isEnglishReadingText, renderedText, selectedReadingContext,
  ReadingSelectionSnapshot,
} from "./reading-selection";

type TargetLang = "ZH" | "EN-US";
type ModelType = "quality_optimized";
type TranslationProvider = "deepl" | "deepseek";

interface DeepLTranslateSettings {
  // General
  translationProvider: TranslationProvider;
  requestTimeoutMs: number;
  fallbackTargetLang: TargetLang;

  // DeepL
  apiKey: string;
  modelType: ModelType;

  // DeepSeek / OpenAI-compatible
  deepseekApiKey: string;
  deepseekModel: string;
  deepseekTemperature: number;
  deepseekBaseUrl: string;
  deepseekCustomSystemPrompt: string;
}

interface TranslateResponse {
  translations?: Array<{
    text: string;
    detected_source_language?: string;
    model_type_used?: string;
  }>;
  message?: string;
  detail?: string;
}

interface DeepSeekChatResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
    type?: string;
  };
}

interface SelectionSnapshot {
  editor: Editor;
  filePath: string | null;
  from: EditorPosition;
  to: EditorPosition;
  text: string;
  source: "editor" | "native";
}

type TranslationSnapshot = SelectionSnapshot | ReadingSelectionSnapshot;

const DEFAULT_SETTINGS: DeepLTranslateSettings = {
  translationProvider: "deepl",
  apiKey: "",
  requestTimeoutMs: 15000,
  fallbackTargetLang: "ZH",
  modelType: "quality_optimized",
  deepseekApiKey: "",
  deepseekModel: "deepseek-v4-flash",
  deepseekTemperature: 0.3,
  deepseekBaseUrl: "https://api.deepseek.com",
  deepseekCustomSystemPrompt: "",
};

const DEFAULT_TRANSLATION_SYSTEM_PROMPT = `You are a professional, native-speaking {{targetLang}} translator.

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

const DEBUG = false;
const BUILD_ID = "v1.3.1";

function debugLog(...args: unknown[]): void {
  if (DEBUG) {
    console.debug(`[DeepL Translate ${BUILD_ID}]`, ...args);
  }
}

class DeepLError extends Error {
  status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = "DeepLError";
    this.status = status;
  }
}

/**
 * Sanitize any value that is supposed to be selected text.
 * Returns a clean string, or "" if the value is garbage.
 */
function sanitizeText(value: unknown): string {
  // Not a string at all (undefined, null, number, object, etc.)
  if (typeof value !== "string") {
    return "";
  }

  // JavaScript stringified sentinel values
  if (
    value === "undefined" ||
    value === "null" ||
    value === "[object Object]"
  ) {
    return "";
  }

  // Empty or whitespace-only
  if (!value.trim()) {
    return "";
  }

  return value;
}

export default class DeepLTranslateSelectionPlugin extends Plugin {
  settings: DeepLTranslateSettings = DEFAULT_SETTINGS;

  // Keep positions and editor identity together when a toolbar or menu takes focus.
  private cachedSelection: SelectionSnapshot | null = null;
  private preserveSelectionForUI = false;
  private selectionCaptureTimer: number | undefined;
  private editorViews = new Set<EditorView>();
  private cachedReadingSelection: ReadingSelectionSnapshot | null = null;
  private readingActions: HTMLElement | null = null;
  private readingPointerInNote = false;
  private translationModalOpen = false;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.addSettingTab(new DeepLTranslateSettingTab(this.app, this));

    // ── Command palette / hotkey ────────────────────────────────
    this.addCommand({
      id: "translate-selection",
      name: "Translate selection",
      checkCallback: (checking: boolean) => {
        const available = !!this.app.workspace.getActiveViewOfType(MarkdownView) || !!this.getActiveEditor();
        if (!checking && available) void this.openActiveTranslation();
        return available;
      },
    });

    // Pointer events cover both a Windows mouse and Android touch input.
    // Capture before a ribbon button, mobile toolbar, or menu takes focus.
    this.registerDomEvent(document, "pointerdown", (evt: PointerEvent) => {
      const view = this.app.workspace.getActiveViewOfType(MarkdownView);
      const root = view ? this.getReadingRoot(view) : null;
      this.readingPointerInNote = !!root && evt.target instanceof HTMLElement
        && root.contains(evt.target) && !evt.target.closest(".deepl-translate-block-action");
      this.preserveSelectionForUI = !(evt.target instanceof HTMLElement
        && evt.target.closest(".cm-editor"));
      this.captureCurrentSelection("pointerdown");
    }, true);
    this.registerDomEvent(document, "contextmenu", () => {
      this.captureCurrentSelection("contextmenu");
    }, true);

    const scheduleCapture = () => {
      window.clearTimeout(this.selectionCaptureTimer);
      // Let the editor update its selection before reading its cursor positions.
      this.selectionCaptureTimer = window.setTimeout(() => {
        this.selectionCaptureTimer = undefined;
        this.captureCurrentSelection("selection change", true);
      }, 0);
    };
    const plugin = this;
    this.registerEditorExtension(ViewPlugin.fromClass(class {
      constructor(readonly view: EditorView) {
        plugin.editorViews.add(view);
      }
      update(update: ViewUpdate): void {
        if (update.selectionSet || update.docChanged) scheduleCapture();
      }
      destroy(): void {
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

    // ── Right-click context menu entry ─────────────────────────
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor) => {
        debugLog("editor-menu triggered");

        const snapshot = this.buildSnapshot(editor);
        if (!snapshot) {
          debugLog("No text found → menu item not added");
          return;
        }

        // Android opens the menu on the initial word, before selection handles
        // finish expanding the range. Retain it only as a fallback, not a frozen
        // argument to the menu callback, and keep tracking subsequent changes.
        this.cachedSelection = snapshot;
        this.preserveSelectionForUI = true;

        menu.addItem((item) => {
          item
            .setTitle("Translate")
            .setIcon("languages")
            .onClick(() => {
              void this.openTranslationModal(editor);
            });
        });
      }),
    );
  }

  // ───────────────────────── Selection capture ──────────────────

  private getActiveEditor(): Editor | null {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (view?.getMode?.() === "preview") return null;
    return this.app.workspace.activeEditor?.editor
      ?? view?.editor
      ?? null;
  }

  private readEditorSelection(editor: Editor): SelectionSnapshot | null {
    const from = { ...editor.getCursor("from") };
    const to = { ...editor.getCursor("to") };
    if (from.line === to.line && from.ch === to.ch) {
      return null;
    }
    // Use the editor range, not window.getSelection(): DOM selection can belong
    // to a dialog or settings field and has no reliable note coordinates.
    const text = sanitizeText(editor.getRange(from, to));
    return text ? { editor, filePath: this.getEditorFilePath(editor), from, to, text, source: "editor" } : null;
  }

  private readNativeSelection(editor: Editor): SelectionSnapshot | null {
    for (const view of this.editorViews) {
      if (view.state.field(editorInfoField, false)?.editor !== editor) continue;
      const selection = view.contentDOM.ownerDocument.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount !== 1) continue;
      const range = selection.getRangeAt(0);
      // Never accept selections from settings, dialogs, or a different editor.
      if (!view.contentDOM.contains(range.startContainer)
        || !view.contentDOM.contains(range.endContainer)) continue;
      try {
        // Android's native handles can move before CodeMirror commits selection
        // state. Convert the visible DOM range to exact note offsets using its
        // registered editor view, including reversed and multiline selections.
        const start = view.posAtDOM(range.startContainer, range.startOffset);
        const end = view.posAtDOM(range.endContainer, range.endOffset);
        const from = editor.offsetToPos(Math.min(start, end));
        const to = editor.offsetToPos(Math.max(start, end));
        const text = sanitizeText(editor.getRange(from, to));
        if (text) {
          return { editor, filePath: this.getEditorFilePath(editor), from, to, text, source: "native" };
        }
      } catch {
        // An unmounted/widget DOM node cannot provide reliable source positions.
        // Fall back to the editor selection without guessing from a text search.
      }
    }
    return null;
  }

  private readCurrentSelection(editor: Editor): SelectionSnapshot | null {
    const native = this.readNativeSelection(editor);
    if (native) return native;
    const live = this.readEditorSelection(editor);
    const cached = this.cachedSelection;
    if (live && (this.preserveSelectionForUI || !editor.hasFocus()) && cached?.source === "native"
      && this.isSnapshotValid(cached)) {
      const beforeOrEqual = (a: EditorPosition, b: EditorPosition) =>
        a.line < b.line || (a.line === b.line && a.ch <= b.ch);
      if (beforeOrEqual(cached.from, live.from) && beforeOrEqual(live.to, cached.to)) {
        // Once UI takes focus, the API may still report the initial word. Do not
        // overwrite a newer native range with that stale subset. A new native
        // selection or a pointer action inside the note always takes precedence.
        return cached;
      }
    }
    return live;
  }

  private getEditorFilePath(editor: Editor): string | null {
    const active = this.app.workspace.activeEditor;
    if (active?.editor === editor) return active.file?.path ?? null;
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    return view?.editor === editor ? view.file?.path ?? null : null;
  }

  isSnapshotValid(snapshot: SelectionSnapshot): boolean {
    return this.getActiveEditor() === snapshot.editor
      && this.getEditorFilePath(snapshot.editor) === snapshot.filePath
      && snapshot.editor.getRange(snapshot.from, snapshot.to) === snapshot.text;
  }

  private captureCurrentSelection(source: string, clearEmptySelection = false): void {
    if (this.translationModalOpen) {
      this.hideReadingActions();
      return;
    }
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const root = view ? this.getReadingRoot(view) : null;
    if (view && root) {
      const context = selectedReadingContext(root);
      if (context) {
        this.cachedReadingSelection = { ...context, source: "reading", view, filePath: view.file?.path ?? null };
        this.showReadingActions();
      } else if (!this.cachedReadingSelection || !this.isReadingSnapshotValid(this.cachedReadingSelection)
        || (clearEmptySelection && this.readingPointerInNote)) {
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
    } else if ((clearEmptySelection && editor.hasFocus() && !this.preserveSelectionForUI)
      || this.cachedSelection?.editor !== editor) {
      // A caret move inside the note deselects text. Losing focus to a menu
      // should instead preserve the range until the translation command runs.
      this.cachedSelection = null;
    }
  }

  // ───────────────────────── Modal entry point ──────────────────

  private installActiveReadingButtons(): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const root = view ? this.getReadingRoot(view) : null;
    if (root) this.installReadingButtons(root);
  }

  private installReadingButtons(element: HTMLElement): void {
    const blocks = Array.from(element.querySelectorAll<HTMLElement>(READING_BLOCKS));
    if (element.matches(READING_BLOCKS)) blocks.unshift(element);
    for (const block of blocks) {
      if (block.closest(".metadata-container,.frontmatter")) continue;
      // Nested paragraphs get their own action; do not duplicate it on a list
      // item/table cell that contains paragraphs.
      if (block.matches("li,td,th") && block.querySelector("p")) continue;
      const existingButton = Array.from(block.children)
        .find((child) => child.matches(".deepl-translate-block-action"));
      if (!isEnglishReadingText(renderedText(block))) {
        existingButton?.remove();
        continue;
      }
      if (existingButton) continue;
      const button = block.ownerDocument.createElement("button");
      button.className = "deepl-translate-block-action";
      button.type = "button";
      button.textContent = this.isChinese() ? "译" : "Tr";
      button.title = this.isChinese() ? "翻译整个标题或段落" : "Translate this heading or paragraph";
      button.setAttribute("aria-label", button.title);
      button.addEventListener("pointerdown", (event) => event.stopPropagation());
      button.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        const root = view ? this.getReadingRoot(view) : null;
        const context = blockContext(block);
        if (view && root?.contains(block) && context && isEnglishReadingText(context.text)) {
          void this.openSnapshot({ ...context, source: "reading", view, filePath: view.file?.path ?? null });
        }
      });
      block.prepend(button);
    }
  }

  private isChinese(): boolean {
    return getLanguage().startsWith("zh");
  }

  private getReadingRoot(view: MarkdownView): HTMLElement | null {
    return view.getMode?.() === "preview" ? view.previewMode?.containerEl ?? null : null;
  }

  private isReadingSnapshotValid(snapshot: ReadingSelectionSnapshot): boolean {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const root = view ? this.getReadingRoot(view) : null;
    return view === snapshot.view && (view?.file?.path ?? null) === snapshot.filePath
      && !!root?.contains(snapshot.block) && snapshot.block.isConnected
      && renderedText(snapshot.block) === snapshot.blockText;
  }

  private hideReadingActions(): void {
    this.readingActions?.remove();
    this.readingActions = null;
  }

  private showReadingActions(): void {
    if (this.readingActions || !this.cachedReadingSelection) return;
    const doc = this.cachedReadingSelection.block.ownerDocument;
    const actions = doc.createElement("div");
    actions.className = "deepl-reading-actions";
    actions.setAttribute("role", "toolbar");
    actions.setAttribute("aria-label", this.isChinese() ? "翻译" : "Translate");
    for (const [scope, label] of [
      ["text", this.isChinese() ? "翻译选中" : "Selection"],
      ["sentenceText", this.isChinese() ? "翻译整句" : "Sentence"],
      ["paragraphText", this.isChinese() ? "翻译整段" : "Paragraph"],
    ] as const) {
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

  private async openActiveTranslation(): Promise<void> {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    const root = view ? this.getReadingRoot(view) : null;
    if (view && root) {
      const context = selectedReadingContext(root);
      const snapshot: ReadingSelectionSnapshot | null = context
        ? { ...context, source: "reading", view, filePath: view.file?.path ?? null }
        : this.cachedReadingSelection;
      if (snapshot && this.isReadingSnapshotValid(snapshot)) {
        await this.openSnapshot(snapshot);
      } else {
        new Notice(this.isChinese() ? "长按选中文字，或点击标题/段落旁的“译”按钮。" : "Select text, or tap Tr beside a heading or paragraph.");
      }
      return;
    }
    const editor = this.getActiveEditor();
    if (editor) await this.openTranslationModal(editor);
    else new Notice("Open a note and select some text first.");
  }

  async openTranslationModal(editor: Editor): Promise<void> {
    const resolvedSnapshot = this.buildSnapshot(editor);
    if (!resolvedSnapshot) {
      new Notice("Select some text first.");
      return;
    }

    await this.openSnapshot(resolvedSnapshot);
  }

  private async openSnapshot(resolvedSnapshot: TranslationSnapshot): Promise<void> {
    if (this.translationModalOpen) return;
    if (resolvedSnapshot.source === "reading" && !this.isReadingSnapshotValid(resolvedSnapshot)) return;

    const activeApiKey = this.settings.translationProvider === "deepl"
      ? this.settings.apiKey.trim()
      : this.settings.deepseekApiKey.trim();

    if (!activeApiKey) {
      new Notice("API key is not configured.");
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

  onTranslationModalClosed(): void {
    this.translationModalOpen = false;
    this.cachedReadingSelection = null;
    this.cachedSelection = null;
    this.hideReadingActions();
  }

  /**
   * Build a snapshot for the command-palette / hotkey path
   * (where no snapshot is pre-built by the menu handler).
   */
  private buildSnapshot(editor: Editor): SelectionSnapshot | null {
    const live = this.readCurrentSelection(editor);
    const cached = this.cachedSelection;
    this.cachedSelection = null; // Cached ranges may only be consumed once.
    this.preserveSelectionForUI = false;
    if (live) return live;
    if (!cached || cached.editor !== editor) return null;

    const cursor = editor.getCursor();
    const atBoundary = [cached.from, cached.to].some(
      (pos) => pos.line === cursor.line && pos.ch === cursor.ch,
    );
    if (!atBoundary || !this.isSnapshotValid(cached)) {
      return null;
    }
    return cached;
  }

  // ───────────────────────── Settings helpers ───────────────────

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  openPluginSettings(): void {
    const appWithSettings = this.app as App & {
      setting?: {
        open: () => void;
        openTabById: (id: string) => void;
      };
    };

    appWithSettings.setting?.open();
    appWithSettings.setting?.openTabById(this.manifest.id);
  }

  // ───────────────────────── Translation logic ──────────────────

  getTargetLanguage(text: string): TargetLang {
    if (/\p{Script=Han}/u.test(text)) {
      return "EN-US";
    }

    if (/[A-Za-z]/.test(text)) {
      return "ZH";
    }

    return this.settings.fallbackTargetLang;
  }

  private getTargetLanguageLabel(targetLang: TargetLang): string {
    switch (targetLang) {
      case "ZH":
        return "Chinese";
      case "EN-US":
        return "English";
      default:
        return "Chinese";
    }
  }

  getProviderLabel(): string {
    return this.settings.translationProvider === "deepl" ? "DeepL" : "LLM";
  }

  async translateText(text: string): Promise<string> {
    if (this.settings.translationProvider === "deepseek") {
      return this.translateWithDeepSeek(text);
    }
    return this.translateWithDeepL(text);
  }

  // ── DeepL translation ─────────────────────────────────────────

  private async translateWithDeepL(text: string): Promise<string> {
    const apiKey = this.settings.apiKey.trim();
    const endpoint = apiKey.endsWith(":fx")
      ? "https://api-free.deepl.com/v2/translate"
      : "https://api.deepl.com/v2/translate";
    const params = new URLSearchParams();
    params.append("text", text);
    params.append("target_lang", this.getTargetLanguage(text));
    params.append("model_type", this.settings.modelType);

    try {
      const response = await this.withTimeout(
        requestUrl({
          url: endpoint,
          method: "POST",
          headers: {
            Authorization: `DeepL-Auth-Key ${apiKey}`,
          },
          contentType: "application/x-www-form-urlencoded",
          body: params.toString(),
          throw: false,
        }),
        this.settings.requestTimeoutMs,
      );

      if (response.status >= 400) {
        throw new DeepLError(this.getDeepLErrorMessage(response), response.status);
      }

      const payload = response.json as TranslateResponse;
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

  private async translateWithDeepSeek(text: string): Promise<string> {
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
          content: `Translate the following text to ${targetLangLabel}:\n\n${text}`,
        },
      ],
      temperature: this.settings.deepseekTemperature,
      stream: false,
    };

    try {
      // LLMs are slower and prone to congestion; use a minimum of 60 seconds
      const timeoutMs = Math.max(this.settings.requestTimeoutMs, 60000);
      const response = await this.withTimeout(
        requestUrl({
          url: endpoint,
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
          throw: false,
        }),
        timeoutMs,
      );

      if (response.status >= 400) {
        throw new DeepLError(this.getLLMErrorMessage(response), response.status);
      }

      const payload = response.json as DeepSeekChatResponse;
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

  private buildTranslationSystemPrompt(targetLangLabel: string): string {
    const customPrompt = this.settings.deepseekCustomSystemPrompt.trim();
    if (customPrompt) {
      return customPrompt.replace(/\{\{targetLang\}\}/g, targetLangLabel);
    }
    return DEFAULT_TRANSLATION_SYSTEM_PROMPT.replace(
      /\{\{targetLang\}\}/g,
      targetLangLabel,
    );
  }

  // ── Error helpers ─────────────────────────────────────────────

  private getDeepLErrorMessage(response: RequestUrlResponse): string {
    const payload = response.json as TranslateResponse | undefined;
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

  private getLLMErrorMessage(response: RequestUrlResponse): string {
    const payload = response.json as DeepSeekChatResponse | undefined;
    
    // Prioritize specific error message from the API payload if available
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

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timeoutId: number | undefined;
    const timeoutPromise = new Promise<T>((_, reject) => {
      timeoutId = window.setTimeout(() => {
        reject(new DeepLError("Translation request timed out."));
      }, timeoutMs);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    }
  }
}

// ═══════════════════════════ Modal ═════════════════════════════

class TranslationResultModal extends Modal {
  private plugin: DeepLTranslateSelectionPlugin;
  // IMPORTANT: Do NOT name this "selection" — Modal parent class overwrites it in open().
  private _snap: TranslationSnapshot;
  private sourceTextArea!: HTMLTextAreaElement;
  private translationTextArea!: HTMLTextAreaElement;
  private statusEl!: HTMLDivElement;
  private insertButton?: HTMLButtonElement;
  private replaceButton?: HTMLButtonElement;
  private copyButton!: HTMLButtonElement;
  private translatedText = "";

  constructor(app: App, plugin: DeepLTranslateSelectionPlugin, snap: TranslationSnapshot) {
    super(app);
    this.plugin = plugin;
    this._snap = snap.source === "reading" ? { ...snap } : {
      ...snap, from: { ...snap.from }, to: { ...snap.to },
    };
    debugLog("Modal constructor: _snap.text =", JSON.stringify(this._snap.text.slice(0, 80)));
  }

  onOpen(): void {
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
      text: `Sending text to ${providerLabel}...`,
    });

    const actions = this.contentEl.createDiv({ cls: "deepl-translate-actions" });

    if (this._snap.source !== "reading") {
      this.insertButton = actions.createEl("button", {
        text: "Insert below",
        cls: "mod-cta",
      });
      this.insertButton.disabled = true;
      this.insertButton.addEventListener("click", () => {
        this.insertBelow();
      });

      this.replaceButton = actions.createEl("button", {
        text: "Replace selection",
      });
      this.replaceButton.disabled = true;
      this.replaceButton.addEventListener("click", () => {
        this.replaceSelection();
      });
    }

    this.copyButton = actions.createEl("button", {
      text: "Copy",
    });
    this.copyButton.disabled = true;
    this.copyButton.addEventListener("click", () => {
      void this.copyTranslation();
    });

    const cancelButton = actions.createEl("button", {
      text: "Cancel",
    });
    cancelButton.addEventListener("click", () => this.close());
  }

  onClose(): void {
    this.plugin.onTranslationModalClosed();
    this.contentEl.empty();
  }

  async translate(): Promise<void> {
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
      new Notice(message);
    }
  }

  private createTextAreaField(label: string, value: string): HTMLTextAreaElement {
    const wrapper = this.contentEl.createDiv({ cls: "deepl-translate-field" });
    wrapper.createDiv({
      cls: "deepl-translate-field-label",
      text: label,
    });

    const textArea = wrapper.createEl("textarea", {
      cls: "deepl-translate-textarea",
    });
    textArea.readOnly = true;
    textArea.value = value;
    return textArea;
  }

  private enableActions(): void {
    if (this.insertButton) this.insertButton.disabled = false;
    if (this.replaceButton) this.replaceButton.disabled = false;
    this.copyButton.disabled = false;
  }

  private insertBelow(): void {
    if (this._snap.source === "reading") return;
    if (!this.isSelectionUnchanged()) return;
    const insertion = `\n${this.translatedText}`;
    this._snap.editor.replaceRange(insertion, this._snap.to);
    new Notice("Inserted translation below the selection.");
    this.close();
  }

  private replaceSelection(): void {
    if (this._snap.source === "reading") return;
    if (!this.isSelectionUnchanged()) return;
    this._snap.editor.replaceRange(this.translatedText, this._snap.from, this._snap.to);
    new Notice("Replaced the selected text with the translation.");
    this.close();
  }

  private async copyTranslation(): Promise<void> {
    try {
      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(this.translatedText);
          new Notice("Translation copied to clipboard.");
          return;
        } catch {
          // Some Android WebViews expose Clipboard API but reject writes.
        }
      }

      const doc = this.translationTextArea.ownerDocument;
      const previousFocus = doc.activeElement;
      this.translationTextArea.focus();
      this.translationTextArea.select();
      const copied = typeof doc.execCommand === "function" && doc.execCommand("copy");
      if (copied) {
        if (previousFocus instanceof HTMLElement) previousFocus.focus();
        new Notice("Translation copied to clipboard.");
        return;
      }
      new Notice("Could not copy automatically. Long-press or select the translated text to copy it.");
    } catch {
      new Notice("Could not copy automatically. Long-press or select the translated text to copy it.");
    }
  }

  private isSelectionUnchanged(): boolean {
    if (this._snap.source === "reading") return false;
    if (this.plugin.isSnapshotValid(this._snap)) {
      return true;
    }
    new Notice("The original note or text changed. Select it again and retry the translation.");
    return false;
  }
}

// ═══════════════════════════ Settings ══════════════════════════

class DeepLTranslateSettingTab extends PluginSettingTab {
  plugin: DeepLTranslateSelectionPlugin;
  private deeplSection!: HTMLElement;
  private deepseekSection!: HTMLElement;

  constructor(app: App, plugin: DeepLTranslateSelectionPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // ── Translation Provider ────────────────────────────────────
    new Setting(containerEl)
      .setName("Translation provider")
      .setDesc("Choose the translation engine to use.")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("deepl", "DeepL")
          .addOption("deepseek", "DeepSeek / OpenAI compatible")
          .setValue(this.plugin.settings.translationProvider)
          .onChange(async (value) => {
            this.plugin.settings.translationProvider = value as TranslationProvider;
            await this.plugin.saveSettings();
            this.toggleProviderSections();
          });
      });

    // ── DeepL Section ───────────────────────────────────────────
    this.deeplSection = containerEl.createDiv({ cls: "deepl-translate-provider-section" });

    new Setting(this.deeplSection).setName("DeepL").setHeading();

    new Setting(this.deeplSection)
      .setName("API key")
      .setDesc(
        "Stored in this vault's plugin data. Keys ending in :fx use the free endpoint automatically.",
      )
      .addText((text) => {
        text.setPlaceholder("Paste your DeepL API key");
        text.setValue(this.plugin.settings.apiKey);
        text.inputEl.type = "password";
        text.inputEl.addClass("deepl-setting-api-key-input");
        text.onChange(async (value) => {
          this.plugin.settings.apiKey = value.trim();
          await this.plugin.saveSettings();
        });
      });

    new Setting(this.deeplSection)
      .setName("Model type")
      .setDesc("Pinned to quality_optimized for v1.")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("quality_optimized", "Quality optimized")
          .setValue(this.plugin.settings.modelType)
          .onChange(async (value) => {
            this.plugin.settings.modelType = value as ModelType;
            await this.plugin.saveSettings();
          });
      });

    // ── DeepSeek / OpenAI-compatible Section ────────────────────
    this.deepseekSection = containerEl.createDiv({ cls: "deepl-translate-provider-section" });

    new Setting(this.deepseekSection)
      .setName("DeepSeek / OpenAI compatible")
      .setHeading();

    new Setting(this.deepseekSection)
      .setName("API key")
      .setDesc("Your DeepSeek or OpenAI-compatible API key.")
      .addText((text) => {
        text.setPlaceholder("Paste your API key");
        text.setValue(this.plugin.settings.deepseekApiKey);
        text.inputEl.type = "password";
        text.inputEl.addClass("deepl-setting-api-key-input");
        text.onChange(async (value) => {
          this.plugin.settings.deepseekApiKey = value.trim();
          await this.plugin.saveSettings();
        });
      });

    new Setting(this.deepseekSection)
      .setName("Model")
      .setDesc("Model identifier (e.g. deepseek-v4-flash, gpt-4o).")
      .addText((text) => {
        text.setPlaceholder(DEFAULT_SETTINGS.deepseekModel);
        text.setValue(this.plugin.settings.deepseekModel);
        text.onChange(async (value) => {
          this.plugin.settings.deepseekModel =
            value.trim() || DEFAULT_SETTINGS.deepseekModel;
          await this.plugin.saveSettings();
        });
      });

    new Setting(this.deepseekSection)
      .setName("Temperature")
      .setDesc(
        "Lower values produce more consistent translations (0.0–2.0). Recommended: 0.3.",
      )
      .addText((text) => {
        text.setPlaceholder(String(DEFAULT_SETTINGS.deepseekTemperature));
        text.setValue(String(this.plugin.settings.deepseekTemperature));
        text.onChange(async (value) => {
          const parsed = Number.parseFloat(value);
          this.plugin.settings.deepseekTemperature =
            Number.isFinite(parsed) && parsed >= 0 && parsed <= 2
              ? parsed
              : DEFAULT_SETTINGS.deepseekTemperature;
          await this.plugin.saveSettings();
        });
      });

    new Setting(this.deepseekSection)
      .setName("API base URL")
      .setDesc("DeepSeek or any OpenAI-compatible endpoint.")
      .addText((text) => {
        text.setPlaceholder(DEFAULT_SETTINGS.deepseekBaseUrl);
        text.setValue(this.plugin.settings.deepseekBaseUrl);
        text.onChange(async (value) => {
          this.plugin.settings.deepseekBaseUrl =
            value.trim() || DEFAULT_SETTINGS.deepseekBaseUrl;
          await this.plugin.saveSettings();
        });
      });

    new Setting(this.deepseekSection)
      .setName("Custom system prompt")
      .setDesc(
        "Override the built-in translation prompt. Use {{targetLang}} as a placeholder for the target language. Leave empty to use the default.",
      )
      .addTextArea((textArea) => {
        textArea.setPlaceholder("Leave empty to use the built-in prompt");
        textArea.setValue(this.plugin.settings.deepseekCustomSystemPrompt);
        textArea.inputEl.addClass("deepl-translate-system-prompt-textarea");
        textArea.onChange(async (value) => {
          this.plugin.settings.deepseekCustomSystemPrompt = value;
          await this.plugin.saveSettings();
        });
      });

    // ── Common Settings ─────────────────────────────────────────
    new Setting(containerEl).setName("Common").setHeading();

    new Setting(containerEl)
      .setName("Request timeout (ms)")
      .setDesc("How long to wait before failing the request.")
      .addText((text) => {
        text.setPlaceholder(String(DEFAULT_SETTINGS.requestTimeoutMs));
        text.setValue(String(this.plugin.settings.requestTimeoutMs));
        text.onChange(async (value) => {
          const parsed = Number.parseInt(value, 10);
          this.plugin.settings.requestTimeoutMs =
            Number.isFinite(parsed) && parsed > 0
              ? parsed
              : DEFAULT_SETTINGS.requestTimeoutMs;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Fallback target language")
      .setDesc("Used when the source language cannot be detected automatically.")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("ZH", "Chinese")
          .addOption("EN-US", "English")
          .setValue(this.plugin.settings.fallbackTargetLang)
          .onChange(async (value) => {
            this.plugin.settings.fallbackTargetLang = value as TargetLang;
            await this.plugin.saveSettings();
          });
      });

    // Apply initial visibility
    this.toggleProviderSections();
  }

  private toggleProviderSections(): void {
    const isDeepL = this.plugin.settings.translationProvider === "deepl";
    this.deeplSection.style.display = isDeepL ? "block" : "none";
    this.deepseekSection.style.display = isDeepL ? "none" : "block";
  }
}
