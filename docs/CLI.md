# CLI

本文档说明 `md2docx` 命令行用法。

## Markdown 转 DOCX

```bash
npm run md2docx
npm run md2docx -- input.md output.docx
npm run md2docx -- --input input.md --output output.docx --style style.conf
npm run md2docx -- -i input.md -o output.docx -s style.conf
```

等价的 CLI 形式：

```bash
md2docx
md2docx input.md output.docx
md2docx --input input.md --output output.docx --style style.conf
md2docx -i input.md -o output.docx -s style.conf
```

## 参数

| 参数 | 说明 |
| --- | --- |
| `input.md` | Markdown 输入文件 |
| `output.docx` | DOCX 输出文件 |
| `-i, --input <path>` | 指定 Markdown 输入文件 |
| `-o, --output <path>` | 指定 DOCX 输出文件 |
| `-s, --style <path>` | 指定样式文件 |
| `-h, --help` | 显示帮助 |

## 默认值

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

## 创建样式文件

```bash
npm run md2docx -- style:create my-style
```

说明：

- 不检查文件后缀。
- 父目录不存在时会自动创建。
- 文件已存在时会失败，避免覆盖已有样式文件。
- 文件内容为完整默认样式配置。

## 修改样式文件

```bash
npm run md2docx -- style:set my-style paragraph.tab_stop 720
npm run md2docx -- style:set my-style paragraph.english_font "Times New Roman"
```

说明：

- 如果 key 已存在，则更新该行。
- 如果 key 不存在，则追加到文件末尾。
- 写入前会校验 key 和 value；非法配置不会写入文件。

## 常见错误

- 重复指定 input/output/style 会报错。
- 未知 option 会报错。
- flag 缺少值会报错。
- 位置参数最多只能有两个。
- 样式 key 或 value 非法时，`style:set` 不会写入文件。
