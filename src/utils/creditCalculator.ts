export interface RateRule {
  id: string;
  name: string;
  timeET: string;
  rate: number;
  fullShift: string;
  isTopTier?: boolean;
}

export const CREDIT_RATES: RateRule[] = [
  {
    id: 'sat-sun-day',
    name: 'Sat & Sun daytime',
    timeET: '07:00–16:00',
    rate: 12.5,
    fullShift: '112.5 (9 h)',
    isTopTier: true
  },
  {
    id: 'sat-sun-eve',
    name: 'Sat & Sun evening',
    timeET: '16:00–00:00',
    rate: 10,
    fullShift: '80 (8 h)'
  },
  {
    id: 'wed-fri-day',
    name: 'Wed & Fri daytime',
    timeET: '07:00–16:00',
    rate: 8,
    fullShift: '72 (9 h)'
  },
  {
    id: 'mon-tue-thu-day',
    name: 'Mon, Tue & Thu daytime',
    timeET: '07:00–16:00',
    rate: 6,
    fullShift: '54 (9 h)'
  },
  {
    id: 'mon-fri-eve',
    name: 'Mon–Fri evening',
    timeET: '16:00–00:00',
    rate: 4,
    fullShift: '32 (8 h)'
  },
  {
    id: 'all-other',
    name: 'All other hours',
    timeET: '00:00–07:00',
    rate: 2,
    fullShift: '14 (7 h)'
  }
];

export function getHourlyRateET(dayOfWeek: number, hourET: number): number {
  // dayOfWeek: 0 = Sun, 1 = Mon, ..., 6 = Sat
  // hourET: 0 to 23
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    if (hourET >= 7 && hourET < 16) return 12.5;
    if (hourET >= 16 && hourET < 24) return 10.0;
    return 2.0;
  }

  // Weekdays (1..5)
  if (hourET >= 7 && hourET < 16) {
    if (dayOfWeek === 3 || dayOfWeek === 5) return 8.0; // Wed & Fri
    return 6.0; // Mon, Tue & Thu
  }

  if (hourET >= 16 && hourET < 24) {
    return 4.0; // Mon-Fri evening
  }

  // All other hours (00:00-07:00)
  return 2.0;
}

export function parseETComponents(timestampMs: number): { dayOfWeek: number; hour: number; minute: number } {
  const d = new Date(timestampMs);
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hourCycle: 'h23',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric'
  });
  const parts = formatter.formatToParts(d);
  let weekdayStr = 'Sun';
  let hour = 0;
  let minute = 0;

  for (const part of parts) {
    if (part.type === 'weekday') weekdayStr = part.value;
    if (part.type === 'hour') hour = parseInt(part.value, 10);
    if (part.type === 'minute') minute = parseInt(part.value, 10);
  }

  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6
  };

  return {
    dayOfWeek: weekdayMap[weekdayStr] ?? 0,
    hour,
    minute
  };
}

export function calculateShiftCredits(
  startInput: string | number | Date,
  endInput: string | number | Date
): { hours: number; credits: number } {
  const startMs = new Date(startInput).getTime();
  const endMs = new Date(endInput).getTime();

  if (isNaN(startMs) || isNaN(endMs) || endMs <= startMs) {
    return { hours: 0, credits: 0 };
  }

  const totalMinutes = Math.round((endMs - startMs) / (60 * 1000));
  let totalCredits = 0;

  // Slices by minute to handle arbitrary start/end boundaries with precision
  for (let m = 0; m < totalMinutes; m++) {
    const currentMs = startMs + m * 60 * 1000;
    const { dayOfWeek, hour } = parseETComponents(currentMs);
    const hourlyRate = getHourlyRateET(dayOfWeek, hour);
    totalCredits += hourlyRate / 60;
  }

  const hours = parseFloat((totalMinutes / 60).toFixed(2));
  const credits = parseFloat(totalCredits.toFixed(2));

  return { hours, credits };
}
