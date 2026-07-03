import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  AlignmentType,
  Document as DocxDocument,
  FootnoteReference,
  LevelFormat,
  LevelSuffix,
  Packer,
  Paragraph,
  Tab,
  TabStopType,
  TextRun,
  type ILevelsOptions,
  type ParagraphChild,
} from "docx";
import type { Block, Document, Inline, InlineNodes, List, Text } from "./ir.js";
import { patchDocxXml } from "./ooxmlPatch.js";
import type { DocxStyle, ListLevelStyle, NumberingFormat, TextRunStyle } from "./style.js";

const ORDERED_REFERENCE = "md2docx-ordered";
const UNORDERED_REFERENCE = "md2docx-unordered";
const FIRST_LIST_NUMBERING_ID = 20;
const MAX_LIST_LEVELS = 6;

interface RenderContext {
  style: DocxStyle;
  footnotes: Record<string, { children: Paragraph[] }>;
  nextListNumberingId: number;
}

interface ParagraphRenderOptions {
  inListItem: boolean;
  numbering?: { reference: string; level: number; instance: number };
}

/**
 * *公共接口*
 *
 * 将内部文档 IR 和样式对象渲染为 DOCX buffer。函数会先通过 docx 库生成主体内容，
 * 再 patch 必要的 OOXML 细节。
 *
 * @param document 内部文档 IR
 * @param style DOCX 样式对象
 * @returns DOCX 文件内容
 */
export async function buildDocx(document: Document, style: DocxStyle): Promise<Buffer> {
  const context: RenderContext = {
    style,
    footnotes: buildFootnotes(document, style),
    nextListNumberingId: FIRST_LIST_NUMBERING_ID,
  };

  const children = renderBlocks(document.blocks, context, 0, false);
  const doc = new DocxDocument({
    styles: footnoteStyles(),
    numbering: {
      config: [
        { reference: ORDERED_REFERENCE, levels: buildLevels(style, "Ordered") },
        { reference: UNORDERED_REFERENCE, levels: buildLevels(style, "Unordered") },
      ],
    },
    footnotes: context.footnotes,
    sections: [{ children }],
  });

  return patchDocxXml(await Packer.toBuffer(doc));
}

/**
 * *公共接口*
 *
 * 将内部文档 IR 写出为 DOCX 文件。输出目录不存在时会自动创建。
 *
 * @param document 内部文档 IR
 * @param style DOCX 样式对象
 * @param outputPath 输出 DOCX 路径
 */
export async function writeDocx(document: Document, style: DocxStyle, outputPath: string): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, await buildDocx(document, style));
}

/**
 * *内部流程*
 *
 * 递归渲染块级 IR。列表会进入 renderList，标题和段落会进入 renderTextBlock。
 *
 * @param blocks 块级 IR 列表
 * @param context 渲染上下文
 * @param level 当前列表层级
 * @param inListItem 当前是否位于列表项内部
 * @returns docx 段落列表
 */
function renderBlocks(blocks: Block[], context: RenderContext, level: number, inListItem: boolean): Paragraph[] {
  const output: Paragraph[] = [];
  for (const block of blocks) {
    if (block.kind === "List") {
      output.push(...renderList(block, context, level));
    } else {
      output.push(renderTextBlock(block, context, { inListItem }));
    }
  }
  return output;
}

/**
 * *内部流程*
 *
 * 渲染一个 Markdown List。每个 Markdown list block 会分配独立 numbering instance，
 * 避免不同父项下的嵌套有序列表互相续号。
 *
 * @param list 列表 IR
 * @param context 渲染上下文
 * @param level 当前列表层级
 * @returns docx 段落列表
 */
function renderList(list: List, context: RenderContext, level: number): Paragraph[] {
  const output: Paragraph[] = [];
  const instance = context.nextListNumberingId++;
  const reference = list.listKind === "Ordered" ? ORDERED_REFERENCE : UNORDERED_REFERENCE;
  const clamped = clampLevel(level);

  for (const item of list.items) {
    item.content.forEach((block, index) => {
      if (block.kind === "List") {
        output.push(...renderList(block, context, level + 1));
        return;
      }
      output.push(
        renderTextBlock(block, context, {
          inListItem: true,
          numbering: index === 0 ? { reference, level: clamped, instance } : undefined,
        }),
      );
    });
  }
  return output;
}

