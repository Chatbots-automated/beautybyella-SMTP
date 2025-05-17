const nodemailer = require('nodemailer');
const chromium = require('chrome-aws-lambda');
const puppeteer = chromium.puppeteer;

async function launchBrowser() {
  // Try chrome-aws-lambda’s bundled Chromium first
  let execPath = await chromium.executablePath;
  // If that’s null/undefined (e.g. local dev), fall back:
  if (!execPath) {
    execPath = process.env.CHROME_PATH || '/usr/bin/google-chrome-stable';
  }

  return puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: execPath,
    headless: chromium.headless,
    ignoreHTTPSErrors: true,
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
      delivery_method,
      payment_reference,
      products,
      total_price,
    } = req.body;

    const parsedAddress = typeof shipping_address === 'string' ? shipping_address : '';
    const priceExcludingVAT = +total_price / 1.21;
    const pvmAmount = priceExcludingVAT * 0.21;

    // If products is an array of { name, qty, price }:
    const productsHtml = Array.isArray(products)
      ? `<ul>${products.map(p => `<li>${p.name} x ${p.qty} – €${p.price.toFixed(2)}</li>`).join('')}</ul>`
      : products;

    const htmlInvoice = `
      <!DOCTYPE html>
      <html lang="lt">
      <head><meta charset="UTF-8"/></head>
      <body style="font-family: sans-serif; padding: 30px;">
        <h2>Sąskaita faktūra</h2>
        <p><strong>Data:</strong> ${new Date().toISOString().split('T')[0]}<br/>
           <strong>Užsakymo numeris:</strong> ${payment_reference}</p>
        <p><strong>Pardavėjas:</strong><br/>
           Stiklų keitimas automobiliams, MB<br/>
           Įmonės kodas: 305232614<br/>
           PVM kodas: LT100017540118<br/>
           Giraitės g. 60A-2, Rubežiaus k., Trakų r.<br/></p>
        <p><strong>Pirkėjas:</strong><br/>
           ${customer_name}<br/>
           ${parsedAddress}<br/>
           ${customer_email}<br/>
           ${phone}</p>
        <hr/>
        <p><strong>Produktai:</strong><br/>${productsHtml}</p>
        <p><strong>Kaina be PVM:</strong> €${priceExcludingVAT.toFixed(2)}</p>
        <p><strong>PVM (21%):</strong> €${pvmAmount.toFixed(2)}</p>
        <p><strong>Bendra suma:</strong> €${(+total_price).toFixed(2)}</p>
      </body>
      </html>
    `;

    // Launch Puppeteer
    const browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setContent(htmlInvoice, { waitUntil: 'networkidle0' });
    // ensure backgrounds/styles are printed
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
    await browser.close();

    // send email
    const transporter = nodemailer.createTransport({
      host: 'smtp.hostinger.com',
      port: 465,
      secure: true,
      auth: {
        user: 'info@beautybyella.lt',
        pass: process.env.SMTP_PASS,  // ← move your real password into an env var!
      },
    });

    await transporter.sendMail({
      from: `"Beauty by Ella" <info@beautybyella.lt>`,
      to,
      subject: 'Jūsų užsakymas patvirtintas!',
      html: `<p>Ačiū, ${customer_name}! Sąskaita faktūra pridėta kaip PDF prisegtukas.</p>`,
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
