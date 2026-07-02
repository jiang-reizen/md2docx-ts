import MarkdownIt from "markdown-it";
import footnote from "markdown-it-footnote";
import type Token from "markdown-it/lib/token.mjs";
import {
  createEmptyDocument,
  defineReference,
  getOrCreateReferenceId,
  type Block,
  type Document,
  type HeadingLevel,
  type InlineNodes,
  type List,
  type ListKind,
  type ReferencePool,
  type TextLanguage,
} from "./ir.js";

interface InlineStyle {
  bold: boolean;
  italic: boolean;
}

const markdown = new MarkdownIt({
  html: false,
  linkify: false,
  typographer: false,
}).use(footnote);

markdown.disable("code");

const unsupportedBlocks = new Set([
  "blockquote_open",
  "hr",
  "fence",
  "code_block",
  "html_block",
  "table_open",
]);

const unsupportedInline = new Set([
  "link_open",
  "image",
  "code_inline",
  "html_inline",
  "s_open",
  "softbreak",
  "hardbreak",
]);

export function parseMarkdown(input: string): Document {
  preflight(input);
  const footnoteDefinitions = scanFootnoteDefinitions(input);
  const tokens = markdown.parse(input, {});
  const document = createEmptyDocument();
  const parser = new BlockParser(tokens, document.referencePool);
  document.blocks = parser.parseUntil();
  parser.parseFootnotes();
  for (const definition of footnoteDefinitions) {
    if (document.referencePool.idsByKey.has(definition.key)) continue;
    const inline = markdown.parseInline(definition.content, {})[0];
    defineReference(
      document.referencePool,
      definition.key,
      convertInline(inline?.children ?? [], document.referencePool, { bold: false, italic: false }, true),
    );
  }
  return document;
}

class BlockParser {
  private index = 0;

  constructor(
    private readonly tokens: Token[],
    private readonly references: ReferencePool,
  ) {}

  parseUntil(stopType?: string): Block[] {
    const blocks: Block[] = [];
    while (this.index < this.tokens.length) {
      const token = this.tokens[this.index];
      if (!token) break;
      if (stopType && token.type === stopType) {
        this.index++;
        break;
      }
      if (token.type === "footnote_block_open") break;
      if (unsupportedBlocks.has(token.type)) unsupportedBlock(token);

      switch (token.type) {
        case "heading_open":
          blocks.push(this.parseHeading(token));
          break;
        case "paragraph_open":
          blocks.push(this.parseParagraph());
          break;
        case "bullet_list_open":
          blocks.push(this.parseList("Unordered"));
          break;
        case "ordered_list_open":
          blocks.push(this.parseOrderedList(token));
          break;
        default:
          unsupportedBlock(token);
      }
    }
    return blocks;
  }

  parseFootnotes(): void {
    if (this.index >= this.tokens.length) return;
    this.expect("footnote_block_open");

    while (this.index < this.tokens.length && this.tokens[this.index]?.type !== "footnote_block_close") {
      const open = this.expect("footnote_open");
      const key = String(open.meta?.label ?? open.meta?.id ?? "");
      const paragraph = this.expect("paragraph_open");
      if (paragraph.level !== 1) {
        throw new Error("md2docx parser: unsupported footnote definition block");
      }
      const inline = this.expect("inline");
      const content = convertInline(inline.children ?? [], this.references, { bold: false, italic: false }, true);
      const next = this.tokens[this.index];
      if (next?.type === "footnote_anchor") this.index++;
      this.expect("paragraph_close");
      this.expect("footnote_close");
      defineReference(this.references, key, content);
    }

    this.expect("footnote_block_close");
    if (this.index < this.tokens.length) unsupportedBlock(this.tokens[this.index]!);
  }

  private parseHeading(open: Token): Block {
    const level = Number(open.tag.slice(1)) as HeadingLevel;
    this.index++;
    const inline = this.expect("inline");
    this.expect("heading_close");
    return {
      kind: "Heading",
      level,
      content: convertInline(inline.children ?? [], this.references, { bold: false, italic: false }, false),
    };
  }

  private parseParagraph(): Block {
    this.index++;
    const inline = this.expect("inline");
    this.expect("paragraph_close");
    return {
      kind: "Paragraph",
      content: convertInline(inline.children ?? [], this.references, { bold: false, italic: false }, false),
    };
  }

  private parseOrderedList(open: Token): List {
    const startAttr = open.attrs?.find(([name]) => name === "start")?.[1];
    if (startAttr !== undefined && Number(startAttr) !== 1) {
      throw new Error(`md2docx parser: ordered list must start at 1, got ${startAttr}`);
    }
    return this.parseList("Ordered");
  }

