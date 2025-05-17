const PDFDocument = require('pdfkit');
const getStream = require('get-stream');
const nodemailer = require('nodemailer');

async function createInvoicePdf({
  payment_reference,
  customer_name,
  parsedAddress,
  customer_email,
  phone,
  products,
  total_price
}) {
  const doc = new PDFDocument({ size: 'A4', margin: 30 });
  doc.font('Helvetica');

  // Title
  doc.fontSize(20).text('Sąskaita faktūra', { align: 'center' });
  doc.moveDown(1.5);

  // Header info
  const date = new Date().toISOString().split('T')[0];
  doc.fontSize(12)
     .text(`Data: ${date}`, { continued: true })
     .text(`   Nr.: ${payment_reference}`);
  doc.moveDown();

  // Seller
  doc.text('Pardavėjas:', { underline: true });
  doc.text('Stiklų keitimas automobiliams, MB');
  doc.text('Įmonės kodas: 305232614');
  doc.text('PVM kodas: LT100017540118');
  doc.text('Giraitės g. 60A-2, Trakų r.');
  doc.moveDown();

  // Buyer
  doc.text('Pirkėjas:', { underline: true });
  doc.text(customer_name);
  doc.text(parsedAddress);
  doc.text(customer_email);
  doc.text(phone);
  doc.moveDown();

  // Products
  doc.text('Produktai:', { underline: true });
  if (Array.isArray(products)) {
    products.forEach(p => {
      doc.text(`• ${p.name} x ${p.qty} – €${p.price.toFixed(2)}`);
    });
  } else {
    doc.text(products.toString());
  }
  doc.moveDown();

  // Totals
  const priceExcl = +total_price / 1.21;
  const vat = priceExcl * 0.21;
  doc.text(`Kaina be PVM: €${priceExcl.toFixed(2)}`);
  doc.text(`PVM (21%): €${vat.toFixed(2)}`);
  doc.text(`Bendra suma: €${(+total_price).toFixed(2)}`);

  doc.end();
  return getStream.buffer(doc);
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

    // Generate the PDF invoice
    const pdfBuffer = await createInvoicePdf({
      payment_reference,
      customer_name,
      parsedAddress,
      customer_email,
      phone,
      products,
      total_price
    });

    // Send the email
    const transporter = nodemailer.createTransport({
      host: 'smtp.hostinger.com',
      port: 465,
      secure: true,
      auth: {
        user: 'info@beautybyella.lt',
        pass: process.env.SMTP_PASS,  // set in Vercel env vars
      },
    });

    await transporter.sendMail({
      from: `"Beauty by Ella" <info@beautybyella.lt>`,
      to,
      subject: 'Jūsų užsakymas patvirtintas!',
      html: `<p>Ačiū, ${customer_name}! Sąskaita prisegta PDF formatu.</p>`,
      attachments: [
        {
          filename: 'invoice.pdf',
          content: pdfBuffer,
          contentType: 'application/pdf',
        },
      ],
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('❌ Email sending failed:', err);
    return res.status(500).json({ error: err.message || 'Email send failed' });
  }
};
