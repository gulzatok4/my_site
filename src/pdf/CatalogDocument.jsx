import { Document, Image, Link, Page, Path, StyleSheet, Svg, Text, View } from "@react-pdf/renderer";
import { ornamentBand, ornamentFrame } from "./ornament.js";
import { coverTitle, footerLabel, pageLabel, strings } from "./strings.js";
import { theme } from "./theme.js";

const line = "#d5d0c0";

const styles = StyleSheet.create({
  cover: {
    backgroundColor: theme.bg,
    paddingTop: 72,
    paddingHorizontal: 48,
    paddingBottom: 64,
    fontFamily: "Onest",
    color: theme.ink,
  },
  coverCenter: {
    marginTop: 92,
    alignItems: "center",
  },
  logo: {
    width: 78,
    height: 78,
    borderRadius: 39,
    objectFit: "cover",
    marginBottom: 22,
  },
  brand: {
    fontSize: 46,
    fontWeight: 600,
    letterSpacing: 0.6,
  },
  coverBand: {
    marginTop: 16,
    marginBottom: 14,
  },
  subtitle: {
    fontSize: 15,
    fontWeight: 600,
    color: theme.oliveDeep,
  },
  date: {
    marginTop: 8,
    fontSize: 11,
    color: theme.mute,
  },
  coverFoot: {
    position: "absolute",
    left: 48,
    right: 48,
    bottom: 44,
    alignItems: "center",
  },
  phone: {
    fontSize: 12,
    color: theme.oliveDeep,
  },
  page: {
    backgroundColor: theme.bg,
    paddingTop: 46,
    paddingHorizontal: 36,
    paddingBottom: 56,
    fontFamily: "Onest",
    color: theme.ink,
  },
  frame: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 595,
    height: 842,
  },
  section: {
    marginBottom: 6,
  },
  sectionHead: {
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 600,
    color: theme.oliveDeep,
    marginBottom: 4,
  },
  grid: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  card: {
    width: "48.6%",
    backgroundColor: theme.paper,
    borderWidth: 0.6,
    borderColor: line,
    borderRadius: 14,
    overflow: "hidden",
  },
  cardPhoto: {
    width: "100%",
    height: 128,
    backgroundColor: theme.oliveSoft,
    overflow: "hidden",
  },
  cardImage: {
    width: "100%",
    height: 128,
    objectFit: "cover",
  },
  cardCopy: {
    paddingTop: 8,
    paddingBottom: 10,
    paddingHorizontal: 10,
  },
  wide: {
    flexDirection: "row",
    backgroundColor: theme.paper,
    borderWidth: 0.6,
    borderColor: line,
    borderRadius: 14,
    overflow: "hidden",
    marginBottom: 10,
    height: 146,
  },
  widePhoto: {
    width: 196,
    height: 146,
    backgroundColor: theme.oliveSoft,
    overflow: "hidden",
  },
  wideImage: {
    width: 196,
    height: 146,
    objectFit: "cover",
  },
  wideCopy: {
    flex: 1,
    paddingTop: 12,
    paddingBottom: 12,
    paddingHorizontal: 14,
    justifyContent: "center",
  },
  name: {
    fontSize: 12,
    fontWeight: 600,
    marginBottom: 3,
  },
  price: {
    fontSize: 12,
    fontWeight: 600,
    color: theme.oliveDeep,
    marginBottom: 4,
  },
  desc: {
    fontSize: 9,
    lineHeight: 1.35,
    color: theme.mute,
  },
  link: {
    marginTop: 4,
    fontSize: 9,
    color: theme.olive,
    textDecoration: "none",
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    paddingTop: 6,
    borderTopWidth: 0.6,
    borderTopColor: line,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 9,
    color: theme.mute,
  },
});

const pageFrame = ornamentFrame(595, 842, { paper: theme.bg });
const coverRule = ornamentBand(252, { paper: theme.bg });
const sectionRule = ornamentBand(108, { paper: theme.bg });

function Paths({ model }) {
  return model.paths.map((path, index) => (
    <Path key={index} d={path.d} stroke={theme.olive} strokeWidth={path.strokeWidth} fill={path.fill} />
  ));
}

function Frame() {
  return (
    <View style={styles.frame} fixed>
      <Svg width={595} height={842} viewBox={`0 0 ${pageFrame.width} ${pageFrame.height}`}>
        <Paths model={pageFrame} />
      </Svg>
    </View>
  );
}

function Band({ model, style }) {
  return (
    <View style={style}>
      <Svg width={model.width} height={model.height} viewBox={`0 0 ${model.width} ${model.height}`}>
        <Paths model={model} />
      </Svg>
    </View>
  );
}

function Copy({ card, wide }) {
  return (
    <View style={wide ? styles.wideCopy : styles.cardCopy}>
      <Text style={styles.name}>{card.name}</Text>
      {card.priceText ? <Text style={styles.price}>{card.priceText}</Text> : null}
      {card.description ? <Text style={styles.desc}>{card.description}</Text> : null}
      {card.href ? (
        <Link src={card.href} style={styles.link}>
          {strings.watch}
        </Link>
      ) : null}
    </View>
  );
}

function Row({ cards }) {
  if (cards.length === 1) {
    const card = cards[0];
    return (
      <View style={styles.wide} wrap={false} minPresenceAhead={156}>
        <View style={styles.widePhoto}>{card.image ? <Image src={card.image} style={styles.wideImage} /> : null}</View>
        <Copy card={card} wide />
      </View>
    );
  }
  return (
    <View style={styles.grid} wrap={false} minPresenceAhead={214}>
      {cards.map((card) => (
        <View key={card.key} style={styles.card}>
          <View style={styles.cardPhoto}>{card.image ? <Image src={card.image} style={styles.cardImage} /> : null}</View>
          <Copy card={card} />
        </View>
      ))}
    </View>
  );
}

function rowsOf(cards) {
  const rows = [];
  for (let index = 0; index < cards.length; index += 2) rows.push(cards.slice(index, index + 2));
  return rows;
}

function Section({ section }) {
  const rows = rowsOf(section.cards);
  const [first, ...rest] = rows;
  return (
    <View style={styles.section}>
      <View wrap={false}>
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>{section.label}</Text>
          <Band model={sectionRule} />
        </View>
        {first ? <Row cards={first} /> : null}
      </View>
      {rest.map((cards) => (
        <Row key={cards.map((card) => card.key).join("|")} cards={cards} />
      ))}
    </View>
  );
}

export function CatalogDocument({ scope, logo, phone, dateLabel, sections }) {
  return (
    <Document title={coverTitle(scope)} author={strings.brand}>
      <Page size="A4" style={styles.cover}>
        <View style={styles.coverCenter}>
          {logo ? <Image src={logo} style={styles.logo} /> : null}
          <Text style={styles.brand}>{strings.brand}</Text>
          <Band model={coverRule} style={styles.coverBand} />
          <Text style={styles.subtitle}>{coverTitle(scope)}</Text>
          <Text style={styles.date}>{dateLabel}</Text>
        </View>
        <View style={styles.coverFoot}>
          <Text style={styles.phone}>{phone}</Text>
        </View>
        <Frame />
      </Page>
      <Page size="A4" style={styles.page}>
        {sections.map((section) => (
          <Section key={section.code} section={section} />
        ))}
        <Frame />
        <View style={styles.footer} fixed>
          <Text>{footerLabel(phone)}</Text>
          <Text render={({ pageNumber, totalPages }) => pageLabel(Math.max(1, pageNumber - 1), Math.max(1, totalPages - 1))} />
        </View>
      </Page>
    </Document>
  );
}
