import { parseMarkdown } from "../src/parser.js";

describe("parseMarkdown", () => {
  it("解析空文档", () => {
    const doc = parseMarkdown("");
    expect(doc.blocks).toEqual([]);
    expect(doc.referencePool.nextId).toBe(0);
  });

  it("解析标题、段落和行内样式", () => {
    const doc = parseMarkdown("# 标题\n\n这里有 **粗体**、*斜体* 和 ***粗斜体***。");
    expect(doc.blocks[0]).toMatchObject({ kind: "Heading", level: 1 });
    const paragraph = doc.blocks[1];
    expect(paragraph?.kind).toBe("Paragraph");
    expect(JSON.stringify(paragraph)).toContain('"bold":true');
    expect(JSON.stringify(paragraph)).toContain('"italic":true');
  });

  it("按 ASCII 和非 ASCII 切分文本 run", () => {
    const doc = parseMarkdown("这里有 a sentence");
    expect(doc.blocks[0]).toEqual({
      kind: "Paragraph",
      content: [
        { kind: "Text", content: "这里有", bold: false, italic: false, language: "Chinese" },
        { kind: "Text", content: " a sentence", bold: false, italic: false, language: "English" },
      ],
    });
  });

  it("支持引用先于定义和定义先于引用", () => {
    const a = parseMarkdown("正文[^x]\n\n[^x]: 脚注");
    expect(a.referencePool.definitions[0]?.[0]).toMatchObject({ kind: "Text", content: "脚注" });

    const b = parseMarkdown("[^x]: 脚注\n\n正文[^x]");
    expect(b.blocks[0]).toMatchObject({ kind: "Paragraph" });
    expect(b.referencePool.definitions[0]?.[0]).toMatchObject({ kind: "Text", content: "脚注" });
  });

  it("解析有序、无序和嵌套列表", () => {
    const doc = parseMarkdown("1. 一\n   1. 二\n\n- 三");
    expect(doc.blocks[0]).toMatchObject({ kind: "List", listKind: "Ordered" });
    expect(JSON.stringify(doc.blocks[0])).toContain('"listKind":"Ordered"');
    expect(doc.blocks[1]).toMatchObject({ kind: "List", listKind: "Unordered" });
  });

  it("拒绝不支持的结构", () => {
    expect(() => parseMarkdown("2. not one")).toThrow(/ordered list must start at 1/);
    expect(() => parseMarkdown("```ts\nx\n```")).toThrow(/unsupported block token: fence/);
    expect(() => parseMarkdown("[x](https://example.com)")).toThrow(/unsupported inline token: link_open/);
    expect(() => parseMarkdown("`code`")).toThrow(/unsupported inline token: code_inline/);
    expect(() => parseMarkdown("[^x]: a\n\n[^x]: b")).toThrow(/duplicate footnote definition/);
    expect(() => parseMarkdown("[^x]: a\n\n    b")).toThrow(/duplicate|unsupported/);
    expect(() => parseMarkdown("[^x]: nested[^y]\n\n[^y]: y")).toThrow(/footnote_ref/);
  });
});
