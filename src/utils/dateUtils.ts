const IST_TIME_ZONE = 'Asia/Kolkata';
const IST_OFFSET_MINUTES = 330;

export const getISTDateParts = (value: Date) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);

  return {
    year: Number(parts.find((part) => part.type === 'year')?.value),
    month: Number(parts.find((part) => part.type === 'month')?.value),
    day: Number(parts.find((part) => part.type === 'day')?.value),
  };
};

const createISTDate = (year: number, month: number, day: number, hour = 0, minute = 0, second = 0, millisecond = 0) =>
  new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond) - IST_OFFSET_MINUTES * 60 * 1000);

export const parseDateInput = (value: string | Date | null | undefined): Date => {
  if (value instanceof Date) {
    const { year, month, day } = getISTDateParts(value);
    return createISTDate(year, month, day);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return new Date();
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [year, month, day] = trimmed.split('-').map(Number);
      return createISTDate(year, month, day);
    }

    const dayFirstMatch = trimmed.match(/^(\d{1,2})[-/]([0-9]{1,2})[-/](\d{4})$/);
    if (dayFirstMatch) {
      const [, dayText, monthText, yearText] = dayFirstMatch;
      const day = Number(dayText);
      const month = Number(monthText);
      const year = Number(yearText);
      const parsed = createISTDate(year, month, day);
      if (
        month >= 1 && month <= 12 &&
        day >= 1 && day <= new Date(Date.UTC(year, month, 0)).getUTCDate()
      ) {
        return parsed;
      }
      return new Date(Number.NaN);
    }

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      const { year, month, day } = getISTDateParts(parsed);
      return createISTDate(year, month, day);
    }
  }

  return new Date();
};

export const formatDateInputValue = (value: string | Date | null | undefined): string => {
  const date = parseDateInput(value);
  const { year, month, day } = getISTDateParts(date);
  const monthText = String(month).padStart(2, '0');
  const dayText = String(day).padStart(2, '0');
  return `${year}-${monthText}-${dayText}`;
};

export const getStartOfDay = (value: string | Date | null | undefined): Date => {
  const date = parseDateInput(value);
  const { year, month, day } = getISTDateParts(date);
  return createISTDate(year, month, day);
};

export const getEndOfDay = (value: string | Date | null | undefined): Date => {
  const date = parseDateInput(value);
  const { year, month, day } = getISTDateParts(date);
  return createISTDate(year, month, day, 23, 59, 59, 999);
};
