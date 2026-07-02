# md2docx-ts API 文档

本文档说明本项目的类型、公共函数、CLI 调用方式，以及主要内部函数的职责。公共库入口在 `src/index.ts`。

## 安装与构建

```bash
npm install
npm run build
npm test
```

`npm run build` 会把 `src/*.ts` 编译到 `dist/`。发布或通过 `bin` 执行时使用 `dist/cli.js`，开发时通常直接用 `tsx src/cli.ts`。

## CLI 调用

```bash
npm run md2docx
npm run md2docx -- input.md output.docx
npm run md2docx -- --input input.md --output output.docx --style style.conf
npm run md2docx -- -i input.md -o output.docx -s style.conf
```

默认值：

| 参数 | 默认值 |
| --- | --- |
| `input` | `sample/complex.md` |
| `output` | `output/complex.docx` |
| `style` | 如果存在则使用 `sample/style.conf`，否则使用内置默认样式 |

只传一个位置参数时，例如 `notes.md`，输出路径自动变为 `notes.docx`。

## 公共库 API

```ts
import {
  parseMarkdown,
  createDefaultStyle,
  loadStyleFromFile,
  buildDocx,
  writeDocx,
} from "md2docx-ts";
```

### `parseMarkdown(input: string): Document`

作用：把受支持的 Markdown 子集转换为内部 IR。

调用：

```ts
const document = parseMarkdown("# 标题\n\n正文[^a]\n\n[^a]: 脚注");
```

说明：
- 支持标题、段落、有序/无序/嵌套列表、粗体、斜体、脚注引用和脚注定义。
- 不支持 link、image、table、code fence、inline code、HTML、blockquote 等结构；遇到时抛错。
- 有序列表必须从 `1` 开始。
- 脚注定义不能重复，且定义内不能再次引用脚注。

### `createDefaultStyle(): DocxStyle`

作用：创建一份完整默认样式配置。

调用：

```ts
const style = createDefaultStyle();
```

说明：返回值是新对象，可以安全修改，不会影响后续调用。

### `loadStyleFromFile(path: string): DocxStyle`

作用：读取 `style.conf`，用配置项覆盖默认样式。

调用：

```ts
const style = loadStyleFromFile("sample/style.conf");
```

说明：
- 配置格式是一行一个 `key = value`。
- 空行和 `#` 开头的注释会被忽略。
- 未配置字段保留默认值。
- 未知 key、未知 field、非法值会抛错。

### `buildDocx(document: Document, style: DocxStyle): Promise<Buffer>`

作用：把 IR 和样式渲染成 DOCX 二进制 buffer。

调用：

```ts
const document = parseMarkdown(markdownText);
const style = createDefaultStyle();
const buffer = await buildDocx(document, style);
```

说明：
- 会生成正文、标题、列表、脚注和 Word 样式。
- 会 patch DOCX 内部 XML，让脚注标记和列表编号更稳定。
- 如果正文引用了缺失定义的脚注，会抛错。

### `writeDocx(document: Document, style: DocxStyle, outputPath: string): Promise<void>`

作用：生成 DOCX 并写入文件。

调用：

```ts
await writeDocx(document, style, "output/paper.docx");
```

说明：如果输出目录不存在，会自动创建。

## 常用完整示例

```ts
import { readFileSync } from "node:fs";
import { parseMarkdown, loadStyleFromFile, writeDocx } from "md2docx-ts";

const markdown = readFileSync("sample/paper.md", "utf8");
const document = parseMarkdown(markdown);
const style = loadStyleFromFile("sample/style.conf");

await writeDocx(document, style, "output/paper.docx");
```

## 类型定义

### 文档 IR

```ts
type TextLanguage = "Chinese" | "English" | "Auto";

interface Text {
  kind: "Text";
  content: string;
  bold: boolean;
  italic: boolean;
  language: TextLanguage;
}

interface Reference {
  kind: "Reference";
  id: number;
}

type Inline = Text | Reference;
type InlineNodes = Inline[];
type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

interface Heading {
  kind: "Heading";
  level: HeadingLevel;
  content: InlineNodes;
}

interface Paragraph {
  kind: "Paragraph";
  content: InlineNodes;
}

type ListKind = "Ordered" | "Unordered";

interface ListItem {
  content: Block[];
}

interface List {
  kind: "List";
  listKind: ListKind;
  items: ListItem[];
}

type Block = Heading | Paragraph | List;

interface ReferencePool {
  idsByKey: Map<string, number>;
  definitions: Array<InlineNodes | undefined>;
  nextId: number;
}

interface Document {
  blocks: Block[];
  referencePool: ReferencePool;
}
```

### 样式类型

