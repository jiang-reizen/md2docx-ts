import JSZip from "jszip";
import { parseMarkdown } from "../src/parser.js";
import { buildDocx } from "../src/renderer.js";
import { createDefaultStyle } from "../src/style.js";

async function readXml(buffer: Buffer, path: string): Promise<string> {
  const zip = await JSZip.loadAsync(buffer);
  const file = zip.file(path);
  if (!file) throw new Error(`missing ${path}`);
  return file.async("string");
}

describe("renderer", () => {
  it("空文档可以生成 docx", async () => {
    const buffer = await buildDocx(parseMarkdown(""), createDefaultStyle());
    expect(buffer.length).toBeGreaterThan(1000);
  });

  it("渲染段首 tab、列表编号和稳定 numbering id", async () => {
    const buffer = await buildDocx(parseMarkdown("正文\n\n1. 一\n   1. 二\n2. 三"), createDefaultStyle());
    const documentXml = await readXml(buffer, "word/document.xml");
    const numberingXml = await readXml(buffer, "word/numbering.xml");

    expect(documentXml).toContain("<w:tabs><w:tab w:val=\"left\" w:pos=\"480\"/></w:tabs>");
    expect(documentXml).toContain("<w:tab/>");
    expect(documentXml).toContain('<w:numId w:val="20"/>');
    expect(documentXml).toContain('<w:numId w:val="21"/>');
    expect(numberingXml).toContain('<w:abstractNum w:abstractNumId="10"');
    expect(numberingXml).toContain('<w:abstractNum w:abstractNumId="11"');
    expect(numberingXml).toContain('<w:num w:numId="20"');
  });

  it("嵌套超过六层时 clamp 到 level 5", async () => {
    const markdown = "1. a\n   1. b\n      1. c\n         1. d\n            1. e\n               1. f\n                  1. g";
    const documentXml = await readXml(await buildDocx(parseMarkdown(markdown), createDefaultStyle()), "word/document.xml");
    expect(documentXml).toContain('<w:ilvl w:val="5"/>');
  });

  it("渲染脚注样式并保留原生 footnoteRef", async () => {
    const buffer = await buildDocx(parseMarkdown("正文[^a]\n\n[^a]: 脚注 **bold**"), createDefaultStyle());
    const documentXml = await readXml(buffer, "word/document.xml");
    const footnotesXml = await readXml(buffer, "word/footnotes.xml");
    const stylesXml = await readXml(buffer, "word/styles.xml");

    expect(documentXml).toContain('<w:rStyle w:val="FootnoteReference"/>');
    expect(documentXml).toContain('<w:footnoteReference w:id="1"/>');
    expect(footnotesXml).toContain('<w:footnote w:type="separator" w:id="-1">');
    expect(footnotesXml).toContain('<w:pStyle w:val="FootnoteText"/>');
    expect(footnotesXml).toContain("<w:footnoteRef/>");
    expect(footnotesXml).not.toMatch(/FootnoteText[\s\S]*<w:rFonts/);
    expect(stylesXml).toContain('w:styleId="FootnoteText"');
    expect(stylesXml).toContain('w:styleId="FootnoteTextChar"');
    expect(stylesXml).toContain('w:styleId="FootnoteReference"');
  });
});
