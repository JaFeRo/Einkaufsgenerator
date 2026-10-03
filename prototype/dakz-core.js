/*
 * dAKZ QR-Code Kern: erzeugt und prüft den CSV-Inhalt nach der
 * "Schnittstellendefinition QR-Code" der Generalzolldirektion (Version 1.2, 01.09.2026).
 * Läuft im Browser (window.DAKZ) und in Node (module.exports).
 */
(function (root) {
  'use strict';

  // ---------- Formatierung ----------

  // Cent-Betrag -> "1234,56" (Komma, keine Tausendertrennung)
  function money(cents) {
    var neg = cents < 0;
    var abs = Math.abs(cents);
    var s = Math.floor(abs / 100) + ',' + String(abs % 100).padStart(2, '0');
    return neg ? '-' + s : s;
  }

  // 19 -> "19" (wie Zoll-Beispiele) oder "19,00" (wie Feldbeispiel P2)
  function rate(r, style) {
    if (style === 'fixed') return r.toFixed(2).replace('.', ',');
    return String(r).replace('.', ',');
  }

  // Menge: bis zu 3 Nachkommastellen, ohne überflüssige Nullen
  function qty(q) {
    return String(Math.round(q * 1000) / 1000).replace('.', ',');
  }

  // CSV-Feld nach C5/C7 maskieren
  function field(v) {
    v = v == null ? '' : String(v);
    if (/[;"]/.test(v)) return '"' + v.replace(/"/g, '""') + '"';
    return v;
  }

  function utf8Length(s) {
    var n = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.codePointAt(i);
      if (c > 0xffff) i++;
      n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
    }
    return n;
  }

  // ---------- Berechnung ----------

  // Positionsbrutto in Cent (Menge × Einzelpreis, kaufmännisch gerundet)
  function positionGross(p) {
    return Math.round(p.qty * p.unitPrice * 100);
  }

  function computeTotals(receipt) {
    var byRate = {};
    receipt.positions.forEach(function (p) {
      var g = positionGross(p);
      byRate[p.vat] = (byRate[p.vat] || 0) + g;
    });
    var rates = Object.keys(byRate).map(Number).sort(function (a, b) { return a - b; });
    var vatLines = rates.map(function (r) {
      var gross = byRate[r];
      var net = Math.round(gross / (1 + r / 100));
      return { rate: r, gross: gross, net: net, vat: gross - net };
    });
    var sum = function (k) { return vatLines.reduce(function (a, l) { return a + l[k]; }, 0); };
    return { vatLines: vatLines, gross: sum('gross'), net: sum('net'), vat: sum('vat') };
  }

  // ---------- Erzeugung ----------

  var DEFAULT_OPTIONS = {
    rateStyle: 'plain',      // 'plain' = "19", 'fixed' = "19,00"
    trailingLF: true,        // EBNF: jeder record endet mit LF
    lineBreak: '\n',         // C3: LF. '\r\n' nur zur Fehlerinjektion
    limitBytes: 1663,        // QR Version 40, ECC Q, Byte-Modus
    alwaysWriteTotal: false, // K3 auch bei nur einem QR-Code schreiben
    faults: {}               // Fehlerinjektion für Negativtests
  };

  function buildLines(receipt, opt) {
    var t = computeTotals(receipt);
    var f = opt.faults || {};
    var total = t.gross + (f.totalMismatch ? 100 : 0);

    var head = {
      bonNr: receipt.bonNr,
      start: receipt.start,
      end: f.endBeforeStart ? receipt.start - 60 : receipt.end,
      total: money(total)
    };
    var e = ['E', money(t.net), money(t.vat), receipt.tseSignature, receipt.tsePublicKey];
    if (receipt.externalRef) e.push(receipt.externalRef);

    var m = t.vatLines.map(function (l) {
      return ['M', rate(l.rate, opt.rateStyle), money(l.gross), money(l.net), money(l.vat)];
    });
    var p = receipt.positions.map(function (pos) {
      return ['P', rate(pos.vat, opt.rateStyle), pos.refundable === false ? '0' : '1',
        money(positionGross(pos)), qty(pos.qty), pos.unit || 'Stück', pos.text];
    });

    if (f.dropE) e = null;
    if (f.noPositions) p = [];
    return { head: head, e: e, m: m, p: p, totals: t };
  }

  function kLine(head, nr, count, writeCount) {
    return ['K', nr, writeCount ? count : '', head.bonNr, head.start, head.end, head.total];
  }

  function serialize(rows, opt) {
    var lb = opt.lineBreak;
    var s = rows.map(function (r) { return r.map(field).join(';'); }).join(lb);
    return opt.trailingLF ? s + lb : s;
  }

  // Teilt den Inhalt auf mehrere QR-Codes auf (Kapitel 5): Zeilen werden nie getrennt,
  // Folge-Codes enthalten nur K- und P-Zeilen.
  function generate(receipt, options) {
    var opt = Object.assign({}, DEFAULT_OPTIONS, options || {});
    var b = buildLines(receipt, opt);
    var lb = opt.lineBreak;
    var lineLen = function (r) { return utf8Length(r.map(field).join(';')) + utf8Length(lb); };

    // Gesamtanzahl beeinflusst die Länge der K-Zeile -> bis zur Stabilität wiederholen
    var count = 1, chunks;
    for (var attempt = 0; attempt < 4; attempt++) {
      var writeCount = count > 1 || opt.alwaysWriteTotal;
      var kLen = lineLen(kLine(b.head, 999, count, writeCount));
      chunks = [];
      var cur = { rows: [], size: kLen };
      var fixed = (b.e ? [b.e] : []).concat(b.m);
      fixed.forEach(function (r) { cur.rows.push(r); cur.size += lineLen(r); });
      b.p.forEach(function (r) {
        var len = lineLen(r);
        if (cur.size + len > opt.limitBytes && cur.rows.some(function (x) { return x[0] === 'P'; })) {
          chunks.push(cur);
          cur = { rows: [], size: kLen };
        }
        cur.rows.push(r);
        cur.size += len;
      });
      chunks.push(cur);
      if (chunks.length === count) break;
      count = chunks.length;
    }

    var writeTotal = chunks.length > 1 || opt.alwaysWriteTotal;
    var codes = chunks.map(function (c, i) {
      var rows = [kLine(b.head, i + 1, chunks.length, writeTotal)].concat(c.rows);
      var text = serialize(rows, opt);
      return { index: i + 1, count: chunks.length, text: text, bytes: utf8Length(text), chars: text.length };
    });
    return { codes: codes, totals: b.totals };
  }

  // ---------- Prüfung ----------

  var RX = {
    nr: /^\d{1,3}$/,
    bonNr: /^[1-9]\d{0,11}$|^10{12}$/,
    epoch: /^\d{10}$/,
    kBrutto: /^(?!50,00$)([5-9]\d|[1-9]\d{2,6}|[1-4]\d{7}),\d{2}$/,
    eBetrag: /^(?!0,00$)(0|[1-9]\d{0,6}|[1-4]\d{7}),\d{2}$/,
    tse: /^.{1,512}$/,
    ref: /^.{0,255}$/,
    satz: /^\d{1,2}(,\d{1,2})?$/,
    flag: /^[01]$/,
    pBrutto: /^(-?[1-4]?\d{1,4}|-?50000|0),\d{2}$/,
    menge: /^(?!0(,0{1,3})?$)(0,\d{1,3}|[1-9]\d{0,4}(,\d{1,3})?)$/,
    einheit: /^.{0,50}$/,
    text: /^.{1,255}$/,
    mBetrag: /^-?([0-4]?\d{1,7}),\d{2}$/
  };

  // [Feld-ID, Name, Regex, Pflicht]
  var SPEC = {
    K: [['K2', 'Nummer', RX.nr, true], ['K3', 'Gesamtanzahl', RX.nr, false], ['K4', 'BON_NR', RX.bonNr, true],
      ['K5', 'BON_START', RX.epoch, true], ['K6', 'BON_ENDE', RX.epoch, true], ['K7', 'UMS_BRUTTO', RX.kBrutto, true]],
    E: [['E2', 'UMS_NETTO', RX.eBetrag, true], ['E3', 'MWST', RX.eBetrag, true], ['E4', 'TSE_TA_SIG', RX.tse, true],
      ['E5', 'TSE_PUBLIC_KEY', RX.tse, true], ['E6', 'externeKundenReferenz', RX.ref, false]],
    M: [['M2', 'MWST_SATZ', RX.satz, true], ['M3', 'UMS_BRUTTO', RX.mBetrag, true], ['M4', 'UMS_NETTO', RX.mBetrag, true],
      ['M5', 'MWST', RX.mBetrag, true]],
    P: [['P2', 'MWST_SATZ', RX.satz, true], ['P3', 'ERSTATTUNGSFAEHIG', RX.flag, false], ['P4', 'UMS_BRUTTO', RX.pBrutto, true],
      ['P5', 'MENGE', RX.menge, false], ['P6', 'EINHEIT', RX.einheit, false], ['P7', 'ARTIKELTEXT', RX.text, true]]
  };

  // RFC-4180-artige Zeile mit ; zerlegen
  function parseRecord(line) {
    var out = [], cur = '', q = false;
    for (var i = 0; i < line.length; i++) {
      var ch = line[i];
      if (q) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') q = false;
        else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === ';') { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  }

  function cents(s) { return Math.round(parseFloat(String(s).replace(',', '.')) * 100); }

  // Prüft einen einzelnen QR-Inhalt. Liefert {errors, warnings, records}.
  function validate(text, opts) {
    opts = opts || {};
    var errors = [], warnings = [];
    if (/\r/.test(text)) errors.push('C3: Zeilenumbruch muss LF sein, CR gefunden');
    var bytes = utf8Length(text);
    if (opts.limitBytes && bytes > opts.limitBytes) errors.push('Inhalt hat ' + bytes + ' Byte, Grenze ' + opts.limitBytes);
    if (text.length > 2420) errors.push('Kapitel 5: mehr als 2.420 Zeichen');
    if (!/\n$/.test(text)) warnings.push('Letzte Zeile endet ohne LF (EBNF verlangt LF je record)');

    var lines = text.replace(/\r/g, '').split('\n').filter(function (l) { return l.length; });
    var records = lines.map(parseRecord);
    var types = records.map(function (r) { return r[0]; }).join('');
    var nr = records[0] && records[0][0] === 'K' ? records[0][1] : null;
    var primary = nr === '1';

    var order = primary ? /^KEM{1,5}P{1,1000}$/ : /^KP{1,1000}$/;
    if (!order.test(types)) {
      errors.push((primary ? 'Primärcode' : 'Folgecode') + ': Zeilenfolge "' + types.replace(/(.)\1+/g, '$1…') +
        '" entspricht nicht ' + (primary ? 'K E M{1..5} P{1..1000}' : 'K P{1..1000}'));
    }

    records.forEach(function (r, li) {
      var spec = SPEC[r[0]];
      if (!spec) { errors.push('Zeile ' + (li + 1) + ': unbekannter Zeilentyp "' + r[0] + '"'); return; }
      spec.forEach(function (s, fi) {
        var v = r[fi + 1];
        if (v === undefined || v === '') {
          if (s[3]) errors.push('Zeile ' + (li + 1) + ' ' + s[0] + ' ' + s[1] + ': Pflichtfeld fehlt');
          return;
        }
        if (!s[2].test(v)) errors.push('Zeile ' + (li + 1) + ' ' + s[0] + ' ' + s[1] + ': "' + v + '" passt nicht zu ' + s[2]);
      });
    });

    // Fachliche Konsistenz (in der Spezifikation nicht ausdrücklich gefordert -> Warnungen)
    var k = records[0];
    if (k && k[0] === 'K') {
      if (+k[4] > +k[5]) warnings.push('BON_ENDE liegt vor BON_START');
      if (k[2] && +k[1] > +k[2]) errors.push('K2 Nummer größer als K3 Gesamtanzahl');
    }
    if (primary) {
      var ms = records.filter(function (r) { return r[0] === 'M'; });
      var ps = records.filter(function (r) { return r[0] === 'P'; });
      var e = records.filter(function (r) { return r[0] === 'E'; })[0];
      var sum = function (rows, i) { return rows.reduce(function (a, r) { return a + cents(r[i]); }, 0); };
      if (k && cents(k[6]) !== sum(ms, 2)) warnings.push('K7 (' + k[6] + ') ≠ Summe M3 (' + money(sum(ms, 2)) + ')');
      if (e && cents(e[1]) !== sum(ms, 3)) warnings.push('E2 (' + e[1] + ') ≠ Summe M4 (' + money(sum(ms, 3)) + ')');
      if (e && cents(e[2]) !== sum(ms, 4)) warnings.push('E3 (' + e[2] + ') ≠ Summe M5 (' + money(sum(ms, 4)) + ')');
      ms.forEach(function (m) {
        if (cents(m[2]) !== cents(m[3]) + cents(m[4])) warnings.push('M ' + m[1] + ' %: Brutto ≠ Netto + MwSt');
      });
      if (k && !k[2] && ps.length && ms.length) {
        var pSum = sum(ps, 3);
        if (pSum !== sum(ms, 2)) warnings.push('Summe P4 (' + money(pSum) + ') ≠ Summe M3 – fehlt ein Folgecode?');
      }
    }
    return { errors: errors, warnings: warnings, records: records, bytes: bytes, chars: text.length };
  }

  // ---------- Testdaten ----------

  var CATALOG = [
    ['Uhr Chronograph Edelstahl', 19, 289.00], ['Kaschmir-Pullover', 19, 149.95], ['Kopfhörer Noise Cancelling', 19, 249.00],
    ['Parfum Eau de Toilette 100 ml', 19, 89.90], ['Laufschuhe Trail', 19, 129.99], ['Lederhandtasche', 19, 219.00],
    ['Espressomaschine', 19, 399.00], ['Messerset 5-tlg.', 19, 119.00], ['Sonnenbrille', 19, 159.00],
    ['Gesichtscreme 50 ml', 19, 34.95], ['Schwarzwälder Schinken', 7, 12.49, 'kg'], ['Bergkäse', 7, 24.90, 'kg'],
    ['Kaffee Bohnen 1 kg', 7, 16.99], ['Pralinen-Box', 7, 9.95], ['Kinderbuch', 7, 14.00],
    ['Riesling Spätlese 0,75 l', 19, 11.90], ['Nasenspray', 19, 4.29], ['Multivitamin 60 Stk.', 19, 12.95]
  ];

  function rnd(seed) {
    // kleiner deterministischer PRNG (mulberry32)
    var a = seed >>> 0;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function base64(bytes) {
    if (typeof btoa === 'function') return btoa(String.fromCharCode.apply(null, bytes));
    return Buffer.from(bytes).toString('base64');
  }

  function fakeTse(r) {
    var sig = [0x30, 0x45, 0x02, 0x20];
    for (var i = 0; i < 67; i++) sig.push(Math.floor(r() * 256));
    var key = [0x04];
    for (var j = 0; j < 64; j++) key.push(Math.floor(r() * 256));
    return { signature: base64(sig), publicKey: base64(key) };
  }

  function randomReceipt(seed, n) {
    var r = rnd(seed || Date.now());
    n = n || 2 + Math.floor(r() * 4);
    var positions = [];
    for (var i = 0; i < n; i++) {
      var c = CATALOG[Math.floor(r() * CATALOG.length)];
      var isKg = c[3] === 'kg';
      positions.push({
        text: c[0], vat: c[1], unitPrice: c[2], unit: isKg ? 'kg' : 'Stück',
        qty: isKg ? Math.round((0.1 + r() * 0.8) * 1000) / 1000 : 1 + Math.floor(r() * 2), refundable: true
      });
    }
    var start = Math.floor(Date.now() / 1000) - Math.floor(r() * 3600);
    var bonNr = 1000 + Math.floor(r() * 899000);
    var tse = fakeTse(r);
    return {
      bonNr: bonNr, start: start, end: start + 5 + Math.floor(r() * 90),
      tseSignature: tse.signature, tsePublicKey: tse.publicKey, externalRef: 'REF_' + bonNr,
      positions: positions
    };
  }

  // Beispiel 6.1 der Spezifikation (rekonstruiert)
  function example61() {
    return {
      bonNr: 302592, start: 1770201944, end: 1770201945,
      tseSignature: 'MEQCID5hG9Z8xPk1qN4v8WzR3mK9sT5Y6b7c8d9e0f1a2b3cAiQ4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9',
      tsePublicKey: 'BKizwdLj9KW2x9jp8KGyw9Tl9qe4ydDh8qO0xdbl56f4qbDB0uP0pbbH2OnwobLD1OX2p7jJ0OHyo7TF1g==',
      externalRef: 'REF_302592',
      positions: [{ text: 'Cla Multi Int Nuit PTS', vat: 19, unitPrice: 105.20, qty: 1, unit: 'Stück', refundable: true }]
    };
  }

  var api = {
    money: money, utf8Length: utf8Length, computeTotals: computeTotals, positionGross: positionGross,
    generate: generate, validate: validate, parseRecord: parseRecord,
    randomReceipt: randomReceipt, example61: example61, fakeTse: fakeTse, rnd: rnd, CATALOG: CATALOG,
    DEFAULT_OPTIONS: DEFAULT_OPTIONS
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DAKZ = api;
})(this);
