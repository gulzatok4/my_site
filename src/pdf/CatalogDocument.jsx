import { Document, Image, Link, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { coverTitle, footerLabel, pageLabel, strings } from "./strings.js";
import { theme } from "./theme.js";

const styles = StyleSheet.create({
  cover: {
    backgroundColor: theme.bg,
    paddingTop: 56,
    paddingHorizontal: 48,
    paddingBottom: 48,
    fontFamily: "Onest",
    color: theme.ink,
  },
  coverBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 12,
    backgroundColor: theme.olive,
  },
  logo: {
    width: 78,
    height: 78,
    marginBottom: 28,
    borderRadius: 18,
    objectFit: "cover",
  },
  brand: {
    fontSize: 40,
    fontWeight: 600,
    color: theme.ink,
  },
  subtitle: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: 600,
    color: theme.oliveDeep,
  },
  date: {
    marginTop: 16,
    fontSize: 12,
    color: theme.mute,
  },
  coverPhone: {
    position: "absolute",
    left: 48,
    bottom: 46,
    fontSize: 12,
    color: theme.oliveDeep,
  },
  page: {
    backgroundColor: theme.bg,
    paddingTop: theme.pagePaddingTop,
    paddingHorizontal: theme.pagePaddingX,
    paddingBottom: theme.pagePaddingBottom,
    fontFamily: "Onest",
    color: theme.ink,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 600,
    color: theme.oliveDeep,
    marginBottom: 4,
  },
  rule: {
    width: 36,
    height: 2,
    backgroundColor: theme.olive,
    marginBottom: 10,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  card: {
    width: "48.5%",
    backgroundColor: theme.paper,
    borderRadius: 10,
    overflow: "hidden",
  },
  photo: {
    width: "100%",
    height: 128,
    objectFit: "cover",
  },
  body: {
    paddingTop: 8,
    paddingBottom: 10,
    paddingHorizontal: 10,
  },
  name: {
    fontSize: 11,
    fontWeight: 600,
    marginBottom: 3,
  },
  price: {
    fontSize: 11,
    fontWeight: 600,
    color: theme.oliveDeep,
    marginBottom: 4,
  },
  desc: {
    fontSize: 9,
    lineHeight: 1.4,
    color: theme.mute,
  },
  link: {
    marginTop: 5,
    fontSize: 9,
    color: theme.olive,
    textDecoration: "none",
  },
  footer: {
    position: "absolute",
    bottom: 18,
    left: theme.pagePaddingX,
    right: theme.pagePaddingX,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 9,
    color: theme.mute,
  },
});

function rowsOf(cards) {
  const rows = [];
  for (let index = 0; index < cards.length; index += 2) rows.push(cards.slice(index, index + 2));
  return rows;
}

function Card({ card }) {
  return (
    <View style={styles.card} wrap={false}>
      {card.image ? <Image src={card.image} style={styles.photo} /> : null}
      <View style={styles.body}>
        <Text style={styles.name}>{card.name}</Text>
        {card.priceText ? <Text style={styles.price}>{card.priceText}</Text> : null}
        {card.description ? <Text style={styles.desc}>{card.description}</Text> : null}
        {card.href ? (
          <Link src={card.href} style={styles.link}>
            {strings.watch}
          </Link>
        ) : null}
      </View>
    </View>
  );
}

function CardRow({ cards }) {
  return (
    <View style={styles.row} wrap={false}>
      {cards.map((card) => (
        <Card key={card.key} card={card} />
      ))}
    </View>
  );
}

function Section({ section }) {
  const rows = rowsOf(section.cards);
  const [first, ...rest] = rows;
  return (
    <View>
      <View wrap={false}>
        <Text style={styles.sectionTitle}>{section.label}</Text>
        <View style={styles.rule} />
        {first ? <CardRow cards={first} /> : null}
      </View>
      {rest.map((cards) => (
        <CardRow key={cards.map((card) => card.key).join("|")} cards={cards} />
      ))}
    </View>
  );
}

export function CatalogDocument({ scope, logo, phone, dateLabel, sections }) {
  return (
    <Document title={coverTitle(scope)} author={strings.brand}>
      <Page size="A4" style={styles.cover}>
        <View style={styles.coverBar} />
        {logo ? <Image src={logo} style={styles.logo} /> : null}
        <Text style={styles.brand}>{strings.brand}</Text>
        <Text style={styles.subtitle}>{coverTitle(scope)}</Text>
        <Text style={styles.date}>{dateLabel}</Text>
        <Text style={styles.coverPhone}>{phone}</Text>
      </Page>
      <Page size="A4" style={styles.page}>
        {sections.map((section) => (
          <Section key={section.code} section={section} />
        ))}
        <View style={styles.footer} fixed>
          <Text>{footerLabel(phone)}</Text>
          <Text
            render={({ pageNumber, totalPages }) => pageLabel(Math.max(1, pageNumber - 1), Math.max(1, totalPages - 1))}
          />
        </View>
      </Page>
    </Document>
  );
}
