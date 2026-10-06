import type { MarkdownView } from "obsidian";

export const READING_BLOCKS = "p,h1,h2,h3,h4,h5,h6,li,td,th";
const EXCLUDED = "button,input,textarea,script,style,svg,[aria-hidden='true'],.metadata-container,.deepl-reading-actions,.deepl-translate-block-action,.collapse-indicator,.heading-collapse-indicator";

export interface ReadingTextContext {
  text: string;
  sentenceText: string;
  paragraphText: string;
  blockText: string;
  block: HTMLElement;
}

export interface ReadingSelectionSnapshot extends ReadingTextContext {
  source: "reading";
  view: MarkdownView;
  filePath: string | null;
}

// Extract rendered text, not Markdown source or translation-button labels.
// DOM ranges preserve the exact selected occurrence even with repeated words.
export function renderedText(node: Node, trim = true): string {
  const visit = (current: Node): string => {
    if (current.nodeType === 3) return current.textContent ?? "";
    const element = current.nodeType === 1 ? current as HTMLElement : null;
    if (element?.matches(EXCLUDED)) return "";
    if (element?.tagName === "BR") return "\n";
    const text = Array.from(current.childNodes).map(visit).join("");
    return element?.matches("p,h1,h2,h3,h4,h5,h6,li,tr,div") ? `${text}\n` : text;
  };
  const text = visit(node).replace(/\n{3,}/g, "\n\n");
  return trim ? text.trim() : text;
}

export function readingBlock(root: HTMLElement, node: Node): HTMLElement | null {
  const element = node.nodeType === 1 ? node as HTMLElement : node.parentElement;
  if (!element || element.closest(EXCLUDED)) return null;
  const block = element.closest<HTMLElement>(READING_BLOCKS);
  return block && root.contains(block) ? block : null;
}

export function blockContext(block: HTMLElement): ReadingTextContext | null {
  const text = renderedText(block);
  return text ? { text, sentenceText: text, paragraphText: text, blockText: text, block } : null;
}

function containingSentence(text: string, start: number, end: number): string {
  if (typeof Intl.Segmenter !== "function") return text;
  const segments = new Intl.Segmenter(undefined, { granularity: "sentence" }).segment(text);
  return Array.from(segments)
    .filter((segment) => segment.index < end && segment.index + segment.segment.length > start)
    .map((segment) => segment.segment).join("").trim() || text;
}

export function selectedReadingContext(root: HTMLElement): ReadingTextContext | null {
  const selection = root.ownerDocument.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount !== 1) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const intersecting = Array.from(root.querySelectorAll<HTMLElement>(READING_BLOCKS))
    .filter((block) => readingBlock(root, block) && range.intersectsNode(block));
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
    text, paragraphText: blockText, blockText, block,
    sentenceText: containingSentence(blockText, start, start + text.length),
  };
}
