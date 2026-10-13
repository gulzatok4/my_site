import { useEffect, useState } from "react";
import { PHONE, formatPhone } from "../lib/catalog.js";
import { adminFetch } from "../lib/adminSession.js";
import { t } from "../lib/i18n.js";

const EMPTY = {
  name: "",
  bin: "",
  address: "",
  bank: "",
  iik: "",
  bik: "",
  kbe: "",
  knp: "",
  phone: "",
  email: "",
  signatory: "",
  vatPayer: false,
  vatRate: "",
  note: "",
};

function fromServer(seller) {
  const next = { ...EMPTY };
  for (const key of Object.keys(EMPTY)) {
    if (seller && seller[key] != null && key !== "vatPayer" && key !== "vatRate") next[key] = String(seller[key]);
  }
  next.vatPayer = Boolean(seller?.vatPayer);
  next.vatRate = seller?.vatRate == null || seller.vatRate === "" ? "" : String(seller.vatRate);
  return next;
}

function hintsFor(form) {
  const hints = [];
  if (form.bin && !/^\d{12}$/.test(form.bin)) hints.push("БИН/ИИН: обычно 12 цифр.");
  if (form.iik && !/^KZ[0-9A-Za-z]{18}$/.test(form.iik)) hints.push("ИИК: 20 символов и начинается с KZ.");
  if (form.bik && !/^[0-9A-Za-z]{8}$/.test(form.bik)) hints.push("БИК: 8 символов, латиница и цифры.");
  if (form.kbe && !/^\d{2}$/.test(form.kbe)) hints.push("КБе: 2 цифры.");
  if (form.knp && !/^\d{3}$/.test(form.knp)) hints.push("КНП: 3 цифры.");
  if (form.vatPayer && !(Number(form.vatRate) > 0)) hints.push("Укажите ставку НДС больше 0.");
  return hints;
}

export function SellerPanel() {
  const [form, setForm] = useState(EMPTY);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const defaultNote = t("delivery.pay.p", "ru");

  useEffect(() => {
    let alive = true;
    adminFetch("/api/settings/seller")
      .then((data) => {
        if (alive) setForm(fromServer(data.seller));
      })
      .catch((reason) => {
        if (!alive) return;
        setError(reason.status === 401 || reason.status === 429 ? "Сначала войдите в разделе «Заказы»." : "Не удалось загрузить реквизиты.");
      });
    return () => {
      alive = false;
    };
  }, []);

  function setField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
    setStatus("");
  }

  async function save(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setStatus("");
    const payload = fromServer(form);
    payload.vatPayer = form.vatPayer;
    payload.vatRate = String(form.vatRate).trim() ? Number(String(form.vatRate).replace(",", ".")) : null;
    try {
      const data = await adminFetch("/api/settings/seller", { method: "PUT", body: JSON.stringify(payload) });
      setForm(fromServer(data.seller));
      setStatus("Сохранено.");
    } catch (reason) {
      if (reason.status === 401 || reason.status === 429) setError("Сначала войдите в разделе «Заказы».");
      else setError("Не удалось сохранить реквизиты.");
    } finally {
      setBusy(false);
    }
  }

  const hints = hintsFor(form);

  return (
    <section className="admin-form-card admin-tab" id="seller">
      <h2>Реквизиты</h2>
      <p className="admin-lead">
        Эти данные печатаются в счёте на оплату. Пока не заполнены наименование, БИН/ИИН, адрес, банк, ИИК, БИК и КБе, счёт не
        сформируется.
      </p>
      <form className="seller-form" onSubmit={save}>
        <label className="field">
          <span className="field-label">Наименование (ИП / ТОО)</span>
          <input value={form.name} maxLength={300} onChange={(event) => setField("name", event.target.value)} />
        </label>
        <div className="field-row">
          <label className="field">
            <span className="field-label">БИН/ИИН</span>
            <input value={form.bin} maxLength={300} inputMode="numeric" onChange={(event) => setField("bin", event.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Телефон</span>
            <input
              value={form.phone}
              maxLength={300}
              placeholder={formatPhone(PHONE)}
              onChange={(event) => setField("phone", event.target.value)}
            />
          </label>
        </div>
        <label className="field">
          <span className="field-label">Юридический адрес</span>
          <input value={form.address} maxLength={300} onChange={(event) => setField("address", event.target.value)} />
        </label>
        <label className="field">
          <span className="field-label">Банк</span>
          <input value={form.bank} maxLength={300} onChange={(event) => setField("bank", event.target.value)} />
        </label>
        <div className="field-row">
          <label className="field">
            <span className="field-label">ИИК</span>
            <input value={form.iik} maxLength={300} onChange={(event) => setField("iik", event.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">БИК</span>
            <input value={form.bik} maxLength={300} onChange={(event) => setField("bik", event.target.value)} />
          </label>
        </div>
        <div className="field-row">
          <label className="field">
            <span className="field-label">КБе</span>
            <input value={form.kbe} maxLength={300} inputMode="numeric" onChange={(event) => setField("kbe", event.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">КНП</span>
            <input value={form.knp} maxLength={300} inputMode="numeric" onChange={(event) => setField("knp", event.target.value)} />
          </label>
        </div>
        <div className="field-row">
          <label className="field">
            <span className="field-label">Email</span>
            <input value={form.email} maxLength={300} onChange={(event) => setField("email", event.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">Руководитель / подписант</span>
            <input value={form.signatory} maxLength={300} onChange={(event) => setField("signatory", event.target.value)} />
          </label>
        </div>
        <label className="pdf-check">
          <input type="checkbox" checked={form.vatPayer} onChange={(event) => setField("vatPayer", event.target.checked)} />
          Плательщик НДС
        </label>
        <label className="field">
          <span className="field-label">Ставка НДС, %</span>
          <input
            value={form.vatRate}
            inputMode="decimal"
            placeholder="без значения, пока не укажете"
            onChange={(event) => setField("vatRate", event.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">Примечание в счёте</span>
          <textarea rows={3} maxLength={300} value={form.note} placeholder={defaultNote} onChange={(event) => setField("note", event.target.value)} />
        </label>
        {hints.map((hint) => (
          <p className="form-note" key={hint}>
            {hint}
          </p>
        ))}
        {error ? (
          <p className="form-note" role="alert">
            {error}
          </p>
        ) : null}
        {status ? (
          <p className="form-note" role="status">
            {status}
          </p>
        ) : null}
        <div className="admin-form-actions">
          <button type="submit" className="btn" disabled={busy}>
            {busy ? "Сохраняем…" : "Сохранить"}
          </button>
        </div>
      </form>
    </section>
  );
}
