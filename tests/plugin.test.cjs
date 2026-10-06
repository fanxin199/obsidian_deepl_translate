const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const bundle = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');

function makeEditor(value = 'Hello world', from = 0, to = 5) {
  return {
    value, from: { line: 0, ch: from }, to: { line: 0, ch: to }, focused: true,
    replacements: [],
    offset(pos) {
      return this.value.split('\n').slice(0, pos.line).reduce((sum, line) => sum + line.length + 1, 0) + pos.ch;
    },
    offsetToPos(offset) {
      const lines = this.value.slice(0, offset).split('\n');
      return { line: lines.length - 1, ch: lines.at(-1).length };
    },
    getCursor(side) { return { ...(side === 'from' ? this.from : this.to) }; },
    getRange(start, end) { return this.value.slice(this.offset(start), this.offset(end)); },
    getSelection() { return this.getRange(this.from, this.to); },
    hasFocus() { return this.focused; },
    replaceRange(text, start, end = start) {
      this.replacements.push({ text, start, end });
      this.value = this.value.slice(0, this.offset(start)) + text + this.value.slice(this.offset(end));
    },
    collapse(ch = this.to.ch) { this.from = this.to = { line: 0, ch }; },
  };
}

async function loadPlugin(editor = makeEditor(), settings = {}, options = {}) {
  const infoField = require('@codemirror/state').StateField.define({ create: () => ({ editor }), update: (value) => value });
  const h = { editor, notices: [], commands: [], requests: [], events: new Map(), workspaceEvents: new Map(), pending: new Map(), cleanups: [], copyCalls: [], clipboard: [], extensions: [], infoField, postProcessors: [], language: options.language ?? 'en' };
  h.doc = options.document ?? { activeElement: null, execCommand(command) { h.copyCalls.push(command); return h.copyResult ?? true; } };
  class Element {
    constructor(options = {}) { this.children = []; this.events = new Map(); this.classes = new Set(); this.ownerDocument = h.doc; this.value = ''; Object.assign(this, options); }
    addClass(name) { this.classes.add(name); }
    removeClass(name) { this.classes.delete(name); }
    setText(text) { this.text = text; }
    empty() { this.children = []; }
    createDiv(options) { return this.createEl('div', options); }
    createEl(tag, options = {}) { const child = new Element({ tag, ...options }); this.children.push(child); return child; }
    addEventListener(event, callback) { this.events.set(event, callback); }
    focus() { h.doc.activeElement = this; }
    select() { this.selected = this.value; }
    closest() { return this.inEditor ? this : null; }
  }
  class Plugin {
    constructor() {
      this.app = { workspace: {
        activeEditor: { editor, file: { path: 'note.md' } },
        getActiveViewOfType() { return this.activeEditor; },
        on(event, callback) { h.workspaceEvents.set(event, callback); return { event }; },
      } };
    }
    async loadData() { return { apiKey: 'test-key:fx', ...settings }; }
    addSettingTab() {}
    addCommand(command) { h.commands.push(command); }
    addRibbonIcon(icon, title, callback) { h.ribbon = { icon, title, callback }; return new Element(); }
    registerDomEvent(target, event, callback, options) {
      h.events.set(event, { callback, options });
      if (target.addEventListener) {
        target.addEventListener(event, callback, options);
        h.cleanups.push(() => target.removeEventListener(event, callback, options));
      }
    }
    registerEvent() {}
    registerEditorExtension(extension) { h.extensions.push(extension); }
    registerMarkdownPostProcessor(callback) { h.postProcessors.push(callback); return callback; }
    register(callback) { h.cleanups.push(callback); }
  }
  class Modal {
    constructor(app) { this.app = app; this.modalEl = new Element(); this.titleEl = new Element(); this.contentEl = new Element(); }
    open() { h.modal = this; this.onOpen(); }
    close() { this.closed = true; this.onClose?.(); }
  }
  h.navigator = { clipboard: { async writeText(text) { h.clipboard.push(text); } } };
  let timerId = 0;
  const moduleObject = { exports: {} };
  vm.runInNewContext(bundle, {
    module: moduleObject, exports: moduleObject.exports, document: h.doc, navigator: h.navigator, HTMLElement: h.doc.defaultView?.HTMLElement ?? Element,
    window: {
      setTimeout(callback, delay) {
        if (delay !== 0) return setTimeout(callback, delay);
        const id = ++timerId; h.pending.set(id, callback); return id;
      },
      clearTimeout(id) { if (!h.pending.delete(id)) clearTimeout(id); },
      getSelection() { return { toString: () => 'text from a settings field' }; },
    },
    URLSearchParams, console,
    require(id) {
      if (id === '@codemirror/view') return require(id);
      assert.equal(id, 'obsidian', 'the mobile bundle must not require Node.js or Electron');
      return {
        Plugin, Modal, PluginSettingTab: class {}, MarkdownView: class {},
        editorInfoField: h.infoField,
        getLanguage: () => h.language,
        Notice: class { constructor(message) { h.notices.push(message); } },
        async requestUrl(request) {
          h.requests.push(request);
          if (h.response) return h.response;
          return request.url.includes('deepl.com')
            ? { status: 200, json: { translations: [{ text: '你好' }] } }
            : { status: 200, json: { choices: [{ message: { content: '  Hello  ' } }] } };
        },
      };
    },
  });
  h.plugin = new moduleObject.exports.default();
  await h.plugin.onload();
  h.dispatch = (event, inEditor = false) => h.events.get(event).callback({ target: new Element({ inEditor }) });
  h.flushCapture = () => { for (const [id, callback] of h.pending) { h.pending.delete(id); callback(); } };
  h.runCommand = () => h.commands[0].checkCallback(false);
  h.open = () => h.plugin.openTranslationModal(editor);
  h.attachNativeSelection = (start, end, targetEditor = editor) => {
    const startNode = {}; const endNode = {};
    h.nativeRange = { startContainer: startNode, startOffset: start, endContainer: endNode, endOffset: end };
    h.doc.getSelection = () => h.nativeRange ? { isCollapsed: false, rangeCount: 1, getRangeAt: () => h.nativeRange } : null;
    h.view = {
      contentDOM: { ownerDocument: h.doc, contains: (node) => node === startNode || node === endNode },
      state: { field: (field) => { assert.equal(field, h.infoField); return { editor: targetEditor }; } },
      posAtDOM(node, offset) { return offset; },
    };
    h.viewPlugin = h.extensions[0].create(h.view);
  };
  return h;
}