```ts
type ParagraphAlignment = "left" | "center";

interface TextRunStyle {
  chineseFont: string;
  englishFont: string;
  size: number;
  tabStop: number;
  lineSpacing: number;
  alignment: ParagraphAlignment;
  bold: boolean;
  italic: boolean;
}

type NumberingFormat =
  | "bullet"
  | "decimal"
  | "lowerLetter"
  | "upperLetter"
  | "lowerRoman"
  | "upperRoman"
  | "chineseCounting";

interface ListLevelStyle {
  format: NumberingFormat;
  font: string;
  size: number;
  text: string;
  leftIndent: number;
  hangingIndent: number;
}

interface ListStyle {
  levels: [
    ListLevelStyle,
    ListLevelStyle,
    ListLevelStyle,
    ListLevelStyle,
    ListLevelStyle,
    ListLevelStyle,
  ];
}

interface DocxStyle {
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
```

### CLI 类型

```ts
interface CliOptions {
  input: string;
  output: string;
  style?: string;
  help: boolean;
}
```

## 函数职责索引

### `src/ir.ts`

| 函数 | 作用 | 调用方式 |
| --- | --- | --- |
| `createReferencePool()` | 创建空脚注引用池。 | 内部使用；测试或自定义 IR 可直接调用。 |
| `createEmptyDocument()` | 创建空文档 IR。 | parser 内部使用；可用于手写 IR。 |
| `getOrCreateReferenceId(pool, key)` | 为脚注 key 获取或分配从 0 开始的内部 id。 | parser 处理 `[^key]` 时调用。 |
| `defineReference(pool, key, content)` | 写入脚注定义，并拒绝重复定义。 | parser 处理 `[^key]: ...` 时调用。 |

### `src/parser.ts`

| 函数 | 作用 | 调用方式 |
| --- | --- | --- |
| `parseMarkdown(input)` | 公共入口，Markdown 转 IR。 | 库调用。 |
| `BlockParser.parseUntil(stopType?)` | 递归解析块级 token，直到结束或遇到停止 token。 | parser 内部调用。 |
| `BlockParser.parseFootnotes()` | 解析 markdown-it 生成的脚注 token 块。 | `parseMarkdown` 内部调用。 |
| `BlockParser.parseHeading(open)` | 解析标题。 | parser 内部调用。 |
| `BlockParser.parseParagraph()` | 解析段落。 | parser 内部调用。 |
| `BlockParser.parseOrderedList(open)` | 校验有序列表起始编号并解析列表。 | parser 内部调用。 |
| `BlockParser.parseList(listKind)` | 解析有序或无序列表，支持嵌套。 | parser 内部调用。 |
| `BlockParser.expect(type)` | 消费并校验当前 token 类型。 | parser 内部调用。 |
| `convertInline(tokens, references, style, insideFootnoteDefinition)` | 把行内 token 转换成 `InlineNodes`。 | parser 内部调用。 |
| `splitText(content, style)` | 按 ASCII/非 ASCII 切分中英文文本 run。 | `convertInline` 内部调用。 |
| `findMatchingClose(tokens, start, closeType)` | 找到粗体/斜体 open token 对应的 close token。 | `convertInline` 内部调用。 |
| `preflight(input)` | 在正式解析前拒绝 task list、math 等结构。 | `parseMarkdown` 内部调用。 |
| `scanFootnoteDefinitions(input)` | 扫描脚注定义，补足 markdown-it 不暴露的重复定义边界。 | `parseMarkdown` 内部调用。 |
| `unsupportedBlock(token)` | 生成不支持块级 token 的错误。 | parser 内部调用。 |
| `unsupportedInlineToken(token)` | 生成不支持行内 token 的错误。 | parser 内部调用。 |

### `src/style.ts`

| 函数 | 作用 | 调用方式 |
| --- | --- | --- |
| `createDefaultStyle()` | 公共入口，创建默认样式。 | 库调用。 |
| `loadStyleFromFile(path)` | 公共入口，读取配置文件并覆盖默认样式。 | 库调用。 |
| `applyStyleConfig(style, input)` | 把配置文本应用到已有样式对象。 | 测试和内部调用；需要自定义配置来源时可用。 |
| `textStyle(...)` | 构造文本样式对象。 | style 内部调用。 |
| `listLevel(format, level, leftIndent)` | 构造单层列表样式对象。 | style 内部调用。 |
| `applyConfigEntry(style, key, value)` | 分派单条配置到正文、标题、脚注或列表。 | `applyStyleConfig` 内部调用。 |
| `applyTextField(style, field, value)` | 解析并写入文本样式字段。 | style 内部调用。 |
| `applyListField(style, field, value, level)` | 解析并写入列表样式字段。 | style 内部调用。 |
| `toTextProp(field)` | 把 snake_case 文本字段转成 camelCase 属性名。 | style 内部调用。 |
| `toListProp(field)` | 把 snake_case 列表字段转成 camelCase 属性名。 | style 内部调用。 |
| `parseHeadingLevel(value)` | 解析 `h1`/`level1` 到标题层级。 | style 内部调用。 |
| `parseListLevel(value)` | 解析 `0..5` 列表层级。 | style 内部调用。 |
| `parseAlignment(value)` | 解析 `left`/`center`。 | style 内部调用。 |
| `parseBool(value)` | 解析布尔别名。 | style 内部调用。 |
| `parseLineSpacing(value)` | 解析行距别名或整数。 | style 内部调用。 |
| `parseNumberingFormat(value)` | 解析编号格式别名。 | style 内部调用。 |
| `parseInteger(value, field)` | 解析严格整数。 | style 内部调用。 |
| `normalize(value)` | 统一大小写、空白、下划线和短横线。 | style 内部调用。 |
| `unquote(value)` | 去掉成对双引号。 | style 内部调用。 |
| `defaultNumberingFont(format)` | 根据编号格式返回默认字体。 | style 内部调用。 |
| `defaultNumberingText(format, level)` | 根据编号格式和层级返回默认编号文本。 | style 内部调用。 |

