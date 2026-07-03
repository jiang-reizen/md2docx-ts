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

/**
 * *公共接口*
 *
 * 将 Markdown 字符串解析为项目内部 IR。该 parser 只支持课程论文所需的窄 Markdown
 * 子集；遇到链接、图片、代码块等未支持结构时会直接抛错。
 *
 * @param input Markdown 原文
 * @returns 内部文档 IR
 */
export function parseMarkdown(input: string): Document {
  const footnoteDefinitions = scanFootnoteDefinitions(input);
  preflight(input);
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

  /**
   * *内部流程*
   *
   * 从当前 token 位置开始解析块级结构，直到 token 结束、遇到脚注块，或遇到指定的
   * stopType。列表项解析会用 stopType 停在 `list_item_close`。
   *
   * @param stopType 可选的停止 token 类型
   * @returns 块级 IR 列表
   */
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

  /**
   * *内部流程*
   *
   * 解析 markdown-it-footnote 生成的脚注 token 块，并把定义写入引用池。
   * 脚注定义只允许单段内容，且定义内部不允许再次引用脚注。
   */
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

  /**
   * *内部流程*
   *
   * 解析一个标题块。标题等级来自 markdown-it 的 `h1` 到 `h6` tag。
   *
   * @param open heading_open token
   * @returns 标题 IR
   */
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

  /**
   * *内部流程*
   *
   * 解析一个普通段落，并递归转换段落内的 inline token。
   *
   * @returns 段落 IR
   */
  private parseParagraph(): Block {
    this.index++;
    const inline = this.expect("inline");
    this.expect("paragraph_close");
    return {
      kind: "Paragraph",
      content: convertInline(inline.children ?? [], this.references, { bold: false, italic: false }, false),
    };
  }

  /**
   * *内部流程*
   *
   * 解析有序列表，并校验起始编号必须为 1。
   *
   * @param open ordered_list_open token
   * @returns 列表 IR
   */
  private parseOrderedList(open: Token): List {
    const startAttr = open.attrs?.find(([name]) => name === "start")?.[1];
    if (startAttr !== undefined && Number(startAttr) !== 1) {
      throw new Error(`md2docx parser: ordered list must start at 1, got ${startAttr}`);
    }
    return this.parseList("Ordered");
  }

  /**
   * *内部流程*
   *
   * 解析有序或无序列表。列表项内部会再次调用 parseUntil，因此支持嵌套列表。
   *
   * @param listKind 列表类型
   * @returns 列表 IR
   */
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

  /**
   * *内部工具*
   *
   * 消费当前 token，并校验它的类型是否符合预期。
   *
   * @param type 预期 token 类型
   * @returns 当前 token
   */
  private expect(type: string): Token {
    const token = this.tokens[this.index];
    if (!token || token.type !== type) {
      throw new Error(`md2docx parser: expected ${type}, got ${token?.type ?? "end"}`);
    }
    this.index++;
    return token;
  }
}

/**
 * *内部流程*
 *
 * 将 markdown-it 的 inline token 转换为内部行内 IR。粗体和斜体通过递归继承样式，
 * 脚注引用会注册到引用池。
 *
 * @param tokens inline token 列表
 * @param references 脚注引用池
 * @param style 从父级继承的行内样式
 * @param insideFootnoteDefinition 当前是否位于脚注定义内
 * @returns 行内 IR 列表
 */
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

/**
 * *内部工具*
 *
 * 按 ASCII / 非 ASCII 将文本切成连续语言 run。渲染阶段会根据 language 选择英文字体
 * 或中文字体。
 *
 * @param content 原始文本
 * @param style 当前继承的粗体/斜体样式
 * @returns 文本 run IR 列表
 */
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

/**
 * *内部工具*
 *
 * 在扁平 inline token 列表中查找 strong/em open token 对应的 close token。
 *
 * @param tokens inline token 列表
 * @param start open token 的下标
 * @param closeType 需要匹配的 close token 类型
 * @returns 匹配 close token 的下标
 */
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

/**
 * *内部校验*
 *
 * 在 markdown-it 正式解析前拦截部分语法。它们可能不会稳定暴露成 token，
 * 但本项目仍然需要把它们视为不支持结构。
 *
 * @param input Markdown 原文
 */
function preflight(input: string): void {
  if (/^\s*[-*+]\s+\[[ xX]\]/m.test(input)) {
    throw new Error("md2docx parser: unsupported block token: task_list_checkbox");
  }
  if (/^\s*\$\$/m.test(input)) {
    throw new Error("md2docx parser: unsupported block token: math");
  }
}

/**
 * *内部校验*
 *
 * 预扫描脚注定义，补足 markdown-it-footnote 对“未被引用的重复定义”等情况不输出
 * token 的边界。该函数只提取单行定义内容，多段定义会直接报错。
 *
 * @param input Markdown 原文
 * @returns 脚注定义 key 和单行内容
 */
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
