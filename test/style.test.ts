import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyStyleConfig, createDefaultStyle, createStyleFile, loadStyleFromFile, setStyleValue } from "../src/style.js";

describe("style", () => {
  it("提供规格要求的默认样式", () => {
    const style = createDefaultStyle();
    expect(style.headings[0]).toMatchObject({
      chineseFont: "SimHei",
      englishFont: "Times New Roman",
      size: 32,
      tabStop: 640,
      lineSpacing: 360,
      alignment: "center",
      bold: true,
      italic: false,
    });
    expect(style.paragraph).toMatchObject({ chineseFont: "SimSun", size: 24, tabStop: 480 });
    expect(style.referenceDefinition).toMatchObject({ size: 20, lineSpacing: 240 });
    expect(style.list.levels[2]).toMatchObject({
      format: "chineseCounting",
      font: "SimSun",
      text: "%3、",
      leftIndent: 2160,
    });
  });

  it("解析配置覆盖并保留默认值", () => {
    const style = applyStyleConfig(
      createDefaultStyle(),
      `
paragraph.tab_stop = 720
paragraph.line_spacing = 1_5
paragraph.bold = YES
heading.level1.italic = on
list.level.1.format = upper-roman
list.level.1.text = "%2)"
`,
    );
    expect(style.paragraph.tabStop).toBe(720);
    expect(style.paragraph.lineSpacing).toBe(360);
    expect(style.paragraph.bold).toBe(true);
    expect(style.paragraph.chineseFont).toBe("SimSun");
    expect(style.headings[0].italic).toBe(true);
    expect(style.list.levels[1]).toMatchObject({
      format: "upperRoman",
      font: "Times New Roman",
      text: "%2)",
    });
  });

  it("format 改变时重置该层 text/font", () => {
    const style = applyStyleConfig(createDefaultStyle(), "list.level.2.format = bullet");
    expect(style.list.levels[2]).toMatchObject({ format: "bullet", font: "Times New Roman", text: "•" });
  });

  it("拒绝未知 key、field 和越界层级", () => {
    expect(() => applyStyleConfig(createDefaultStyle(), "unknown.x = 1")).toThrow(/unknown key/);
    expect(() => applyStyleConfig(createDefaultStyle(), "paragraph.foo = 1")).toThrow(/unknown text field/);
    expect(() => applyStyleConfig(createDefaultStyle(), "heading.h7.size = 1")).toThrow(/heading level/);
    expect(() => applyStyleConfig(createDefaultStyle(), "list.level.6.size = 1")).toThrow(/list level/);
  });

  it("创建新样式文件，不检查后缀", () => {
    const dir = mkdtempSync(join(tmpdir(), "md2docx-style-"));
    try {
      const path = join(dir, "paper-style");
      createStyleFile(path);
      const content = readFileSync(path, "utf8");
      expect(content).toContain("paragraph.chinese_font = SimSun");
      expect(content).toContain("heading.h1.chinese_font = SimHei");
      expect(loadStyleFromFile(path).paragraph.chineseFont).toBe("SimSun");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("修改样式文件中已有 key，或追加新 key", () => {
    const dir = mkdtempSync(join(tmpdir(), "md2docx-style-"));
    try {
      const path = join(dir, "style");
      writeFileSync(path, "# keep comment\nparagraph.tab_stop = 480\n", "utf8");

      setStyleValue(path, "paragraph.tab_stop", "720");
      setStyleValue(path, "heading.h1.alignment", "center");

      const content = readFileSync(path, "utf8");
      expect(content).toContain("# keep comment");
      expect(content).toContain("paragraph.tab_stop = 720");
      expect(content).toContain("heading.h1.alignment = center");
      expect(loadStyleFromFile(path).paragraph.tabStop).toBe(720);
      expect(loadStyleFromFile(path).headings[0].alignment).toBe("center");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("修改样式文件时校验 key 和 value", () => {
    const dir = mkdtempSync(join(tmpdir(), "md2docx-style-"));
    try {
      const path = join(dir, "style");
      writeFileSync(path, "", "utf8");
      expect(() => setStyleValue(path, "paragraph.unknown", "1")).toThrow(/unknown text field/);
      expect(() => setStyleValue(path, "paragraph.size", "large")).toThrow(/invalid integer/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
