import type { VercelRequest, VercelResponse } from '@vercel/node'
import nodemailer from 'nodemailer' // <- this is REQUIRED

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
      console.error('Missing "to" email')
      return res.status(400).json({ error: 'Missing recipient email (to)' })
    }

    console.log('Preparing to send email to:', to)
    console.log('Order details:', {
      customer_name,
      customer_email,
      phone,
      shipping_address,
      delivery_method,
      payment_reference,
      products,
      total_price,
    })

    const transporter = nodemailer.createTransport({
      host: 'evispax80.hostingas.lt',
      port: 465,
      secure: true,
      auth: {
        user: 'info@beautybyella.lt',
        pass: 'jDgXvgW695ndhxm7',
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
  <div style="max-width: 700px; margin: auto; background: #ffffff; border-radius: 12px; box-shadow: 0 8px 20px rgba(0,0,0,0.05); overflow: hidden;">
    <div style="padding: 30px; text-align: center;">
      <img src="https://i.imgur.com/oFa7Bqt.jpeg" alt="Beauty by Ella logotipas" style="width: 110px; border-radius: 10px; margin-bottom: 25px;">
      <h2 style="color: #d81b60; font-weight: 600;">Ačiū, {{customer_name}}!</h2>
      <p style="font-size: 16px;">Jūsų užsakymas sėkmingai priimtas. 🛍️</p>
    </div>

    <div style="padding: 0 30px 30px;">
      <h3 style="margin-bottom: 5px;">Sąskaita faktūra </h3>
      <p>Išrašymo data: 2025-05-09<br/>Užsakymo numeris: ${payment_reference}</p>

      <table style="width: 100%; font-size: 14px; margin-top: 20px; border-collapse: collapse;">
        <tr>
          <td style="vertical-align: top; width: 50%;">
            <strong>Pardavėjas:</strong><br/>
            Lietuva<br/>
            info@beautybyella.lt
          </td>
          <td style="vertical-align: top; width: 50%;">
            <strong>Pirkėjas:</strong><br/>
            {{customer_name}}<br/>
            {{shipping_address}}<br/>
            {{customer_email}}<br/>
            {{phone}}
          </td>
        </tr>
      </table>

      <table style="width: 100%; font-size: 14px; margin-top: 25px; border-collapse: collapse; border-top: 1px solid #ddd; border-bottom: 1px solid #ddd;">
        <thead>
          <tr style="background-color: #f5f5f5;">
            <th align="left">Produktas arba paslauga</th>
            <th>Kiekis</th>
            <th>Vnt. kaina</th>
            <th>Nuolaida</th>
            <th>Kaina be PVM</th>
            <th>PVM (21%)</th>
            <th>Suma</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Veido kremas</td>
            <td>2</td>
            <td>€10.00</td>
            <td>€1.20</td>
            <td>€7.27</td>
            <td>€3.06</td>
            <td>€17.60</td>
          </tr>
          <tr>
            <td>Pristatymas</td>
            <td>1</td>
            <td>€2.00</td>
            <td>-</td>
            <td>€1.65</td>
            <td>€0.35</td>
            <td>€2.00</td>
          </tr>
        </tbody>
      </table>

      <table style="width: 100%; font-size: 14px; margin-top: 15px;">
        <tr>
          <td style="text-align: right;" colspan="6">Iš viso be PVM:</td>
          <td style="text-align: right;">€16.19</td>
        </tr>
        <tr>
          <td style="text-align: right;" colspan="6">PVM (21%):</td>
          <td style="text-align: right;">€3.41</td>
        </tr>
        <tr>
          <td style="text-align: right;" colspan="6"><strong>NUOLAIDA:</strong></td>
          <td style="text-align: right;"><strong>€2.40</strong></td>
        </tr>
        <tr>
          <td style="text-align: right;" colspan="6"><strong>Dovanų kuponai:</strong></td>
          <td style="text-align: right;"><strong>€0.20</strong></td>
        </tr>
        <tr>
          <td style="text-align: right;" colspan="6"><strong>IŠ VISO:</strong></td>
          <td style="text-align: right;"><strong>€19.60</strong></td>
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
</html>
`

   const sendResult = await transporter.sendMail({
      from: `"Beauty by Ella" <info@beautybyella.lt>`,
      to,
      subject: 'Jūsų užsakymas patvirtintas!',
      html,
    })

    console.log('Email sent successfully:', sendResult)

    return res.status(200).json({ success: true })
  } catch (err: any) {
    console.error('Email sending failed:', err)
    return res.status(500).json({ error: err.message || 'Email send failed' })
  }
}
