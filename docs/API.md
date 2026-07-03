# API

本文档说明 `md2docx-ts` 导出的核心库 API。

## 导入

```ts
import {
  parseMarkdown,
  createDefaultStyle,
  loadStyleFromFile,
  createStyleFile,
  setStyleValue,
  serializeStyle,
  buildDocx,
  writeDocx,
} from "md2docx-ts";
```

## `parseMarkdown(input: string): Document`

把 Markdown 字符串解析为内部文档 IR。

```ts
const document = parseMarkdown("# 标题\n\n正文[^a]\n\n[^a]: 脚注");
```

支持标题、段落、列表、粗体、斜体和脚注。遇到不支持的结构会抛错，例如链接、图片、表格、代码块、行内代码、HTML、引用块。

## `createDefaultStyle(): DocxStyle`

创建一份完整默认样式对象。

```ts
const style = createDefaultStyle();
style.paragraph.tabStop = 720;
```

返回值是新对象，可以按需修改。

## `loadStyleFromFile(path: string): DocxStyle`

读取样式文件，并覆盖默认样式。

```ts
const style = loadStyleFromFile("sample/style.conf");
```

未出现在样式文件里的字段会保留默认值。

## `createStyleFile(path: string, style?: DocxStyle): void`

创建新的样式文件。

```ts
createStyleFile("my-style");

const style = createDefaultStyle();
style.paragraph.tabStop = 720;
createStyleFile("custom-style", style);
```

说明：

- 不检查文件后缀。
- 会自动创建父目录。
- 目标文件已存在时会抛错，避免覆盖。

## `setStyleValue(path: string, key: string, value: string): void`

写入或修改样式文件中的一条配置。

```ts
setStyleValue("my-style", "paragraph.tab_stop", "720");
setStyleValue("my-style", "paragraph.english_font", "Times New Roman");
```

说明：

- 已存在的 key 会被更新。
- 不存在的 key 会追加到文件末尾。
- 写入前会校验 key 和 value。

## `serializeStyle(style: DocxStyle): string`

把样式对象序列化为样式文件文本。

```ts
const text = serializeStyle(createDefaultStyle());
```

适合需要自行保存到数据库、网络响应或非本地文件系统的场景。

## `buildDocx(document: Document, style: DocxStyle): Promise<Buffer>`

把内部文档 IR 和样式对象渲染为 DOCX buffer。

```ts
const document = parseMarkdown(markdownText);
const style = createDefaultStyle();
const buffer = await buildDocx(document, style);
```

## `writeDocx(document: Document, style: DocxStyle, outputPath: string): Promise<void>`

生成 DOCX 并写入文件。输出目录不存在时会自动创建。

```ts
const document = parseMarkdown(markdownText);
const style = loadStyleFromFile("sample/style.conf");

await writeDocx(document, style, "output/paper.docx");
```

## 完整示例

```ts
import { readFileSync } from "node:fs";
import { loadStyleFromFile, parseMarkdown, writeDocx } from "md2docx-ts";

const markdown = readFileSync("sample/paper.md", "utf8");
const document = parseMarkdown(markdown);
const style = loadStyleFromFile("sample/style.conf");

await writeDocx(document, style, "output/paper.docx");
```

## 主要类型

### `Document`

```ts
interface Document {
  blocks: Block[];
  referencePool: ReferencePool;
}
```

### `Block`

```ts
type Block = Heading | Paragraph | List;
```

### `Inline`

```ts
type Inline = Text | Reference;
```

### `DocxStyle`

```ts
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

### `TextRunStyle`

```ts
interface TextRunStyle {
  chineseFont: string;
  englishFont: string;
  size: number;
  tabStop: number;
  lineSpacing: number;
  alignment: "left" | "center";
  bold: boolean;
  italic: boolean;
}
```
