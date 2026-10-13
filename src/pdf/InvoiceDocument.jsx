import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { PHONE, formatPhone, normalizeItemType } from "../lib/catalog.js";
import { amountInWords } from "./amountInWords.js";
import { formatMoney } from "./money.js";
import { invoiceHeading, invoiceStrings as s } from "./strings.js";
import { theme } from "./theme.js";

const line = "#c5cbb6";

const styles = StyleSheet.create({
  page: {
    backgroundColor: "#ffffff",
    paddingTop: 28,
    paddingHorizontal: 32,
    paddingBottom: 36,
    fontFamily: "Onest",
    fontSize: 9,
    color: theme.ink,
  },
  head: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  logo: {
    width: 36,
    height: 36,
    objectFit: "contain",
  },
  sellerName: {
    flex: 1,
    marginLeft: 12,
    textAlign: "right",
    fontSize: 12,
    fontWeight: 600,
    color: theme.oliveDeep,
  },
  bank: {
    marginTop: 12,
    borderWidth: 0.6,
    borderColor: line,
  },
  bankRow: {
    flexDirection: "row",
    borderBottomWidth: 0.6,
    borderBottomColor: line,
  },
  bankRowLast: {
    flexDirection: "row",
  },
  bankMain: {
    width: "62%",
    padding: 6,
    borderRightWidth: 0.6,
    borderRightColor: line,
  },
  bankSide: {
    width: "38%",
  },
  sideLine: {
    flexDirection: "row",
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderBottomWidth: 0.6,
    borderBottomColor: line,
  },
  sideLineLast: {
    flexDirection: "row",
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  sideLabel: {
    width: 28,
    color: theme.oliveDeep,
    fontWeight: 600,
  },
  label: {
    color: theme.oliveDeep,
    fontWeight: 600,
    marginBottom: 1,
  },
  title: {
    marginTop: 16,
    marginBottom: 12,
    textAlign: "center",
    fontSize: 13,
    fontWeight: 600,
  },
  party: {
    marginBottom: 6,
  },
  table: {
    marginTop: 8,
    borderWidth: 0.6,
    borderColor: line,
  },
  row: {
    flexDirection: "row",
    borderBottomWidth: 0.6,
    borderBottomColor: line,
  },
  rowLast: {
    flexDirection: "row",
  },
  headRow: {
    flexDirection: "row",
    backgroundColor: theme.oliveSoft,
    borderBottomWidth: 0.6,
    borderBottomColor: line,
  },
  cellNo: { width: "7%", padding: 4 },
  cellName: { width: "39%", padding: 4 },
  cellQty: { width: "10%", padding: 4, textAlign: "right" },
  cellUnit: { width: "10%", padding: 4, textAlign: "center" },
  cellMoney: { width: "17%", padding: 4, textAlign: "right" },
  headText: { fontWeight: 600, color: theme.oliveDeep },
  right: { textAlign: "right" },
  center: { textAlign: "center" },
  totals: {
    marginTop: 8,
    marginLeft: "auto",
    width: 230,
  },
  totalLine: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 2,
  },
  grand: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 3,
    paddingTop: 3,
    borderTopWidth: 0.8,
    borderTopColor: theme.olive,
    fontWeight: 600,
  },
  summary: {
    marginTop: 10,
  },
  words: {
    marginTop: 4,
    fontWeight: 600,
  },
  note: {
    marginTop: 10,
    color: theme.mute,
  },
  sign: {
    marginTop: 22,
    flexDirection: "row",
    alignItems: "flex-end",
  },
  signLine: {
    width: 110,
    marginHorizontal: 8,
    borderBottomWidth: 0.6,
    borderBottomColor: theme.ink,
    height: 12,
  },
});

function amountFromTiyn(tiyn) {
  const value = Math.round(Number(tiyn) || 0);
  const sign = value < 0 ? -1 : 1;
  const abs = Math.abs(value);
  return sign * (Math.floor(abs / 100) + (abs % 100) / 100);
}

function partyText(label, lines) {
  return (
    <Text style={styles.party}>
      <Text style={styles.label}>{label}: </Text>
      {lines.filter(Boolean).join(", ")}
    </Text>
  );
}

function sidePair(label, value, last) {
  return (
    <View style={last ? styles.sideLineLast : styles.sideLine}>
      <Text style={styles.sideLabel}>{label}</Text>
      <Text>{value}</Text>
    </View>
  );
}