  private parseList(listKind: ListKind): List {
    const closeType = listKind === "Ordered" ? "ordered_list_close" : "bullet_list_close";
    this.index++;
    const items: List["items"] = [];

    while (this.index < this.tokens.length && this.tokens[this.index]?.type !== closeType) {
      this.expect("list_item_open");
      items.push({ content: this.parseUntil("list_item_close") });
    }
    this.expect(closeType);
    return { kind: "List", listKind, items };
  }

  private expect(type: string): Token {
    const token = this.tokens[this.index];
    if (!token || token.type !== type) {
      throw new Error(`md2docx parser: expected ${type}, got ${token?.type ?? "end"}`);
    }
    this.index++;
    return token;
  }
}

function convertInline(
  tokens: Token[],
  references: ReferencePool,
  style: InlineStyle,
  insideFootnoteDefinition: boolean,
): InlineNodes {
  const output: InlineNodes = [];
  let index = 0;

  while (index < tokens.length) {
    const token = tokens[index]!;
    if (unsupportedInline.has(token.type)) unsupportedInlineToken(token);

    if (token.type === "text") {
      output.push(...splitText(token.content, style));
      index++;
      continue;
    }

    if (token.type === "strong_open" || token.type === "em_open") {
      const closeType = token.type === "strong_open" ? "strong_close" : "em_close";
      const end = findMatchingClose(tokens, index, closeType);
      const nextStyle = {
        bold: style.bold || token.type === "strong_open",
        italic: style.italic || token.type === "em_open",
      };
      output.push(...convertInline(tokens.slice(index + 1, end), references, nextStyle, insideFootnoteDefinition));
      index = end + 1;
      continue;
    }

    if (token.type === "footnote_ref") {
      if (insideFootnoteDefinition) {
        throw new Error("md2docx parser: unsupported inline token in footnote definition: footnote_ref");
      }
      const key = String(token.meta?.label ?? token.meta?.id ?? "");
      output.push({ kind: "Reference", id: getOrCreateReferenceId(references, key) });
      index++;
      continue;
    }

    if (token.type.endsWith("_close")) {
      throw new Error(`md2docx parser: unmatched inline token: ${token.type}`);
    }
    unsupportedInlineToken(token);
  }

  return output;
}

function splitText(content: string, style: InlineStyle): InlineNodes {
  const output: InlineNodes = [];
  let current = "";
  let language: TextLanguage = "Auto";

  for (const char of content) {
    const nextLanguage: TextLanguage = char.charCodeAt(0) <= 0x7f ? "English" : "Chinese";
    if (current && nextLanguage !== language) {
      output.push({ kind: "Text", content: current, language, ...style });
      current = "";
    }
    current += char;
    language = nextLanguage;
  }

  if (current) output.push({ kind: "Text", content: current, language, ...style });
  return output;
}

function findMatchingClose(tokens: Token[], start: number, closeType: string): number {
  let depth = 0;
  const openType = tokens[start]!.type;
  for (let index = start + 1; index < tokens.length; index++) {
    const token = tokens[index]!;
    if (token.type === openType) depth++;
    if (token.type === closeType) {
      if (depth === 0) return index;
      depth--;
    }
  }
  throw new Error(`md2docx parser: missing inline close token: ${closeType}`);
}

function preflight(input: string): void {
  scanFootnoteDefinitions(input);
  if (/^\s*[-*+]\s+\[[ xX]\]/m.test(input)) {
    throw new Error("md2docx parser: unsupported block token: task_list_checkbox");
  }
  if (/^\s*\$\$/m.test(input)) {
    throw new Error("md2docx parser: unsupported block token: math");
  }
}

function scanFootnoteDefinitions(input: string): Array<{ key: string; content: string }> {
  const definitions: Array<{ key: string; content: string }> = [];
  const seen = new Set<string>();
  const lines = input.split(/\r?\n/);

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;
    const match = /^ {0,3}\[\^([^\]]+)]:[ \t]*(.*)$/.exec(line);
    if (!match) continue;

    const key = match[1]!;
    if (seen.has(key)) throw new Error(`md2docx parser: duplicate footnote definition: ${key}`);
    seen.add(key);
    const content = match[2] ?? "";
    if (/\[\^[^\]]+]/.test(content)) {
      throw new Error("md2docx parser: unsupported inline token in footnote definition: footnote_ref");
    }
    definitions.push({ key, content });

    for (let next = index + 1; next < lines.length; next++) {
      const nextLine = lines[next]!;
      if (/^ {0,3}\[\^[^\]]+]:/.test(nextLine)) break;
      if (!nextLine.trim()) continue;
      if (/^(?: {4,}|\t)/.test(nextLine)) {
        throw new Error("md2docx parser: unsupported block token: footnote_definition_multiblock");
      }
      break;
    }
  }
  return definitions;
}

function unsupportedBlock(token: Token): never {
  throw new Error(`md2docx parser: unsupported block token: ${token.type}`);
}

function unsupportedInlineToken(token: Token): never {
  throw new Error(`md2docx parser: unsupported inline token: ${token.type}`);
}
