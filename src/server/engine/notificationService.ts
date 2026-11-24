/**
 * Notification Service for 15-Minute 23 EMA / 50 EMA Crossover Alert System
 * Supports Telegram Bot API, SMTP Email (Nodemailer), and Audit Logging.
 */

import nodemailer from 'nodemailer';
import { randomUUID } from 'node:crypto';
import { formatTelegramSignal, sendTelegram, signalAlertTiming, type TelegramSignalSource } from './telegramAlertTransport.js';
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
  public async dispatchSignalAlerts(signal: Ema15mSignal, userId?: string | null, source: TelegramSignalSource = 'UNKNOWN'): Promise<{
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
      const botToken = settings.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN;

      if (botToken && chatId) {
        const tgSuccess = await this.sendTelegramAlert(signal, botToken, chatId, source);
        results.telegram = tgSuccess ? 'SUCCESS' : 'FAILED';
      } else {
        // Record skipped / unconfigured
        dbEngine.logEmaNotification({
          id: `tg-${signal.id}-${Date.now()}`,
          signalId: signal.id,
          channel: 'TELEGRAM',
          status: 'SKIPPED',
          attemptedAt: new Date().toISOString(),
          errorMessage: !botToken && !chatId
            ? 'Neither Telegram Bot Token nor Chat ID is configured'
            : !botToken
              ? 'Telegram Bot Token is not configured'
              : 'Telegram Chat ID is not configured'
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
    const overallStatus = (results.telegram === 'SUCCESS' || results.email === 'SUCCESS') &&
      (!settings.telegramEnabled || results.telegram === 'SUCCESS') &&
      (!settings.emailEnabled || results.email === 'SUCCESS')
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
  public async sendTelegramAlert(signal: Ema15mSignal, botToken: string, chatId: string, source: TelegramSignalSource = 'UNKNOWN'): Promise<boolean> {
    const attempted = Date.now();
    const timing = signalAlertTiming(signal, attempted);
    const result = await sendTelegram(botToken, chatId, formatTelegramSignal(signal, source, attempted));
    dbEngine.logEmaNotification({
      id: 'tg-' + randomUUID(), signalId: signal.id, channel: 'TELEGRAM',
      status: result.ok ? 'SUCCESS' : 'FAILED',
      attemptedAt: new Date(attempted).toISOString(),
      errorMessage: result.ok ? undefined : result.code,
      payload: { ...timing, source, transport: result }
    });
    if (!result.ok) console.warn('[NOTIF SERVICE] Telegram dispatch:', result.code);
    return result.ok;
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
          <td class="label">${signal.instrument} Spot Close Price</td>
          <td class="val" style="color: ${accentColor}; font-size: 16px;">₹${signal.price.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
        </tr>
        ${signal.selectedStrike && signal.optionType ? `
        <tr>
          <td class="label">Directional ATM Option</td>
          <td class="val" style="color: #38bdf8; font-weight: 700;">BUY ${signal.selectedStrike} ${signal.optionType} (1 Lot MIS)</td>
        </tr>
        <tr>
          <td class="label">Weekly Expiry</td>
          <td class="val"><strong>${signal.weeklyExpiry || 'Nearest Upcoming'}</strong></td>
        </tr>
        ` : ''}
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
      This is an automated 15-Minute EMA 23/50 Strategy notification for NIFTY 50 Option Derivatives.<br>
      Product: MIS / Intraday | 1 Lot Execution with SL and Target Controls.
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
  public async testNotification(
    channel: 'TELEGRAM' | 'EMAIL',
    target?: string,
    botTokenInput?: string
  ): Promise<{ success: boolean; message: string }> {
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

    const currentSettings = dbEngine.getEmaNotificationSettings();

    if (channel === 'TELEGRAM') {
      const botToken = botTokenInput || currentSettings.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN;
      const chatId = target || currentSettings.telegramChatId || process.env.TELEGRAM_CHAT_ID;
      if (!botToken || !chatId) {
        return {
          success: false,
          message: !botToken && !chatId
            ? 'Both Telegram Bot Token and Chat ID are missing. Enter them in the settings dialog.'
            : !botToken
              ? 'Telegram Bot Token is missing. Enter your Bot Token from @BotFather.'
              : 'Telegram Chat ID is missing. Enter your numeric Chat ID or channel username.'
        };
      }
      const result = await sendTelegram(botToken, chatId, '🧪 TELEGRAM CONNECTIVITY TEST — NOT A TRADING SIGNAL\nServer time: ' + new Date().toISOString());
      return {
        success: result.ok,
        message: result.ok
          ? 'Telegram accepted the test message in ' + result.elapsedMs + ' ms. Check the destination chat; device delivery is not confirmed.'
          : 'Telegram test failed: ' + result.code + ' (' + result.elapsedMs + ' ms).' +
            (result.retryAfterSeconds !== undefined ? ' Retry after ' + result.retryAfterSeconds + 's.' : '')
      };
    } else {
      const email = target || currentSettings.emailAddress || process.env.SMTP_USER;
      if (!email) {
        return { success: false, message: 'No target email address provided. Please enter a valid recipient email.' };
      }
      const ok = await this.sendEmailAlert(dummySignal, email);
      return {
        success: ok,
        message: ok
          ? `Email test alert sent successfully to ${email}!`
          : 'Failed to send test email. Please check your recipient email address and ensure SMTP is accessible.'
      };
    }
  }
  /**
   * Sends an arbitrary formatted message to the configured Telegram bot & chat
   */
  public async sendDirectTelegramMessage(text: string, customBotToken?: string, customChatId?: string): Promise<boolean> {
    const settings = dbEngine.getEmaNotificationSettings();
    const botToken = customBotToken || settings.telegramBotToken || process.env.TELEGRAM_BOT_TOKEN;
    const chatId = customChatId || settings.telegramChatId || process.env.TELEGRAM_CHAT_ID;

    if (!botToken || !chatId) {
      return false;
    }

    const result = await sendTelegram(botToken, chatId, text, true);
    if (!result.ok) console.warn('[NOTIF SERVICE] Direct Telegram dispatch:', result.code);
    return result.ok;
  }
}

export const globalNotificationService = NotificationService.getInstance();
