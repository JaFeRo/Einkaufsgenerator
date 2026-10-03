/**
 * Datenmodell nach der „Schnittstellendefinition QR-Code“ der Generalzolldirektion,
 * Version 1.2 vom 01.09.2026 (Verfahren dAKZ).
 */

export interface Position {
  /** P7 ARTIKELTEXT */
  text: string;
  /** Menge (P5), bis 3 Nachkommastellen */
  qty: number;
  /** P6 EINHEIT, Standard „Stück“ */
  unit: string;
  /** Einzelpreis brutto in Euro – nur für die Berechnung von P4 */
  unitPrice: number;
  /** P2 MWST_SATZ in Prozent */
  vat: number;
  /** P3 ERSTATTUNGSFAEHIG */
  refundable: boolean;
}

export interface Receipt {
  /** K4 BON_NR */
  bonNr: string;
  /** K5 BON_START, Unix-Sekunden UTC */
  start: number;
  /** K6 BON_ENDE, Unix-Sekunden UTC */
  end: number;
  /** E4 TSE_TA_SIG (Base64) */
  tseSignature: string;
  /** E5 TSE_PUBLIC_KEY (Base64) */
  tsePublicKey: string;
  /** E6 externeKundenReferenz, optional */
  externalRef: string;
  positions: Position[];
}

/** Angaben, die nur auf dem gedruckten Bon stehen, nicht im QR-Code. */
export interface Merchant {
  name: string;
  address: string;
  vatId: string;
  register: string;
}

export interface Faults {
  /** K7 weicht um 1,00 € von der Summe ab */
  totalMismatch?: boolean;
  /** BON_ENDE liegt vor BON_START */
  endBeforeStart?: boolean;
  /** E-Zeile weglassen */
  dropE?: boolean;
  /** CRLF statt LF */
  crlf?: boolean;
  /** keine P-Zeilen */
  noPositions?: boolean;
  /** Steuersatz mit Leerzeichen wie im PDF-Regex (P2/M2) */
  rateWithSpace?: boolean;
}

export type RateStyle = 'plain' | 'fixed';
export type EccLevel = 'L' | 'M' | 'Q' | 'H';

export interface GenerateOptions {
  /** „19“ wie in den Beispielen oder „19,00“ wie im Feldbeispiel */
  rateStyle: RateStyle;
  /** EBNF: jeder record endet mit LF */
  trailingLF: boolean;
  /** Maximale Größe eines Codes in Byte (UTF-8) */
  limitBytes: number;
  /** K3 auch bei nur einem Code schreiben */
  alwaysWriteTotal: boolean;
  faults: Faults;
}

export interface VatLine {
  rate: number;
  /** Cent */
  gross: number;
  net: number;
  vat: number;
}

export interface Totals {
  vatLines: VatLine[];
  gross: number;
  net: number;
  vat: number;
}

export interface GeneratedCode {
  index: number;
  count: number;
  text: string;
  bytes: number;
  chars: number;
}

export interface GenerateResult {
  codes: GeneratedCode[];
  totals: Totals;
}

export type Severity = 'error' | 'warning';

export interface Finding {
  severity: Severity;
  /** Feld-ID aus der Spezifikation (z. B. K7) oder Regel-Kürzel */
  ref?: string;
  /** Zeilennummer (1-basiert), falls zutreffend */
  line?: number;
  message: string;
}

export interface CodeCheck {
  findings: Finding[];
  records: string[][];
  bytes: number;
  chars: number;
  /** K2 = 1 */
  primary: boolean;
}
