import React from 'react';

export const RICH_TEXT_MESSAGE_PREFIX = 'NZRT1:';

const isInlineRun = (run) => (
  Array.isArray(run)
  && run.length === 2
  && typeof run[0] === 'string'
  && Number.isInteger(run[1])
  && run[1] >= 0
  && run[1] <= 7
);

const isInlineContent = (content) => Array.isArray(content) && content.every(isInlineRun);

export const parseRichTextMessage = (value) => {
  const source = String(value ?? '');
  if (!source.startsWith(RICH_TEXT_MESSAGE_PREFIX)) return null;

  try {
    const blocks = JSON.parse(source.slice(RICH_TEXT_MESSAGE_PREFIX.length));
    if (!Array.isArray(blocks) || blocks.length > 100) return null;

    const valid = blocks.every((block) => {
      if (!Array.isArray(block) || block.length !== 2) return false;
      if (block[0] === 'p') return isInlineContent(block[1]);
      if (block[0] === 'ul' || block[0] === 'ol') {
        return Array.isArray(block[1]) && block[1].length <= 100 && block[1].every(isInlineContent);
      }
      return false;
    });

    return valid ? blocks : null;
  } catch {
    return null;
  }
};

const inlineText = (runs) => runs.map((run) => run[0]).join('');

export const richTextMessageToPlainText = (value) => {
  const blocks = parseRichTextMessage(value);
  if (!blocks) return String(value ?? '');

  return blocks.map(([type, content]) => {
    if (type === 'p') return inlineText(content);
    return content.map((item) => inlineText(item)).join('\n');
  }).join('\n').trim();
};

const renderRuns = (runs, keyPrefix) => runs.map(([text, marks], index) => {
  let node = text;
  if (marks & 1) node = <strong>{node}</strong>;
  if (marks & 2) node = <em>{node}</em>;
  if (marks & 4) node = <u>{node}</u>;
  return <React.Fragment key={`${keyPrefix}-${index}`}>{node}</React.Fragment>;
});

export const RichTextMessage = ({ value, className = '' }) => {
  const blocks = parseRichTextMessage(value);
  if (!blocks) {
    return <p className={`${className} whitespace-pre-wrap break-words`}>{String(value ?? '')}</p>;
  }

  return (
    <div className={`${className} break-words space-y-1.5`}>
      {blocks.map(([type, content], blockIndex) => {
        if (type === 'ul' || type === 'ol') {
          const List = type;
          return (
            <List
              key={`block-${blockIndex}`}
              className={`pl-5 space-y-0.5 ${type === 'ul' ? 'list-disc' : 'list-decimal'}`}
            >
              {content.map((item, itemIndex) => (
                <li key={`block-${blockIndex}-item-${itemIndex}`}>
                  {renderRuns(item, `block-${blockIndex}-item-${itemIndex}`)}
                </li>
              ))}
            </List>
          );
        }

        return (
          <p key={`block-${blockIndex}`} className="whitespace-pre-wrap">
            {renderRuns(content, `block-${blockIndex}`)}
          </p>
        );
      })}
    </div>
  );
};
