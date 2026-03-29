const express = require('express');
const twilio = require('twilio');
const nodemailer = require('nodemailer');
const axios = require('axios');
const app = express();

app.use(express.urlencoded({ extended: false }));

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const client = twilio(accountSid, authToken);

let userSessions = {};

app.post('/webhook', async (req, res) => {
  const from = req.body.From;
  const body = req.body.Body?.trim();
  const mediaUrl = req.body.MediaUrl0;
  const mediaCount = parseInt(req.body.NumMedia || '0');

  if (!userSessions[from]) {
    userSessions[from] = { files: [], email: null, step: 'awaiting_email' };
  }

  const session = userSessions[from];

  // Step 1 - Get email
  if (session.step === 'awaiting_email') {
    if (body && body.includes('@')) {
      session.email = body;
      session.step = 'awaiting_files';
      return sendReply(res, 'Got it! Now send me the files you want to forward.');
    } else {
      return sendReply(res, 'Hi! Please send me the email address you want to forward files to.');
    }
  }

  // Step 2 - Collect files
  if (session.step === 'awaiting_files') {
    if (mediaCount > 0) {
      session.files.push(mediaUrl);
      return sendReply(res, `File received! Send more files or type "SEND" to forward them.`);
    } else if (body === 'SEND') {
      session.step = 'sending';
      await sendFilesViaEmail(session.email, session.files);
      userSessions[from] = null;
      return sendReply(res, `Done! ${session.files.length} file(s) sent to ${session.email}`);
    } else {
      return sendReply(res, 'Please send a file, or type "SEND" when you are ready.');
    }
  }

  res.sendStatus(200);
});

function sendReply(res, message) {
  const twiml = new twilio.twiml.MessagingResponse();
  twiml.message(message);
  res.type('text/xml');
  res.send(twiml.toString());
}

async function sendFilesViaEmail(toEmail, fileUrls) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD
    }
  });

  const attachments = await Promise.all(fileUrls.map(async (url, i) => {
    const response = await axios.get(url, { 
      responseType: 'arraybuffer',
      auth: {
        username: process.env.TWILIO_ACCOUNT_SID,
        password: process.env.TWILIO_AUTH_TOKEN
      }
    });
    return {
      filename: `file-${i + 1}`,
      content: Buffer.from(response.data)
    };
  }));

  await transporter.sendMail({
    from: process.env.GMAIL_USER,
    to: toEmail,
    subject: 'Files from WhatsApp Bot',
    text: 'Please find attached files sent via WhatsApp.',
    attachments
  });
}

app.listen(3000, () => console.log('Bot running on port 3000'));
