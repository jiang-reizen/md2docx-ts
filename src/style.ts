import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type ParagraphAlignment = "left" | "center";

export interface TextRunStyle {
  chineseFont: string;
  englishFont: string;
  size: number;
  tabStop: number;
  lineSpacing: number;
  alignment: ParagraphAlignment;
  bold: boolean;
  italic: boolean;
}

export type NumberingFormat =
  | "bullet"
  | "decimal"
  | "lowerLetter"
  | "upperLetter"
  | "lowerRoman"
  | "upperRoman"
  | "chineseCounting";

export interface ListLevelStyle {
  format: NumberingFormat;
  font: string;
  size: number;
  text: string;
  leftIndent: number;
  hangingIndent: number;
}

export interface ListStyle {
  levels: [
    ListLevelStyle,
    ListLevelStyle,
    ListLevelStyle,
    ListLevelStyle,
    ListLevelStyle,
    ListLevelStyle,
  ];
}

export interface DocxStyle {
  headings: [
    TextRunStyle,
    TextRunStyle,
    TextRunStyle,
    TextRunStyle,
    TextRunStyle,
    TextRunStyle,
  ];
  paragraph: TextRunStyle;
  referenceDefinition: TextRunStyle;
  list: ListStyle;
}

type TextField = keyof TextRunStyle;
type ListField = keyof ListLevelStyle;

const textFields = new Set<string>([
  "chinese_font",
  "english_font",
  "size",
  "tab_stop",
  "line_spacing",
  "alignment",
  "bold",
  "italic",
]);

const listFields = new Set<string>([
  "format",
  "font",
  "size",
  "text",
  "left_indent",
  "hanging_indent",
]);

/**
 * *公共接口*
 *
 * 创建项目内置默认样式。返回对象包含 6 级标题、正文、脚注定义和 6 级列表样式。
 *
 * @returns 默认 DOCX 样式对象
 */
export function createDefaultStyle(): DocxStyle {
  return {
    headings: [
      textStyle("SimHei", "Times New Roman", 32, 640, 360, "center", true, false),
      textStyle("SimHei", "Times New Roman", 28, 560, 360, "left", true, false),
      textStyle("SimHei", "Times New Roman", 26, 520, 360, "left", true, false),
      textStyle("SimHei", "Times New Roman", 24, 480, 360, "left", true, false),
      textStyle("SimHei", "Times New Roman", 22, 440, 360, "left", true, false),
      textStyle("SimHei", "Times New Roman", 21, 420, 360, "left", true, false),
    ],
    paragraph: textStyle("SimSun", "Times New Roman", 24, 480, 360, "left", false, false),
    referenceDefinition: textStyle("SimSun", "Times New Roman", 20, 400, 240, "left", false, false),
    list: {
      levels: [
        listLevel("decimal", 1, 720),
        listLevel("lowerLetter", 2, 1440),
        listLevel("chineseCounting", 3, 2160),
        listLevel("lowerRoman", 4, 2880),
        listLevel("decimal", 5, 3600),
        listLevel("lowerLetter", 6, 4320),
      ],
    },
  };
}

/**
 * *公共接口*
 *
 * 读取样式配置文件，并把配置覆盖到默认样式上。未出现的字段保留默认值。
 *
 * @param path 样式配置文件路径
 * @returns 覆盖后的 DOCX 样式对象
 */
export function loadStyleFromFile(path: string): DocxStyle {
  const style = createDefaultStyle();
  applyStyleConfig(style, readFileSync(path, "utf8"));
  return style;
}

/**
 * *公共接口*
 *
 * 创建新的样式配置文件。文件名不检查后缀，父目录不存在时会自动创建。
 * 使用 `wx` 模式写入，因此目标文件已存在时会失败，避免覆盖用户配置。
 *
 * @param path 要创建的样式文件路径
 * @param style 要写入的样式对象，默认使用内置默认样式
 */
export function createStyleFile(path: string, style = createDefaultStyle()): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, serializeStyle(style), { encoding: "utf8", flag: "wx" });
}

/**
 * *公共接口*
 *
 * 在已有样式文件中写入或修改一条配置。写入前会复用样式解析逻辑校验 key/value，
 * 因此非法配置不会落盘。
 *
 * @param path 样式文件路径
 * @param key 样式配置 key
 * @param value 样式配置 value
 */
export function setStyleValue(path: string, key: string, value: string): void {
  validateStyleEntry(key, value);
  const input = readFileSync(path, "utf8");
  const output = upsertConfigLine(input, key, value);
  writeFileSync(path, output, "utf8");
}

/**
 * *公共接口*
 *
 * 将配置文本应用到给定样式对象。配置格式为一行一个 `key = value`，空行和注释会被忽略。
 *
 * @param style 被修改的样式对象
 * @param input 样式配置文本
 * @returns 传入的同一个 style 对象
 */