/**
 * *内部流程*
 *
 * 渲染标题或段落。普通正文段落使用 tab stop + tab run 实现段首缩进；
 * 列表项内部段落不会添加段首 tab。
 *
 * @param block 标题或段落 IR
 * @param context 渲染上下文
 * @param options 段落渲染选项
 * @returns docx 段落
 */
function renderTextBlock(
  block: Exclude<Block, List>,
  context: RenderContext,
  options: ParagraphRenderOptions,
): Paragraph {
  const runStyle = block.kind === "Heading" ? context.style.headings[block.level - 1] : context.style.paragraph;
  const children: ParagraphChild[] = [
    ...(!options.inListItem && block.kind === "Paragraph" ? [new TextRun({ children: [new Tab()] })] : []),
    ...renderInline(block.content, runStyle, context, false),
  ];

  return new Paragraph({
    children,
    alignment: runStyle.alignment === "center" ? AlignmentType.CENTER : AlignmentType.LEFT,
    spacing: { line: runStyle.lineSpacing },
    tabStops: !options.inListItem && block.kind === "Paragraph"
      ? [{ type: TabStopType.LEFT, position: runStyle.tabStop }]
      : undefined,
    numbering: options.numbering,
  });
}

/**
 * *内部流程*
 *
 * 渲染行内 IR。普通文本进入 renderTextRun，脚注引用进入 renderReference。
 *
 * @param nodes 行内 IR 列表
 * @param style 当前文本样式
 * @param context 渲染上下文
 * @param footnoteContent 是否正在渲染脚注正文
 * @returns docx 段落子节点列表
 */
function renderInline(
  nodes: InlineNodes,
  style: TextRunStyle,
  context: RenderContext,
  footnoteContent: boolean,
): ParagraphChild[] {
  return nodes.map((node) => {
    if (node.kind === "Reference") return renderReference(node.id, style, context);
    return renderTextRun(node, style, footnoteContent);
  });
}

/**
 * *内部流程*
 *
 * 渲染单个文本 run。脚注正文 run 不显式设置字体和字号，让 Word 的 FootnoteText
 * 样式接管。
 *
 * @param text 文本 IR
 * @param style 当前文本样式
 * @param footnoteContent 是否正在渲染脚注正文
 * @returns docx TextRun
 */
function renderTextRun(text: Text, style: TextRunStyle, footnoteContent: boolean): TextRun {
  return new TextRun({
    text: text.content,
    bold: style.bold || text.bold,
    italics: style.italic || text.italic,
    ...(footnoteContent ? {} : { size: style.size, font: fontForText(text, style) }),
  });
}

/**
 * *内部流程*
 *
 * 渲染正文中的脚注引用，并检查引用对应的脚注定义是否存在。
 *
 * @param id 内部脚注 id
 * @param style 当前文本样式
 * @param context 渲染上下文
 * @returns docx TextRun
 */
function renderReference(id: number, style: TextRunStyle, context: RenderContext): TextRun {
  const footnoteId = id + 1;
  if (!context.footnotes[String(footnoteId)]) {
    throw new Error(`md2docx renderer: missing footnote definition for reference ${id}`);
  }
  return new TextRun({
    style: "FootnoteReference",
    size: style.size,
    font: { ascii: style.englishFont, hAnsi: style.englishFont, cs: style.englishFont },
    children: [new FootnoteReference(footnoteId)],
  });
}

/**
 * *内部流程*
 *
 * 根据引用池中的脚注定义生成 docx 库需要的 footnotes 配置。
 *
 * @param document 内部文档 IR
 * @param style DOCX 样式对象
 * @returns docx footnotes 配置
 */
