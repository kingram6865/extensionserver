import { Console } from 'console';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export function fileDate(datetime) {
  let year, month, day, hours, minutes, seconds
  year = datetime.getFullYear()
  month = datetime.getMonth() + 1
  day = datetime.getDate()

  hours = datetime.getHours()
  minutes = datetime.getMinutes()
  seconds = datetime.getSeconds()

  return `${year}-${month}-${day}_${hours}${minutes}`
}

export function timeStamp() {
  let timestamp, year, month, day, hours, minutes, seconds, tz
  const thisMoment = new Date()
  year = thisMoment.getFullYear()
  month = thisMoment.getMonth() + 1
  day = thisMoment.getDate()

  hours = thisMoment.getHours()
  minutes = thisMoment.getMinutes()
  seconds = thisMoment.getSeconds()
  tz = thisMoment.getTimezoneOffset()/60

  timestamp = `${day}-${month}-${year} ${hours}:${minutes}:${seconds} +000${tz}`
  return timestamp
}

export function appLogger(dir) {
  if (!fs.existsSync(`${dir}/logs`)){
    fs.mkdirSync(`${dir}/logs`);
  }

  const log = new Console({
    stdout: fs.createWriteStream(path.join(dir, `/logs/app.log`), { flags: 'a' }),
    stderr: fs.createWriteStream(path.join(dir, `/logs/errors.log`), { flags: 'a' }),
  })
  
  return log
}

function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }

function todayStr() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Create a daily-rotating JSONL log stream (logs/<prefix>-YYYY-MM-DD.log).
 * Returns a lightweight logger with levels and .child(bindings).
 */
export function createStructuredLogger(dir, { level = 'info', prefix = 'app' } = {}) {
  const logsDir = path.join(dir, 'logs');
  ensureDir(logsDir);

  let current = todayStr();
  let stream = fs.createWriteStream(path.join(logsDir, `${prefix}-${current}.log`), { flags: 'a' });

  function rotateIfNeeded() {
    const t = todayStr();
    if (t !== current) {
      stream.end();
      current = t;
      stream = fs.createWriteStream(path.join(logsDir, `${prefix}-${current}.log`), { flags: 'a' });
    }
  }

  const levels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];
  const minIdx = Math.max(0, levels.indexOf(level));

  function write(lvl, msg, meta) {
    if (levels.indexOf(lvl) < minIdx) return;
    rotateIfNeeded();
    const rec = {
      time: new Date().toISOString(),
      level: lvl,
      msg,
      ...(meta && typeof meta === 'object' ? meta : {})
    };
    stream.write(JSON.stringify(rec) + '\n');
  }

  const base = {
    trace: (m, meta) => write('trace', m, meta),
    debug: (m, meta) => write('debug', m, meta),
    info:  (m, meta) => write('info',  m, meta),
    warn:  (m, meta) => write('warn',  m, meta),
    error: (m, meta) => write('error', m, meta),
    fatal: (m, meta) => write('fatal', m, meta),
    child(bindings = {}) {
      return {
        trace: (m, meta) => write('trace', m, { ...bindings, ...meta }),
        debug: (m, meta) => write('debug', m, { ...bindings, ...meta }),
        info:  (m, meta) => write('info',  m, { ...bindings, ...meta }),
        warn:  (m, meta) => write('warn',  m, { ...bindings, ...meta }),
        error: (m, meta) => write('error', m, { ...bindings, ...meta }),
        fatal: (m, meta) => write('fatal', m, { ...bindings, ...meta }),
      };
    }
  };

  // Console-compat convenience (so you can drop-in replace console.* if needed)
  base.log = (...args) => write('info', args.map(String).join(' '));
  base.dir = (obj) => write('info', 'dir', { obj });

  return base;
}

/**
 * Express middleware: attaches req.log (child logger) and req.id (request id).
 * Also logs a request.completed line on response finish.
 */
export function requestLogger(baseLogger) {
  return function (req, res, next) {
    const reqId = (req.headers['x-request-id']?.toString()) || crypto.randomBytes(8).toString('hex');
    req.id = reqId;
    req.log = baseLogger.child({ reqId, method: req.method, path: req.path });

    const start = process.hrtime.bigint();
    res.on('finish', () => {
      const durMs = Number(process.hrtime.bigint() - start) / 1e6;
      baseLogger.info('request.completed', {
        reqId,
        method: req.method,
        path: req.originalUrl || req.url,
        status: res.statusCode,
        durationMs: Math.round(durMs),
        ip: req.ip
      });
    });

    next();
  };
}

/**
 * Optionally mirror console.* calls into the structured app log.
 * (Keeps original console behavior; useful in production.)
 */
export function interceptConsoleTo(logger) {
  const orig = { log: console.log, warn: console.warn, error: console.error };
  console.log  = (...args) => { logger.info(args.map(String).join(' '));  orig.log(...args);   };
  console.warn = (...args) => { logger.warn(args.map(String).join(' '));  orig.warn(...args);  };
  console.error= (...args) => { logger.error(args.map(String).join(' ')); orig.error(...args); };
}
