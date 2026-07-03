import JSZip from "jszip";

/**
 * *内部流程*
 *
 * 打开 DOCX zip，对生成后的底层 XML 做兼容修补。目前会处理脚注 marker 和
 * numbering id，再重新打包为 Buffer。
 *
 * @param buffer docx 库生成的 DOCX buffer
 * @returns 修补后的 DOCX buffer；如果没有变化则返回原 buffer
 */
export async function patchDocxXml(buffer: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);
  let changed = false;

  const footnotesFile = zip.file("word/footnotes.xml");
  if (footnotesFile) {
    const xml = await footnotesFile.async("string");
    const patched = patchFootnotesXmlText(xml);
    if (patched !== xml) {
      zip.file("word/footnotes.xml", patched);
      changed = true;
    }
  }

  const numberingFile = zip.file("word/numbering.xml");
  const documentFile = zip.file("word/document.xml");
  if (numberingFile && documentFile) {
    const numberingXml = await numberingFile.async("string");
    const documentXml = await documentFile.async("string");
    const { numbering, document } = patchNumberingXml(numberingXml, documentXml);
    if (numbering !== numberingXml || document !== documentXml) {
      zip.file("word/numbering.xml", numbering);
      zip.file("word/document.xml", document);
      changed = true;
    }
  }

  return changed ? zip.generateAsync({ type: "nodebuffer" }) : buffer;
}

/**
 * *内部工具*
 *
 * 修补 `word/footnotes.xml`。如果脚注区开头是普通上标数字 marker，
 * 则替换为 Word 原生 `<w:footnoteRef/>` marker。
 *
 * @param xml footnotes.xml 文本
 * @returns 修补后的 XML 文本
 */
export function patchFootnotesXmlText(xml: string): string {
  return xml.replace(/<w:footnote\b([^>]*)>([\s\S]*?)<\/w:footnote>/g, (whole, attrs: string, body: string) => {
    const id = Number(/w:id="(-?\d+)"/.exec(attrs)?.[1]);
    if (!Number.isFinite(id) || id <= 0) return whole;

    const run = /<w:r\b[\s\S]*?<\/w:r>/.exec(body);
    if (!run || run[0].includes("<w:footnoteRef")) return whole;

    const text = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/.exec(run[0])?.[1] ?? "";
    const isMarker = text === String(id) || text === `${id} `;
    if (!isMarker || !/<w:vertAlign\b[^>]*w:val="superscript"/.test(run[0])) return whole;

    const marker =
      '<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteRef/></w:r>' +
      '<w:r><w:t xml:space="preserve"> </w:t></w:r>';
    return `<w:footnote${attrs}>${body.slice(0, run.index)}${marker}${body.slice(run.index + run[0].length)}</w:footnote>`;
  });
}

/**
 * *内部工具*
 *
 * 稳定 `word/numbering.xml` 中的 abstract numbering id 和具体 numbering id，
 * 并同步修改 `word/document.xml` 中段落引用的 numId。
 *
 * @param numberingXml numbering.xml 文本
 * @param documentXml document.xml 文本
 * @returns 修补后的两个 XML 文本
 */
function patchNumberingXml(numberingXml: string, documentXml: string): { numbering: string; document: string } {
  const abstractIds = [...numberingXml.matchAll(/<w:abstractNum\b[^>]*w:abstractNumId="(\d+)"/g)]
    .map((match) => Number(match[1]))
    .filter((id) => id > 1);
  if (abstractIds.length === 0) return { numbering: numberingXml, document: documentXml };

  const abstractMap = new Map(abstractIds.map((id, index) => [id, 10 + index]));
  const numMap = new Map<number, number>();

  for (const match of numberingXml.matchAll(/<w:num\b[^>]*w:numId="(\d+)">[\s\S]*?<w:abstractNumId w:val="(\d+)"/g)) {
    if (abstractMap.has(Number(match[2]))) numMap.set(Number(match[1]), 20 + numMap.size);
  }

  const mapAbstract = (whole: string, id: string) => {
    const next = abstractMap.get(Number(id));
    return next === undefined ? whole : whole.replace(id, String(next));
  };
  const mapNum = (whole: string, id: string) => {
    const next = numMap.get(Number(id));
    return next === undefined ? whole : whole.replace(id, String(next));
  };

  return {
    numbering: numberingXml
      .replace(/w:abstractNumId="(\d+)"/g, mapAbstract)
      .replace(/<w:abstractNumId w:val="(\d+)"\/>/g, mapAbstract)
      .replace(/w:numId="(\d+)"/g, mapNum),
    document: documentXml.replace(/<w:numId w:val="(\d+)"\/>/g, mapNum),
  };
}
