const ONES = [
  "",
  "один",
  "два",
  "три",
  "четыре",
  "пять",
  "шесть",
  "семь",
  "восемь",
  "девять",
  "десять",
  "одиннадцать",
  "двенадцать",
  "тринадцать",
  "четырнадцать",
  "пятнадцать",
  "шестнадцать",
  "семнадцать",
  "восемнадцать",
  "девятнадцать",
];

const TENS = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"];

const HUNDREDS = ["", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот"];

const UNITS = {
  kzt: { major: ["тенге", "тенге", "тенге"], minor: ["тиын", "тиына", "тиын"] },
  rub: { major: ["рубль", "рубля", "рублей"], minor: ["копейка", "копейки", "копеек"] },
  usd: { major: ["доллар", "доллара", "долларов"], minor: ["цент", "цента", "центов"] },
};

function plural(value, forms) {
  const mod100 = value % 100;
  const mod10 = value % 10;
  if (mod100 >= 11 && mod100 <= 19) return forms[2];
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
}

function oneWord(value, feminine) {
  if (feminine && value === 1) return "одна";
  if (feminine && value === 2) return "две";
  return ONES[value];
}

function belowThousand(value, feminine) {
  const parts = [];
  const hundred = Math.floor(value / 100);
  const rest = value % 100;
  if (hundred) parts.push(HUNDREDS[hundred]);
  if (rest >= 20) {
    parts.push(TENS[Math.floor(rest / 10)]);
    const one = rest % 10;
    if (one) parts.push(oneWord(one, feminine));
  } else if (rest > 0) {
    parts.push(rest < 3 ? oneWord(rest, feminine) : ONES[rest]);
  }
  return parts.join(" ");
}

function group(value, forms, feminine) {
  if (!value) return "";
  return `${belowThousand(value, feminine)} ${plural(value, forms)}`;
}

function capitalize(text) {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

export function amountInWords(value, currency = "kzt") {
  const code = UNITS[String(currency || "kzt").toLowerCase()] ? String(currency || "kzt").toLowerCase() : "kzt";
  const unit = UNITS[code];
  const tiyn = Math.round(Number(value) * 100);
  const sign = tiyn < 0 ? -1 : 1;
  const abs = Math.abs(tiyn);
  const major = Math.floor(abs / 100);
  const minor = abs % 100;
  const millions = Math.floor(major / 1000000) % 1000;
  const thousands = Math.floor(major / 1000) % 1000;
  const ones = major % 1000;
  const parts = [
    group(Math.floor(major / 1000000000), ["миллиард", "миллиарда", "миллиардов"], false),
    group(millions, ["миллион", "миллиона", "миллионов"], false),
    group(thousands, ["тысяча", "тысячи", "тысяч"], true),
    ones ? belowThousand(ones, false) : "",
  ].filter(Boolean);
  if (!parts.length) parts.push("ноль");
  const words = `${sign < 0 ? "минус " : ""}${parts.join(" ")} ${plural(major, unit.major)} ${String(minor).padStart(2, "0")} ${plural(minor, unit.minor)}`;
  return capitalize(words);
}
