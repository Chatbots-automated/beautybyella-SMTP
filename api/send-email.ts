import type { VercelRequest, VercelResponse } from '@vercel/node';
import nodemailer from 'nodemailer';
import chromium from 'chrome-aws-lambda';
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

    console.log('📦 Raw incoming body:', JSON.stringify(req.body));

    if (!to || typeof to !== 'string') {
      console.error('❌ Missing or invalid "to" field');
      return res.status(400).json({ error: 'Missing recipient email (to)' });
    }

    let parsedAddress = typeof shipping_address === 'string' ? shipping_address : '';
    const priceExcludingVAT = +total_price / 1.21;
    const pvmAmount = priceExcludingVAT * 0.21;

    // HTML invoice
    const htmlInvoice = `
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

    // 🧾 Generate PDF with puppeteer-core + chrome-aws-lambda
    const browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath,
      headless: chromium.headless,
    });

    const page = await browser.newPage();
    await page.setContent(htmlInvoice, { waitUntil: 'networkidle0' });
    const pdfBuffer = await page.pdf({ format: 'A4' });
    await browser.close();

    // 📧 Send email with PDF attached
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
      html: `<p>Ačiū, ${customer_name}! Sąskaita faktūra prisegta kaip PDF dokumentas.</p>`,
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
