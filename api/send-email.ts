import type { VercelRequest, VercelResponse } from '@vercel/node';
import nodemailer from 'nodemailer';
import puppeteer from 'puppeteer-core';

export default async function handler(req: VercelRequest, res: VercelResponse) {
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

    const parsedAddress =
      typeof shipping_address === 'string' ? shipping_address : 'Nepavyko atpažinti adreso';

    const priceExcludingVAT = +total_price / 1.21;
    const pvmAmount = priceExcludingVAT * 0.21;

    const html = `
<!DOCTYPE html>
<html lang="lt">
<head><meta charset="UTF-8" /></head>
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
  <p><strong>Produktai:</strong><br/>${products}</p>
  <p><strong>Kaina be PVM:</strong> €${priceExcludingVAT.toFixed(2)}</p>
  <p><strong>PVM (21%):</strong> €${pvmAmount.toFixed(2)}</p>
  <p><strong>Bendra suma:</strong> €${(+total_price).toFixed(2)}</p>
</body>
</html>
    `;

    // Generate PDF from HTML
    const browser = await puppeteer.launch({
      args: ['--no-sandbox'],
      headless: true,
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium-browser'
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({ format: 'A4' });
    await browser.close();

    const transporter = nodemailer.createTransport({
      host: 'smtp.hostinger.com',
      port: 465,
      secure: true,
      auth: {
        user: 'info@beautybyella.lt',
        pass: 'Benukas2222!',
      },
    });

    const emailResult = await transporter.sendMail({
      from: `"Beauty by Ella" <info@beautybyella.lt>`,
      to,
      subject: 'Jūsų užsakymas patvirtintas!',
      html: `<p>Ačiū, ${customer_name}! Sąskaita pridėta prisegtuke.</p>`,
      attachments: [{
        filename: 'invoice.pdf',
        content: pdfBuffer,
        contentType: 'application/pdf',
      }],
    });

    console.log('✅ Email sent:', emailResult);
    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error('❌ Email sending failed:', err);
    return res.status(500).json({ error: err.message || 'Email send failed' });
  }
}
