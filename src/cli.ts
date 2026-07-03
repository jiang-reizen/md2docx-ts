#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { extname } from "node:path";
import { pathToFileURL } from "node:url";
import { parseMarkdown } from "./parser.js";
import { writeDocx } from "./renderer.js";
import { createDefaultStyle, createStyleFile, loadStyleFromFile, setStyleValue, type DocxStyle } from "./style.js";

export type CliOptions = ConvertOptions | StyleCreateOptions | StyleSetOptions | HelpOptions;

export interface ConvertOptions {
  command: "convert";
  input: string;
  output: string;
  style?: string;
}

export interface StyleCreateOptions {
  command: "style:create";
  path: string;
}

export interface StyleSetOptions {
  command: "style:set";
  path: string;
  key: string;
  value: string;
}

export interface HelpOptions {
  command: "help";
}

const helpText = `Usage:
  md2docx [input.md] [output.docx]
  md2docx --input input.md --output output.docx --style style.conf
  md2docx style:create <path>
  md2docx style:set <path> <key> <value>

Options:
  -i, --input <path>    Markdown input path
  -o, --output <path>   DOCX output path
  -s, --style <path>    Optional style config path
  -h, --help            Show this help

Style commands:
  style:create <path>             Create a new style config file
  style:set <path> <key> <value>  Add or update one style config entry

Defaults:
  input:  sample/complex.md
  output: output/complex.docx
  style:  sample/style.conf if it exists, otherwise built-in defaults`;

/**
 * *公共接口*
 *
 * 解析 CLI 参数。返回值通过 command 字段区分转换命令、样式文件命令和 help。
 *
 * @param args CLI 参数，不包含 node 和脚本路径
 * @returns 解析后的 CLI 选项
 */
export function parseCliArgs(args: string[]): CliOptions {
  if (args[0] === "style:create") {
    if (args.length !== 2) throw new Error("md2docx cli: style:create requires <path>");
    return { command: "style:create", path: args[1]! };
  }
  if (args[0] === "style:set") {
    if (args.length < 4) throw new Error("md2docx cli: style:set requires <path> <key> <value>");
    return { command: "style:set", path: args[1]!, key: args[2]!, value: args.slice(3).join(" ") };
  }

  const values: Partial<Record<"input" | "output" | "style", string>> = {};
  const seen = new Set<"input" | "output" | "style">();
  const positional: string[] = [];

  for (let index = 0; index < args.length; index++) {
    const arg = args[index]!;
    if (arg === "-h" || arg === "--help") return { command: "help" };

    const longEquals = /^--(input|output|style)=(.+)$/.exec(arg);
    if (longEquals) {
      setValue(values, seen, longEquals[1] as "input" | "output" | "style", longEquals[2]);
      continue;
    }

    if (arg === "--input" || arg === "--output" || arg === "--style" || arg === "-i" || arg === "-o" || arg === "-s") {
      const key = flagKey(arg);
      const value = args[++index];
      if (!value || value.startsWith("-")) throw new Error(`md2docx cli: missing value for ${arg}`);
      setValue(values, seen, key, value);
      continue;
    }

    if (arg.startsWith("-")) throw new Error(`md2docx cli: unknown option: ${arg}`);
    positional.push(arg);
  }

  if (positional.length > 2) throw new Error("md2docx cli: too many positional arguments");
  if (positional[0]) setValue(values, seen, "input", positional[0]);
  if (positional[1]) setValue(values, seen, "output", positional[1]);

  const input = values.input ?? "sample/complex.md";
  return {
    command: "convert",
    input,
    output: values.output ?? (values.input && !positional[1] ? replaceExtension(input, ".docx") : "output/complex.docx"),
    style: values.style ?? (existsSync("sample/style.conf") ? "sample/style.conf" : undefined),
  };
}

/**
 * *公共接口*
 *
 * 执行 CLI 命令。转换命令会读取 Markdown 和样式文件并写出 DOCX；
 * 样式命令会创建或修改样式配置文件。
 *
 * @param args CLI 参数，默认使用 process.argv.slice(2)
 */
export async function runCli(args = process.argv.slice(2)): Promise<void> {
  const options = parseCliArgs(args);
  if (options.command === "help") {
    console.log(helpText);
    return;
  }
  if (options.command === "style:create") {
    createStyleFile(options.path);
    console.log(`created ${options.path}`);
    return;
  }
  if (options.command === "style:set") {
    setStyleValue(options.path, options.key, options.value);
    console.log(`updated ${options.path}`);
    return;
  }

  const style = loadStyle(options.style);
  const document = parseMarkdown(readFileSync(options.input, "utf8"));
  await writeDocx(document, style, options.output);
  console.log(`created ${options.output}`);
}

/**
 * *内部工具*
 *
 * 根据可选路径加载样式文件；未提供路径时返回内置默认样式。
 *
 * @param path 样式文件路径
 * @returns DOCX 样式对象
 */
function loadStyle(path: string | undefined): DocxStyle {
  return path ? loadStyleFromFile(path) : createDefaultStyle();
}

function setValue(
  values: Partial<Record<"input" | "output" | "style", string>>,
  seen: Set<"input" | "output" | "style">,
  key: "input" | "output" | "style",
  value: string,
): void {
  if (seen.has(key)) throw new Error(`md2docx cli: duplicate ${key}`);
  seen.add(key);
  values[key] = value;
}

function flagKey(flag: string): "input" | "output" | "style" {
  if (flag === "--input" || flag === "-i") return "input";
  if (flag === "--output" || flag === "-o") return "output";
  return "style";
}

function replaceExtension(path: string, extension: string): string {
  const old = extname(path);
  return old ? `${path.slice(0, -old.length)}${extension}` : `${path}${extension}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
