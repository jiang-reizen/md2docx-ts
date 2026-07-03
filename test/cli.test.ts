import { parseCliArgs } from "../src/cli.js";

describe("parseCliArgs", () => {
  it("无参数使用默认路径", () => {
    expect(parseCliArgs([])).toMatchObject({
      command: "convert",
      input: "sample/complex.md",
      output: "output/complex.docx",
      style: "sample/style.conf",
    });
  });

  it("支持位置参数、flags 和等号形式", () => {
    expect(parseCliArgs(["notes.md"])).toMatchObject({ input: "notes.md", output: "notes.docx" });
    expect(parseCliArgs(["in.md", "out.docx"])).toMatchObject({ input: "in.md", output: "out.docx" });
    expect(parseCliArgs(["-i", "a.md", "--output=b.docx", "-s", "s.conf"])).toMatchObject({
      input: "a.md",
      output: "b.docx",
      style: "s.conf",
    });
  });

  it("处理 help 和错误参数", () => {
    expect(parseCliArgs(["--help"])).toEqual({ command: "help" });
    expect(() => parseCliArgs(["-i", "a.md", "--input", "b.md"])).toThrow(/duplicate input/);
    expect(() => parseCliArgs(["--bad"])).toThrow(/unknown option/);
    expect(() => parseCliArgs(["--input"])).toThrow(/missing value/);
    expect(() => parseCliArgs(["a", "b", "c"])).toThrow(/too many positional/);
  });

  it("解析样式文件命令", () => {
    expect(parseCliArgs(["style:create", "my-style"])).toEqual({ command: "style:create", path: "my-style" });
    expect(parseCliArgs(["style:set", "my-style", "paragraph.chinese_font", "Times", "New", "Roman"])).toEqual({
      command: "style:set",
      path: "my-style",
      key: "paragraph.chinese_font",
      value: "Times New Roman",
    });
    expect(() => parseCliArgs(["style:create"])).toThrow(/requires <path>/);
    expect(() => parseCliArgs(["style:set", "a", "b"])).toThrow(/requires <path> <key> <value>/);
  });
});