async function readingFixture(html, settings = {}) {
  const { JSDOM } = require('jsdom');
  const dom = new JSDOM(`<div class="is-mobile"><div class="markdown-preview-view">${html}</div></div><div id="palette">Translate selection</div>`);
  const h = await loadPlugin(makeEditor('Hidden Markdown source'), settings, { document: dom.window.document, language: 'zh-CN' });
  const root = dom.window.document.querySelector('.markdown-preview-view');
  const view = { editor: h.editor, file: { path: 'reading.md' }, getMode: () => 'preview', previewMode: { containerEl: root } };
  h.plugin.app.workspace.activeEditor = null;
  h.plugin.app.workspace.getActiveViewOfType = () => view;
  h.workspaceEvents.get('layout-change')();
  const select = (element, start = 0, end = element.textContent.length) => {
    const range = dom.window.document.createRange();
    range.setStart(element.firstChild, start); range.setEnd(element.firstChild, end);
    const selection = dom.window.getSelection();
    selection.removeAllRanges(); selection.addRange(range);
    dom.window.document.dispatchEvent(new dom.window.Event('selectionchange'));
    h.flushCapture();
  };
  const toolbarButton = (text) => Array.from(dom.window.document.querySelectorAll('.deepl-reading-actions button')).find((button) => button.textContent === text);
  return { h, dom, root, view, select, toolbarButton };
}

test('reading-mode command is available with no active editor and translates selected rendered text', async () => {
  const { h, dom, root, select } = await readingFixture('<p><span id="word">This complete sentence is selected.</span></p>');
  assert.equal(h.commands[0].checkCallback(true), true);
  select(root.querySelector('#word'));
  assert.equal(h.requests.length, 0, 'selecting does not send text without a translation action');
  h.runCommand();
  assert.equal(h.modal.sourceTextArea.value, 'This complete sentence is selected.');
  await new Promise(setImmediate);
  assert.equal(new URLSearchParams(h.requests[0].body).get('text'), 'This complete sentence is selected.');
  assert.equal(h.modal.insertButton, undefined); assert.equal(h.modal.replaceButton, undefined);
  await h.modal.copyTranslation(); assert.deepEqual(h.clipboard, ['你好']);
  h.modal.insertBelow(); h.modal.replaceSelection();
  assert.equal(h.editor.value, 'Hidden Markdown source'); assert.equal(h.editor.replacements.length, 0);
  dom.window.close();
});

test('screenshot scenario: tapping 译 translates the full wrapped scientific heading without dragging selection handles', async () => {
  const title = 'Neoantigen-driven B cell and CD4 T follicular helper cell collaboration promotes anti-tumor CD8 T cell responses';
  const { h, dom, root, select } = await readingFixture(`<h1><span id="word">Neoantigen</span>${title.slice(10)}</h1><blockquote><p>Different citation text.</p></blockquote>`);
  select(root.querySelector('#word'));
  assert.equal(h.plugin.cachedReadingSelection.text, 'Neoantigen');
  root.querySelector('h1 .deepl-translate-block-action').click();
  assert.equal(h.modal.sourceTextArea.value, title);
  await new Promise(setImmediate);
  assert.equal(new URLSearchParams(h.requests[0].body).get('text'), title);
  assert.equal(h.editor.replacements.length, 0);
  dom.window.close();
});

