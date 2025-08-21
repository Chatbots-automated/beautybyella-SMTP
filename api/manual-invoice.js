import { useState, useMemo } from "react";

// 🔧 Adjust if you prefer /api/send-email (without .js)
const ENDPOINT = "https://beautybyella-smtp-bice.vercel.app/api/send-email.js";
const VAT_RATE = 0.21;

export default function ManualInvoice() {
  const [form, setForm] = useState({
    customer_name: "",
    customer_email: "",
    phone: "",
    shipping_address: "",
    payment_reference: "",
    invoice_number: "", // enter WITHOUT EVA (server prefixes)
  });

  const [rows, setRows] = useState([
    { name: "", quantity: 1, price: 0 }, // price = unit NET (be PVM)
  ]);

  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState("");

  const totals = useMemo(() => {
    const net = rows.reduce(
      (sum, r) => sum + (Number(r.quantity) || 0) * (Number(r.price) || 0),
      0
    );
    const vat = net * VAT_RATE;
    const gross = net + vat;
    return {
      net,
      vat,
      gross,
      fmtNet: euro(net),
      fmtVat: euro(vat),
      fmtGross: euro(gross),
    };
  }, [rows]);

  function euro(n) {
    const v = Number.isFinite(n) ? n : 0;
    return "€" + v.toFixed(2).replace(".", ",");
  }

  const updateForm = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const updateRow = (i, k, v) =>
    setRows((r) => {
      const copy = r.slice();
      copy[i] = { ...copy[i], [k]: v };
      return copy;
    });

  const addRow = () =>
    setRows((r) => [...r, { name: "", quantity: 1, price: 0 }]);

  const removeRow = (i) =>
    setRows((r) => (r.length === 1 ? r : r.filter((_, idx) => idx !== i)));

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus("");

    // Validate at least one valid product row
    const products = rows
      .map((r) => ({
        name: String(r.name || "").trim(),
        quantity: Number(r.quantity) || 0,
        price: Number(r.price) || 0, // unit NET (be PVM)
      }))
      .filter((r) => r.name && r.quantity > 0 && r.price >= 0);

    if (products.length === 0) {
      setStatus("❌ Pridėkite bent vieną produktą.");
      return;
    }
    if (!form.customer_name || !form.customer_email || !form.invoice_number || !form.payment_reference) {
      setStatus("❌ Užpildykite privalomus laukus.");
      return;
    }

    // total_price must be GROSS (su PVM)
    const total_price = Number((totals.gross).toFixed(2));

    const payload = {
      to: form.customer_email,
      customer_name: form.customer_name,
      customer_email: form.customer_email,
      phone: form.phone,
      shipping_address: form.shipping_address,
      payment_reference: form.payment_reference,
      invoice_number: form.invoice_number, // server will prefix EVA
      products, // [{ name, quantity, price (net) }]
      total_price, // gross
    };

    try {
      setSending(true);
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Siuntimas nepavyko");

      setStatus("✅ Sąskaita sugeneruota ir el. laiškas išsiųstas.");
      // optional reset:
      // setForm({ customer_name:"", customer_email:"", phone:"", shipping_address:"", payment_reference:"", invoice_number:"" });
      // setRows([{ name:"", quantity:1, price:0 }]);
    } catch (err) {
      setStatus("❌ Klaida: " + (err.message || "nežinoma"));
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={styles.wrap}>
      <h1 style={{ marginBottom: 12 }}>Rankinis sąskaitų generatorius</h1>
      <form onSubmit={handleSubmit} style={styles.card}>
        <section style={styles.grid}>
          <Field
            label="Kliento vardas / įmonė"
            required
            value={form.customer_name}
            onChange={(v) => updateForm("customer_name", v)}
          />
          <Field
            label="Kliento el. paštas"
            type="email"
            required
            value={form.customer_email}
            onChange={(v) => updateForm("customer_email", v)}
          />
          <Field
            label="Telefonas"
            value={form.phone}
            onChange={(v) => updateForm("phone", v)}
          />
          <Field
            label="Adresas"
            value={form.shipping_address}
            onChange={(v) => updateForm("shipping_address", v)}
          />
          <Field
            label="Užsakymo Nr. (payment_reference)"
            placeholder="ORD-12345"
            required
            value={form.payment_reference}
            onChange={(v) => updateForm("payment_reference", v)}
          />
          <Field
            label='Sąskaitos numeris (įveskite be „EVA“ — serveris pridės)'
            placeholder="12345"
            required
            value={form.invoice_number}
            onChange={(v) => updateForm("invoice_number", v)}
          />
        </section>

        <h3 style={{ marginTop: 18, marginBottom: 6 }}>Produktai</h3>
        <div style={{ fontSize: 12, color: "#666", marginBottom: 6 }}>
          Kaina įvedama <strong>be PVM</strong> (už vienetą). PVM 21% bus
          paskaičiuota automatiškai.
        </div>

        <table style={styles.table}>
          <thead>
            <tr>
              <th style={{ width: "46%" }}>Pavadinimas</th>
              <th style={{ width: "14%" }}>Kiekis</th>
              <th style={{ width: "20%" }}>Kaina (be PVM)</th>
              <th style={{ width: "20%", textAlign: "right" }}>Suma su PVM</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const q = Number(r.quantity) || 0;
              const p = Number(r.price) || 0;
              const rowGross = q * p * (1 + VAT_RATE);
              return (
                <tr key={i}>
                  <td>
                    <input
                      style={styles.input}
                      placeholder="Prekės pavadinimas"
                      value={r.name}
                      onChange={(e) => updateRow(i, "name", e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      style={styles.input}
                      type="number"
                      min="1"
                      step="1"
                      value={r.quantity}
                      onChange={(e) => updateRow(i, "quantity", e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      style={styles.input}
                      type="number"
                      min="0"
                      step="0.01"
                      value={r.price}
                      onChange={(e) => updateRow(i, "price", e.target.value)}
                    />
                  </td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    {euro(rowGross)}{" "}
                    <button
                      type="button"
                      onClick={() => removeRow(i)}
                      style={styles.linkDanger}
                      title="Pašalinti eilutę"
                    >
                      Pašalinti
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
          <button type="button" onClick={addRow} style={styles.btn}>
            + Pridėti eilutę
          </button>
        </div>

        <section style={{ display: "flex", justifyContent: "flex-end" }}>
          <div style={styles.totalsCard}>
            <Row k="Tarpinė suma (be PVM)" v={totals.fmtNet} />
            <Row k="PVM (21%)" v={totals.fmtVat} />
            <div style={{ borderTop: "1px solid #eee", margin: "10px 0" }} />
            <Row k="Bendra suma (su PVM)" v={totals.fmtGross} strong brand />
          </div>
        </section>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button style={styles.btnPrimary} disabled={sending}>
            {sending ? "Siunčiama..." : "Generuoti ir išsiųsti"}
          </button>
          <div style={{ fontSize: 12, color: "#666" }}>
            Bus iškviestas <code>/api/send-email.js</code>
          </div>
        </div>

        {status && (
          <div style={{ marginTop: 10, fontSize: 14 }}>
            {status}
          </div>
        )}
      </form>
    </div>
  );
}

function Field({ label, type = "text", value, onChange, required, placeholder }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: "#666", margin: "6px 0" }}>{label}{required ? " *" : ""}</div>
      <input
        style={styles.input}
        type={type}
        value={value}
        placeholder={placeholder}
        required={required}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function Row({ k, v, strong, brand }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", margin: "6px 0" }}>
      <div style={{ color: "#444" }}>{k}</div>
      <div style={{ fontWeight: strong ? 700 : 600, color: brand ? "#d81b60" : "#111" }}>{v}</div>
    </div>
  );
}

const styles = {
  wrap: { maxWidth: 960, margin: "32px auto", padding: "0 16px", fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" },
  card: { background: "#fff", border: "1px solid #eee", borderRadius: 14, padding: 18, boxShadow: "0 1px 4px rgba(0,0,0,.03)" },
  grid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 },
  input: { width: "100%", padding: "10px 12px", border: "1px solid #e6e6e6", borderRadius: 10, fontSize: 14, outline: "none" },
  table: { width: "100%", borderCollapse: "collapse", marginTop: 8 },
  totalsCard: { width: 420, background: "#fff", border: "1px solid #eee", borderRadius: 12, padding: 12, marginTop: 12 },
  btn: { padding: "10px 14px", borderRadius: 12, border: "1px solid #e6e6e6", background: "#fff", cursor: "pointer", fontWeight: 600 },
  btnPrimary: { padding: "10px 14px", borderRadius: 12, border: "1px solid #d81b60", background: "#d81b60", color: "#fff", cursor: "pointer", fontWeight: 700 },
  linkDanger: { marginLeft: 10, border: "none", background: "transparent", color: "#b00020", cursor: "pointer", fontSize: 12 },
};
