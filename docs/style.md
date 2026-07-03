# 样式文件说明

样式文件用于覆盖内置默认 DOCX 样式。只写需要修改的项，没写到的字段会继续使用默认值。

## 基本格式

```text
key = value
```

规则：

- 一行一个配置项。
- 空行会被忽略。
- `#` 开头的行会被当作注释。
- `value` 两端如果是一对双引号，会去掉双引号。
- 未知 key、未知 field 或非法 value 会报错。

## 创建和修改样式文件

创建完整默认样式文件：

```bash
npm run md2docx -- style:create my-style
```

修改或追加单条配置：

```bash
npm run md2docx -- style:set my-style paragraph.tab_stop 720
npm run md2docx -- style:set my-style paragraph.english_font "Times New Roman"
```

`style:create` 不检查文件后缀；目标文件已存在时会失败，避免覆盖。`style:set` 会先校验 key 和 value，校验失败不会写入文件。

## 可配置区域与样式字段

### 文本

正文、脚注定义和标题共享这些字段：

| field | 类型 | 说明 |
| --- | --- | --- |
| `chinese_font` | 字符串 | 中文字体名，写入 Word 的 eastAsia 字体属性 |
| `english_font` | 字符串 | 英文字体名，写入 Word 的 ascii/hAnsi 字体属性 |
| `size` | 整数 | 字号，单位是 DOCX half-point；`24` 表示 12pt |
| `tab_stop` | 整数 | 段首 tab stop，单位 twips；正文段首缩进使用它 |
| `line_spacing` | 整数或别名 | 行距，Word auto line spacing；单倍为 `240` |
| `alignment` | 枚举 | 段落对齐方式，支持 `left`,`center` |
| `bold` | 布尔 | 是否默认加粗 |
| `italic` | 布尔 | 是否默认斜体 |

`bold`、`italic` 支持：

```text
true:  true, yes, on, 1
false: false, no, off, 0
```

`line_spacing` 支持：

```text
single, 1, 1.0       -> 240
oneandhalf, 1.5, 1_5 -> 360
double, 2, 2.0       -> 480
other integer        -> 直接作为 line_spacing
```

布尔、对齐、行距别名解析时不区分大小写、空白、下划线和短横线。

### 正文

```text
paragraph.<field>
```

### 脚注定义

```text
reference_definition.<field>
```

### 标题

```text
heading.h1.<field>
heading.h2.<field>
...
heading.h6.<field>
```

也可以使用：

```text
heading.level1.<field>
heading.level2.<field>
...
heading.level6.<field>
```

### 列表

```text
list.level.0.<field>
list.level.1.<field>
list.level.2.<field>
list.level.3.<field>
list.level.4.<field>
list.level.5.<field>
```

列表最多配置 6 级。Markdown 嵌套超过 6 级时，会继续使用第 6 级样式。

| field | 类型 | 说明 |
| --- | --- | --- |
| `format` | 枚举 | 编号格式 |
| `font` | 字符串 | 编号字体 |
| `size` | 整数 | 编号字号，单位 half-point |
| `text` | 字符串 | 编号显示模板 |
| `left_indent` | 整数 | 左缩进，单位 twips |
| `hanging_indent` | 整数 | 悬挂缩进，单位 twips |

注意：设置 `list.level.N.format` 时，会同时重置该层默认 `text` 和默认 `font`。如果需要自定义编号文本或字体，请在 `format` 后面继续设置 `text` 和 `font`。

`format` 支持：

| 写法 | 实际格式 |
| --- | --- |
| `bullet` | 项目符号 |
| `decimal`, `number`, `numbers`, `123` | 阿拉伯数字 |
| `lowerLetter`, `loweralpha`, `abc` | 小写字母 |
| `upperLetter`, `upperalpha`, `abcupper` | 大写字母 |
| `lowerRoman`, `roman`, `iii` | 小写罗马数字 |
| `upperRoman`, `romanupper` | 大写罗马数字 |
| `chinese`, `chineseCounting`, `一二三` | 中文数字 |

`format` 解析时不区分大小写、空白、下划线和短横线。

`text` 中的 `%1`、`%2`、`%3` 等表示对应列表层级的编号。例如：

```text
list.level.0.text = %1.
list.level.1.text = %2)
list.level.2.text = %3、
```

## 默认样式

### 标题

| 层级 | 中文字体 | 英文字体 | size | tab_stop | line_spacing | alignment | bold | italic |
| --- | --- | --- | ---: | ---: | ---: | --- | --- | --- |
| h1 | SimHei | Times New Roman | 32 | 640 | 360 | center | true | false |
| h2 | SimHei | Times New Roman | 28 | 560 | 360 | left | true | false |
| h3 | SimHei | Times New Roman | 26 | 520 | 360 | left | true | false |
| h4 | SimHei | Times New Roman | 24 | 480 | 360 | left | true | false |
| h5 | SimHei | Times New Roman | 22 | 440 | 360 | left | true | false |
| h6 | SimHei | Times New Roman | 21 | 420 | 360 | left | true | false |

### 正文

| field | 默认值 |
| --- | --- |
| `chinese_font` | SimSun |
| `english_font` | Times New Roman |
| `size` | 24 |
| `tab_stop` | 480 |
| `line_spacing` | 360 |
| `alignment` | left |
| `bold` | false |
| `italic` | false |

### 脚注定义

| field | 默认值 |
| --- | --- |
| `chinese_font` | SimSun |
| `english_font` | Times New Roman |
| `size` | 20 |
| `tab_stop` | 400 |
| `line_spacing` | 240 |
| `alignment` | left |
| `bold` | false |
| `italic` | false |

### 列表

| level | format | font | size | text | left_indent | hanging_indent |
| ---: | --- | --- | ---: | --- | ---: | ---: |
| 0 | decimal | Times New Roman | 24 | `%1.` | 720 | 360 |
| 1 | lowerLetter | Times New Roman | 24 | `%2)` | 1440 | 360 |
| 2 | chineseCounting | SimSun | 24 | `%3、` | 2160 | 360 |
| 3 | lowerRoman | Times New Roman | 24 | `%4)` | 2880 | 360 |
| 4 | decimal | Times New Roman | 24 | `%5.` | 3600 | 360 |
| 5 | lowerLetter | Times New Roman | 24 | `%6)` | 4320 | 360 |