test('automatic reading buttons stay on English blocks and exclude Chinese medical prose', async () => {
  const { h, dom, root } = await readingFixture(`
    <h1 id="english-heading">Neoantigen-driven B cell and CD4 T cell responses</h1>
    <p id="english">English <em>sentences</em> remain easy to translate.</p>
    <h2 id="chinese-heading">一句话总结</h2>
    <p id="chinese">肿瘤若表达能被 B 细胞受体识别的新抗原，CD4 T 细胞分化为 TH1 和 TFH，并产生 IL-21，提高 CD8 T 细胞的杀伤能力。</p>
    <p id="citation">文献信息经 PubMed 核实；全文自 PubMed Central 开放获取版本阅读。</p>
    <p id="mixed">English text with 中文注释.</p>
    <p id="numbers">2021 / 184(25):6101–6118</p>`);
  for (const id of ['english-heading', 'english']) {
    assert.ok(root.querySelector(`#${id} .deepl-translate-block-action`), id);
  }
  for (const id of ['chinese-heading', 'chinese', 'citation', 'mixed', 'numbers']) {
    assert.equal(root.querySelector(`#${id} .deepl-translate-block-action`), null, id);
  }
  assert.equal(h.requests.length, 0);
  dom.window.close();
});

test('reading buttons follow language changes without duplicates or stale Chinese actions', async () => {
  const { h, dom, root } = await readingFixture('<p><span>English paragraph.</span></p>');
  const block = root.querySelector('p');
  const span = block.querySelector('span');
  const update = () => h.postProcessors.forEach((callback) => callback(root, {}));
  assert.equal(block.querySelectorAll('.deepl-translate-block-action').length, 1);
  span.textContent = 'CD4 T 细胞的中文描述。';
  // A stale button cannot send Chinese text even before the render update.
  block.querySelector('.deepl-translate-block-action').click();
  assert.equal(h.requests.length, 0);
  update();
  assert.equal(block.querySelector('.deepl-translate-block-action'), null);
  span.textContent = 'English paragraph again.';
  update(); update();
  assert.equal(block.querySelectorAll('.deepl-translate-block-action').length, 1);
  block.querySelector('.deepl-translate-block-action').click();
  await new Promise(setImmediate);
  assert.equal(new URLSearchParams(h.requests[0].body).get('text'), 'English paragraph again.');
  assert.equal(new URLSearchParams(h.requests[0].body).get('target_lang'), 'ZH');
  dom.window.close();
});

test('English button filtering uses visible text rather than hidden labels or markup', async () => {
  const { dom, root } = await readingFixture('<p id="english">Visible English text.<span aria-hidden="true">隐藏的中文</span></p><p id="chinese">中文内容。<span aria-hidden="true">Hidden English</span></p>');
  assert.ok(root.querySelector('#english .deepl-translate-block-action'));
  assert.equal(root.querySelector('#chinese .deepl-translate-block-action'), null);
  dom.window.close();
});

test('a paragraph button also works with no native selection at all', async () => {
  const { h, dom, root } = await readingFixture('<p>Translate this entire paragraph without a long press.</p>');
  assert.equal(h.requests.length, 0);
  root.querySelector('.deepl-translate-block-action').click();
  assert.equal(h.modal.sourceTextArea.value, 'Translate this entire paragraph without a long press.');
  await new Promise(setImmediate);
  assert.equal(h.requests.length, 1);
  dom.window.close();
});

test('long-pressing one word offers whole-sentence translation in an app-owned toolbar', async () => {
  const { h, dom, root, select, toolbarButton } = await readingFixture('<p>First sentence. <strong><span id="word">Second</span> sentence has more words.</strong> Last sentence.</p>');
  select(root.querySelector('#word'));
  assert.ok(toolbarButton('翻译选中')); assert.ok(toolbarButton('翻译整句')); assert.ok(toolbarButton('翻译整段'));
  toolbarButton('翻译整句').click();
  assert.equal(h.modal.sourceTextArea.value, 'Second sentence has more words.');
  await new Promise(setImmediate);
  assert.equal(new URLSearchParams(h.requests[0].body).get('text'), 'Second sentence has more words.');
  assert.equal(dom.window.document.querySelector('.deepl-reading-actions'), null);
  dom.window.close();
});

test('whole-paragraph translation does not leak UI labels, hidden elements, or lose line breaks', async () => {
  const { h, dom, root, select, toolbarButton } = await readingFixture('<p><span id="word">First</span> sentence.<br>Second <em>formatted</em> sentence.<span aria-hidden="true">HIDDEN</span><button>Other UI</button></p>');
  select(root.querySelector('#word'));
  toolbarButton('翻译整段').click();
  assert.equal(h.modal.sourceTextArea.value, 'First sentence.\nSecond formatted sentence.');
  await new Promise(setImmediate);
  dom.window.close();
});

