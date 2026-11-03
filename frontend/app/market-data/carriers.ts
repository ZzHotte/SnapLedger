// Ocean carriers the tracking tool covers. `prefixes` are container owner
// codes (BIC) / B/L prefixes used only to *suggest* a carrier from a typed
// number — the user can always override, and an unknown prefix just means
// "pick one". Leave a carrier's list empty rather than guess a code.

export type Carrier = {
  code: string;
  name: string;
  website: string;
  prefixes: string[];
};

export const CARRIERS: Carrier[] = [
  { code: "MSK", name: "Maersk", website: "https://www.maersk.com.cn/", prefixes: ["MAEU", "MSKU", "MRKU", "MRSU"] },
  { code: "MSC", name: "MSC", website: "https://www.msccargo.cn/", prefixes: ["MSCU", "MEDU", "MSDU", "MSMU"] },
  { code: "CMA", name: "CMA CGM", website: "http://www.cma-cgm.com/", prefixes: ["CMAU", "CGMU"] },
  { code: "COSCO", name: "COSCO Shipping", website: "https://elines.coscoshipping.com/ebusiness/", prefixes: ["COSU", "CSNU", "CBHU", "CCLU"] },
  { code: "HPL", name: "Hapag-Lloyd", website: "https://www.hapag-lloyd.com/zh/online-business.html", prefixes: ["HLCU", "HLXU", "HLBU"] },
  { code: "ONE", name: "Ocean Network Express", website: "https://ch.one-line.com/zh-hans", prefixes: ["ONEY", "ONEU"] },
  { code: "EMC", name: "Evergreen", website: "https://www.evergreen-marine.com/", prefixes: ["EGLV", "EMCU", "EGHU", "EISU", "EITU"] },
  { code: "OOCL", name: "OOCL", website: "https://www.oocl.com/schi/Pages/default.aspx", prefixes: ["OOLU", "OOCU"] },
  { code: "YML", name: "Yang Ming", website: "https://www.yangming.com/", prefixes: ["YMLU", "YMMU"] },
  { code: "HMM", name: "HMM", website: "https://www.hmm21.com/e-service/general/DashBoard.do", prefixes: ["HDMU", "HMMU"] },
  { code: "ZIM", name: "ZIM", website: "https://www.zimchina.com/za-cn/", prefixes: ["ZIMU", "ZCSU"] },
  { code: "TSL", name: "T.S. Lines", website: "https://www.tslines.com.cn/cn", prefixes: [] },
  { code: "ANL", name: "ANL", website: "https://www.anl.com.au/", prefixes: [] },
];

export function detectCarrier(reference: string): Carrier | null {
  const head = reference.replace(/\s+/g, "").toUpperCase().slice(0, 4);
  if (head.length < 4) return null;
  return CARRIERS.find((c) => c.prefixes.includes(head)) ?? null;
}

export type ReferenceKind = "container" | "bl" | "booking";

// ISO 6346: 4 letters (owner + category) + 6 digits + check digit.
export function guessReferenceKind(reference: string): ReferenceKind {
  const ref = reference.replace(/\s+/g, "").toUpperCase();
  if (/^[A-Z]{3}[UJZ]\d{7}$/.test(ref)) return "container";
  if (/^[A-Z]{4}/.test(ref)) return "bl";
  return "booking";
}