export function applyStyleConfig(style: DocxStyle, input: string): DocxStyle {
  input.split(/\r?\n/).forEach((rawLine, index) => {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) return;

    const eq = line.indexOf("=");
    if (eq < 0) throw new Error(`md2docx style: invalid line ${index + 1}: ${rawLine}`);

    const key = line.slice(0, eq).trim();
    const value = unquote(line.slice(eq + 1).trim());
    applyConfigEntry(style, key, value);
  });
  return style;
}

/**
 * *公共接口*
 *
 * 将完整样式对象序列化为 style.conf 文本。通常由 createStyleFile 调用，也可用于
 * 调用方自行保存样式内容。
 *
 * @param style 样式对象
 * @returns 可写入文件的样式配置文本
 */
export function serializeStyle(style: DocxStyle): string {
  const lines = [
    "# md2docx-ts style config",
    "",
    ...serializeTextStyle("paragraph", style.paragraph),
    "",
    ...serializeTextStyle("reference_definition", style.referenceDefinition),
    "",
    ...style.headings.flatMap((heading, index) => [
      ...(index === 0 ? [] : [""]),
      ...serializeTextStyle(`heading.h${index + 1}`, heading),
    ]),
    "",
    ...style.list.levels.flatMap((level, index) => [
      ...(index === 0 ? [] : [""]),
      ...serializeListLevel(`list.level.${index}`, level),
    ]),
  ];
  return `${lines.join("\n")}\n`;
}

function textStyle(
  chineseFont: string,
  englishFont: string,
  size: number,
  tabStop: number,
  lineSpacing: number,
  alignment: ParagraphAlignment,
  bold: boolean,
  italic: boolean,
): TextRunStyle {
  return { chineseFont, englishFont, size, tabStop, lineSpacing, alignment, bold, italic };
}

function listLevel(format: NumberingFormat, level: number, leftIndent: number): ListLevelStyle {
  return {
    format,
    font: defaultNumberingFont(format),
    size: 24,
    text: defaultNumberingText(format, level),
    leftIndent,
    hangingIndent: 360,
  };
}

function applyConfigEntry(style: DocxStyle, key: string, value: string): void {
  const parts = key.split(".").map((part) => part.trim());
  if (parts[0] === "paragraph" && parts.length === 2) {
    applyTextField(style.paragraph, parts[1], value);
    return;
  }
  if (parts[0] === "reference_definition" && parts.length === 2) {
    applyTextField(style.referenceDefinition, parts[1], value);
    return;
  }
  if (parts[0] === "heading" && parts.length === 3) {
    applyTextField(style.headings[parseHeadingLevel(parts[1]) - 1], parts[2], value);
    return;
  }
  if (parts[0] === "list" && parts[1] === "level" && parts.length === 4) {
    const level = parseListLevel(parts[2]);
    applyListField(style.list.levels[level], parts[3], value, level + 1);
    return;
  }
  throw new Error(`md2docx style: unknown key: ${key}`);
}

/**
 * *内部校验*
 *
 * 用默认样式试应用单条配置，借用完整解析路径校验 key 和 value。
 *
 * @param key 样式配置 key
 * @param value 样式配置 value
 */
function validateStyleEntry(key: string, value: string): void {
  applyStyleConfig(createDefaultStyle(), `${key} = ${value}`);
}

function applyTextField(style: TextRunStyle, field: string, value: string): void {
  if (!textFields.has(field)) throw new Error(`md2docx style: unknown text field: ${field}`);

  const prop = toTextProp(field);
  switch (prop) {
    case "chineseFont":
    case "englishFont":
      style[prop] = value;
      break;
    case "size":
    case "tabStop":
      style[prop] = parseInteger(value, field);
      break;
    case "lineSpacing":
      style.lineSpacing = parseLineSpacing(value);
      break;
    case "alignment":
      style.alignment = parseAlignment(value);
      break;
    case "bold":
    case "italic":
      style[prop] = parseBool(value);
      break;
  }
}

function applyListField(style: ListLevelStyle, field: string, value: string, level: number): void {
  if (!listFields.has(field)) throw new Error(`md2docx style: unknown list field: ${field}`);

  const prop = toListProp(field);
  switch (prop) {
    case "format": {
      const format = parseNumberingFormat(value);
      style.format = format;
      // Rust 版在 format 改变时会立刻重置依赖 format 的默认 text/font。
      style.text = defaultNumberingText(format, level);
      style.font = defaultNumberingFont(format);
      break;
    }
    case "font":
    case "text":
      style[prop] = value;
      break;
    case "size":
    case "leftIndent":
    case "hangingIndent":
      style[prop] = parseInteger(value, field);
      break;
  }
}

function toTextProp(field: string): TextField {
  return field.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase()) as TextField;
}

function toListProp(field: string): ListField {
  return field.replace(/_([a-z])/g, (_, char: string) => char.toUpperCase()) as ListField;
}

function parseHeadingLevel(value: string): 1 | 2 | 3 | 4 | 5 | 6 {
  const match = /^(?:h|level)([1-6])$/.exec(value);
  if (!match) throw new Error(`md2docx style: heading level out of range: ${value}`);
  return Number(match[1]) as 1 | 2 | 3 | 4 | 5 | 6;
}