test('CJK sentence boundaries work when only two characters are selected', async () => {
  const { h, dom, root, select, toolbarButton } = await readingFixture('<p><span id="text">第一句。第二句包含更多内容！第三句。</span></p>');
  select(root.querySelector('#text'), 4, 6);
  toolbarButton('翻译整句').click();
  assert.equal(h.modal.sourceTextArea.value, '第二句包含更多内容！');
  await new Promise(setImmediate);
  dom.window.close();
});

test('repeated words select the containing sentence at the actual DOM occurrence', async () => {
  const { h, dom, root, select, toolbarButton } = await readingFixture('<p>Hello first sentence. <span id="word">Hello</span> second sentence.</p>');
  select(root.querySelector('#word'));
  toolbarButton('翻译整句').click();
  assert.equal(h.modal.sourceTextArea.value, 'Hello second sentence.');
  await new Promise(setImmediate);
  dom.window.close();
});

test('selected reading text survives command-palette focus loss with no hidden-editor fallback', async () => {
  const { h, dom, root, select } = await readingFixture('<p><span id="text">This is the whole selected sentence.</span></p>');
  select(root.querySelector('#text'));
  const range = dom.window.document.createRange();
  range.selectNodeContents(dom.window.document.querySelector('#palette'));
  dom.window.getSelection().removeAllRanges(); dom.window.getSelection().addRange(range);
  dom.window.document.dispatchEvent(new dom.window.Event('selectionchange')); h.flushCapture();
  h.runCommand();
  assert.equal(h.modal.sourceTextArea.value, 'This is the whole selected sentence.');
  await new Promise(setImmediate);
  assert.equal(h.editor.replacements.length, 0);
  dom.window.close();
});

test('reading selection handles can expand across multiple rendered blocks', async () => {
  const { h, dom, root } = await readingFixture('<p><span id="first">First paragraph.</span></p><p><span id="second">Second paragraph.</span></p>');
  const range = dom.window.document.createRange();
  range.setStart(root.querySelector('#first').firstChild, 0);
  range.setEnd(root.querySelector('#second').firstChild, 17);
  dom.window.getSelection().removeAllRanges(); dom.window.getSelection().addRange(range);
  h.runCommand();
  assert.equal(h.modal.sourceTextArea.value, 'First paragraph.\nSecond paragraph.');
  await new Promise(setImmediate);
  dom.window.close();
});

test('select-all within the reading pane excludes plugin actions and note properties', async () => {
  const { h, dom, root } = await readingFixture('<div class="metadata-container">PRIVATE PROPERTY</div><h1>Heading</h1><p>Paragraph.</p>');
  const range = dom.window.document.createRange(); range.selectNodeContents(root);
  dom.window.getSelection().removeAllRanges(); dom.window.getSelection().addRange(range);
  h.runCommand();
  assert.equal(h.modal.sourceTextArea.value, 'Heading\nParagraph.');
  await new Promise(setImmediate);
  dom.window.close();
});

test('settings/dialog selections outside the reading pane do not trigger translation', async () => {
  const { h, dom } = await readingFixture('<p>Note text.</p>');
  const range = dom.window.document.createRange(); range.selectNodeContents(dom.window.document.querySelector('#palette'));
  dom.window.getSelection().removeAllRanges(); dom.window.getSelection().addRange(range);
  h.runCommand();
  assert.equal(h.requests.length, 0); assert.equal(h.modal, undefined);
  assert.match(h.notices.pop(), /译/);
  dom.window.close();
});

test('changing note identity invalidates a cached reading selection before any API request', async () => {
  const { h, dom, root, view, select } = await readingFixture('<p><span id="word">Selected</span> text.</p>');
  select(root.querySelector('#word'));
  dom.window.getSelection().removeAllRanges(); view.file = { path: 'different.md' };
  h.runCommand();
  assert.equal(h.requests.length, 0); assert.equal(h.modal, undefined);
  dom.window.close();
});

test('rerendering the selected block invalidates its cached toolbar', async () => {
  const { h, dom, root, select, toolbarButton } = await readingFixture('<p><span id="word">Selected</span> text.</p>');
  select(root.querySelector('#word'));
  const button = toolbarButton('翻译整段'); root.querySelector('p').remove();
  button.click();
  assert.equal(h.requests.length, 0); assert.equal(dom.window.document.querySelector('.deepl-reading-actions'), null);
  dom.window.close();
});

test('reading button installation is idempotent and cleaned up on plugin unload', async () => {
  const { h, dom, root, select } = await readingFixture('<h1>Title</h1><ul><li><p><span id="word">Paragraph</span> text.</p></li></ul>');
  for (const callback of h.postProcessors) { callback(root, {}); callback(root, {}); }
  assert.equal(root.querySelectorAll('.deepl-translate-block-action').length, 2);
  select(root.querySelector('#word'));
  assert.ok(dom.window.document.querySelector('.deepl-reading-actions'));
  h.cleanups.forEach((cleanup) => cleanup());
  assert.equal(root.querySelectorAll('.deepl-translate-block-action').length, 0);
  assert.equal(dom.window.document.querySelector('.deepl-reading-actions'), null);
  dom.window.close();
});

