// /api/manual-invoice.js (ESM)
// Serves a tiny HTML app that POSTs to /api/send-email.js.

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.status(405).send("Use GET to load the manual invoice form.");
    return;
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(`<!doctype html>
<html lang="lt">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Rankinis sąskaitų generatorius</title>
  <style>
    :root { --brand:#d81b60; }
    html,body{background:#fafafa;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111}
    .wrap{max-width:960px;margin:32px auto;padding:0 16px}
    .card{background:#fff;border:1px solid #eee;border-radius:14px;padding:18px;box-shadow:0 1px 4px rgba(0,0,0,.03)}
    h1{margin:0 0 12px}
    .muted{color:#666;font-size:12px}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .label{font-size:12px;color:#666;margin:6px 0}
    .input, textarea{width:100%;padding:10px 12px;border:1px solid #e6e6e6;border-radius:10px;font-size:14px;outline:none;background:#fff}
    table{width:100%;border-collapse:collapse;margin-top:8px}
    th,td{padding:8px;border-bottom:1px solid #eee;vertical-align:middle;text-align:left}
    th{background:#faf7f8;font-weight:700}
    td:last-child, th:last-child{text-align:right;white-space:nowrap}
    .row-btn{margin-left:10px;border:none;background:transparent;color:#b00020;cursor:pointer;font-size:12px}
    .btn{padding:10px 14px;border-radius:12px;border:1px solid #e6e6e6;background:#fff;cursor:pointer;font-weight:600}
    .btnPrimary{padding:10px 14px;border-radius:12px;border:1px solid var(--brand);background:var(--brand);color:#fff;cursor:pointer;font-weight:700}
    .totals{width:420px;background:#fff;border:1px solid #eee;border-radius:12px;padding:12px;margin-top:12px}
    .row{display:flex;justify-content:space-between;margin:6px 0}
    .brand{color:var(--brand);font-weight:700}
    .note{font-size:12px;color:#666}
    .ok{color:#1b5e20}
    .err{color:#b00020}
    .pill{display:inline-block;padding:.2rem .5rem;border:1px solid #eee;border-radius:999px;background:#fff;margin-left:.3rem}
    code{background:#f3f3f3;border:1px solid #eee;border-radius:6px;padding:0 .3rem}
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Rankinis sąskaitų generatorius</h1>
    <div class="muted" style="margin-bottom:12px">
      Ši forma siunčia JSON į <code>/api/send-email.js</code>, kuris sugeneruoja PDF ir išsiunčia el. laišką.
    </div>

    <form id="f" class="card">
      <section class="grid">
        <div>
          <div class="label">Kliento vardas / įmonė *</div>
          <input class="input" id="customer_name" required />
        </div>
        <div>
          <div class="label">Kliento el. paštas *</div>
          <input class="input" id="customer_email" type="email" required />
        </div>
        <div>
          <div class="label">Telefonas</div>
          <input class="input" id="phone" />
        </div>
        <div>
          <div class="label">Adresas</div>
          <input class="input" id="shipping_address" placeholder="Gatvė, įmonė, miestas" />
        </div>
        <div>
          <div class="label">Užsakymo Nr. (payment_reference) *</div>
          <input class="input" id="payment_reference" placeholder="ORD-12345" required />
        </div>
        <div>
          <div class="label">Sąskaitos numeris (įveskite be „EVA“) *</div>
          <input class="input" id="invoice_number" placeholder="12345" required />
          <div class="note">Serveris pridės prefiksą <span class="pill">EVA</span>.</div>
        </div>
      </section>

      <h3 style="margin:18px 0 6px">Produktai</h3>
      <div class="note" style="margin-bottom:6px">
        Kaina įvedama <strong>be PVM</strong> (už vienetą). PVM 21% bus paskaičiuota automatiškai.
      </div>

      <table id="tbl">
        <thead>
          <tr>
            <th style="width:46%">Pavadinimas</th>
            <th style="width:14%">Kiekis</th>
            <th style="width:20%">Kaina (be PVM)</th>
            <th style="width:20%;text-align:right">Suma su PVM</th>
          </tr>
        </thead>
        <tbody id="body"></tbody>
      </table>

      <div style="display:flex;gap:10px;margin-top:10px">
        <button class="btn" type="button" id="add">+ Pridėti eilutę</button>
      </div>

      <section style="display:flex;justify-content:flex-end">
        <div class="totals">
          <div class="row"><div>Tarpinė suma (be PVM)</div><div id="tNet" style="font-weight:600">€0,00</div></div>
          <div class="row"><div>PVM (21%)</div><div id="tVat" style="font-weight:600">€0,00</div></div>
          <div style="border-top:1px solid #eee;margin:10px 0"></div>
          <div class="row"><div class="brand">Bendra suma (su PVM)</div><div id="tGross" class="brand">€0,00</div></div>
        </div>
      </section>

      <div style="display:flex;align-items:center;gap:10px;margin-top:12px">
        <button class="btnPrimary" id="submitBtn" type="submit">Generuoti ir išsiųsti</button>
        <div class="note">Bus iškviestas <code>/api/send-email.js</code></div>
      </div>

      <div id="status" style="margin-top:10px;font-size:14px"></div>
    </form>
  </div>

  <script>
    (function(){
      var VAT_RATE = 0.21;
      var tbody = document.getElementById('body');
      var addBtn = document.getElementById('add');
      var form = document.getElementById('f');
      var statusEl = document.getElementById('status');
      var submitBtn = document.getElementById('submitBtn');

      function euro(n){ n = Number(n)||0; return '€' + n.toFixed(2).replace('.', ','); }

      function makeRow(name, qty, price){
        var tr = document.createElement('tr');
        tr.innerHTML =
          '<td><input class="input n" placeholder="Prekės pavadinimas" value="'+(name||'')+'"/></td>'+
          '<td><input class="input q" type="number" min="1" step="1" value="'+(qty||1)+'"/></td>'+
          '<td><input class="input p" type="number" min="0" step="0.01" value="'+(price||0)+'"/></td>'+
          '<td style="text-align:right;white-space:nowrap"><span class="sum">€0,00</span> '+
            '<button type="button" class="row-btn">Pašalinti</button></td>';
        tbody.appendChild(tr);
        tr.querySelector('.n').addEventListener('input', recalc);
        tr.querySelector('.q').addEventListener('input', recalc);
        tr.querySelector('.p').addEventListener('input', recalc);
        tr.querySelector('.row-btn').addEventListener('click', function(){
          if (tbody.children.length > 1) { tr.remove(); recalc(); }
        });
        recalc();
      }

      function recalc(){
        var rows = tbody.querySelectorAll('tr');
        var net=0, vat=0, gross=0;
        rows.forEach(function(tr){
          var q = Number(tr.querySelector('.q').value) || 0;
          var p = Number(tr.querySelector('.p').value) || 0; // unit NET
          var rowNet = q * p;
          var rowGross = rowNet * (1 + VAT_RATE);
          tr.querySelector('.sum').textContent = euro(rowGross);
          net += rowNet;
        });
        vat = net * VAT_RATE;
        gross = net + vat;
        document.getElementById('tNet').textContent = euro(net);
        document.getElementById('tVat').textContent = euro(vat);
        document.getElementById('tGross').textContent = euro(gross);
      }

      addBtn.addEventListener('click', function(){ makeRow('',1,0); });

      form.addEventListener('submit', async function(e){
        e.preventDefault();
        statusEl.textContent = '';
        statusEl.className = '';

        var customer_name = document.getElementById('customer_name').value.trim();
        var customer_email = document.getElementById('customer_email').value.trim();
        var phone = document.getElementById('phone').value.trim();
        var shipping_address = document.getElementById('shipping_address').value.trim();
        var payment_reference = document.getElementById('payment_reference').value.trim();
        var invoice_number = document.getElementById('invoice_number').value.trim();

        if (!customer_name || !customer_email || !payment_reference || !invoice_number) {
          statusEl.textContent = '❌ Užpildykite privalomus laukus.';
          statusEl.className = 'err';
          return;
        }

        // Build products + totals
        var products = [];
        var rows = tbody.querySelectorAll('tr');
        var net = 0;
        rows.forEach(function(tr){
          var name = tr.querySelector('.n').value.trim();
          var qty  = Number(tr.querySelector('.q').value) || 0;
          var price= Number(tr.querySelector('.p').value) || 0; // unit NET
          if (name && qty > 0 && price >= 0) {
            products.push({ name: name, quantity: qty, price: price });
            net += qty * price;
          }
        });
        if (products.length === 0) {
          statusEl.textContent = '❌ Pridėkite bent vieną produktą.';
          statusEl.className = 'err';
          return;
        }
        var total_price = Number((net * (1 + VAT_RATE)).toFixed(2)); // GROSS

        var payload = {
          to: customer_email,
          customer_name: customer_name,
          customer_email: customer_email,
          phone: phone,
          shipping_address: shipping_address,
          payment_reference: payment_reference,
          invoice_number: invoice_number, // server adds EVA
          products: products,
          total_price: total_price
        };

        submitBtn.disabled = true;
        submitBtn.textContent = 'Siunčiama...';

        try {
          var res = await fetch('/api/send-email.js', {
            method: 'POST',
            headers: { 'Content-Type':'application/json' },
            body: JSON.stringify(payload)
          });
          var data = null;
          try { data = await res.json(); } catch(_) {}
          if (!res.ok) throw new Error((data && data.error) || ('HTTP ' + res.status));
          statusEl.textContent = '✅ Sąskaita sugeneruota ir el. laiškas išsiųstas.';
          statusEl.className = 'ok';
        } catch (err) {
          statusEl.textContent = '❌ Klaida: ' + (err && err.message ? err.message : 'nežinoma');
          statusEl.className = 'err';
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Generuoti ir išsiųsti';
        }
      });

      // start with one empty row
      makeRow('', 1, 0);
    })();
  </script>
</body>
</html>`);
}
