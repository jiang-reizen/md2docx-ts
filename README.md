# md2docx-ts

一个简单的 Markdown 到 DOCX 的转换工具，基于 TypeScript 实现。

兄弟项目：[md2docx](https://github.com/jiang-reizen/md2docx) 用 Rust 实现的版本。

## 项目简介

在写课程论文的时候，如果想用 AI 工具辅助写作，可能会遇到如下问题：

1. Word/WPS 自带的 AI 工具不够强大，无法传入参考文件。
2. 网页上的 AI 工具，如 DeepSeek/ChatGPT/Gemini，虽然能够传入文件，但是如果想要写引用一般不准确。
3. 用 Agent 工具，如 Claude/Codex，虽然能够准确引用，但是无法直接修改 DOCX 文件；如果直接修改容易导致格式错乱。

因此开发这个转换工具，让强大的 AI 工具的直接输出为 Markdown 文件，然后再转换为带格式的 DOCX 文件。

## 安装

```bash
git clone https://github.com/jiang-reizen/md2docx-ts
cd md2docx-ts
npm install
```

## 快速开始

```bash
npm run md2docx
npm run md2docx -- --input sample/paper.md --output output/paper.docx --style sample/style.conf # 指定输入、输出和样式文件
```

## 支持语法及样式文件

### 支持的 Markdown 语法

- 标题：`#` 到 `######`
- 段落
- 有序列表和无序列表，支持嵌套；有序列表必须从 `1` 开始
- 加粗、斜体、粗斜体
- 脚注引用和脚注定义：`[^id]`、`[^id]: ...`

不支持链接、图片、表格、代码块、行内代码、HTML、引用块等结构；遇到这些语法会直接报错。

## CLI 用法

命令行用法详见 [docs/CLI.md](docs/CLI.md)。

一些常用 CLI 命令：

```bash
md2docx [input.md] [output.docx]
md2docx --input input.md --output output.docx --style style.conf
md2docx style:create my-style # 创建一个样式配置文件 my-style.conf
md2docx style:set my-style paragraph.tab_stop 720 # 设置样式
```

### 样式文件

样式文件详见 [docs/style.md](docs/style.md)。

样式文件一行一个配置项，格式为：

```text
key = value
```

空行和 `#` 开头的注释会被忽略。未写到的字段会保留默认样式。

常用配置：

```text
paragraph.chinese_font = SimSun
paragraph.english_font = Times New Roman
paragraph.tab_stop = 480
heading.h1.alignment = center
heading.h1.size = 32
reference_definition.size = 20
list.level.0.format = decimal
list.level.0.text = %1.
```

## API

库 API 详见 [docs/API.md](docs/API.md)。

常用 API：

```ts
import { loadStyleFromFile, parseMarkdown, writeDocx } from "md2docx-ts";
```

## 项目结构

```text
src/
  cli.ts          CLI 参数解析和命令入口
  index.ts        对外库 API 导出
  ir.ts           Markdown 转 DOCX 的内部文档结构
  parser.ts       Markdown 解析和不支持语法校验
  renderer.ts     DOCX 渲染主流程
  style.ts        默认样式、样式文件解析和写入
  ooxmlPatch.ts   DOCX 底层 XML 兼容修补
docs/             API 和样式文件说明
sample/           示例 Markdown 和样式文件
test/             单元测试
```

## 许可证

TODO: 决定许可证后填写，例如 MIT、Apache-2.0，或说明暂不授权复用。