test('missing provider credentials keep paragraph translation on the normal settings path', async () => {
  const { h, dom, root } = await readingFixture('<p>Whole paragraph.</p>', { apiKey: '' });
  let settingsOpened = false; h.plugin.openPluginSettings = () => { settingsOpened = true; };
  root.querySelector('.deepl-translate-block-action').click();
  assert.ok(settingsOpened); assert.equal(h.requests.length, 0);
  dom.window.close();
});

test('release metadata enables mobile and keeps version files synchronized', () => {
  const root = path.join(__dirname, '..');
  const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  const manifest = read('manifest.json');
  assert.equal(manifest.isDesktopOnly, false);
  assert.equal(manifest.version, read('package.json').version);
  assert.equal(manifest.version, read('package-lock.json').version);
  assert.equal(manifest.version, read('package-lock.json').packages[''].version);
  assert.equal(read('versions.json')[manifest.version], manifest.minAppVersion);
});

test('registers mouse/touch capture, mobile selection updates, ribbon, and existing command', async () => {
  const h = await loadPlugin();
  for (const event of ['pointerdown', 'pointerup', 'selectionchange', 'contextmenu', 'keyup']) assert.ok(h.events.has(event));
  assert.equal(h.events.get('pointerdown').options, true);
  assert.equal(h.events.get('contextmenu').options, true);
  assert.equal(h.commands[0].id, 'translate-selection');
  assert.equal(h.ribbon.icon, 'languages');
});

test('Android selection survives toolbar focus loss and is consumed only once', async () => {
  const h = await loadPlugin();
  h.dispatch('selectionchange'); h.flushCapture();
  h.editor.collapse(); h.editor.focused = false;
  h.dispatch('selectionchange'); h.flushCapture();
  const snapshot = h.plugin.buildSnapshot(h.editor);
  assert.equal(snapshot.text, 'Hello');
  assert.equal(snapshot.from.ch, 0); assert.equal(snapshot.to.ch, 5);
  assert.equal(h.plugin.buildSnapshot(h.editor), null);
});

test('Windows right-click retains the pre-captured selection after the menu collapses it', async () => {
  const h = await loadPlugin();
  h.dispatch('pointerdown'); h.editor.collapse(); h.dispatch('contextmenu');
  let click;
  const item = { setTitle() { return this; }, setIcon() { return this; }, onClick(callback) { click = callback; } };
  h.workspaceEvents.get('editor-menu')({ addItem(callback) { callback(item); } }, h.editor);
  assert.equal(typeof click, 'function');
  click();
  assert.equal(h.modal.sourceTextArea.value, 'Hello');
  await new Promise(setImmediate);
  assert.equal(h.modal.translationTextArea.value, '你好');
});

test('Android menu uses the expanded paragraph when selection handles move after the menu opens', async () => {
  const h = await loadPlugin();
  let click;
  const item = { setTitle() { return this; }, setIcon() { return this; }, onClick(callback) { click = callback; } };
  h.workspaceEvents.get('editor-menu')({ addItem(callback) { callback(item); } }, h.editor);
  h.editor.to.ch = h.editor.value.length;
  click();
  assert.equal(h.modal.sourceTextArea.value, 'Hello world');
  await new Promise(setImmediate);
  assert.equal(new URLSearchParams(h.requests[0].body).get('text'), 'Hello world');
});

test('Android command palette reads the full native handle range even when the API still selects the initial word', async () => {
  const h = await loadPlugin();
  h.attachNativeSelection(0, h.editor.value.length);
  h.dispatch('selectionchange'); h.flushCapture();
  h.dispatch('pointerdown');
  h.nativeRange = null; h.editor.focused = false;
  h.dispatch('selectionchange'); h.flushCapture();
  h.runCommand();
  assert.equal(h.modal.sourceTextArea.value, 'Hello world');
  await new Promise(setImmediate);
  assert.equal(new URLSearchParams(h.requests[0].body).get('text'), 'Hello world');
  h.modal.replaceSelection();
  assert.equal(h.editor.value, '你好');
});

test('opening the command palette without a pointer event also retains the expanded native selection', async () => {
  const h = await loadPlugin();
  h.attachNativeSelection(0, h.editor.value.length);
  h.dispatch('selectionchange'); h.flushCapture();
  h.nativeRange = null; h.editor.focused = false;
  h.dispatch('selectionchange'); h.flushCapture();
  h.runCommand();
  assert.equal(h.modal.sourceTextArea.value, 'Hello world');
  await new Promise(setImmediate);
});

test('native handle updates take effect synchronously at command invocation', async () => {
  const h = await loadPlugin();
  h.attachNativeSelection(0, 5);
  h.dispatch('selectionchange'); h.flushCapture();
  h.nativeRange.endOffset = 11;
  h.runCommand();
  assert.equal(h.modal.sourceTextArea.value, 'Hello world');
  await new Promise(setImmediate);
});

