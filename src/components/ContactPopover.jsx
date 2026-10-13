import { useLayoutEffect, useRef, useState } from "react";
import { PHONE, formatPhone } from "../lib/catalog.js";
import { useStore } from "../store.jsx";

const MAIL_CONFIGURED = false;

export function ContactPopover() {
  const { t, contactEl, closeContact } = useStore();
  const [box, setBox] = useState(null);
  const dialogRef = useRef(null);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!contactEl || !dialog) return undefined;
    const place = () => {
      const rect = contactEl.getBoundingClientRect();
      const gap = 12;
      const margin = 12;
      const viewW = document.documentElement.clientWidth;
      const viewH = window.innerHeight;
      const width = dialog.offsetWidth;
      const height = dialog.offsetHeight;
      const center = rect.left + rect.width / 2;
      const left = Math.max(margin, Math.min(center - width / 2, viewW - width - margin));
      const spaceBelow = viewH - rect.bottom - gap - margin;
      const above = spaceBelow < height && rect.top - gap - margin > spaceBelow;
      const top = above ? Math.max(margin, rect.top - gap - height) : rect.bottom + gap;
      setBox({
        left,
        top,
        above,
        arrow: Math.max(20, Math.min(center - left, width - 20)),
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [contactEl]);

  if (!contactEl) return null;

  return (
    <div className={`checkout-modal contact-modal${box?.above ? " is-above" : ""}`} id="contact-modal">
      <div className="checkout-backdrop" onClick={closeContact} />
      <div
        ref={dialogRef}
        className="checkout-dialog contact-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="contact-modal-title"
        style={
          box
            ? {
                left: `${box.left}px`,
                top: `${box.top}px`,
                "--contact-arrow": `${box.arrow}px`,
              }
            : undefined
        }
      >
        <button type="button" className="checkout-close" aria-label={t("checkout.close")} onClick={closeContact}>
          ×
        </button>
        <div className="contact-dialog-mark" aria-hidden="true">
          G
        </div>
        <h2 id="contact-modal-title">{t("contact.popup.title")}</h2>
        <p className="checkout-lead">{t("contact.popup.lead")}</p>
        <a className="contact-dialog-phone" href={`tel:+${PHONE}`}>
          {formatPhone(PHONE)}
        </a>
        <div className="contact-dialog-links">
          <a className="btn" href={`https://wa.me/${PHONE}`} target="_blank" rel="noopener noreferrer">
            WhatsApp
          </a>
        </div>
        {MAIL_CONFIGURED ? (
          <a className="contact-dialog-mail" href="/#mail" onClick={closeContact}>
            {t("contact.mail.title")}
          </a>
        ) : null}
      </div>
    </div>
  );
}
