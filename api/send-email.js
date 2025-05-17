const PDFDocument = require('pdfkit');
const nodemailer = require('nodemailer');
const https = require('https');

// fetchImageBuffer is used for both logo & font loading
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

async function createInvoicePdf({
  payment_reference,
  customer_name,
  parsedAddress,
  customer_email,
  phone,
  products,
  total_price
}) {
  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const buffers = [];
  doc.on('data', c => buffers.push(c));
  // no-op on end; we’ll concat below

  // 1) Load & register Roboto fonts from Google’s repo
  try {
    const [reg, bold] = await Promise.all([
      fetchImageBuffer('https://raw.githubusercontent.com/google/fonts/main/apache/roboto/Roboto-Regular.ttf'),
      fetchImageBuffer('https://raw.githubusercontent.com/google/fonts/main/apache/roboto/Roboto-Bold.ttf'),
    ]);
    doc.registerFont('Roboto', reg);
    doc.registerFont('Roboto-Bold', bold);
  } catch (e) {
    console.warn('⚠️ Could not load custom fonts, falling back to Helvetica');
  }

  // 2) Draw the logo top-left
  try {
    const logo = await fetchImageBuffer('https://i.imgur.com/oFa7Bqt.jpeg');
    doc.image(logo, 50, 50, { width: 80 });
  } catch (e) {
    console.warn('⚠️ Logo failed to load');
  }

  // 3) Heading centered
  const date = new Date().toISOString().split('T')[0];
  doc
    .font('Roboto-Bold').fontSize(24).fillColor('#d81b60')
    .text('SĄSKAITA FAKTŪRA', 0, 65, { align: 'center' });

  // 4) Invoice meta & two-column info
  const startY = 120;
  doc
    .font('Roboto').fontSize(10).fillColor('#000')
    .text(`Data: ${date}`, 50, startY)
    .text(`Užsakymo Nr.: ${payment_reference}`, 50, startY + 15);

  // Seller (left)
  doc
    .font('Roboto-Bold').text('Pardavėjas:', 50, startY + 45)
    .font('Roboto').text('Stiklų keitimas automobiliams, MB', 50, startY + 60)
    .text('Įm. kodas: 305232614')
    .text('PVM kodas: LT100017540118')
    .text('Giraitės g. 60A-2, Trakų r.');

  // Buyer (right)
  doc
    .font('Roboto-Bold').text('Pirkėjas:', 300, startY + 45)
    .font('Roboto').text(customer_name, 300, startY + 60)
    .text(parsedAddress)
    .text(customer_email)
    .text(phone);

  // 5) Separator line
  doc
    .moveTo(50, startY + 140)
    .lineTo(545, startY + 140)
    .strokeColor('#eeeeee')
    .lineWidth(1)
    .stroke();

  // 6) Products table header
  const tableTop = startY + 155;
  const colX = { item: 50, qty: 300, unit: 350, sum: 450 };
  doc
    .font('Roboto-Bold').fontSize(12).fillColor('#d81b60')
    .text('Prekė', colX.item, tableTop)
    .text('Kiekis', colX.qty, tableTop)
    .text('Vnt. kaina', colX.unit, tableTop)
    .text('Suma', colX.sum, tableTop);

  // 7) Products rows
  doc.font('Roboto').fontSize(10).fillColor('#000');
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

  // 8) Totals box
  const priceExcl = total_price / 1.21;
  const vat = priceExcl * 0.21;
  y += 20;
  doc
    .font('Roboto-Bold').fontSize(12).fillColor('#000')
    .text('Be PVM:', colX.unit, y, { continued: true })
    .text(`€${priceExcl.toFixed(2)}`, { align: 'right' });
  y += 15;
  doc
    .font('Roboto').text('PVM (21%):', colX.unit, y, { continued: true })
    .text(`€${vat.toFixed(2)}`, { align: 'right' });
  y += 15;
  doc
    .font('Roboto-Bold').fillColor('#d81b60')
    .text('Iš viso:', colX.unit, y, { continued: true })
    .text(`€${total_price.toFixed(2)}`, { align: 'right' });

  doc.end();
  return Buffer.concat(buffers);
}

// your existing handler, just swap in the new createInvoicePdf
module.exports = async (req, res) => {
  // ... OPTIONS / POST check ...

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

    const parsedAddress = String(shipping_address || '');
    const pdfBuffer = await createInvoicePdf({
      payment_reference,
      customer_name,
      parsedAddress,
      customer_email,
      phone,
      products,
      total_price
    });

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
      subject: 'Jūsų užsakymas patvirtintas!',
      html: `<p>Sveiki, <strong>${customer_name}</strong>! Prisegame sąskaitą faktūrą.</p>`,
      attachments: [{
        filename: 'invoice.pdf',
        content: pdfBuffer,
        contentType: 'application/pdf'
      }]
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};
