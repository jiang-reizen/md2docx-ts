# md2docx-ts

> TODO: 用一两句话说明这个项目解决什么问题。建议写清楚它不是通用 Markdown 转 DOCX 工具，而是面向中文课程论文样式的转换器。

## 项目简介

TODO:

- 这个项目的背景是什么？
- 目标用户是谁？
- 输入是什么，输出是什么？
- 和通用 Markdown 转 DOCX 工具有何区别？

## 功能特性

TODO:

- 支持哪些 Markdown 结构？
- 支持哪些中文论文样式？
- 是否支持脚注、列表、标题、样式文件？
- 有哪些明确不支持的 Markdown 结构？

## 安装

TODO:

```bash
npm install
```

如果从 GitHub 克隆本项目：

```bash
git clone <your-repo-url>
cd md2docx-ts
npm install
```

## 快速开始

TODO: 给出最小可运行示例。

```bash
npm run md2docx
```

指定输入、输出和样式文件：

```bash
npm run md2docx -- --input sample/paper.md --output output/paper.docx --style sample/style.conf
```

## CLI 用法

TODO: 按命令列出参数含义。

```bash
md2docx [input.md] [output.docx]
md2docx --input input.md --output output.docx --style style.conf
md2docx style:create my-style
md2docx style:set my-style paragraph.tab_stop 720
```

## 样式文件

TODO:

- 说明 `style.conf` 的基本格式。
- 说明常用 key。
- 给出一份短示例。

示例：

```text
paragraph.chinese_font = SimSun
paragraph.english_font = Times New Roman
paragraph.tab_stop = 480
heading.h1.alignment = center
```

## 库 API

TODO: 简要说明可作为库调用。详细 API 见 [docs/API.md](docs/API.md)。

```ts
import { loadStyleFromFile, parseMarkdown, writeDocx } from "md2docx-ts";
```

## 开发

TODO: 写清楚本地开发流程。

```bash
npm install
npm test
npm run check
npm run build
```

## 项目结构

TODO: 根据当前目录补充说明。

```text
src/
  cli.ts
  parser.ts
  renderer.ts
  style.ts
  ooxmlPatch.ts
docs/
sample/
test/
```

## 限制与设计取舍

TODO:

- 为什么只支持窄 Markdown 子集？
- 为什么未支持结构直接报错？
- 字体名称和字体文件之间是什么关系？
- 是否需要保留 OOXML patch？

## 许可证

TODO: 决定许可证后填写，例如 MIT、Apache-2.0，或说明暂不授权复用。
