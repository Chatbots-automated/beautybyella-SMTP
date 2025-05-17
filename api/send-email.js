const PDFDocument = require('pdfkit');
const nodemailer  = require('nodemailer');
const https       = require('https');

// fetchBuffer: helper to pull any binary URL into a Buffer
function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    console.log(`🔗 fetchBuffer: GET ${url}`);
    https.get(url, res => {
      console.log(`🔗 fetchBuffer: statusCode=${res.statusCode} for ${url}`);
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        console.log(`🔗 fetchBuffer: downloaded ${chunks.reduce((s, b) => s + b.length, 0)} bytes from ${url}`);
        resolve(Buffer.concat(chunks));
      });
      res.on('error', err => {
        console.error(`❌ fetchBuffer error for ${url}:`, err);
        reject(err);
      });
    }).on('error', err => {
      console.error(`❌ fetchBuffer request error for ${url}:`, err);
      reject(err);
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
  console.log('📄 createInvoicePdf: start');
  console.log({ payment_reference, customer_name, customer_email, phone, total_price, products });

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const buffers = [];
  doc.on('data', chunk => buffers.push(chunk));
  doc.on('end', () => console.log('📄 createInvoicePdf: PDF stream ended'));

  const date = new Date().toISOString().split('T')[0];
  const priceExcl = +total_price / 1.21;
  const vat = priceExcl * 0.21;
  console.log(`📄 Invoice calculations — date=${date}, priceExcl=${priceExcl.toFixed(2)}, VAT=${vat.toFixed(2)}`);

  // 🖼 Logo
  console.log('📄 Attempting to fetch logo...');
  try {
    const logoBuffer = await fetchBuffer('https://i.imgur.com/oFa7Bqt.jpeg');
    console.log(`📄 Logo fetched (${logoBuffer.length} bytes), embedding...`);
    doc.image(logoBuffer, 50, 40, { width: 100 });
  } catch (e) {
    console.warn('⚠️ Logo failed to load:', e.message);
  }

  doc.moveDown(3);
  doc.font('Helvetica-Bold')
     .fillColor('#d81b60')
     .fontSize(20)
     .text('INVOICE', { align: 'center' });
  doc.moveDown();

  doc.fillColor('#000')
     .font('Helvetica')
     .fontSize(12)
     .text(`Date: ${date}`, { continued: true })
     .text(`   Order No.: ${payment_reference}`);
  doc.moveDown();

  doc.font('Helvetica-Bold').text('Seller:', { underline: true });
  doc.font('Helvetica')
     .text('Beauty by Ella Ltd.')
     .text('Company ID: 305232614')
     .text('VAT Number: LT100017540118')
     .text('Giraitės St. 60A-2, Trakai District');
  doc.moveDown();

  doc.font('Helvetica-Bold').text('Buyer:', { underline: true });
  doc.font('Helvetica')
     .text(customer_name)
     .text(parsedAddress)
     .text(customer_email)
     .text(phone);
  doc.moveDown();

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

  doc.moveDown(1.5).fontSize(12);
  doc.text(`Price excl. VAT:`, 360, doc.y, { continued: true })
     .text(`€${priceExcl.toFixed(2)}`, { align: 'right' });
  doc.text(`VAT (21%):`, 360, doc.y, { continued: true })
     .text(`€${vat.toFixed(2)}`, { align: 'right' });
  doc.font('Helvetica-Bold')
     .fillColor('#d81b60')
     .text(`Total:`, 360, doc.y, { continued: true })
     .text(`€${(+total_price).toFixed(2)}`, { align: 'right' });

  console.log('📄 Finalizing PDF...');
  doc.end();

  // Wait for 'end' then return buffer
  return await new Promise(resolve => {
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(buffers);
      console.log(`📄 PDF generated, ${pdfBuffer.length} total bytes`);
      resolve(pdfBuffer);
    });
  });
}

module.exports = async (req, res) => {
  console.log(`➡️  Incoming request: ${req.method} ${req.url}`);
  if (req.method === 'OPTIONS') {
    console.log('↩️  OPTIONS preflight');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    console.log('❌ Method not allowed');
    return res.status(405).json({ error: 'Only POST requests allowed' });
  }

  console.log('📥 Parsing body:', req.body);
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
    console.log('📦 Generating PDF for:', { to, customer_name, payment_reference, total_price });

    const pdfBuffer = await createInvoicePdf({
      payment_reference,
      customer_name,
      parsedAddress,
      customer_email,
      phone,
      products,
      total_price
    });

    console.log(`✉️  Preparing to send email to: ${to}`);
    const transporter = nodemailer.createTransport({
      host: 'smtp.hostinger.com',
      port: 465,
      secure: true,
      auth: {
        user: 'info@beautybyella.lt',
        pass: 'Benukas2222!'
      }
    });
    console.log('🔑 SMTP transport configured');

    const mailOptions = {
      from: `"Beauty by Ella" <info@beautybyella.lt>`,
      to,
      subject: 'Jūsų užsakymas patvirtintas!',
      html: `
        <div style="font-family: sans-serif; font-size: 15px; color: #333;">
          <img src="https://i.imgur.com/oFa7Bqt.jpeg" style="width:100px; border-radius:8px; margin-bottom:15px;" />
          <p>Sveiki, <strong>${customer_name}</strong>,</p>
          <p>Jūsų užsakymas buvo sėkmingai priimtas! Prisegame sąskaitą faktūrą PDF formatu.</p>
          <p>Su meile,<br/><strong>Beauty by Ella</strong> 💖</p>
        </div>
      `,
      attachments: [{
        filename: 'invoice.pdf',
        content: pdfBuffer,
        contentType: 'application/pdf'
      }]
    };

    console.log('✉️  Sending mail with options:', { to: mailOptions.to, subject: mailOptions.subject, attachments: mailOptions.attachments.length });
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Email sent:', info);

    return res.status(200).json({ success: true, messageId: info.messageId });
  } catch (err) {
    console.error('❌ Email sending failed:', err);
    return res.status(500).json({ error: err.message || 'Email send failed' });
  }
};
