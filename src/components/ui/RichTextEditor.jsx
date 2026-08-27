import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { RICH_TEXT_MESSAGE_PREFIX, parseRichTextMessage } from '../../utils/richTextMessage';

const markBit = (element, inherited) => {
  const tag = element?.tagName?.toLowerCase();
  if (tag === 'strong' || tag === 'b') return inherited | 1;
  if (tag === 'em' || tag === 'i') return inherited | 2;
  if (tag === 'u') return inherited | 4;
  return inherited;
};

const inlineRunsFromNode = (root) => {
  const runs = [];
  const append = (text, marks) => {
    if (!text) return;
    const previous = runs[runs.length - 1];
    if (previous && previous[1] === marks) previous[0] += text;
    else runs.push([text, marks]);
  };
  const visit = (node, marks = 0) => {
    if (node.nodeType === Node.TEXT_NODE) {
      append(node.textContent || '', marks);
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.tagName.toLowerCase() === 'br') {
      append('\n', marks);
      return;
    }
    const nextMarks = markBit(node, marks);
    Array.from(node.childNodes).forEach((child) => visit(child, nextMarks));
  };
  Array.from(root.childNodes).forEach((node) => visit(node));
  return runs;
};

const editorToBlocks = (editor) => {
  const blocks = [];
  const paragraphNodes = [];
  const flushParagraph = () => {
    if (!paragraphNodes.length) return;
    const wrapper = document.createElement('div');
    paragraphNodes.forEach((node) => wrapper.appendChild(node.cloneNode(true)));
    blocks.push(['p', inlineRunsFromNode(wrapper)]);
    paragraphNodes.length = 0;
  };

  Array.from(editor.childNodes).forEach((node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = node.tagName.toLowerCase();
      if (tag === 'ul' || tag === 'ol') {
        flushParagraph();
        const items = Array.from(node.children)
          .filter((child) => child.tagName.toLowerCase() === 'li')
          .map(inlineRunsFromNode);
        blocks.push([tag, items]);
        return;
      }
      if (tag === 'div' || tag === 'p') {
        flushParagraph();
        blocks.push(['p', inlineRunsFromNode(node)]);
        return;
      }
    }
    paragraphNodes.push(node);
  });
  flushParagraph();

  return blocks.filter(([type, content]) => (
    type === 'p'
      ? content.some(([text]) => text.trim() !== '')
      : content.some((item) => item.some(([text]) => text.trim() !== ''))
  ));
};

const runsToHtml = (runs) => runs.map(([text, marks]) => {
  const span = document.createElement('span');
  span.textContent = text;
  let html = span.innerHTML.replace(/\n/g, '<br>');
  if (marks & 1) html = `<strong>${html}</strong>`;
  if (marks & 2) html = `<em>${html}</em>`;
  if (marks & 4) html = `<u>${html}</u>`;
  return html;
}).join('');

const blocksToHtml = (blocks) => blocks.map(([type, content]) => {
  if (type === 'ul' || type === 'ol') {
    return `<${type}>${content.map((item) => `<li>${runsToHtml(item)}</li>`).join('')}</${type}>`;
  }
  return `<div>${runsToHtml(content) || '<br>'}</div>`;
}).join('');

const toolbarItems = [
  ['bold', 'B', 'bold'],
  ['italic', 'I', 'italic'],
  ['underline', 'U', 'underline'],
  ['insertUnorderedList', '• List', 'bulletList'],
  ['insertOrderedList', '1. List', 'numberedList'],
];

const RichTextEditor = ({ value, onChange, label, placeholder, disabled = false }) => {
  const { t } = useTranslation();
  const editorRef = useRef(null);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (!value) {
      if (editor.textContent || editor.children.length) editor.innerHTML = '';
      return;
    }
    if (!editor.innerHTML) {
      const blocks = parseRichTextMessage(value);
      editor.innerHTML = blocks ? blocksToHtml(blocks) : '';
    }
  }, [value]);

  const emitChange = () => {
    const blocks = editorToBlocks(editorRef.current);
    onChange(blocks.length ? `${RICH_TEXT_MESSAGE_PREFIX}${JSON.stringify(blocks)}` : '');
  };

  const applyFormat = (event, command) => {
    event.preventDefault();
    if (disabled) return;
    editorRef.current?.focus();
    document.execCommand(command, false);
    emitChange();
  };

  const handlePaste = (event) => {
    event.preventDefault();
    const text = event.clipboardData?.getData('text/plain') || '';
    document.execCommand('insertText', false, text);
  };

  return (
    <div className="space-y-1.5">
      {label && <label className="block text-sm font-medium text-foreground">{label}</label>}
      <div className="overflow-hidden rounded-md border border-input bg-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
        <div className="flex flex-wrap items-center gap-1 border-b border-border bg-muted/30 px-2 py-1.5" role="toolbar">
          {toolbarItems.map(([command, text, translationKey]) => (
            <button
              key={command}
              type="button"
              title={t(`caseManagementDetail.communication.richText.${translationKey}`)}
              aria-label={t(`caseManagementDetail.communication.richText.${translationKey}`)}
              disabled={disabled}
              onMouseDown={(event) => applyFormat(event, command)}
              className={`min-w-8 rounded px-2 py-1 text-xs text-foreground hover:bg-muted disabled:opacity-50 ${command === 'italic' ? 'italic' : ''} ${command === 'underline' ? 'underline' : ''} ${command === 'bold' ? 'font-bold' : ''}`}
            >
              {text}
            </button>
          ))}
        </div>
        <div className="relative">
          {!value && (
            <span className="pointer-events-none absolute left-3 top-2.5 text-sm text-muted-foreground">
              {placeholder}
            </span>
          )}
          <div
            ref={editorRef}
            contentEditable={!disabled}
            suppressContentEditableWarning
            role="textbox"
            aria-multiline="true"
            aria-label={label}
            onInput={emitChange}
            onPaste={handlePaste}
            className="min-h-[112px] max-h-[240px] overflow-y-auto px-3 py-2.5 text-sm text-foreground outline-none [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
          />
        </div>
      </div>
    </div>
  );
};

export default RichTextEditor;