function parseListLevel(value: string): 0 | 1 | 2 | 3 | 4 | 5 {
  if (!/^[0-5]$/.test(value)) throw new Error(`md2docx style: list level out of range: ${value}`);
  return Number(value) as 0 | 1 | 2 | 3 | 4 | 5;
}

function parseAlignment(value: string): ParagraphAlignment {
  const normalized = normalize(value);
  if (normalized === "left" || normalized === "center") return normalized;
  throw new Error(`md2docx style: invalid alignment: ${value}`);
}

function parseBool(value: string): boolean {
  const normalized = normalize(value);
  if (["true", "yes", "on", "1"].includes(normalized)) return true;
  if (["false", "no", "off", "0"].includes(normalized)) return false;
  throw new Error(`md2docx style: invalid bool: ${value}`);
}

function parseLineSpacing(value: string): number {
  const raw = value.trim().toLowerCase();
  if (raw === "1.0") return 240;
  if (raw === "1.5") return 360;
  if (raw === "2.0") return 480;

  const normalized = normalize(value);
  if (["single", "1", "10"].includes(normalized)) return 240;
  if (["oneandhalf", "15"].includes(normalized)) return 360;
  if (["double", "2", "20"].includes(normalized)) return 480;
  return parseInteger(value, "line_spacing");
}

function parseNumberingFormat(value: string): NumberingFormat {
  const normalized = normalize(value);
  if (normalized === "bullet") return "bullet";
  if (["decimal", "number", "numbers", "123"].includes(normalized)) return "decimal";
  if (["lowerletter", "loweralpha", "abc"].includes(normalized)) return "lowerLetter";
  if (["upperletter", "upperalpha", "abcupper"].includes(normalized)) return "upperLetter";
  if (["lowerroman", "roman", "iii"].includes(normalized)) return "lowerRoman";
  if (["upperroman", "romanupper"].includes(normalized)) return "upperRoman";
  if (["chinese", "chinesecounting", "一二三"].includes(normalized)) return "chineseCounting";
  throw new Error(`md2docx style: invalid numbering format: ${value}`);
}

function parseInteger(value: string, field: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || String(parsed) !== value.trim()) {
    throw new Error(`md2docx style: invalid integer for ${field}: ${value}`);
  }
  return parsed;
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/[\s_-]+/g, "");
}

function unquote(value: string): string {
  return value.length >= 2 && value.startsWith('"') && value.endsWith('"')
    ? value.slice(1, -1)
    : value;
}

/**
 * *内部工具*
 *
 * 在配置文本中更新指定 key；如果 key 不存在，则追加到文件末尾。
 * 注释行不会被当作可更新配置。
 *
 * @param input 原配置文本
 * @param key 要写入的配置 key
 * @param value 要写入的配置 value
 * @returns 更新后的配置文本
 */
function upsertConfigLine(input: string, key: string, value: string): string {
  const lines = input.split(/\r?\n/);
  const normalizedKey = key.trim();
  let replaced = false;

  const output = lines.map((line) => {
    const eq = line.indexOf("=");
    if (eq < 0 || line.trim().startsWith("#")) return line;
    if (line.slice(0, eq).trim() !== normalizedKey) return line;
    replaced = true;
    return `${normalizedKey} = ${value}`;
  });

  if (!replaced) {
    if (output.length > 0 && output[output.length - 1] !== "") output.push("");
    output.push(`${normalizedKey} = ${value}`);
  }
  return `${output.join("\n").replace(/\n+$/, "")}\n`;
}

function serializeTextStyle(prefix: string, style: TextRunStyle): string[] {
  return [
    `${prefix}.chinese_font = ${style.chineseFont}`,
    `${prefix}.english_font = ${style.englishFont}`,
    `${prefix}.size = ${style.size}`,
    `${prefix}.tab_stop = ${style.tabStop}`,
    `${prefix}.line_spacing = ${style.lineSpacing}`,
    `${prefix}.alignment = ${style.alignment}`,
    `${prefix}.bold = ${style.bold}`,
    `${prefix}.italic = ${style.italic}`,
  ];
}

function serializeListLevel(prefix: string, style: ListLevelStyle): string[] {
  return [
    `${prefix}.format = ${style.format}`,
    `${prefix}.font = ${style.font}`,
    `${prefix}.size = ${style.size}`,
    `${prefix}.text = ${style.text}`,
    `${prefix}.left_indent = ${style.leftIndent}`,
    `${prefix}.hanging_indent = ${style.hangingIndent}`,
  ];
}

function defaultNumberingFont(format: NumberingFormat): string {
  return format === "chineseCounting" ? "SimSun" : "Times New Roman";
}

function defaultNumberingText(format: NumberingFormat, level: number): string {
  const marker = `%${level}`;
  if (format === "bullet") return "•";
  if (format === "chineseCounting") return `${marker}、`;
  if (format === "lowerLetter" || format === "lowerRoman") return `${marker})`;
  return `${marker}.`;
}
