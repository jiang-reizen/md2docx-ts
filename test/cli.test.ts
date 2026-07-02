import { parseCliArgs } from "../src/cli.js";

describe("parseCliArgs", () => {
  it("无参数使用默认路径", () => {
    expect(parseCliArgs([])).toMatchObject({
      input: "sample/complex.md",
      output: "output/complex.docx",
      style: "sample/style.conf",
      help: false,
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
    expect(parseCliArgs(["--help"]).help).toBe(true);
    expect(() => parseCliArgs(["-i", "a.md", "--input", "b.md"])).toThrow(/duplicate input/);
    expect(() => parseCliArgs(["--bad"])).toThrow(/unknown option/);
    expect(() => parseCliArgs(["--input"])).toThrow(/missing value/);
    expect(() => parseCliArgs(["a", "b", "c"])).toThrow(/too many positional/);
  });
});
