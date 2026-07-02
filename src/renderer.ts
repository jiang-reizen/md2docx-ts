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

export async function writeDocx(document: Document, style: DocxStyle, outputPath: string): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, await buildDocx(document, style));
}

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

function renderTextRun(text: Text, style: TextRunStyle, footnoteContent: boolean): TextRun {
  return new TextRun({
    text: text.content,
    bold: style.bold || text.bold,
    italics: style.italic || text.italic,
    ...(footnoteContent ? {} : { size: style.size, font: fontForText(text, style) }),
  });
}

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
