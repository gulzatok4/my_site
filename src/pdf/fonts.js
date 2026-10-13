import { Font } from "@react-pdf/renderer";
import regular from "../../public/fonts/Onest-Regular.ttf?inline";
import semibold from "../../public/fonts/Onest-SemiBold.ttf?inline";

let registered = false;

export function registerPdfFonts() {
  if (registered) return;
  // Файлы лежат в public/fonts, но в чанк они вшиты: serve.ps1 не отдаёт .ttf.
  Font.register({
    family: "Onest",
    fonts: [
      { src: regular, fontWeight: 400 },
      { src: semibold, fontWeight: 600 },
    ],
  });
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}
