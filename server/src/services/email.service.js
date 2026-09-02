import { Resend } from 'resend';

let resendClient = null;
function getResend() {
  if (!resendClient && process.env.RESEND_API_KEY) {
    resendClient = new Resend(process.env.RESEND_API_KEY);
  }
  return resendClient;
}

export async function sendWelcomeEmail({ to, name }) {
  try {
    const resend = getResend();
    if (!resend) {
      console.warn('⚠️ [RESEND] API key not set, skipping welcome email.');
      return;
    }

    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'CineStory AI <notifications@cinestory.app>',
      to,
      subject: 'Welcome to CineStory AI! ✨ Turn your photos into cinematic reels',
      html: `
        <div style="font-family: sans-serif; background-color: #0A0A0C; color: #FFFFFF; padding: 40px; border-radius: 16px;">
          <h1 style="color: #A24CF3; margin-bottom: 8px;">Welcome to CineStory AI, ${name}! 🎬</h1>
          <p style="color: #CCCCCC; font-size: 15px; line-height: 1.6;">
            Your creator account is active. Turn any photoshoot into a music-synced cinematic premiere in seconds.
          </p>
          <div style="margin: 30px 0;">
            <a href="${process.env.CLIENT_URL || 'https://cinestory.app'}/create" style="background: #A24CF3; color: #FFFFFF; padding: 14px 28px; border-radius: 12px; text-decoration: none; font-weight: bold;">
              Create Your First Story →
            </a>
          </div>
          <p style="color: #666666; font-size: 12px;">CineStory AI • The Next Evolution of Photo Deliveries</p>
        </div>
      `
    });
    console.log(`✅ [RESEND] Welcome email sent to ${to}`);
  } catch (err) {
    console.error('❌ [RESEND] Error sending email:', err.message);
  }
}

export async function sendStoryReadyEmail({ to, clientName, storyTitle, storyUrl }) {
  try {
    const resend = getResend();
    if (!resend) return;

    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'CineStory AI <premiere@cinestory.app>',
      to,
      subject: `✨ Your Photoshoot Premiere Is Ready: ${storyTitle}`,
      html: `
        <div style="font-family: sans-serif; background-color: #0A0A0C; color: #FFFFFF; padding: 40px; border-radius: 16px;">
          <h2 style="color: #A24CF3;">Your Photoshoot Premiere Is Ready! 🎬</h2>
          <p style="color: #CCCCCC; font-size: 15px;">Hello ${clientName}, your bespoke AI photo story has been directed and is ready to watch and share.</p>
          <div style="margin: 30px 0;">
            <a href="${storyUrl}" style="background: #10B981; color: #FFFFFF; padding: 14px 28px; border-radius: 12px; text-decoration: none; font-weight: bold;">
              Watch Photo Story & Download Photos →
            </a>
          </div>
          <p style="color: #888888; font-size: 13px;">You can download all high-resolution photos straight to your phone inside the viewer.</p>
        </div>
      `
    });
  } catch (err) {
    console.error('❌ [RESEND] Error sending story email:', err.message);
  }
}
