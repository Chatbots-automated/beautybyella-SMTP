const PDFDocument = require('pdfkit');
const nodemailer = require('nodemailer');

function createInvoicePdf({
  payment_reference,
  customer_name,
  parsedAddress,
  customer_email,
  phone,
  products,
  total_price
}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const buffers = [];

    doc.on('data', buffers.push.bind(buffers));
    doc.on('end', () => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    const date = new Date().toISOString().split('T')[0];
    const priceExcl = +total_price / 1.21;
    const vat = priceExcl * 0.21;

    // 🖼 Logo
    doc.image('https://i.imgur.com/oFa7Bqt.jpeg', 50, 40, { width: 80 });
    doc.moveDown(2);

    // Header
    doc.fillColor('#d81b60').fontSize(20).text('SĄSKAITA FAKTŪRA', { align: 'center' });
    doc.moveDown();

    // Date & Ref
    doc.fillColor('#000').fontSize(12)
      .text(`Data: ${date}`, { continued: true })
      .text(`   Užsakymo Nr.: ${payment_reference}`);
    doc.moveDown();

    // Pardavėjas
    doc.font('Helvetica-Bold').text('Pardavėjas:', { underline: true });
    doc.font('Helvetica')
      .text('Stiklų keitimas automobiliams, MB')
      .text('Įmonės kodas: 305232614')
      .text('PVM kodas: LT100017540118')
      .text('Giraitės g. 60A-2, Trakų r.');
    doc.moveDown();

    // Pirkėjas
    doc.font('Helvetica-Bold').text('Pirkėjas:', { underline: true });
    doc.font('Helvetica')
      .text(customer_name)
      .text(parsedAddress)
      .text(customer_email)
      .text(phone);
    doc.moveDown();

    // Produktai
    doc.font('Helvetica-Bold').fillColor('#d81b60').text('Produktai:', { underline: true });
    doc.moveDown(0.5);
    doc.font('Helvetica').fillColor('#000');

    if (Array.isArray(products)) {
      products.forEach(p => {
        doc.text(`• ${p.name} x ${p.quantity} – €${(+p.price).toFixed(2)}`);
      });
    } else {
      doc.text(String(products));
    }

    doc.moveDown(1.5);

    // Totals
    doc.font('Helvetica')
      .text(`Kaina be PVM:`, 360, doc.y, { continued: true })
      .text(`€${priceExcl.toFixed(2)}`, { align: 'right' });
    doc.text(`PVM (21%):`, 360, doc.y, { continued: true })
      .text(`€${vat.toFixed(2)}`, { align: 'right' });
    doc.font('Helvetica-Bold').fillColor('#d81b60')
      .text(`Bendra suma:`, 360, doc.y, { continued: true })
      .text(`€${(+total_price).toFixed(2)}`, { align: 'right' });

    doc.end();
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
        pass: process.env.SMTP_PASS
      }
    });

    const info = await transporter.sendMail({
      from: `"Beauty by Ella" <info@beautybyella.lt>`,
      to,
      subject: 'Jūsų užsakymas patvirtintas!',
      html: `
        <div style="font-family: sans-serif; font-size: 15px; color: #333;">
          <p style="margin-bottom: 12px;">Sveiki, <strong>${customer_name}</strong>,</p>
          <p>Jūsų užsakymas buvo sėkmingai priimtas! Sąskaita faktūra pridėta kaip PDF dokumentas prie šio laiško.</p>
          <p style="margin-top: 30px;">Ačiū, kad pirkote iš <strong>Beauty by Ella</strong> 💖</p>
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
