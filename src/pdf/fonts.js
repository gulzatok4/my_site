import { Font } from "@react-pdf/renderer";

let registered = false;

export function registerPdfFonts() {
  if (registered) return;
  Font.register({
    family: "Onest",
    fonts: [
      { src: fontUrl("Onest-Regular.ttf"), fontWeight: 400 },
      { src: fontUrl("Onest-SemiBold.ttf"), fontWeight: 600 },
    ],
  });
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}

function fontUrl(file) {
  if (typeof window === "undefined") return `/fonts/${file}`;
  return new URL(`/fonts/${file}`, window.location.origin).href;
}