### `src/renderer.ts`

| 函数 | 作用 | 调用方式 |
| --- | --- | --- |
| `buildDocx(document, style)` | 公共入口，IR 转 DOCX buffer。 | 库调用。 |
| `writeDocx(document, style, outputPath)` | 公共入口，生成并写出 DOCX 文件。 | 库调用。 |
| `renderBlocks(blocks, context, level, inListItem)` | 递归渲染块级 IR。 | renderer 内部调用。 |
| `renderList(list, context, level)` | 渲染列表并为每个 Markdown list 分配独立编号实例。 | renderer 内部调用。 |
| `renderTextBlock(block, context, options)` | 渲染标题或段落。 | renderer 内部调用。 |
| `renderInline(nodes, style, context, footnoteContent)` | 渲染行内文本和脚注引用。 | renderer 内部调用。 |
| `renderTextRun(text, style, footnoteContent)` | 渲染单个文本 run。 | renderer 内部调用。 |
| `renderReference(id, style, context)` | 渲染正文脚注引用。 | renderer 内部调用。 |
| `buildFootnotes(document, style)` | 生成 docx 库需要的 footnotes 配置。 | `buildDocx` 内部调用。 |
| `buildLevels(style, kind)` | 生成 ordered/unordered numbering levels。 | `buildDocx` 内部调用。 |
| `unorderedLevel(level)` | 把指定层级转换为无序列表层级样式。 | renderer 内部调用。 |
| `mapLevelFormat(format)` | 映射项目内部编号格式到 docx 库格式。 | renderer 内部调用。 |
| `fontForText(text, style)` | 根据文本语言选择中文或英文字体。 | renderer 内部调用。 |
| `clampLevel(level)` | 列表层级超过 6 时固定到第 6 层。 | renderer 内部调用。 |
| `footnoteStyles()` | 注册 Word 默认脚注相关样式。 | `buildDocx` 内部调用。 |

### `src/ooxmlPatch.ts`

| 函数 | 作用 | 调用方式 |
| --- | --- | --- |
| `patchDocxXml(buffer)` | 公共到 renderer 的内部入口，一次性 patch DOCX zip 内部 XML。 | `buildDocx` 内部调用。 |
| `patchFootnotesXmlText(xml)` | 把脚注区普通上标 marker 替换为原生 `<w:footnoteRef/>`。 | `patchDocxXml` 内部调用；可单独测试字符串规则。 |
| `patchNumberingXml(numberingXml, documentXml)` | 稳定 numbering id，并同步更新 `document.xml` 引用。 | `patchDocxXml` 内部调用。 |

### `src/cli.ts`

| 函数 | 作用 | 调用方式 |
| --- | --- | --- |
| `parseCliArgs(args)` | 解析 CLI 参数并套用默认值。 | CLI 和测试调用。 |
| `runCli(args?)` | 执行完整命令行转换流程。 | CLI 入口调用；也可在脚本中复用。 |
| `loadStyle(path)` | 根据路径读取样式或返回默认样式。 | CLI 内部调用。 |
| `setValue(values, seen, key, value)` | 写入参数并拒绝重复指定。 | CLI 内部调用。 |
| `flagKey(flag)` | 把 `-i`/`--input` 等 flag 映射为字段名。 | CLI 内部调用。 |
| `replaceExtension(path, extension)` | 只传 input 时生成默认 output 路径。 | CLI 内部调用。 |

## 错误处理约定

- parser 错误以 `md2docx parser:` 开头。
- style 错误以 `md2docx style:` 开头。
- CLI 错误以 `md2docx cli:` 开头。
- renderer 缺失脚注定义时以 `md2docx renderer:` 开头。

这些前缀便于调用方区分错误来源。