test('shrinking a native selection to one word overrides the previous paragraph cache', async () => {
  const h = await loadPlugin();
  h.attachNativeSelection(0, 11);
  h.dispatch('pointerdown'); h.nativeRange.endOffset = 5;
  assert.equal(h.plugin.buildSnapshot(h.editor).text, 'Hello');
});

test('native selection mappings preserve reverse and multiline source positions', async () => {
  const editor = makeEditor('First\nSecond\nThird');
  const h = await loadPlugin(editor);
  h.attachNativeSelection(9, 2);
  const snapshot = h.plugin.buildSnapshot(editor);
  assert.equal(snapshot.text, 'rst\nSec');
  assert.equal(snapshot.from.line, 0); assert.equal(snapshot.from.ch, 2);
  assert.equal(snapshot.to.line, 1); assert.equal(snapshot.to.ch, 3);
});

test('a DOM selection outside the editor or in another note cannot override its API selection', async () => {
  const h = await loadPlugin();
  h.attachNativeSelection(0, 11);
  h.nativeRange.endContainer = {};
  assert.equal(h.plugin.buildSnapshot(h.editor).text, 'Hello');
  h.attachNativeSelection(0, 11, makeEditor('Other note'));
  assert.equal(h.plugin.buildSnapshot(h.editor).text, 'Hello');
});

test('unsupported DOM nodes fall back to source positions without searching for matching words', async () => {
  const h = await loadPlugin();
  h.attachNativeSelection(0, 11);
  h.view.posAtDOM = () => { throw new Error('Detached node'); };
  assert.equal(h.plugin.buildSnapshot(h.editor).text, 'Hello');
});

test('CodeMirror selection updates schedule a capture and removed views are no longer read', async () => {
  const h = await loadPlugin();
  h.attachNativeSelection(0, 11);
  h.viewPlugin.update({ selectionSet: true, docChanged: false });
  assert.equal(h.pending.size, 1);
  h.flushCapture();
  assert.equal(h.plugin.cachedSelection.text, 'Hello world');
  h.viewPlugin.destroy();
  h.plugin.cachedSelection = null;
  assert.equal(h.plugin.buildSnapshot(h.editor).text, 'Hello');
});

test('editing the note invalidates a larger native cache while the command palette is open', async () => {
  const h = await loadPlugin();
  h.attachNativeSelection(0, 11); h.dispatch('pointerdown');
  h.nativeRange = null; h.editor.value = 'Other words'; h.editor.focused = false;
  assert.equal(h.plugin.buildSnapshot(h.editor).text, 'Other');
});

