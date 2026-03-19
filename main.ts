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
  requestUrl,
} from "obsidian";

type TargetLang = "ZH" | "EN-US";
type ModelType = "quality_optimized";

interface DeepLTranslateSettings {
  apiKey: string;
  requestTimeoutMs: number;
  fallbackTargetLang: TargetLang;
  modelType: ModelType;
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

interface SelectionSnapshot {
  editor: Editor;
  from: EditorPosition;
  to: EditorPosition;
  text: string;
}

const DEFAULT_SETTINGS: DeepLTranslateSettings = {
  apiKey: "",
  requestTimeoutMs: 15000,
  fallbackTargetLang: "ZH",
  modelType: "quality_optimized",
};

const DEBUG = false;
const BUILD_ID = "v2-20260319-1540";

function debugLog(...args: unknown[]): void {
  if (DEBUG) {
    console.log(`[DeepL Translate ${BUILD_ID}]`, ...args);
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

  /**
   * Cache for editor selection, captured at the earliest possible
   * moment (mousedown / contextmenu) before Obsidian clears it.
   */
  private cachedText = "";
  private cachedFrom: EditorPosition = { line: 0, ch: 0 };
  private cachedTo: EditorPosition = { line: 0, ch: 0 };

  async onload(): Promise<void> {
    await this.loadSettings();

    this.addSettingTab(new DeepLTranslateSettingTab(this.app, this));

    // ── Command palette / hotkey ────────────────────────────────
    this.addCommand({
      id: "deepl-translate-selection",
      name: "DeepL: Translate Selection",
      editorCallback: (editor: Editor) => {
        debugLog("editorCallback triggered");
        void this.openTranslationModal(editor);
      },
    });

    // ── Pre-capture on right-click mousedown (earliest event) ──
    this.registerDomEvent(document, "mousedown", (evt: MouseEvent) => {
      if (evt.button === 2) {
        // button 2 = right-click
        this.captureCurrentSelection("mousedown");
      }
    });

    // ── Pre-capture on contextmenu (fires after mousedown) ─────
    this.registerDomEvent(document, "contextmenu", () => {
      this.captureCurrentSelection("contextmenu");
    });

    // ── Right-click context menu entry ─────────────────────────
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor) => {
        debugLog("editor-menu triggered");

        const text = this.getSelectedText(editor, "editor-menu");
        if (!text) {
          debugLog("No text found → menu item not added");
          return;
        }

        // Snapshot the positions now so they're stable in the closure
        const snapshot: SelectionSnapshot = {
          editor,
          from: { ...this.cachedFrom },
          to: { ...this.cachedTo },
          text,
        };

        menu.addItem((item) => {
          item
            .setTitle("DeepL Translate")
            .setIcon("languages")
            .onClick(() => {
              debugLog("Menu item clicked, text =", JSON.stringify(snapshot.text));
              void this.openTranslationModal(editor, snapshot);
            });
        });
      }),
    );
  }

  // ───────────────────────── Selection capture ──────────────────

  /**
   * Capture the selection from the active MarkdownView editor.
   * Called as early as possible (mousedown / contextmenu).
   */
  private captureCurrentSelection(source: string): void {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view?.editor) {
      debugLog(`captureCurrentSelection(${source}): no active MarkdownView`);
      return;
    }

    const editor = view.editor;

    // Method 1: editor.getSelection()
    let text = sanitizeText(editor.getSelection());
    debugLog(
      `captureCurrentSelection(${source}): getSelection() →`,
      JSON.stringify(editor.getSelection()),
      "sanitized →",
      JSON.stringify(text),
    );

    // Method 2: range-based using cursors
    if (!text) {
      const from = editor.getCursor("from");
      const to = editor.getCursor("to");
      if (from.line !== to.line || from.ch !== to.ch) {
        text = sanitizeText(editor.getRange(from, to));
        debugLog(
          `captureCurrentSelection(${source}): getRange() →`,
          JSON.stringify(text),
        );
      }
    }

    // Method 3: DOM selection
    if (!text) {
      text = sanitizeText(window.getSelection()?.toString());
      debugLog(
        `captureCurrentSelection(${source}): DOM selection →`,
        JSON.stringify(text),
      );
    }

    if (text) {
      this.cachedText = text;
      this.cachedFrom = editor.getCursor("from");
      this.cachedTo = editor.getCursor("to");
      debugLog(`captureCurrentSelection(${source}): cached "${text.slice(0, 60)}…"`);
    }
  }

  /**
   * Get the selected text, trying the live editor first,
   * then falling back to the cache.
   */
  private getSelectedText(editor: Editor, source: string): string {
    // Try 1: direct editor.getSelection()
    let text = sanitizeText(editor.getSelection());
    if (text) {
      debugLog(`getSelectedText(${source}): got from editor.getSelection()`);
      this.cachedFrom = editor.getCursor("from");
      this.cachedTo = editor.getCursor("to");
      return text;
    }

    // Try 2: range-based
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

    // Try 3: DOM selection
    text = sanitizeText(window.getSelection()?.toString());
    if (text) {
      debugLog(`getSelectedText(${source}): got from DOM selection`);
      return text;
    }

    // Try 4: fall back to cached text from mousedown/contextmenu
    if (this.cachedText) {
      debugLog(`getSelectedText(${source}): using cached text`);
      text = this.cachedText;
      this.cachedText = ""; // consume once
      return text;
    }

    debugLog(`getSelectedText(${source}): nothing found`);
    return "";
  }

  // ───────────────────────── Modal entry point ──────────────────

  async openTranslationModal(editor: Editor, snapshot?: SelectionSnapshot): Promise<void> {
    const resolvedSnapshot = snapshot ?? this.buildSnapshot(editor);
    if (!resolvedSnapshot) {
      new Notice("Select some text before using DeepL Translate.");
      return;
    }

    if (!this.settings.apiKey.trim()) {
      new Notice("DeepL API key is not configured.");
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
  private buildSnapshot(editor: Editor): SelectionSnapshot | null {
    const text = this.getSelectedText(editor, "buildSnapshot");
    if (!text) {
      return null;
    }

    return {
      editor,
      from: { ...this.cachedFrom },
      to: { ...this.cachedTo },
      text,
    };
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

  async translateText(text: string): Promise<string> {
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
        throw new DeepLError(this.getErrorMessage(response), response.status);
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

  private getErrorMessage(response: RequestUrlResponse): string {
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

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timeoutId: number | undefined;
    const timeoutPromise = new Promise<T>((_, reject) => {
      timeoutId = window.setTimeout(() => {
        reject(new DeepLError("DeepL request timed out."));
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
  private _snap: SelectionSnapshot;
  private sourceTextArea!: HTMLTextAreaElement;
  private translationTextArea!: HTMLTextAreaElement;
  private statusEl!: HTMLDivElement;
  private insertButton!: HTMLButtonElement;
  private replaceButton!: HTMLButtonElement;
  private copyButton!: HTMLButtonElement;
  private translatedText = "";

  constructor(app: App, plugin: DeepLTranslateSelectionPlugin, snap: SelectionSnapshot) {
    super(app);
    this.plugin = plugin;
    this._snap = {
      editor: snap.editor,
      from: { ...snap.from },
      to: { ...snap.to },
      text: typeof snap.text === "string" ? snap.text : "",
    };
    debugLog("Modal constructor: _snap.text =", JSON.stringify(this._snap.text.slice(0, 80)));
  }

  onOpen(): void {
    this.modalEl.addClass("deepl-translate-modal");
    this.titleEl.setText("DeepL Translate");
    this.contentEl.empty();
    this.contentEl.addClass("deepl-translate-modal-content");

    debugLog("onOpen: _snap.text =", JSON.stringify(this._snap.text.slice(0, 80)));

    this.sourceTextArea = this.createTextAreaField("Original text", this._snap.text);
    this.translationTextArea = this.createTextAreaField("Translated text", "Translating...");
    this.statusEl = this.contentEl.createDiv({
      cls: "deepl-translate-status",
      text: "Sending text to DeepL...",
    });

    const actions = this.contentEl.createDiv({ cls: "deepl-translate-actions" });

    this.insertButton = actions.createEl("button", {
      text: "Insert Below",
      cls: "mod-cta",
    });
    this.insertButton.disabled = true;
    this.insertButton.addEventListener("click", () => {
      this.insertBelow();
    });

    this.replaceButton = actions.createEl("button", {
      text: "Replace Selection",
    });
    this.replaceButton.disabled = true;
    this.replaceButton.addEventListener("click", () => {
      this.replaceSelection();
    });

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

  async translate(): Promise<void> {
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
    this.insertButton.disabled = false;
    this.replaceButton.disabled = false;
    this.copyButton.disabled = false;
  }

  private insertBelow(): void {
    const insertion = `\n${this.translatedText}`;
    this._snap.editor.replaceRange(insertion, this._snap.to);
    new Notice("Inserted translation below the selection.");
    this.close();
  }

  private replaceSelection(): void {
    this._snap.editor.replaceRange(this.translatedText, this._snap.from, this._snap.to);
    new Notice("Replaced the selected text with the translation.");
    this.close();
  }

  private async copyTranslation(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.translatedText);
      new Notice("Translation copied to clipboard.");
    } catch {
      const fallback = document.createElement("textarea");
      fallback.value = this.translatedText;
      fallback.setAttribute("readonly", "readonly");
      fallback.style.position = "fixed";
      fallback.style.opacity = "0";
      document.body.appendChild(fallback);
      fallback.select();

      const copied = document.execCommand("copy");
      document.body.removeChild(fallback);

      if (!copied) {
        new Notice("Could not copy the translation to the clipboard.");
        return;
      }

      new Notice("Translation copied to clipboard.");
    }
  }
}

// ═══════════════════════════ Settings ══════════════════════════

class DeepLTranslateSettingTab extends PluginSettingTab {
  plugin: DeepLTranslateSelectionPlugin;

  constructor(app: App, plugin: DeepLTranslateSelectionPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "DeepL Translate Selection" });

    new Setting(containerEl)
      .setName("DeepL API key")
      .setDesc("Stored in this vault's plugin data. Keys ending in :fx use the DeepL Free endpoint automatically.")
      .addText((text) => {
        text.setPlaceholder("Paste your DeepL API key");
        text.setValue(this.plugin.settings.apiKey);
        text.inputEl.type = "password";
        text.inputEl.style.width = "100%";
        text.onChange(async (value) => {
          this.plugin.settings.apiKey = value.trim();
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Request timeout (ms)")
      .setDesc("How long the plugin waits for DeepL before failing the request.")
      .addText((text) => {
        text.setPlaceholder(String(DEFAULT_SETTINGS.requestTimeoutMs));
        text.setValue(String(this.plugin.settings.requestTimeoutMs));
        text.onChange(async (value) => {
          const parsed = Number.parseInt(value, 10);
          this.plugin.settings.requestTimeoutMs = Number.isFinite(parsed) && parsed > 0
            ? parsed
            : DEFAULT_SETTINGS.requestTimeoutMs;
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Fallback target language")
      .setDesc("Used when the selection is neither clearly Chinese nor English.")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("ZH", "ZH")
          .addOption("EN-US", "EN-US")
          .setValue(this.plugin.settings.fallbackTargetLang)
          .onChange(async (value) => {
            this.plugin.settings.fallbackTargetLang = value as TargetLang;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Model type")
      .setDesc("Pinned to quality_optimized for v1.")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("quality_optimized", "quality_optimized")
          .setValue(this.plugin.settings.modelType)
          .onChange(async (value) => {
            this.plugin.settings.modelType = value as ModelType;
            await this.plugin.saveSettings();
          });
      });
  }
}
