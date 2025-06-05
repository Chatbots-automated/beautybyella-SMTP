const fs          = require('fs');
const path        = require('path');
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
        const buf = Buffer.concat(chunks);
        console.log(`🔗 fetchBuffer: downloaded ${buf.length} bytes from ${url}`);
        resolve(buf);
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
  total_price,
  invoice_number
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
  doc.on('data', chunk => buffers.push(chunk));
  doc.on('end',   () => console.log('📄 createInvoicePdf: PDF stream ended'));

  // Register embedded fonts
  doc.registerFont('Reg',  robotoRegPath);
  doc.registerFont('Bold', robotoBoldPath);

  // Calculate totals
  const date     = new Date().toISOString().split('T')[0];
  const priceExcl= +total_price / 1.21;
  const vat      = priceExcl * 0.21;
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

  // Move down from logo
  doc.moveDown(3);

  // 2) PDF CONTENT (all in Roboto!)
  // Heading (Lithuanian)
  doc
    .font('Bold').fillColor('#d81b60').fontSize(20)
    .text('SĄSKAITA FAKTŪRA', { align: 'center' });
  doc.moveDown();

  // Invoice metadata (Lithuanian)
  doc
    .font('Reg').fillColor('#000').fontSize(12)
    .text(`Data: ${date}`, { continued: true })
    .text(`   Užsakymo Nr.: ${payment_reference}`)
    .text(`   Sąskaitos numeris: ${invoice_number}`);
  doc.moveDown();

  // Seller (Lithuanian)
  doc
    .font('Bold').text('Pardavėjas:', { underline: true })
    .font('Reg')
    .text('Beauty by Ella Ltd.')
    .text('Company ID: 305232614')
    .text('VAT kodas: LT100017540118')
    .text('Giraitės g. 60A-2, Trakų r.');
  doc.moveDown();

  // Buyer (Lithuanian)
  doc
    .font('Bold').text('Pirkėjas:', { underline: true })
    .font('Reg')
    .text(customer_name)
    .text(parsedAddress)
    .text(customer_email)
    .text(phone);
  doc.moveDown();

  // ────────────────────────────────────────────────────────────────────────────
  // 3) PRODUCT TABLE HEADER (Lithuanian)  
  // ────────────────────────────────────────────────────────────────────────────
  const tableTop = doc.y;
  const itemX   = 50;   // Pavadinimas column start
  const qtyX    = 260;  // Kiekis column start
  const priceX  = 340;  // Kaina (be PVM) column start
  const vatX    = 420;  // PVM column start
  const incX    = 500;  // Kaina su PVM column start

  // Draw header background (brown)
  doc
    .rect(itemX - 2, tableTop - 2, 545 - itemX, 20) // full width from itemX to right margin (≈545)
    .fill('#8B4513');

  // Header text in white
  doc
    .fillColor('#FFFFFF')
    .font('Bold')
    .fontSize(10)
    .text('PAVADINIMAS',       itemX + 5, tableTop + 2, { width: qtyX - itemX - 10 })
    .text('KIEKIS',            qtyX,      tableTop + 2)
    .text('KAINA (be PVM)',     priceX,   tableTop + 2)
    .text('PVM',               vatX,      tableTop + 2)
    .text('KAINA su PVM',      incX,      tableTop + 2);

  // Reset fill color to black for rows
  doc.fillColor('#000').font('Reg').fontSize(10);

  // ────────────────────────────────────────────────────────────────────────────
  // 4) PRODUCT TABLE ROWS (with word‐wrap for “Pavadinimas”)  
  // ────────────────────────────────────────────────────────────────────────────
  const colNameWidth = qtyX - itemX - 10; // width for “Pavadinimas” minus small padding
  let rowY = tableTop + 20;

  // If products is an array, iterate; otherwise fallback to single‐item logic
  const items = Array.isArray(products)
    ? products
    : [{ name: String(products), quantity: 1, price: total_price }];

  for (const p of items) {
    const name      = p.name;
    const qty       = p.quantity;
    const price     = p.price;
    const lineTotal = qty * price;
    const lineVat   = lineTotal * 0.21;
    const priceEx   = price;           // price (be PVM)
    const vatAmt    = lineVat;         // VAT amount
    const priceInc  = lineTotal;       // price including VAT

    // Format numbers with comma decimal:
    const priceStr   = priceEx.toFixed(2).replace('.', ',');
    const vatStrAmt  = vatAmt.toFixed(2).replace('.', ',');
    const priceIncStr= priceInc.toFixed(2).replace('.', ',');

    // 1) Measure how tall the wrapped name will be given our column width
    doc.font('Reg').fontSize(10);
    const nameHeight = doc.heightOfString(name, {
      width: colNameWidth,
      align: 'left'
    });
    // Add small vertical padding (4px) so text doesn’t touch borders
    const rowHeight = nameHeight + 4;

    // 2) Draw “Pavadinimas” inside its own cell, with wrap
    doc.text(name, itemX + 5, rowY, {
      width: colNameWidth,
      align: 'left'
    });

    // 3) Draw the remaining columns at the same rowY
    doc.text(qty.toString(),         qtyX,    rowY);
    doc.text(`€${priceStr}`,        priceX,  rowY);
    doc.text(`€${vatStrAmt}`,        vatX,    rowY);
    doc.text(`€${priceIncStr}`,      incX,    rowY);

    // 4) Advance rowY by the (wrapped) row height
    rowY += rowHeight;
  }

  // Move the “cursor” below the last row + a little padding:
  doc.y = rowY + 10;

  // ────────────────────────────────────────────────────────────────────────────
  // 5) TOTALS (Lithuanian)
  // ────────────────────────────────────────────────────────────────────────────
  doc.moveDown(1.5).fontSize(12);
  doc
    .font('Reg').fillColor('#000')
    .text(`Kaina be PVM:`, 360, doc.y, { continued: true })
    .text(`€${priceExcl.toFixed(2).replace('.', ',')}`, { align: 'right' });
  doc
    .text(`PVM (21%):`, 360, doc.y, { continued: true })
    .text(`€${vat.toFixed(2).replace('.', ',')}`, { align: 'right' });
  doc
    .font('Bold').fillColor('#d81b60')
    .text(`Bendra suma:`, 360, doc.y, { continued: true })
    .text(`€${(+total_price).toFixed(2).replace('.', ',')}`, { align: 'right' });

  console.log('📄 Finalizing PDF...');
  doc.end();

  // Wait for PDF to finish then return buffer
  return new Promise(resolve => {
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
    const {
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

    const parsedAddress = String(shipping_address || '');
    console.log('📦 Generating PDF for:', { to, customer_name, payment_reference, total_price, invoice_number });

    const pdfBuffer = await createInvoicePdf({
      payment_reference,
      customer_name,
      parsedAddress,
      customer_email,
      phone,
      products,
      total_price,
      invoice_number
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
          <p><strong>Sąskaitos numeris: ${invoice_number}</strong></p>
          <p>Su meile,<br/><strong>Beauty by Ella</strong> 💖</p>
        </div>
      `,
      attachments: [{
        filename: 'invoice.pdf',
        content: pdfBuffer,
        contentType: 'application/pdf'
      }]
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