function buildFootnotes(document: Document, style: DocxStyle): Record<string, { children: Paragraph[] }> {
  const footnotes: Record<string, { children: Paragraph[] }> = {};
  document.referencePool.definitions.forEach((definition, id) => {
    if (!definition) return;

    const footnoteId = id + 1;
    const children: ParagraphChild[] = [
      new TextRun({ text: " " }),
      ...renderInline(definition, style.referenceDefinition, { style, footnotes, nextListNumberingId: 0 }, true),
    ];
    footnotes[String(footnoteId)] = {
      children: [
        new Paragraph({
          style: "FootnoteText",
          children,
          alignment: style.referenceDefinition.alignment === "center" ? AlignmentType.CENTER : AlignmentType.LEFT,
          spacing: { line: style.referenceDefinition.lineSpacing },
        }),
      ],
    };
  });
  return footnotes;
}

/**
 * *内部流程*
 *
 * 将项目列表样式转换为 docx numbering levels。无序列表会强制使用 bullet format，
 * 但保留对应层级的缩进、字体和字号。
 *
 * @param style DOCX 样式对象
 * @param kind 列表类型
 * @returns docx numbering level 配置
 */
function buildLevels(style: DocxStyle, kind: "Ordered" | "Unordered"): ILevelsOptions[] {
  return style.list.levels.map((level, index) => {
    const effective = kind === "Unordered" ? unorderedLevel(level) : level;
    return {
      level: index,
      format: mapLevelFormat(effective.format),
      text: effective.text.replace(/%NaN/g, `%${index + 1}`),
      alignment: AlignmentType.LEFT,
      start: 1,
      suffix: LevelSuffix.TAB,
      style: {
        run: { font: effective.font, size: effective.size },
        paragraph: {
          indent: { left: effective.leftIndent, hanging: effective.hangingIndent },
        },
      },
    };
  });
}

function unorderedLevel(level: ListLevelStyle): ListLevelStyle {
  return {
    ...level,
    format: "bullet",
    text: level.format === "bullet" ? level.text : "•",
  };
}

function mapLevelFormat(format: NumberingFormat): (typeof LevelFormat)[keyof typeof LevelFormat] {
  const map = {
    bullet: LevelFormat.BULLET,
    decimal: LevelFormat.DECIMAL,
    lowerLetter: LevelFormat.LOWER_LETTER,
    upperLetter: LevelFormat.UPPER_LETTER,
    lowerRoman: LevelFormat.LOWER_ROMAN,
    upperRoman: LevelFormat.UPPER_ROMAN,
    chineseCounting: LevelFormat.CHINESE_COUNTING,
  } satisfies Record<NumberingFormat, (typeof LevelFormat)[keyof typeof LevelFormat]>;
  return map[format];
}

/**
 * *内部工具*
 *
 * 根据文本语言选择 Word run 的字体属性。英文 run 只写 ascii/hAnsi/cs；
 * 中文 run 额外写 eastAsia 和 eastAsia hint。
 *
 * @param text 文本 IR
 * @param style 当前文本样式
 * @returns docx 字体属性
 */
function fontForText(text: Text, style: TextRunStyle) {
  if (text.language === "English") {
    return { ascii: style.englishFont, hAnsi: style.englishFont, cs: style.englishFont };
  }
  return {
    eastAsia: style.chineseFont,
    ascii: style.chineseFont,
    hAnsi: style.chineseFont,
    cs: style.chineseFont,
    hint: "eastAsia",
  };
}

function clampLevel(level: number): number {
  return Math.min(level, MAX_LIST_LEVELS - 1);
}

function footnoteStyles() {
  return {
    paragraphStyles: [
      {
        id: "FootnoteText",
        name: "footnote text",
        basedOn: "Normal",
        link: "FootnoteTextChar",
        uiPriority: 99,
        semiHidden: true,
        unhideWhenUsed: true,
        quickFormat: false,
      },
    ],
    characterStyles: [
      {
        id: "FootnoteTextChar",
        name: "Footnote Text Char",
        basedOn: "DefaultParagraphFont",
        link: "FootnoteText",
        uiPriority: 99,
        semiHidden: true,
        quickFormat: false,
      },
      {
        id: "FootnoteReference",
        name: "footnote reference",
        basedOn: "DefaultParagraphFont",
        uiPriority: 99,
        semiHidden: true,
        unhideWhenUsed: true,
        quickFormat: false,
        run: { superScript: true },
      },
    ],
  };
}
