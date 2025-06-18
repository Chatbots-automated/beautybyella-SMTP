const fs          = require('fs');
const path        = require('path');
const PDFDocument = require('pdfkit');
const nodemailer  = require('nodemailer');
const https       = require('https');

// fetchBuffer: helper to pull any binary URL into a Buffer
function fetchBuffer(url) {
  return new Promise((resolve, reject) => {
    console.log(`🔗 fetchBuffer: GET ${url}`);
    https
      .get(url, (res) => {
        console.log(`🔗 fetchBuffer: statusCode=${res.statusCode} for ${url}`);
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          console.log(`🔗 fetchBuffer: downloaded ${buf.length} bytes from ${url}`);
          resolve(buf);
        });
        res.on('error', (err) => {
          console.error(`❌ fetchBuffer error for ${url}:`, err);
          reject(err);
        });
      })
      .on('error', (err) => {
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
  total_price,
  invoice_number,       // this now must already be "EVA..." prefixed
}) {
  console.log('📄 createInvoicePdf: start');
  console.log({ payment_reference, customer_name, customer_email, phone, total_price, products, invoice_number });

  // 1) Load local Roboto TTFs
  const fontsDir = path.join(process.cwd(), 'fonts');
  const robotoRegPath  = path.join(fontsDir, 'Roboto-Regular.ttf');
  const robotoBoldPath = path.join(fontsDir, 'Roboto-Bold.ttf');
  console.log('📄 Registering fonts from:', fontsDir);

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const buffers = [];
  doc.on('data', (chunk) => buffers.push(chunk));
  doc.on('end',   () => console.log('📄 createInvoicePdf: PDF stream ended'));

  // Register embedded fonts
  doc.registerFont('Reg',  robotoRegPath);
  doc.registerFont('Bold', robotoBoldPath);

  // Compute totals
  const date       = new Date().toISOString().split('T')[0];
  const overallNet = +total_price / 1.21;
  const overallVat = overallNet * 0.21;
  console.log(`📄 Invoice calculations — date=${date}, overallNet=${overallNet.toFixed(2)}, overallVat=${overallVat.toFixed(2)}`);

  // Logo
  console.log('📄 Attempting to fetch logo...');
  try {
    const logoBuffer = await fetchBuffer('https://i.imgur.com/oFa7Bqt.jpeg');
    console.log(`📄 Logo fetched (${logoBuffer.length} bytes), embedding...`);
    doc.image(logoBuffer, 50, 40, { width: 100 });
  } catch (e) {
    console.warn('⚠️ Logo failed to load:', e.message);
  }

  doc.moveDown(3);

  // Title
  doc
    .font('Bold')
    .fillColor('#d81b60')
    .fontSize(20)
    .text('SĄSKAITA FAKTŪRA', { align: 'center' });
  doc.moveDown();

  // Metadata with prefixed invoice number
  doc
    .font('Reg')
    .fillColor('#000')
    .fontSize(12)
    .text(`Data: ${date}`, { continued: true })
    .text(`   Užsakymo Nr.: ${payment_reference}`)
    .text(`   Sąskaitos numeris: ${invoice_number}`);
  doc.moveDown();

  // Seller
  doc
    .font('Bold').text('Pardavėjas:', { underline: true })
    .font('Reg')
    .text('MB Stiklų keitimas automobiliams')
    .text('Company ID: 305232614')
    .text('VAT kodas: LT100017540118')
    .text('Giraitės g. 60A-2, Trakų r.');
  doc.moveDown();

  // Buyer
  doc
    .font('Bold').text('Pirkėjas:', { underline: true })
    .font('Reg')
    .text(customer_name)
    .text(parsedAddress)
    .text(customer_email)
    .text(phone);
  doc.moveDown();

  // PRODUCT TABLE
  const tableTop = doc.y;
  const itemX   = 50, qtyX = 240, priceX = 330, vatX = 410, incX = 460;

  // Header
  doc
    .rect(itemX - 2, tableTop - 2, 545 - itemX, 22)
    .fill('#8B4513')
    .fillColor('#FFFFFF')
    .font('Bold')
    .fontSize(10)
    .text('PAVADINIMAS', itemX + 5, tableTop + 2, { width: qtyX - itemX - 10 })
    .text('KIEKIS',     qtyX + 5,  tableTop + 2)
    .text('KAINA (be PVM)', priceX + 5, tableTop + 2)
    .text('PVM',        vatX + 5,   tableTop + 2)
    .text('KAINA su PVM', incX + 5,  tableTop + 2);

  // White separators
  doc
    .strokeColor('#FFFFFF').lineWidth(0.5)
    .moveTo(qtyX - 2, tableTop - 2).lineTo(qtyX - 2, tableTop + 20).stroke()
    .moveTo(priceX - 2, tableTop - 2).lineTo(priceX - 2, tableTop + 20).stroke()
    .moveTo(vatX - 2, tableTop - 2).lineTo(vatX - 2, tableTop + 20).stroke()
    .moveTo(incX - 2, tableTop - 2).lineTo(incX - 2, tableTop + 20).stroke();

  doc.fillColor('#000').font('Reg').fontSize(10);

  // Rows
  let rowY = tableTop + 22;
  const items = Array.isArray(products)
    ? products
    : [{ name: String(products), quantity: 1, price: total_price }];

  for (let i = 0; i < items.length; i++) {
    const { name, quantity: qty, price: unitNet } = items[i];
    const lineNet  = qty * unitNet;
    const lineVat  = lineNet * 0.21;
    const lineGross= lineNet * 1.21;

    const priceNetStr = unitNet.toFixed(2).replace('.', ',');
    const vatStrAmt   = lineVat.toFixed(2).replace('.', ',');
    const grossStrAmt = lineGross.toFixed(2).replace('.', ',');

    // Measure wrap height
    doc.font('Reg').fontSize(10);
    const nameHeight = doc.heightOfString(name, { width: qtyX - itemX - 10 });
    const rowHeight  = nameHeight + 6;

    // Shade alternate
    if (i % 2 === 1) {
      doc.rect(itemX - 2, rowY - 2, 545 - itemX, rowHeight).fill('#F5F5F5').fillColor('#000');
    }

    // Borders
    doc
      .strokeColor('#DDDDDD').lineWidth(0.5)
      .moveTo(itemX - 2, rowY - 2).lineTo(545, rowY - 2).stroke()
      .moveTo(itemX - 2, rowY + rowHeight - 2).lineTo(545, rowY + rowHeight - 2).stroke()
      .moveTo(qtyX - 2, rowY - 2).lineTo(qtyX - 2, rowY + rowHeight - 2).stroke()
      .moveTo(priceX - 2, rowY - 2).lineTo(priceX - 2, rowY + rowHeight - 2).stroke()
      .moveTo(vatX - 2, rowY - 2).lineTo(vatX - 2, rowY + rowHeight - 2).stroke()
      .moveTo(incX - 2, rowY - 2).lineTo(incX - 2, rowY + rowHeight - 2).stroke();

    // Data
    doc.text(name, itemX + 5, rowY, { width: qtyX - itemX - 10 });
    doc.text(qty.toString(), qtyX + 5, rowY);
    doc.text(`€${priceNetStr}`, priceX + 5, rowY);
    doc.text(`€${vatStrAmt}`,   vatX + 5,   rowY);
    doc.text(`€${grossStrAmt}`, incX + 5,   rowY);

    rowY += rowHeight;
  }

  doc.y = rowY + 10;

  // Totals
  doc.moveDown(1.5).fontSize(12);
  doc
    .font('Reg').fillColor('#000')
    .text(`Kaina be PVM:`, 360, doc.y, { continued: true })
    .text(`€${overallNet.toFixed(2).replace('.', ',')}`, { align: 'right' });
  doc
    .text(`PVM (21%):`, 360, doc.y, { continued: true })
    .text(`€${overallVat.toFixed(2).replace('.', ',')}`, { align: 'right' });
  doc
    .font('Bold').fillColor('#d81b60')
    .text(`Bendra suma:`, 360, doc.y, { continued: true })
    .text(`€${(+total_price).toFixed(2).replace('.', ',')}`, { align: 'right' });

  console.log('📄 Finalizing PDF...');
  doc.end();

  return new Promise((resolve) => {
    doc.on('end', () => {
      const pdfBuffer = Buffer.concat(buffers);
      console.log(`📄 PDF generated, ${pdfBuffer.length} bytes`);
      resolve(pdfBuffer);
    });
  });
}

module.exports = async (req, res) => {
  console.log(`➡️ Incoming request: ${req.method} ${req.url}`);
  if (req.method === 'OPTIONS') {
    console.log('↩️ OPTIONS preflight');
    res
      .setHeader('Access-Control-Allow-Origin', '*')
      .setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
      .setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }
  if (req.method !== 'POST') {
    console.log('❌ Method not allowed');
    return res.status(405).json({ error: 'Only POST requests allowed' });
  }

  console.log('📥 Parsing body:', req.body);
  try {
    let {
      to,
      customer_name,
      customer_email,
      phone,
      shipping_address,
      payment_reference,
      products,
      total_price,
      invoice_number
    } = req.body;

    // Prefix the invoice number here
    const prefixedInvoiceNumber = `EVA${invoice_number}`;

    const parsedAddress = String(shipping_address || '');
    console.log('📦 Generating PDF for:', {
      to,
      customer_name,
      payment_reference,
      total_price,
      invoice_number: prefixedInvoiceNumber
    });

    const pdfBuffer = await createInvoicePdf({
      payment_reference,
      customer_name,
      parsedAddress,
      customer_email,
      phone,
      products,
      total_price,
      invoice_number: prefixedInvoiceNumber   // pass the EVA… number in
    });

    console.log(`✉️ Preparing to send email to: ${to}`);
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
          <p><strong>Sąskaitos numeris: ${prefixedInvoiceNumber}</strong></p>
          <p>Su meile,<br/><strong>Beauty by Ella</strong> 💖</p>
        </div>
      `,
      attachments: [
        {
          filename: 'invoice.pdf',
          content: pdfBuffer,
          contentType: 'application/pdf'
        }
      ]
    };

    console.log('✉️ Sending mail with options:', { to, subject: mailOptions.subject });
    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Email sent:', info);

    return res.status(200).json({ success: true, messageId: info.messageId });
  } catch (err) {
    console.error('❌ Email sending failed:', err);
    return res.status(500).json({ error: err.message || 'Email send failed' });
  }
};