test('real CodeMirror DOM mapping translates the expanded native paragraph after command-palette focus loss', async () => {
  const { JSDOM } = require('jsdom');
  const { EditorState } = require('@codemirror/state');
  const { EditorView } = require('@codemirror/view');
  const dom = new JSDOM('<main></main><div id="palette">Translate selection</div>', { pretendToBeVisual: true });
  const globals = {
    window: dom.window, document: dom.window.document, MutationObserver: dom.window.MutationObserver,
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
  };
  const descriptors = new Map(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  let view;
  try {
    for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    const h = await loadPlugin();
    view = new EditorView({
      state: EditorState.create({ doc: h.editor.value, extensions: [h.infoField, ...h.extensions] }),
      parent: dom.window.document.querySelector('main'),
    });
    const text = view.contentDOM.querySelector('.cm-line').firstChild;
    const range = dom.window.document.createRange();
    range.setStart(text, 0); range.setEnd(text, 11);
    const selection = dom.window.getSelection();
    selection.removeAllRanges(); selection.addRange(range);
    h.dispatch('selectionchange'); h.flushCapture();
    assert.equal(h.plugin.cachedSelection.text, 'Hello world');
    assert.equal(h.editor.getSelection(), 'Hello', 'Obsidian API intentionally lags behind native handles');
    const paletteRange = dom.window.document.createRange();
    paletteRange.selectNodeContents(dom.window.document.querySelector('#palette'));
    selection.removeAllRanges(); selection.addRange(paletteRange);
    h.editor.focused = false;
    h.runCommand();
    assert.equal(h.modal.sourceTextArea.value, 'Hello world');
    await new Promise(setImmediate);
    assert.equal(new URLSearchParams(h.requests[0].body).get('text'), 'Hello world');
    h.modal.replaceSelection();
    assert.equal(h.editor.value, '你好');
  } finally {
    view?.destroy(); dom.window.close();
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

test('real DOM mapping locates the selected occurrence and multiline offsets without matching text searches', async () => {
  const { JSDOM } = require('jsdom');
  const { EditorState } = require('@codemirror/state');
  const { EditorView } = require('@codemirror/view');
  const dom = new JSDOM('<main></main>', { pretendToBeVisual: true });
  const globals = { window: dom.window, document: dom.window.document, MutationObserver: dom.window.MutationObserver };
  const descriptors = new Map(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  let view;
  try {
    for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
    const editor = makeEditor('Hello world\nHello world\nThird line');
    const h = await loadPlugin(editor);
    view = new EditorView({ state: EditorState.create({ doc: editor.value, extensions: [h.infoField, ...h.extensions] }), parent: dom.window.document.querySelector('main') });
    const lines = view.contentDOM.querySelectorAll('.cm-line');
    const range = dom.window.document.createRange();
    range.setStart(lines[1].firstChild, 0); range.setEnd(lines[1].firstChild, 11);
    const selection = dom.window.getSelection();
    selection.removeAllRanges(); selection.addRange(range);
    const snapshot = h.plugin.buildSnapshot(editor);
    assert.equal(snapshot.text, 'Hello world'); assert.equal(snapshot.from.line, 1); assert.equal(snapshot.to.line, 1);
    range.setStart(lines[1].firstChild, 6); range.setEnd(lines[2].firstChild, 5);
    selection.removeAllRanges(); selection.addRange(range);
    const multiline = h.plugin.buildSnapshot(editor);
    assert.equal(multiline.text, 'world\nThird');
    assert.equal(multiline.from.line, 1); assert.equal(multiline.from.ch, 6);
    assert.equal(multiline.to.line, 2); assert.equal(multiline.to.ch, 5);
  } finally {
    view?.destroy(); dom.window.close();
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});

test('touching the mobile toolbar preserves a collapsed selection even if the editor keeps focus', async () => {
  const h = await loadPlugin();
  h.dispatch('pointerdown'); h.editor.collapse();
  h.dispatch('pointerup'); h.dispatch('selectionchange'); h.flushCapture();
  assert.equal(h.plugin.buildSnapshot(h.editor).text, 'Hello');
});

test('touching the note again clears a selection previously saved for a toolbar', async () => {
  const h = await loadPlugin();
  h.dispatch('pointerdown'); h.editor.collapse();
  h.dispatch('pointerdown', true); h.dispatch('pointerup'); h.flushCapture();
  assert.equal(h.plugin.buildSnapshot(h.editor), null);
});

test('live editor range wins over cached text and incorrect DOM selection', async () => {
  const h = await loadPlugin();
  h.dispatch('pointerdown'); h.editor.from.ch = 6; h.editor.to.ch = 11;
  h.editor.getSelection = () => '';
  assert.equal(h.plugin.buildSnapshot(h.editor).text, 'world');
  h.editor.collapse();
  assert.equal(h.plugin.buildSnapshot(h.editor), null);
});

test('deselecting within a focused note clears the mobile cache', async () => {
  const h = await loadPlugin();
  h.dispatch('selectionchange'); h.flushCapture(); h.editor.collapse();
  h.dispatch('selectionchange'); h.flushCapture();
  assert.equal(h.plugin.buildSnapshot(h.editor), null);
});

test('a caret moved away from the saved boundaries cannot reuse the selection', async () => {
  const h = await loadPlugin();
  h.dispatch('pointerdown'); h.editor.collapse(9); h.editor.focused = false;
  assert.equal(h.plugin.buildSnapshot(h.editor), null);
});

test('cached text is never reused for a different editor or changed note content', async () => {
  const h = await loadPlugin();
  h.dispatch('pointerdown');
  assert.equal(h.plugin.buildSnapshot(makeEditor('Other note', 0, 0)), null);
  h.dispatch('pointerdown'); h.editor.collapse(); h.editor.value = 'Changed world';
  assert.equal(h.plugin.buildSnapshot(h.editor), null);
});

for (const event of ['file-open', 'active-leaf-change']) {
  test(`${event} clears cached ranges`, async () => {
    const h = await loadPlugin();
    h.dispatch('pointerdown'); h.editor.collapse(); h.workspaceEvents.get(event)();
    assert.equal(h.plugin.buildSnapshot(h.editor), null);
  });
}

test('queued capture runs after editor updates and is cancelled when unloaded', async () => {
  const h = await loadPlugin();
  h.dispatch('pointerup'); h.dispatch('selectionchange');
  assert.equal(h.pending.size, 1);
  h.editor.from.ch = 6; h.editor.to.ch = 11; h.flushCapture();
  h.editor.collapse(); h.editor.focused = false;
  assert.equal(h.plugin.buildSnapshot(h.editor).text, 'world');
  h.dispatch('keyup'); h.cleanups.forEach((cleanup) => cleanup());
  assert.equal(h.pending.size, 0);
});

test('command palette and ribbon both open the translation modal', async () => {
  const h = await loadPlugin();
  h.runCommand();
  await new Promise(setImmediate);
  assert.equal(h.modal.translationTextArea.value, '你好');
  h.modal.close();
  h.modal = null;
  h.ribbon.callback();
  await new Promise(setImmediate);
  assert.equal(h.modal.translationTextArea.value, '你好');
  assert.equal(h.modal.replaceButton.disabled, false);
});

test('a missing editor or empty selection shows guidance without making an API request', async () => {
  const h = await loadPlugin(makeEditor('Hello', 0, 0));
  await h.open();
  assert.equal(h.notices.pop(), 'Select some text first.');
  h.plugin.app.workspace.activeEditor = null;
  h.ribbon.callback();
  assert.match(h.notices.pop(), /Open a note/);
  assert.equal(h.requests.length, 0);
});

test('a missing key opens plugin settings without sending the selected text', async () => {
  const h = await loadPlugin(makeEditor(), { apiKey: '' });
  let settingsOpened = false;
  h.plugin.openPluginSettings = () => { settingsOpened = true; };
  await h.open();
  assert.ok(settingsOpened); assert.equal(h.requests.length, 0);
});

test('multiline selection preserves the correct replacement positions', async () => {
  const editor = makeEditor('First\nSecond\nThird');
  editor.from = { line: 0, ch: 2 }; editor.to = { line: 1, ch: 3 };
  const h = await loadPlugin(editor);
  await h.open(); h.modal.replaceSelection();
  assert.equal(editor.value, 'Fi你好ond\nThird');
});

test('replace and insert retain the Windows editor behavior', async () => {
  const h = await loadPlugin();
  await h.open(); h.modal.replaceSelection();
  assert.equal(h.editor.value, '你好 world'); assert.ok(h.modal.closed);
  const other = await loadPlugin();
  await other.open(); other.modal.insertBelow();
  assert.equal(other.editor.value, 'Hello\n你好 world');
});

test('editing the original text while translation is open prevents destructive actions', async () => {
  const h = await loadPlugin();
  await h.open(); h.editor.value = 'Other world';
  h.modal.replaceSelection(); h.modal.insertBelow();
  assert.equal(h.editor.replacements.length, 0);
  assert.match(h.notices.pop(), /original note or text changed/);
});

test('switching files in a reused editor also prevents replacing the other note', async () => {
  const h = await loadPlugin();
  await h.open(); h.plugin.app.workspace.activeEditor.file = { path: 'other.md' };
  h.modal.replaceSelection();
  assert.equal(h.editor.replacements.length, 0);
});

test('modern clipboard writes do not modify the note', async () => {
  const h = await loadPlugin();
  await h.open(); await h.modal.copyTranslation();
  assert.deepEqual(h.clipboard, ['你好']); assert.equal(h.copyCalls.length, 0);
  assert.equal(h.editor.value, 'Hello world');
});

for (const mode of ['missing', 'rejected']) {
  test(`Android clipboard fallback works when Clipboard API is ${mode}`, async () => {
    const h = await loadPlugin();
    if (mode === 'missing') delete h.navigator.clipboard;
    else h.navigator.clipboard.writeText = async () => { throw new Error('WebView clipboard denied'); };
    await h.open(); await h.modal.copyTranslation();
    assert.deepEqual(h.copyCalls, ['copy']);
    assert.equal(h.modal.translationTextArea.selected, '你好');
    assert.equal(h.notices.pop(), 'Translation copied to clipboard.');
    assert.equal(h.editor.value, 'Hello world');
  });
}

test('if both clipboard mechanisms fail, the translated text remains available for manual copy', async () => {
  const h = await loadPlugin();
  delete h.navigator.clipboard; h.copyResult = false;
  await h.open(); await h.modal.copyTranslation();
  assert.match(h.notices.pop(), /Long-press/);
  assert.equal(h.modal.translationTextArea.value, '你好');
});

test('DeepL Free/Pro and DeepSeek all use the cross-platform Obsidian request API', async () => {
  const h = await loadPlugin();
  assert.equal(await h.plugin.translateText('Hello'), '你好');
  assert.equal(h.requests[0].url, 'https://api-free.deepl.com/v2/translate');
  assert.equal(new URLSearchParams(h.requests[0].body).get('target_lang'), 'ZH');
  h.plugin.settings.apiKey = 'test-pro-key';
  await h.plugin.translateText('你好');
  assert.equal(h.requests[1].url, 'https://api.deepl.com/v2/translate');
  assert.equal(new URLSearchParams(h.requests[1].body).get('target_lang'), 'EN-US');
  h.plugin.settings.translationProvider = 'deepseek'; h.plugin.settings.deepseekApiKey = 'test-llm-key';
  assert.equal(await h.plugin.translateText('你好'), 'Hello');
  assert.equal(h.requests[2].url, 'https://api.deepseek.com/chat/completions');
  assert.match(JSON.parse(h.requests[2].body).messages[0].content, /English translator/);
  assert.equal(JSON.parse(h.requests[2].body).stream, false);
});

test('translation errors keep editor actions disabled and preserve the original text', async () => {
  const h = await loadPlugin();
  h.response = { status: 429, json: {} };
  await h.open();
  assert.match(h.modal.statusEl.text, /rate limit/);
  assert.equal(h.modal.replaceButton.disabled, true); assert.equal(h.modal.copyButton.disabled, true);
  assert.equal(h.editor.replacements.length, 0);
});
