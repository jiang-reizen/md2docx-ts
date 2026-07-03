# md2docx-ts 对外 API

本文档只说明可从 `src/index.ts` 导出的对外 API 及其调用方式。

## 安装与构建

```bash
npm install
npm run build
npm test
```

开发期可直接运行 TypeScript：

```bash
npm run md2docx
```

构建后产物位于 `dist/`，库入口为 `dist/index.js`，CLI 入口为 `dist/cli.js`。

## CLI

### Markdown 转 DOCX

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

只传一个位置参数时：

```bash
npm run md2docx -- notes.md
```

输出路径自动变为：

```text
notes.docx
```

### 创建样式文件

```bash
npm run md2docx -- style:create my-style
```

说明：

- 不检查文件后缀。
- 父目录不存在时会自动创建。
- 文件已存在时会失败，避免覆盖已有样式文件。
- 文件内容为完整默认样式配置。

### 修改样式文件

```bash
npm run md2docx -- style:set my-style paragraph.tab_stop 720
npm run md2docx -- style:set my-style paragraph.english_font "Times New Roman"
```

说明：

- 如果 key 已存在，则更新该行。
- 如果 key 不存在，则追加到文件末尾。
- 写入前会校验 key 和 value；非法配置不会写入文件。

## 库 API

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

### `parseMarkdown(input: string): Document`

把 Markdown 字符串解析为内部文档 IR。

```ts
const document = parseMarkdown("# 标题\n\n正文[^a]\n\n[^a]: 脚注");
```

支持范围：

- 标题 `#` 到 `######`
- 段落
- 有序列表、无序列表、嵌套列表
- 粗体、斜体、粗斜体
- 脚注引用和脚注定义

不支持的 Markdown 结构会直接抛错，例如 link、image、table、code fence、inline code、HTML、blockquote。

### `createDefaultStyle(): DocxStyle`

创建一份完整默认样式对象。

```ts
const style = createDefaultStyle();
```

返回值是新对象，可以在调用方修改。

### `loadStyleFromFile(path: string): DocxStyle`

读取样式文件，并覆盖默认样式。

```ts
const style = loadStyleFromFile("sample/style.conf");
```

样式文件格式：

```text
paragraph.tab_stop = 720
heading.h1.alignment = center
list.level.2.format = chinese
```

未出现的字段会保留默认值。

### `createStyleFile(path: string, style?: DocxStyle): void`

创建新的样式文件。

```ts
createStyleFile("my-style");

const style = createDefaultStyle();
style.paragraph.tabStop = 720;
createStyleFile("custom-style", style);
```

说明：

- 不检查文件后缀。
- 自动创建父目录。
- 目标文件已存在时抛错。

### `setStyleValue(path: string, key: string, value: string): void`

写入或修改样式文件中的一条配置。

```ts
setStyleValue("my-style", "paragraph.tab_stop", "720");
setStyleValue("my-style", "paragraph.english_font", "Times New Roman");
```

说明：

- 已存在的 key 会被更新。
- 不存在的 key 会追加到文件末尾。
- 写入前会校验 key/value。

### `serializeStyle(style: DocxStyle): string`

把样式对象序列化为配置文件文本。

```ts
const text = serializeStyle(createDefaultStyle());
```

适合需要自行保存到数据库、网络响应或非本地文件系统的场景。

### `buildDocx(document: Document, style: DocxStyle): Promise<Buffer>`

把内部文档 IR 和样式对象渲染为 DOCX buffer。

```ts
const document = parseMarkdown(markdownText);
const style = createDefaultStyle();
const buffer = await buildDocx(document, style);
```

### `writeDocx(document: Document, style: DocxStyle, outputPath: string): Promise<void>`

生成 DOCX 并写入文件。

```ts
const document = parseMarkdown(markdownText);
const style = loadStyleFromFile("sample/style.conf");

await writeDocx(document, style, "output/paper.docx");
```

输出目录不存在时会自动创建。

## 常用完整示例

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
