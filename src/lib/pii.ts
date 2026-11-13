const PII_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: "email", regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
  { name: "ssn", regex: /\b\d{3}-\d{2}-\d{4}\b/g },
  { name: "phone", regex: /\b(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g },
  { name: "credit_card", regex: /\b(?:\d[ -]?){13,16}\b/g },
];

export type PiiScanResult = { redacted: string; classification: "restricted" | "internal"; findings: string[] };

/** Enforces governance in code: detected PII is masked before it can reach a search excerpt or AI answer. */
export function scanAndRedact(content: string): PiiScanResult {
  let redacted = content;
  const findings: string[] = [];
  for (const pattern of PII_PATTERNS) {
    if (content.match(pattern.regex)) {
      findings.push(pattern.name);
      redacted = redacted.replace(pattern.regex, "[redacted]");
    }
  }
  return { redacted, classification: findings.length > 0 ? "restricted" : "internal", findings };
}
