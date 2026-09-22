import React from 'react';
import { ExternalLink } from 'lucide-react';

function safeHref(rawHref) {
  const href = String(rawHref || '').trim();
  if (!href || href.startsWith('//') || /^(?:javascript|data|vbscript):/i.test(href)) return '';
  if (href.startsWith('/')) return href.includes('..') ? '' : href;
  try {
    const url = new URL(href);
    if (url.protocol !== 'https:') return '';
    const host = url.hostname.toLowerCase();
    if (host === 'veylo.com.ng' || host.endsWith('.veylo.com.ng')) return url.toString();
  } catch {}
  return '';
}
function inlineParts(value) {
  const source = String(value || '');
  const pattern = /(\[[^\]]+\]\([^\s)]+\)|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
  const parts = [];
  let last = 0;
  let match;
  while ((match = pattern.exec(source))) {
    if (match.index > last) parts.push(source.slice(last, match.index));
    const token = match[0];
    if (token.startsWith('[')) {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^\s)]+)\)$/);
      const href = safeHref(linkMatch?.[2]);
      if (linkMatch && href) parts.push(<a key={`link-${match.index}`} href={href} target={href.startsWith('/') ? undefined : '_blank'} rel={href.startsWith('/') ? undefined : 'noopener noreferrer'}>{linkMatch[1]}{!href.startsWith('/') && <ExternalLink size={12} aria-hidden="true" />}</a>);
      else parts.push(linkMatch?.[1] || token);
    } else if (token.startsWith('`')) parts.push(<code key={`code-${match.index}`}>{token.slice(1, -1)}</code>);
    else if (token.startsWith('**')) parts.push(<strong key={`strong-${match.index}`}>{token.slice(2, -2)}</strong>);
    else parts.push(<em key={`em-${match.index}`}>{token.slice(1, -1)}</em>);
    last = match.index + token.length;
  }
  if (last < source.length) parts.push(source.slice(last));
  return parts.length ? parts : source;
}

function splitTableRow(line) {
  const value = String(line || '').trim().replace(/^\|/, '').replace(/\|$/, '');
  return value.split('|').map(cell => cell.trim());
}

function isTableDivider(line) {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every(cell => /^:?-{3,}:?$/.test(cell));
}

function isUnordered(line) { return /^\s*[-*]\s+/.test(line); }
function isOrdered(line) { return /^\s*\d+[.)]\s+/.test(line); }

export default function VeyloMarkdown({ children }) {
  const lines = String(children || '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let index = 0;
  let paragraph = [];
  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push({ type: 'paragraph', lines: paragraph });
      paragraph = [];
    }
  };

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { flushParagraph(); index += 1; continue; }

    const fence = line.match(/^\s*```\s*([\w+-]*)\s*$/);
    if (fence) {
      flushParagraph();
      const code = [];
      index += 1;
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) { code.push(lines[index]); index += 1; }
      if (index < lines.length) index += 1;
      blocks.push({ type: 'code', language: fence[1], code: code.join('\n') });
      continue;
    }

    const heading = line.match(/^\s*(#{1,3})\s+(.+?)\s*#*\s*$/);
    if (heading) { flushParagraph(); blocks.push({ type: 'heading', level: heading[1].length, value: heading[2] }); index += 1; continue; }
    if (/^\s*(?:---|___|\*\*\*)\s*$/.test(line)) { flushParagraph(); blocks.push({ type: 'rule' }); index += 1; continue; }

    if (line.includes('|') && index + 1 < lines.length && isTableDivider(lines[index + 1])) {
      flushParagraph();
      const headers = splitTableRow(line);
      index += 2;
      const rows = [];
      while (index < lines.length && lines[index].trim() && lines[index].includes('|')) { rows.push(splitTableRow(lines[index])); index += 1; }
      blocks.push({ type: 'table', headers, rows });
      continue;
    }

    if (isUnordered(line) || isOrdered(line)) {
      flushParagraph();
      const ordered = isOrdered(line);
      const items = [];
      while (index < lines.length && (ordered ? isOrdered(lines[index]) : isUnordered(lines[index]))) {
        items.push(lines[index].replace(ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*]\s+/, '').trim());
        index += 1;
      }
      blocks.push({ type: ordered ? 'ordered' : 'unordered', items });
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      flushParagraph();
      const quote = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) { quote.push(lines[index].replace(/^\s*>\s?/, '').trim()); index += 1; }
      blocks.push({ type: 'quote', lines: quote });
      continue;
    }

    paragraph.push(line.trim());
    index += 1;
  }
  flushParagraph();

  return <div className="veylo-markdown">
    {blocks.map((block, blockIndex) => {
      if (block.type === 'heading') {
        const Heading = `h${block.level}`;
        return <Heading key={blockIndex}>{inlineParts(block.value)}</Heading>;
      }
      if (block.type === 'paragraph') return <p key={blockIndex}>{inlineParts(block.lines.join(' '))}</p>;
      if (block.type === 'code') return <pre key={blockIndex} data-language={block.language || undefined}><code>{block.code}</code></pre>;
      if (block.type === 'rule') return <hr key={blockIndex} />;
      if (block.type === 'quote') return <blockquote key={blockIndex}>{inlineParts(block.lines.join(' '))}</blockquote>;
      if (block.type === 'table') return <div className="veylo-markdown-table" key={blockIndex}><table><thead><tr>{block.headers.map((header, cellIndex) => <th key={cellIndex} scope="col">{inlineParts(header)}</th>)}</tr></thead><tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{block.headers.map((_, cellIndex) => <td key={cellIndex}>{inlineParts(row[cellIndex] || '')}</td>)}</tr>)}</tbody></table></div>;
      const List = block.type === 'ordered' ? 'ol' : 'ul';
      return <List key={blockIndex}>{block.items.map((item, itemIndex) => <li key={itemIndex}>{inlineParts(item)}</li>)}</List>;
    })}
  </div>;
}
