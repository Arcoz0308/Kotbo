const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function timestamp() {
  return new Date().toLocaleTimeString('fr-FR', { hour12: false });
}

function formatMsg(level: string, color: string, tag: string, ...args: unknown[]) {
  return `${COLORS.gray}[${timestamp()}]${COLORS.reset} ${color}${COLORS.bold}${level}${COLORS.reset} ${COLORS.cyan}[${tag}]${COLORS.reset} ${args.join(' ')}`;
}

export const logger = {
  info: (tag: string, ...args: unknown[]) =>
    console.log(formatMsg('INFO ', COLORS.blue, tag, ...args)),
  success: (tag: string, ...args: unknown[]) =>
    console.log(formatMsg('OK   ', COLORS.green, tag, ...args)),
  warn: (tag: string, ...args: unknown[]) =>
    console.warn(formatMsg('WARN ', COLORS.yellow, tag, ...args)),
  error: (tag: string, ...args: unknown[]) =>
    console.error(formatMsg('ERROR', COLORS.red, tag, ...args)),
  debug: (tag: string, ...args: unknown[]) => {
    if (process.env.LOG_LEVEL === 'debug')
      console.log(formatMsg('DEBUG', COLORS.magenta, tag, ...args));
  },
};
