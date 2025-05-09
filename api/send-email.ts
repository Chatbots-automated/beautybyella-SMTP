// /api/send-email.ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import nodemailer from 'nodemailer'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST requests allowed' })
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
    } = req.body

    if (!to) {
      return res.status(400).json({ error: 'Missing recipient email (to)' })
    }

    const transporter = nodemailer.createTransport({
      host: 'evispax80.hostingas.lt',
      port: 465,
      secure: true,
      auth: {
        user: 'info@beautybyella.lt',
        pass: 'Benukas1',
      },
    })

    const html = `
<!DOCTYPE html>
<html lang="lt">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Užsakymo patvirtinimas</title>
</head>
<body style="font-family: 'Segoe UI', sans-serif; background-color: #fff8f9; padding: 40px; color: #333;">
  <div style="max-width: 600px; margin: auto; background: #ffffff; border-radius: 12px; box-shadow: 0 8px 20px rgba(0,0,0,0.05); overflow: hidden;">
    <div style="padding: 30px; text-align: center;">
      <img src="https://i.imgur.com/oFa7Bqt.jpeg" alt="Beauty by Ella logotipas" style="width: 110px; border-radius: 10px; margin-bottom: 25px;">
      <h2 style="color: #d81b60; font-weight: 600;">Ačiū, ${customer_name}!</h2>
      <p style="font-size: 16px; line-height: 1.6;">Jūsų užsakymas sėkmingai priimtas. 🛍️</p>
      <div style="text-align: left; margin-top: 30px; font-size: 15px; line-height: 1.7;">
        <strong>El. paštas:</strong> ${customer_email}<br/>
        <strong>Telefonas:</strong> ${phone}<br/>
        <strong>Pristatymo adresas:</strong> ${shipping_address}<br/>
        <strong>Pristatymo būdas:</strong> ${delivery_method}<br/>
        <strong>Apmokėjimo kodas:</strong> ${payment_reference}<br/>
        <strong>Užsakyti produktai:</strong> ${products}<br/>
        <strong>Bendra suma:</strong> ${total_price} €
      </div>
      <p style="margin-top: 35px; font-size: 14px; color: #999;">
        Jūsų grožis – mūsų įkvėpimas.<br/>
        Su meile,<br/>
        <strong>Beauty by Ella</strong> komanda 💖
      </p>
    </div>
  </div>
</body>
</html>
`

    await transporter.sendMail({
      from: `"Beauty by Ella" <info@beautybyella.lt>`,
      to,
      subject: 'Jūsų užsakymas patvirtintas!',
      html,
    })

    return res.status(200).json({ success: true })
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Email send failed' })
  }
}
