/**
 * Timezone-aware Indian Exchange (NSE/BSE) Session & Calendar Engine
 * Handles Asia/Kolkata (UTC +05:30) trading sessions, holidays, and intraday boundaries.
 */

export class SessionCalendar {
  public static readonly IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

  // Indian Stock Market Holidays (YYYY-MM-DD)
  public static readonly MARKET_HOLIDAYS = new Set([
    '2026-01-26', // Republic Day
    '2026-03-03', // Holi
    '2026-03-20', // Id-Ul-Fitr
    '2026-04-03', // Good Friday
    '2026-04-14', // Dr. Ambedkar Jayanti
    '2026-05-01', // Maharashtra Day
    '2026-05-27', // Bakri Id
    '2026-08-15', // Independence Day
    '2026-09-04', // Janmashtami
    '2026-10-02', // Mahatma Gandhi Jayanti
    '2026-10-20', // Dussehra
    '2026-11-08', // Diwali Laxmi Pujan
    '2026-11-10', // Diwali Balipratipada
    '2026-11-24', // Gurunanak Jayanti
    '2026-12-25'  // Christmas
  ]);

  /**
   * Converts any UTC or local Date to IST Date components
   */
  public static toIstDate(date: Date = new Date()): {
    istDate: Date;
    year: number;
    month: number;
    day: number;
    hours: number;
    minutes: number;
    seconds: number;
    dayOfWeek: number;
    dateStr: string;
    timeStr: string;
  } {
    const istTime = date.getTime() + SessionCalendar.IST_OFFSET_MS;
    const ist = new Date(istTime);

    const year = ist.getUTCFullYear();
    const month = ist.getUTCMonth() + 1;
    const day = ist.getUTCDate();
    const hours = ist.getUTCHours();
    const minutes = ist.getUTCMinutes();
    const seconds = ist.getUTCSeconds();
    const dayOfWeek = ist.getUTCDay(); // 0 = Sun, 6 = Sat

    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

    return {
      istDate: ist,
      year,
      month,
      day,
      hours,
      minutes,
      seconds,
      dayOfWeek,
      dateStr,
      timeStr
    };
  }

  /**
   * Determines if a calendar date is an active Indian market trading day
   */
  public static isTradingDay(date: Date = new Date()): boolean {
    const ist = SessionCalendar.toIstDate(date);
    const isWeekend = ist.dayOfWeek === 0 || ist.dayOfWeek === 6;
    const isHoliday = SessionCalendar.MARKET_HOLIDAYS.has(ist.dateStr);
    return !isWeekend && !isHoliday;
  }

  /**
   * Determines if exchange is open at reference timestamp (09:15 to 15:30 IST on working days)
   */
  public static isExchangeOpen(referenceDate: Date = new Date()): {
    isOpen: boolean;
    reason: string;
    istTime: string;
    dateStr: string;
  } {
    const ist = SessionCalendar.toIstDate(referenceDate);
    const isWeekend = ist.dayOfWeek === 0 || ist.dayOfWeek === 6;
    const isHoliday = SessionCalendar.MARKET_HOLIDAYS.has(ist.dateStr);

    const minutesFromMidnight = ist.hours * 60 + ist.minutes;
    const openMinutes = 9 * 60 + 15; // 09:15 AM IST
    const closeMinutes = 15 * 60 + 30; // 03:30 PM IST

    const formattedIst = `${ist.timeStr} IST`;

    if (isWeekend) {
      return { isOpen: false, reason: `Weekend (${formattedIst})`, istTime: formattedIst, dateStr: ist.dateStr };
    }
    if (isHoliday) {
      return { isOpen: false, reason: `Exchange Holiday (${formattedIst})`, istTime: formattedIst, dateStr: ist.dateStr };
    }
    if (minutesFromMidnight < openMinutes) {
      return { isOpen: false, reason: `Pre-Market (Opens 09:15 AM - ${formattedIst})`, istTime: formattedIst, dateStr: ist.dateStr };
    }
    if (minutesFromMidnight >= closeMinutes) {
      return { isOpen: false, reason: `Market Closed (Closed at 03:30 PM - ${formattedIst})`, istTime: formattedIst, dateStr: ist.dateStr };
    }

    return { isOpen: true, reason: `Market Open (09:15 - 15:30 IST)`, istTime: formattedIst, dateStr: ist.dateStr };
  }

  /**
   * Checks whether the given timestamp is at or past forced square-off time (e.g. 15:15 IST)
   */
  public static isAtOrPastForcedSquareOff(
    timestamp: string | Date,
    forceSquareOffTime: string = '15:15'
  ): boolean {
    const d = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
    if (isNaN(d.getTime())) return false;

    const ist = SessionCalendar.toIstDate(d);
    return ist.timeStr >= forceSquareOffTime;
  }

  /**
   * Rounds a Date down to the nearest 15-minute slot boundary (00, 15, 30, 45)
   */
  public static get15mSlotBoundary(date: Date = new Date()): string {
    const d = new Date(date);
    const minutes = d.getMinutes();
    const slotMinute = Math.floor(minutes / 15) * 15;
    d.setMinutes(slotMinute, 0, 0);
    return d.toISOString();
  }
}
