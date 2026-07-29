import JsBarcode from "jsbarcode";

// Minimal SVG DOM-like interface for JsBarcode
function createSvgElement() {
  const attrs: Record<string, string> = {};
  const children: any[] = [];
  return {
    tagName: "svg",
    namespaceURI: "http://www.w3.org/2000/svg",
    attrs,
    children,
    setAttribute(name: string, value: string) { attrs[name] = value; },
    getAttribute(name: string) { return attrs[name]; },
    appendChild(child: any) { children.push(child); },
  };
}

function serializeSvg(el: any): string {
  const tag = el.tagName || el.nodeName;
  const ns = el.namespaceURI ? ` xmlns="${el.namespaceURI}"` : "";
  let attrsStr = "";
  if (el.attrs) {
    for (const [k, v] of Object.entries(el.attrs)) {
      attrsStr += ` ${k}="${v}"`;
    }
  } else if (el.attributes) {
    for (const attr of el.attributes) {
      attrsStr += ` ${attr.name}="${attr.value}"`;
    }
  }
  let inner = "";
  if (el.children) {
    inner = el.children.map(serializeSvg).join("");
  } else if (el.childNodes) {
    for (const child of el.childNodes) {
      if (child.nodeType === 3) inner += child.textContent;
      else if (child.nodeType === 1) inner += serializeSvg(child);
    }
  } else if (typeof el === "string") {
    return el;
  }
  return `<svg${ns}${attrsStr}>${inner}</svg>`;
}

export async function generateBarcodeDataUrl(data: string, options?: {
  format?: string;
  width?: number;
  height?: number;
  displayValue?: boolean;
  fontSize?: number;
  font?: string;
  textAlign?: string;
  textPosition?: string;
  textMargin?: number;
  background?: string;
  lineColor?: string;
  margin?: number;
}): Promise<string> {
  const svg = createSvgElement();
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  svg.setAttribute("width", "200");
  svg.setAttribute("height", "100");
  JsBarcode(svg as any, data, {
    format: options?.format || "CODE128",
    width: options?.width || 2,
    height: options?.height || 50,
    displayValue: options?.displayValue !== false,
    fontSize: options?.fontSize || 14,
    font: options?.font || "monospace",
    textAlign: options?.textAlign as any || "center",
    textPosition: options?.textPosition as any || "bottom",
    textMargin: options?.textMargin || 2,
    background: options?.background || "#ffffff",
    lineColor: options?.lineColor || "#000000",
    margin: options?.margin || 10,
  });
  const svgString = serializeSvg(svg);
  return `data:image/svg+xml;base64,${Buffer.from(svgString).toString("base64")}`;
}

export async function generateBarcodeSvg(data: string, options?: {
  format?: string;
  width?: number;
  height?: number;
  displayValue?: boolean;
  fontSize?: number;
}): Promise<string> {
  const svg = createSvgElement();
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  svg.setAttribute("width", "200");
  svg.setAttribute("height", "100");
  JsBarcode(svg as any, data, {
    format: options?.format || "CODE128",
    width: options?.width || 2,
    height: options?.height || 50,
    displayValue: options?.displayValue !== false,
    fontSize: options?.fontSize || 14,
    font: "monospace",
    textAlign: "center",
    textMargin: 2,
    margin: 10,
  });
  return serializeSvg(svg);
}

export async function generateBarcodeBuffer(data: string, options?: {
  format?: string;
  width?: string;
  height?: number;
  displayValue?: boolean;
  fontSize?: number;
}): Promise<Buffer> {
  const svgString = await generateBarcodeSvg(data, options);
  return Buffer.from(svgString);
}

export async function generateJobBarcode(jobNumber: string): Promise<string> {
  return generateBarcodeDataUrl(jobNumber, {
    format: "CODE128",
    width: 2,
    height: 40,
    fontSize: 12,
    displayValue: true,
  });
}

export async function generateDispatchBarcode(dispatchNumber: string): Promise<string> {
  return generateBarcodeDataUrl(dispatchNumber, {
    format: "CODE128",
    width: 2,
    height: 40,
    fontSize: 12,
    displayValue: true,
  });
}

export async function generateProductBarcode(productId: string): Promise<string> {
  const padded = productId.replace(/\D/g, "").padStart(12, "0").slice(0, 12);
  return generateBarcodeDataUrl(padded, {
    format: "EAN13",
    width: 2,
    height: 50,
    fontSize: 12,
    displayValue: true,
  });
}