export function InvoiceDocument({ order, seller, buyer, lines, summary, logo }) {
  const phone = formatPhone(String(seller?.phone || "").trim()) || formatPhone(PHONE);
  const note = String(seller?.note || "").trim() || s.defaultNote;
  const knp = String(seller?.knp || "").trim();
  const company = String(buyer?.company || "").trim();
  const buyerBin = String(buyer?.bin || "").trim();
  const buyerName = company || String(buyer?.name || "").trim();
  const buyerIdentity = buyerName && buyerBin ? `${buyerName}, ${s.bin} ${buyerBin}` : buyerName;
  const currency = summary.currency;
  const rows = lines.map((item, index) => ({
    name: String(item.name || "").trim() || "—",
    qty: summary.items[index]?.qty || 0,
    unit: normalizeItemType(item.itemType) === "service" ? s.unitService : s.unitProduct,
    price: formatMoney(summary.items[index]?.priceTiyn || 0, currency),
    sum: formatMoney(summary.items[index]?.amountTiyn || 0, currency),
  }));

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.head}>
          {logo ? <Image src={logo} style={styles.logo} /> : <View style={styles.logo} />}
          <Text style={styles.sellerName}>{seller.name}</Text>
        </View>

        <View style={styles.bank} wrap={false}>
          <View style={styles.bankRow}>
            <View style={styles.bankMain}>
              <Text style={styles.label}>{s.beneficiary}</Text>
              <Text>{seller.name}</Text>
              <Text>
                {s.bin} {seller.bin}
              </Text>
            </View>
            <View style={styles.bankSide}>
              {sidePair(s.iik, seller.iik, false)}
              {sidePair(s.kbe, seller.kbe, true)}
            </View>
          </View>
          <View style={styles.bankRowLast}>
            <View style={styles.bankMain}>
              <Text style={styles.label}>{s.bank}</Text>
              <Text>{seller.bank}</Text>
            </View>
            <View style={styles.bankSide}>
              {sidePair(s.bik, seller.bik, !knp)}
              {knp ? sidePair(s.knp, knp, true) : null}
            </View>
          </View>
        </View>

        <Text style={styles.title}>{invoiceHeading(order.number, order.createdAt)}</Text>

        {partyText(s.supplier, [seller.name, `${s.bin} ${seller.bin}`, seller.address, phone])}
        {partyText(s.buyer, [buyerIdentity, buyer?.address, formatPhone(buyer?.phone)])}

        <View style={styles.table}>
          <View style={styles.headRow} fixed>
            <View style={styles.cellNo}><Text style={styles.headText}>{s.colNo}</Text></View>
            <View style={styles.cellName}><Text style={styles.headText}>{s.colName}</Text></View>
            <View style={styles.cellQty}><Text style={[styles.headText, styles.right]}>{s.colQty}</Text></View>
            <View style={styles.cellUnit}><Text style={[styles.headText, styles.center]}>{s.colUnit}</Text></View>
            <View style={styles.cellMoney}><Text style={[styles.headText, styles.right]}>{s.colPrice}</Text></View>
            <View style={styles.cellMoney}><Text style={[styles.headText, styles.right]}>{s.colSum}</Text></View>
          </View>
          {rows.map((row, index) => (
            <View key={index} style={index === rows.length - 1 ? styles.rowLast : styles.row} wrap={false}>
              <View style={styles.cellNo}><Text>{index + 1}</Text></View>
              <View style={styles.cellName}><Text>{row.name}</Text></View>
              <View style={styles.cellQty}><Text style={styles.right}>{row.qty}</Text></View>
              <View style={styles.cellUnit}><Text style={styles.center}>{row.unit}</Text></View>
              <View style={styles.cellMoney}><Text style={styles.right}>{row.price}</Text></View>
              <View style={styles.cellMoney}><Text style={styles.right}>{row.sum}</Text></View>
            </View>
          ))}
        </View>

        <View style={styles.totals} wrap={false}>
          <View style={styles.totalLine}>
            <Text>{s.total}</Text>
            <Text>{formatMoney(summary.totalTiyn, currency)}</Text>
          </View>
          <View style={styles.totalLine}>
            <Text>
              {summary.vatPayer && summary.vatRate > 0 ? `${s.vatIncluded} ${summary.vatRate}%` : s.noVat}
            </Text>
            <Text>{summary.vatPayer && summary.vatRate > 0 ? formatMoney(summary.vatTiyn, currency) : ""}</Text>
          </View>
          <View style={styles.grand}>
            <Text>{s.grand}</Text>
            <Text>{formatMoney(summary.totalTiyn, currency)}</Text>
          </View>
        </View>

        <Text style={styles.summary}>
          {s.itemsOnSum} {rows.length} {s.onSum} {formatMoney(summary.totalTiyn, currency, { code: true })}
        </Text>
        <Text style={styles.words}>{amountInWords(amountFromTiyn(summary.totalTiyn), currency)}</Text>
        <Text style={styles.note}>{note}</Text>
        {String(seller?.signatory || "").trim() ? (
          <View style={styles.sign} wrap={false}>
            <Text>{s.signatory}</Text>
            <View style={styles.signLine} />
            <Text>/ {String(seller.signatory).trim()} /</Text>
          </View>
        ) : null}
      </Page>
    </Document>
  );
}
