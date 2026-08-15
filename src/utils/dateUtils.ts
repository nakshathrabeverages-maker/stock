export const parseDateInput = (value: string | Date | null | undefined): Date => {
  if (value instanceof Date) {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return new Date();
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      const [year, month, day] = trimmed.split('-').map(Number);
      return new Date(year, month - 1, day);
    }

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
    }
  }

  return new Date();
};

export const formatDateInputValue = (value: string | Date | null | undefined): string => {
  const date = parseDateInput(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getStartOfDay = (value: string | Date | null | undefined): Date => {
  const date = parseDateInput(value);
  date.setHours(0, 0, 0, 0);
  return date;
};

export const getEndOfDay = (value: string | Date | null | undefined): Date => {
  const date = parseDateInput(value);
  date.setHours(23, 59, 59, 999);
  return date;
};
