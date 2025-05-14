import type { VercelRequest, VercelResponse } from '@vercel/node';
import nodemailer from 'nodemailer';

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

    // 🛠️ Fail-proof shipping address parser
    let parsedAddress = '';
    try {
      const safeString = typeof shipping_address === 'string'
        ? shipping_address.replace(/\\+"/g, '"').replace(/“|”/g, '"')
        : '';

      const parsed = typeof shipping_address === 'object'
        ? shipping_address
        : JSON.parse(safeString);

      parsedAddress = `${parsed.name}, ${parsed.address}, ${parsed.city}, ${parsed.postal_code}`;
    } catch (err) {
      console.warn('⚠️ Failed to parse shipping_address. Using raw string:', shipping_address);
      parsedAddress = typeof shipping_address === 'string' ? shipping_address : '';
    }

    console.log('📍 Parsed address:', parsedAddress);

    const transporter = nodemailer.createTransport({
      host: 'smtp.hostinger.com',
      port: 465,
      secure: true,
      auth: {
        user: 'info@beautybyella.lt',
        pass: 'Benukas2222!',
      },
    });

    const html = `
<!DOCTYPE html>
<html lang="lt">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Užsakymo patvirtinimas</title>
</head>
<body style="font-family: 'Segoe UI', sans-serif; background-color: #fff8f9; padding: 40px; color: #333;">
  <div style="max-width: 700px; margin: auto; background: #ffffff; border-radius: 12px; box-shadow: 0 8px 20px rgba(0,0,0,0.05); overflow: hidden;">
    <div style="padding: 30px; text-align: center;">
      <img src="https://i.imgur.com/oFa7Bqt.jpeg" alt="Beauty by Ella" style="width: 110px; border-radius: 10px; margin-bottom: 25px;">
      <h2 style="color: #d81b60; font-weight: 600;">Ačiū, ${customer_name}!</h2>
      <p style="font-size: 16px;">Jūsų užsakymas sėkmingai priimtas. 🛍️</p>
    </div>
    <div style="padding: 0 30px 30px;">
      <h3 style="margin-bottom: 5px;">Sąskaita faktūra</h3>
      <p>Išrašymo data: ${new Date().toISOString().split('T')[0]}<br/>Užsakymo numeris: ${payment_reference}</p>
      <table style="width: 100%; font-size: 14px; margin-top: 20px; border-collapse: collapse;">
        <tr>
          <td style="vertical-align: top; width: 50%;">
            <strong>Pardavėjas:</strong><br/>
            Stiklų keitimas automobiliams, MB<br/>
            Įmonės kodas: 305232614<br/>
            PVM mokėtojo kodas: LT100017540118<br/>
            Giraitės g. 60A-2, Rubežiaus k., Trakų r.<br/>
            info@beautybyella.lt
          </td>
          <td style="vertical-align: top; width: 50%;">
            <strong>Pirkėjas:</strong><br/>
            ${customer_name}<br/>
            ${parsedAddress}<br/>
            ${customer_email}<br/>
            ${phone}
          </td>
        </tr>
      </table>
      <table style="width: 100%; font-size: 14px; margin-top: 25px; border-collapse: collapse; border-top: 1px solid #ddd; border-bottom: 1px solid #ddd;">
        <thead>
          <tr style="background-color: #f5f5f5;">
            <th align="left">Produktai</th>
            <th align="right">Suma</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${products}</td>
            <td align="right">€${(+total_price).toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
      <table style="width: 100%; font-size: 14px; margin-top: 15px;">
        <tr>
          <td style="text-align: right;" colspan="1"><strong>Bendra suma:</strong></td>
          <td style="text-align: right;"><strong>€${(+total_price).toFixed(2)}</strong></td>
        </tr>
      </table>
      <p style="margin-top: 35px; font-size: 14px; color: #999;">
        Jūsų grožis – mūsų įkvėpimas.<br/>
        Su meile,<br/>
        <strong>Beauty by Ella</strong> komanda 💖
      </p>
    </div>
  </div>
</body>
</html>`;

    const sendResult = await transporter.sendMail({
      from: `"Beauty by Ella" <info@beautybyella.lt>`,
      to,
      subject: 'Jūsų užsakymas patvirtintas!',
      html,
    });

    console.log('✅ Email sent:', sendResult);
    return res.status(200).json({ success: true });
  } catch (err: any) {
    console.error('❌ Email sending failed:', err);
    return res.status(500).json({ error: err.message || 'Email send failed' });
  }
}
