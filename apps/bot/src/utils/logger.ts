import pino from 'pino';

const isDevelopment = process.env.NODE_ENV !== 'production';
const isDocker = process.env.DOCKER === 'true';

// Configure pino with pretty printing for Docker/development
const pinoLogger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  serializers: {
    error: pino.stdSerializers.err,
  },
  timestamp: pino.stdTimeFunctions.isoTime,
}, isDevelopment || isDocker ? pino.transport({
  target: 'pino-pretty',
  options: {
    colorize: true,
    translateTime: 'HH:MM:ss',
    ignore: 'pid,hostname,label',
    levelFirst: true,
    messageFormat: '[{label}] {msg}',
    singleLine: true,
    customColors: 'info:blue,warn:yellow,error:red,debug:magenta',
    errorLikeObjectKeys: ['err', 'error'],
    errorProps: 'stack',
  },
}) : undefined);

// Wrapper to maintain backward compatibility with existing tag-based API
export const logger = {
  info: (tag: string, ...args: unknown[]) => {
    const message = args.map(arg => 
      arg instanceof Error ? arg.message : String(arg)
    ).join(' ');
    pinoLogger.info({ label: tag }, message);
    if (args.some(arg => arg instanceof Error)) {
      const error = args.find(arg => arg instanceof Error);
      if (error) pinoLogger.debug({ err: error, label: tag }, 'Error details');
    }
  },
  success: (tag: string, ...args: unknown[]) => {
    const message = args.map(arg => 
      arg instanceof Error ? arg.message : String(arg)
    ).join(' ');
    pinoLogger.info({ label: tag }, `✓ ${message}`);
  },
  warn: (tag: string, ...args: unknown[]) => {
    const message = args.map(arg => 
      arg instanceof Error ? arg.message : String(arg)
    ).join(' ');
    pinoLogger.warn({ label: tag }, message);
    if (args.some(arg => arg instanceof Error)) {
      const error = args.find(arg => arg instanceof Error);
      if (error) pinoLogger.debug({ err: error, label: tag }, 'Error details');
    }
  },
  error: (tag: string, ...args: unknown[]) => {
    const message = args.map(arg => 
      arg instanceof Error ? arg.message : String(arg)
    ).join(' ');
    const error = args.find(arg => arg instanceof Error);
    if (error) {
      pinoLogger.error({ err: error, label: tag }, message);
    } else {
      pinoLogger.error({ label: tag }, message);
    }
  },
  debug: (tag: string, ...args: unknown[]) => {
    const message = args.map(arg => 
      arg instanceof Error ? arg.message : String(arg)
    ).join(' ');
    pinoLogger.debug({ label: tag }, message);
  },
};

export default logger;
