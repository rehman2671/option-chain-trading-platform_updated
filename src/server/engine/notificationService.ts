/**
 * Notification Service for 15-Minute 23 EMA / 50 EMA Crossover Alert System
 * Supports Telegram Bot API, SMTP Email (Nodemailer), and Audit Logging.
 */

import nodemailer from 'nodemailer';
import { dbEngine } from '../db.js';
import { Ema15mSignal, EmaNotificationLog, EmaNotificationSettings } from '../../types.js';

export class NotificationService {
  private static instance: NotificationService | null = null;
  private mailTransporter: nodemailer.Transporter | null = null;

  private constructor() {
    this.initMailTransporter();
  }

  public static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  private initMailTransporter(): void {
    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT) || 465;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (host && user && pass) {
      try {
        this.mailTransporter = nodemailer.createTransport({
          host,
          port,
          secure: port === 465,
          auth: { user, pass }
        });
      } catch (err) {
        console.warn('[NOTIF SERVICE] Failed to initialize mail transporter:', err);
      }
    }
  }

  /**
   * Dispatches alerts for a newly confirmed 15m EMA crossover signal
   */
  public async dispatchSignalAlerts(signal: Ema15mSignal, userId?: string | null): Promise<{
    telegram: 'SUCCESS' | 'FAILED' | 'SKIPPED';
    email: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  }> {
    const settings = dbEngine.getEmaNotificationSettings(userId);
    const results = {
      telegram: 'SKIPPED' as 'SUCCESS' | 'FAILED' | 'SKIPPED',
      email: 'SKIPPED' as 'SUCCESS' | 'FAILED' | 'SKIPPED'
    };

    // 1. Telegram Dispatch
    if (settings.telegramEnabled) {
      const chatId = settings.telegramChatId || process.env.TELEGRAM_CHAT_ID;
      const botToken = process.env.TELEGRAM_BOT_TOKEN;

      if (botToken && chatId) {
        const tgSuccess = await this.sendTelegramAlert(signal, botToken, chatId);
        results.telegram = tgSuccess ? 'SUCCESS' : 'FAILED';
      } else {
        // Record skipped / unconfigured
        dbEngine.logEmaNotification({
          id: `tg-${signal.id}-${Date.now()}`,
          signalId: signal.id,
          channel: 'TELEGRAM',
          status: 'SKIPPED',
          attemptedAt: new Date().toISOString(),
          errorMessage: 'TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID not configured'
        });
      }
    }

    // 2. Email Dispatch
    if (settings.emailEnabled) {
      const recipient = settings.emailAddress || process.env.SMTP_USER;
      if (recipient) {
        const emailSuccess = await this.sendEmailAlert(signal, recipient);
        results.email = emailSuccess ? 'SUCCESS' : 'FAILED';
      } else {
        dbEngine.logEmaNotification({
          id: `em-${signal.id}-${Date.now()}`,
          signalId: signal.id,
          channel: 'EMAIL',
          status: 'SKIPPED',
          attemptedAt: new Date().toISOString(),
          errorMessage: 'No destination email configured'
        });
      }
    }

    // Update signal notification summary status
    const overallStatus = results.telegram === 'SUCCESS' && results.email === 'SUCCESS'
      ? 'DELIVERED'
      : (results.telegram === 'SUCCESS' || results.email === 'SUCCESS')
        ? 'PARTIAL'
        : (results.telegram === 'FAILED' || results.email === 'FAILED')
          ? 'FAILED'
          : 'SKIPPED';

    dbEngine.updateEmaSignalNotificationStatus(signal.id, overallStatus);

    return results;
  }

  /**
   * Formats and sends message to Telegram Bot
   */
  public async sendTelegramAlert(signal: Ema15mSignal, botToken: string, chatId: string): Promise<boolean> {
    const isBullish = signal.signalType === 'BULLISH';
    const headerEmoji = isBullish ? '🟢 🚀' : '🔴 🔻';
    const signalLabel = isBullish ? 'BULLISH CROSSOVER (23 EMA > 50 EMA)' : 'BEARISH CROSSOVER (23 EMA < 50 EMA)';
    const diffSign = signal.emaDifference > 0 ? '+' : '';

    const text = `
${headerEmoji} <b>15-MINUTE EMA CROSSOVER ALERT</b> ${headerEmoji}

📊 <b>Instrument:</b> ${signal.instrument}
⚡ <b>Signal:</b> ${signalLabel}
💰 <b>Candle Close:</b> ₹${signal.price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}

📈 <b>23 EMA:</b> ${signal.ema23.toFixed(2)}
📉 <b>50 EMA:</b> ${signal.ema50.toFixed(2)}
⚖️ <b>EMA Diff:</b> ${diffSign}${signal.emaDifference.toFixed(2)}

⏳ <b>Timeframe:</b> 15 Minutes
🕒 <b>Candle Time:</b> ${signal.candleTimestamp}
✅ <b>Confirmed At:</b> ${signal.signalConfirmedAt}

<i>⚠️ Notice: Alert-only strategy. No automated trade executed.</i>
`.trim();

    try {
      const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML'
        })
      });

      const resJson: any = await response.json();
      const isSuccess = response.ok && resJson.ok;

      dbEngine.logEmaNotification({
        id: `tg-${signal.id}-${Date.now()}`,
        signalId: signal.id,
        channel: 'TELEGRAM',
        status: isSuccess ? 'SUCCESS' : 'FAILED',
        attemptedAt: new Date().toISOString(),
        errorMessage: isSuccess ? undefined : (resJson.description || 'Telegram API request failed'),
        payload: { chatId, result: resJson }
      });

      return isSuccess;
    } catch (err: any) {
      console.error('[NOTIF SERVICE] Telegram dispatch error:', err.message);
      dbEngine.logEmaNotification({
        id: `tg-${signal.id}-${Date.now()}`,
        signalId: signal.id,
        channel: 'TELEGRAM',
        status: 'FAILED',
        attemptedAt: new Date().toISOString(),
        errorMessage: err.message
      });
      return false;
    }
  }

  /**
   * Formats and sends email notification
   */
  public async sendEmailAlert(signal: Ema15mSignal, recipientEmail: string): Promise<boolean> {
    if (!this.mailTransporter) {
      this.initMailTransporter();
    }

    if (!this.mailTransporter) {
      dbEngine.logEmaNotification({
        id: `em-${signal.id}-${Date.now()}`,
        signalId: signal.id,
        channel: 'EMAIL',
        status: 'FAILED',
        attemptedAt: new Date().toISOString(),
        errorMessage: 'SMTP transporter not configured or connection failed'
      });
      return false;
    }

    const isBullish = signal.signalType === 'BULLISH';
    const accentColor = isBullish ? '#10b981' : '#f43f5e';
    const bgBadge = isBullish ? '#064e3b' : '#881337';
    const signalTitle = isBullish ? 'BULLISH CROSSOVER (23 EMA > 50 EMA)' : 'BEARISH CROSSOVER (23 EMA < 50 EMA)';
    const fromAddress = process.env.SMTP_FROM || process.env.SMTP_USER || 'noreply@aaditechs.in';

    const html = `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #090d16; color: #f8fafc; margin: 0; padding: 24px; }
    .card { background-color: #131c2e; border: 1px solid #1e293b; border-radius: 12px; max-width: 600px; margin: 0 auto; overflow: hidden; }
    .header { background: linear-gradient(135deg, ${accentColor} 0%, #0f172a 100%); padding: 24px; text-align: center; }
    .badge { background-color: ${bgBadge}; color: #ffffff; padding: 6px 14px; border-radius: 20px; font-weight: 700; font-size: 13px; display: inline-block; letter-spacing: 0.5px; }
    .content { padding: 24px; }
    .table-data { width: 100%; border-collapse: collapse; margin-top: 16px; margin-bottom: 24px; }
    .table-data td { padding: 12px 8px; border-bottom: 1px solid #1e293b; font-size: 14px; }
    .table-data td.label { color: #94a3b8; font-weight: 500; }
    .table-data td.val { color: #f8fafc; font-weight: 600; text-align: right; }
    .footer { background-color: #0b1120; padding: 16px 24px; font-size: 12px; color: #64748b; text-align: center; border-top: 1px solid #1e293b; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="badge">${signal.instrument} 15-MIN TIMEFRAME</div>
      <h2 style="margin: 12px 0 0 0; color: #ffffff; font-size: 20px;">${signalTitle}</h2>
    </div>
    <div class="content">
      <table class="table-data">
        <tr>
          <td class="label">Instrument</td>
          <td class="val"><strong>${signal.instrument}</strong></td>
        </tr>
        <tr>
          <td class="label">Candle Close Price</td>
          <td class="val" style="color: ${accentColor}; font-size: 16px;">₹${signal.price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        </tr>
        <tr>
          <td class="label">23-Period EMA</td>
          <td class="val">${signal.ema23.toFixed(2)}</td>
        </tr>
        <tr>
          <td class="label">50-Period EMA</td>
          <td class="val">${signal.ema50.toFixed(2)}</td>
        </tr>
        <tr>
          <td class="label">EMA Difference</td>
          <td class="val" style="color: ${accentColor};">${signal.emaDifference > 0 ? '+' : ''}${signal.emaDifference.toFixed(2)}</td>
        </tr>
        <tr>
          <td class="label">Candle Period</td>
          <td class="val">${signal.candleTimestamp}</td>
        </tr>
        <tr>
          <td class="label">Signal Confirmed At</td>
          <td class="val">${signal.signalConfirmedAt}</td>
        </tr>
      </table>
    </div>
    <div class="footer">
      This is an automated 15-Minute EMA Crossover Alert generated by your Option Chain Trading Platform.<br>
      Strictly alert-only system: no automatic trading or order execution has taken place.
    </div>
  </div>
</body>
</html>
    `.trim();

    try {
      await this.mailTransporter.sendMail({
        from: `"Option Chain EMA Alerts" <${fromAddress}>`,
        to: recipientEmail,
        subject: `[EMA 15M ALERT] ${signal.signalType} Crossover on ${signal.instrument} @ ₹${signal.price.toLocaleString('en-IN')}`,
        html
      });

      dbEngine.logEmaNotification({
        id: `em-${signal.id}-${Date.now()}`,
        signalId: signal.id,
        channel: 'EMAIL',
        status: 'SUCCESS',
        attemptedAt: new Date().toISOString(),
        payload: { recipient: recipientEmail }
      });

      return true;
    } catch (err: any) {
      console.error('[NOTIF SERVICE] Email dispatch error:', err.message);
      dbEngine.logEmaNotification({
        id: `em-${signal.id}-${Date.now()}`,
        signalId: signal.id,
        channel: 'EMAIL',
        status: 'FAILED',
        attemptedAt: new Date().toISOString(),
        errorMessage: err.message,
        payload: { recipient: recipientEmail }
      });
      return false;
    }
  }

  /**
   * Test notification utility for checking user settings
   */
  public async testNotification(channel: 'TELEGRAM' | 'EMAIL', target?: string): Promise<{ success: boolean; message: string }> {
    const dummySignal: Ema15mSignal = {
      id: `test-signal-${Date.now()}`,
      instrument: 'NIFTY',
      timeframe: '15m',
      signalType: 'BULLISH',
      price: 24150.75,
      ema23: 24120.50,
      ema50: 24095.10,
      emaDifference: 25.40,
      candleTimestamp: new Date().toISOString(),
      signalConfirmedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };

    if (channel === 'TELEGRAM') {
      const botToken = process.env.TELEGRAM_BOT_TOKEN;
      const chatId = target || process.env.TELEGRAM_CHAT_ID;
      if (!botToken || !chatId) {
        return { success: false, message: 'TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not configured in .env' };
      }
      const ok = await this.sendTelegramAlert(dummySignal, botToken, chatId);
      return {
        success: ok,
        message: ok ? 'Telegram test alert delivered successfully!' : 'Failed to deliver Telegram test message. Check bot token and chat ID.'
      };
    } else {
      const email = target || process.env.SMTP_USER;
      if (!email) {
        return { success: false, message: 'No target email address provided and SMTP_USER is empty.' };
      }
      const ok = await this.sendEmailAlert(dummySignal, email);
      return {
        success: ok,
        message: ok ? `Email test alert sent successfully to ${email}!` : 'Failed to send test email. Verify SMTP credentials.'
      };
    }
  }
}

export const globalNotificationService = NotificationService.getInstance();
