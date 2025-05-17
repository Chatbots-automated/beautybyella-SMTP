const PDFDocument = require('pdfkit');
const nodemailer = require('nodemailer');
const https = require('https');

// fetchImageBuffer: helper to pull in your hosted logo
function fetchImageBuffer(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
  });
}

function createInvoicePdf({
  payment_reference,
  customer_name,
  parsedAddress,
  customer_email,
  phone,
  products,
  total_price
}) {
  return new Promise(async (resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const buffers = [];
      doc.on('data', c => buffers.push(c));
      doc.on('end', () => resolve(Buffer.concat(buffers)));

      const date = new Date().toISOString().split('T')[0];
      const priceExcl = total_price / 1.21;
      const vat = priceExcl * 0.21;

      // --- Logo top-left ---
      try {
        const logo = await fetchImageBuffer('https://i.imgur.com/oFa7Bqt.jpeg');
        doc.image(logo, 50, 45, { width: 80 });
      } catch (_) {
        // ignore
      }

      // --- Heading centered ---
      doc
        .font('Helvetica-Bold')
        .fillColor('#d81b60')
        .fontSize(24)
        .text('SĄSKAITA FAKTŪRA', 0, 60, { align: 'center' });

      // --- Invoice info ---
      doc
        .font('Helvetica')
        .fillColor('#000')
        .fontSize(10)
        .text(`Data: ${date}`, 50, 120)
        .text(`Užsakymo Nr.: ${payment_reference}`, 50, 135);

      // --- Seller (left) ---
      doc
        .font('Helvetica-Bold')
        .text('Pardavėjas:', 50, 160)
        .font('Helvetica')
        .text('Stiklų keitimas automobiliams, MB', 50, 175)
        .text('Įm. kodas: 305232614')
        .text('PVM kodas: LT100017540118')
        .text('Giraitės g. 60A-2, Trakų r.');

      // --- Buyer (right) ---
      doc
        .font('Helvetica-Bold')
        .text('Pirkėjas:', 300, 160)
        .font('Helvetica')
        .text(customer_name, 300, 175)
        .text(parsedAddress)
        .text(customer_email)
        .text(phone);

      // --- Separator ---
      doc
        .moveTo(50, 250)
        .lineTo(545, 250)
        .lineWidth(1)
        .strokeColor('#eeeeee')
        .stroke();

      // --- Table header ---
      const tableTop = 270;
      const colX = { item: 50, qty: 300, unit: 380, sum: 470 };
      doc
        .font('Helvetica-Bold')
        .fillColor('#d81b60')
        .fontSize(12)
        .text('Prekė', colX.item, tableTop)
        .text('Kiekis', colX.qty, tableTop)
        .text('Vnt. kaina', colX.unit, tableTop)
        .text('Suma', colX.sum, tableTop);

      // --- Table rows ---
      doc.font('Helvetica').fillColor('#000').fontSize(10);
      let y = tableTop + 20;
      (Array.isArray(products) ? products : [{ name: products, qty: 1, price: total_price }])
        .forEach(p => {
          doc
            .text(p.name, colX.item, y)
            .text(p.qty.toString(), colX.qty, y)
            .text(`€${parseFloat(p.price).toFixed(2)}`, colX.unit, y)
            .text(`€${(p.qty * p.price).toFixed(2)}`, colX.sum, y);
          y += 20;
        });

      // --- Totals ---
      y += 20;
      doc
        .font('Helvetica')
        .fontSize(10)
        .text('Be PVM:', colX.unit, y, { continued: true })
        .text(`€${priceExcl.toFixed(2)}`, { align: 'right' });
      y += 15;
      doc
        .text('PVM (21%):', colX.unit, y, { continued: true })
        .text(`€${vat.toFixed(2)}`, { align: 'right' });
      y += 15;
      doc
        .font('Helvetica-Bold')
        .fillColor('#d81b60')
        .text('Iš viso:', colX.unit, y, { continued: true })
        .text(`€${total_price.toFixed(2)}`, { align: 'right' });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST requests allowed' });
  }

  try {
    const {
      to,
      customer_name,
      customer_email,
      phone,
      shipping_address,
      payment_reference,
      products,
      total_price
    } = req.body;

    const parsedAddress = shipping_address || '';

    // build PDF
    const pdfBuffer = await createInvoicePdf({
      payment_reference,
      customer_name,
      parsedAddress,
      customer_email,
      phone,
      products,
      total_price
    });

    // nicer email HTML
    const html = `
      <div style="font-family: Arial, sans-serif; color: #333; line-height:1.5;">
        <img src="https://i.imgur.com/oFa7Bqt.jpeg" width="120" style="border-radius:8px; margin-bottom:20px;" />
        <h2 style="color:#d81b60; margin-bottom:10px;">
          Jūsų užsakymas #${payment_reference} patvirtintas!
        </h2>
        <p>Sveiki <strong>${customer_name}</strong>,</p>
        <p>Dėkojame, kad pasirinkote <strong>Beauty by Ella</strong>! Jūsų užsakymas buvo sėkmingai priimtas ir apdorotas. Prisegame sąskaitą faktūrą PDF formatu.</p>
        <p>Jei turite klausimų ar reikia pagalbos, rašykite mums el. paštu <a href="mailto:info@beautybyella.lt">info@beautybyella.lt</a> arba skambinkite +370 656 25323.</p>
        <p>Su meile,<br/><strong>Beauty by Ella</strong> 💖</p>
      </div>
    `;

    const transporter = nodemailer.createTransport({
      host: 'smtp.hostinger.com',
      port: 465,
      secure: true,
      auth: {
        user: 'info@beautybyella.lt',
        pass: 'Benukas2222!'
      }
    });

    await transporter.sendMail({
      from: `"Beauty by Ella" <info@beautybyella.lt>`,
      to,
      subject: `Jūsų užsakymas #${payment_reference} patvirtintas!`,
      html,
      attachments: [
        {
          filename: 'invoice.pdf',
          content: pdfBuffer,
          contentType: 'application/pdf'
        }
      ]
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('❌ Email sending failed:', err);
    return res.status(500).json({ error: err.message });
  }
};
