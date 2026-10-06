const { chromium } = require('playwright-core');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const executablePath = process.env.MOBILE_TEST_BROWSER || ['/usr/bin/chromium', '/usr/bin/google-chrome', '/usr/bin/chromium-browser'].find((candidate) => fs.existsSync(candidate));
assert.ok(executablePath, 'Install Chrome/Chromium or set MOBILE_TEST_BROWSER to its executable path.');

(async () => {
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const title = 'Neoantigen-driven B cell and CD4 T follicular helper cell collaboration promotes anti-tumor CD8 T cell responses';
    await page.setContent(`<html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body class="is-mobile"><header>文献笔记 · 阅读模式</header><main class="markdown-preview-view"><h1><span id="word">Neoantigen</span>${title.slice(10)}</h1><blockquote><p>Cui C, Wang J, Fagerberg E, ... Craft J, Joshi NS. Cell. 2021 Dec 9;184(25):6101-6118.e13.</p></blockquote><p>First sentence. <span id="second">Second</span> sentence has more words. Last sentence.</p><h2 id="zh-title">一句话总结</h2><p id="zh-summary">肿瘤表达新抗原，CD4 T 细胞分化为 TH1 和 TFH，产生 IL-21，提高 CD8 T 细胞的杀伤能力。</p><p id="zh-citation">文献信息经 PubMed 核实，全文自 PubMed Central 阅读。</p></main></body></html>`);
    await page.addStyleTag({ content: `:root { --text-muted:#777; --background-primary:white; --background-modifier-border:#ddd; --background-modifier-box-shadow:#0002; --text-normal:#222; } body {margin:20px; font:18px/1.5 system-ui; background:white;} header{font-size:14px;color:#888;} h1{font:bold 32px/1.22 Georgia;margin:24px 0;} blockquote{border-left:3px solid #9b7bdb;margin:18px 0;padding-left:16px;} button{border:1px solid #ccc;border-radius:8px;background:#fff;color:#222;} .modal{position:fixed;z-index:2000;inset:10vh 0 10px;box-sizing:border-box;overflow:auto;background:white;padding:16px;border:1px solid #aaa;border-radius:16px;box-shadow:0 0 0 100vmax #0005;} .modal h2{font-size:22px;} .modal button{padding:10px 20px;} ${fs.readFileSync(path.join(root, 'styles.css'), 'utf8')}` });
    await page.addScriptTag({ content: `
      window.requests = []; window.events = {}; window.cleanups = [];
      HTMLElement.prototype.addClass = function(name) {this.classList.add(name);};
      HTMLElement.prototype.removeClass = function(name) {this.classList.remove(name);};
      HTMLElement.prototype.setText = function(text) {this.textContent=text;};
      HTMLElement.prototype.empty = function() {this.replaceChildren();};
      HTMLElement.prototype.createEl = function(tag,options={}) {const el=document.createElement(tag); if(options.cls)el.className=options.cls;if(options.text)el.textContent=options.text;this.append(el);return el;};
      HTMLElement.prototype.createDiv = function(options={}) {return this.createEl('div',options);};
      window.view={file:{path:'reading.md'},getMode:()=> 'preview',previewMode:{containerEl:document.querySelector('main')}};
      class Plugin {
        constructor(){this.app={workspace:{activeEditor:null,getActiveViewOfType:()=>window.view,on:(name,cb)=>{events[name]=cb;return{name};}}};}
        async loadData(){return {apiKey:'test-key:fx'};}
        addSettingTab(){} addCommand(command){window.command=command;} addRibbonIcon(){} registerEditorExtension(){}
        registerDomEvent(target,name,callback,options){target.addEventListener(name,callback,options);cleanups.push(()=>target.removeEventListener(name,callback,options));}
        registerEvent(){} register(callback){cleanups.push(callback);} registerMarkdownPostProcessor(callback){window.postProcessor=callback;}
      }
      class Modal {
        constructor(app){this.app=app;this.modalEl=document.createElement('div');this.modalEl.className='modal';this.titleEl=this.modalEl.createEl('h2');this.contentEl=this.modalEl.createDiv();}
        open(){document.body.append(this.modalEl);window.currentModal=this;this.onOpen();}
        close(){this.modalEl.remove();this.onClose?.();}
      }
      window.module={exports:{}};
      window.require=(id)=>id==='@codemirror/view'?{ViewPlugin:{fromClass:(c)=>c}}:{Plugin,Modal,PluginSettingTab:class {},MarkdownView:class {},editorInfoField:{},getLanguage:()=> 'zh-CN',Notice:class {},requestUrl:async(request)=>{requests.push(request);return{status:200,json:{translations:[{text:'测试译文'}]}};}};
    ` });
    await page.addScriptTag({ content: fs.readFileSync(path.join(root, 'main.js'), 'utf8') });
    await page.evaluate(async () => { window.plugin = new module.exports.default(); await plugin.onload(); });
    assert.equal(await page.locator('#zh-title .deepl-translate-block-action, #zh-summary .deepl-translate-block-action, #zh-citation .deepl-translate-block-action').count(), 0, 'Chinese blocks with Latin medical terms have no automatic button');
    assert.equal(await page.evaluate(() => requests.length), 0);
    const headingButton = page.locator('h1 .deepl-translate-block-action');
    await headingButton.waitFor({ state: 'visible' });
    const bounds = await headingButton.boundingBox();
    assert.ok(bounds.width >= 44 && bounds.height >= 44);
    await headingButton.tap();
    await page.waitForFunction(() => requests.length === 1);
    assert.equal(await page.locator('.modal textarea').first().inputValue(), title);
    assert.equal(await page.evaluate(() => new URLSearchParams(requests[0].body).get('text')), title);
    assert.equal(await page.getByRole('button', { name: 'Replace selection', exact: true }).count(), 0);
    await page.waitForTimeout(100);
    assert.equal(await page.locator('.deepl-reading-actions').count(), 0);
    assert.ok(await page.locator('.modal').evaluate((el) => el.getBoundingClientRect().right <= window.innerWidth), 'Mobile modal stays within the viewport');
    await page.getByRole('button', { name: 'Cancel', exact: true }).tap();
    await page.evaluate(() => {const node=document.querySelector('#second').firstChild;const range=document.createRange();range.setStart(node,0);range.setEnd(node,6);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);});
    await page.getByRole('button', { name: '翻译整句', exact: true }).waitFor({ state: 'visible' });
    await page.getByRole('button', { name: '翻译整句', exact: true }).tap();
    await page.waitForFunction(() => requests.length === 2);
    assert.equal(await page.locator('.modal textarea').first().inputValue(), 'Second sentence has more words.');
    assert.equal(await page.evaluate(() => new URLSearchParams(requests[1].body).get('text')), 'Second sentence has more words.');
    await page.waitForTimeout(100);
    assert.equal(await page.locator('.deepl-reading-actions').count(), 0);
    assert.deepEqual(errors, []);
    console.log('Chromium mobile touch smoke passed: English-only buttons, 44px targets, full heading tap, word-to-sentence translation, exact API text, read-only output, no obscuring toolbar or browser errors.');
  } finally {
    await browser.close();
  }
})().catch((error) => {console.error(error); process.exit(1);});
