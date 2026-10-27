/**
 * Datenmodell nach der „Schnittstellendefinition QR-Code“ der Generalzolldirektion
 * (Verfahren dAKZ), Fassungen 1.2 und 1.3 – siehe spec.ts.
 */
import type { Charset, SpecVersion } from './spec';

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
  /** 1.2: E4 TSE_TA_SIG (Base64). Ab 1.3 nicht mehr im QR-Code, aber weiter auf dem Bon. */
  tseSignature: string;
  /** 1.2: E5 TSE_PUBLIC_KEY (Base64) */
  tsePublicKey: string;
  /** externeKundenReferenz, optional (1.2: E6, 1.3: E4) */
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
  /** Mit der jeweils anderen Zeichenkodierung erzeugen (1.3: UTF-8 statt ISO 8859-1) */
  wrongCharset?: boolean;
}

export type RateStyle = 'plain' | 'fixed';
export type EccLevel = 'L' | 'M' | 'Q' | 'H';

export interface GenerateOptions {
  /** Fassung der Spezifikation */
  spec: SpecVersion;
  /** 1.3: K8 Versionsnummer schreiben */
  writeVersion: boolean;
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
  /** Inhalt als Zeichenkette (nicht darstellbare Zeichen bereits ersetzt) */
  text: string;
  /** Exakte Bytes im Byte-Segment des QR-Codes */
  data: Uint8Array;
  charset: Charset;
  bytes: number;
  chars: number;
}

export interface GenerateResult {
  codes: GeneratedCode[];
  totals: Totals;
  /** Zeichen, die in der Zielkodierung fehlen und durch „?“ ersetzt wurden */
  replaced: string[];
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
  /** Fassung, nach der geprüft wurde */
  spec: SpecVersion;
}
