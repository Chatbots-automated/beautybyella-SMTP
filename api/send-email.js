const PDFDocument = require('pdfkit');
const nodemailer = require('nodemailer');
const https = require('https');

// fetchBuffer: helper to pull any binary URL into a Buffer
function fetchBuffer(url) {
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

  doc.on('data', chunk => buffers.push(chunk));
  doc.on('end', () => {});
  const date = new Date().toISOString().split('T')[0];
  const priceExcl = +total_price / 1.21;
  const vat = priceExcl * 0.21;

  // 🖼 Logo
  try {
    const logoBuffer = await fetchImageBuffer('https://i.imgur.com/oFa7Bqt.jpeg');
    doc.image(logoBuffer, 50, 40, { width: 100 });
  } catch (e) {
    console.warn('⚠️ Logo failed to load');
  }

  doc.moveDown(3);

  // Heading in English
  doc.font('Helvetica-Bold').fillColor('#d81b60').fontSize(20).text('INVOICE', { align: 'center' });
  doc.moveDown();

  // Meta
  doc.fillColor('#000').font('Helvetica').fontSize(12)
    .text(`Date: ${date}`, { continued: true })
    .text(`   Order No.: ${payment_reference}`);
  doc.moveDown();

  // Seller
  doc.font('Helvetica-Bold').text('Seller:', { underline: true });
  doc.font('Helvetica')
    .text('Beauty by Ella Ltd.')
    .text('Company ID: 305232614')
    .text('VAT Number: LT100017540118')
    .text('Giraitės St. 60A-2, Trakai District');
  doc.moveDown();

  // Buyer
  doc.font('Helvetica-Bold').text('Buyer:', { underline: true });
  doc.font('Helvetica')
    .text(customer_name)
    .text(parsedAddress)
    .text(customer_email)
    .text(phone);
  doc.moveDown();

  // Products header
  doc.font('Helvetica-Bold').fillColor('#d81b60').text('Products:', { underline: true });
  doc.moveDown(0.5);
  doc.font('Helvetica').fillColor('#000');

  if (Array.isArray(products)) {
    products.forEach(p => {
      doc.text(`• ${p.name} x ${p.quantity} – €${(+p.price).toFixed(2)}`);
    });
  } else {
    doc.text(String(products));
  }

  // Totals in English
  doc.moveDown(1.5).fontSize(12);
  doc.text(`Price excl. VAT:`, 360, doc.y, { continued: true })
     .text(`€${priceExcl.toFixed(2)}`, { align: 'right' });
  doc.text(`VAT (21%):`, 360, doc.y, { continued: true })
     .text(`€${vat.toFixed(2)}`, { align: 'right' });
  doc.font('Helvetica-Bold').fillColor('#d81b60')
     .text(`Total:`, 360, doc.y, { continued: true })
     .text(`€${(+total_price).toFixed(2)}`, { align: 'right' });

  doc.end();
  return Buffer.concat(buffers);
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

    const info = await transporter.sendMail({
      from: `"Beauty by Ella" <info@beautybyella.lt>`,
      to,
      subject: 'Jūsų užsakymas patvirtintas!',
      html: `
        <div style="font-family: sans-serif; font-size: 15px; color: #333;">
          <img src="https://i.imgur.com/oFa7Bqt.jpeg" alt="Beauty by Ella" style="width: 100px; border-radius: 8px; margin-bottom: 15px;" />
          <p style="margin-bottom: 12px;">Sveiki, <strong>${customer_name}</strong>,</p>
          <p>Jūsų užsakymas buvo sėkmingai priimtas! Prisegame sąskaitą faktūrą PDF formatu.</p>
          <p style="margin-top: 30px;">Su meile,<br/><strong>Beauty by Ella</strong> 💖</p>
        </div>
      `,
      attachments: [{
        filename: 'invoice.pdf',
        content: pdfBuffer,
        contentType: 'application/pdf'
      }]
    });

    return res.status(200).json({ success: true, messageId: info.messageId });
  } catch (err) {
    console.error('❌ Email sending failed:', err);
    return res.status(500).json({ error: err.message || 'Email send failed' });
  }
};
