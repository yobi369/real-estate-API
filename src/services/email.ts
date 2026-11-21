import { config } from '../config.js';

export type PasswordResetMessage = {
  to: string;
  resetUrl: string;
  expiresInMinutes: number;
};
export type EmailTransport = (message: PasswordResetMessage) => Promise<void>;

async function resendTransport(message: PasswordResetMessage): Promise<void> {
  if (!config.EMAIL_API_KEY || !config.EMAIL_FROM) {
    throw new Error('EMAIL_DELIVERY_NOT_CONFIGURED');
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.EMAIL_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: config.EMAIL_FROM,
      to: [message.to],
      subject: 'Reset your Secure Properties password',
      text: [
        'A password reset was requested for your Secure Properties account.',
        '',
        'Use this one-time link to choose a new password:',
        message.resetUrl,
        '',
        `This link expires in ${message.expiresInMinutes} minutes and can only be used once.`,
        'If you did not request this, you can ignore this email.'
      ].join('\n')
    }),
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) {
    // Never include provider response bodies: they may contain recipient data.
    throw new Error('EMAIL_DELIVERY_FAILED');
  }
}

let testTransport: EmailTransport | null = null;

export function setEmailTransportForTests(transport: EmailTransport | null): void {
  if (config.NODE_ENV !== 'test') throw new Error('TEST_TRANSPORT_ONLY');
  testTransport = transport;
}

export function isEmailDeliveryConfigured(): boolean {
  return config.NODE_ENV === 'test' ? testTransport !== null : config.EMAIL_PROVIDER === 'resend';
}

export async function sendPasswordResetEmail(message: PasswordResetMessage): Promise<void> {
  if (config.NODE_ENV === 'test' && testTransport) {
    await testTransport(message);
    return;
  }
  if (config.EMAIL_PROVIDER !== 'resend') throw new Error('EMAIL_DELIVERY_NOT_CONFIGURED');
  await resendTransport(message);
}

export function passwordResetUrl(token: string): string {
  if (!config.APP_BASE_URL) throw new Error('APP_BASE_URL_NOT_CONFIGURED');
  return new URL(`/reset-password?token=${encodeURIComponent(token)}`, config.APP_BASE_URL).toString();
}
