import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import http from 'http';
import https from 'https';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';

import * as conColor from './utilities/consoleColors';
import { appLogger, createStructuredLogger, requestLogger, interceptConsoleTo } from './utilities/logging.js';

import { ytsaverRoutes } from './routes/ytsaver';
import { scraperRoutes } from './routes/torscraper';
import { getJsonLimitValue } from './config/serverLimits.js';

const PORT = process.env.PORT || 3019;
const HTTPS_PORT = process.env.HTTPS_PORT || 3018; // New HTTPS port
const SERVER = process.env.HOST || 'localhost';
const TIME = new Date();
const sslOptions = {
  key: fs.readFileSync('/etc/letsencrypt/live/bastiat.hopto.org/privkey.pem'),
  cert: fs.readFileSync('/etc/letsencrypt/live/bastiat.hopto.org/fullchain.pem')
};

const myLogger = appLogger(__dirname)

const logger = createStructuredLogger(__dirname, {
  level: process.env.LOG_LEVEL || 'info', // e.g., 'debug' in dev
  prefix: 'app'                           // logs/app-YYYY-MM-DD.log
});

const accessLogStream = fs.createWriteStream(path.join(__dirname, `/logs/access.log`), { flags: 'a' })

const app = express();
app.use(cors());

// attach per-request logger
app.use(requestLogger(logger));

// optional: route console.* into the structured app log in production
// if (process.env.NODE_ENV === 'production') {
  interceptConsoleTo(logger);
// }

/* dev, combined or common */
// (Optional) include reqId in access logs
// app.use(morgan('common', { stream: accessLogStream }))
morgan.token('rid', req => req.id || '-');
// app.use(morgan(':method :url :status :response-time ms rid=:rid'));

app.use(express.static(__dirname + '/static', { dotfiles: 'allow' }))

app.use(express.json({ limit: getJsonLimitValue() }));

/* Set up html templating */
app.engine('.html', require('pug').__express);
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'html');

app.get('/', (req, res) => {
  res.render('root', {})
})

app.get('/favicon.ico', (req, res) => res.status(204).end());

// Add all the routes to the Express server exported from routes/{object model}/index.js
ytsaverRoutes.forEach(route => {
    app[route.method](route.path, route.handler);
});

scraperRoutes.forEach(route => {
    app[route.method](route.path, route.handler);
});

const httpsServer = https.createServer(sslOptions, app);
let httpsMessage = `${conColor.brightBlue}API Browser Extension Server Started${conColor.Reset} [IP: ${conColor.brightYellow}${SERVER}${conColor.Reset}, PORT: ${conColor.brightYellow}${HTTPS_PORT}${conColor.Reset}, start time: (${conColor.brightGreen}${TIME.toLocaleString()}${conColor.Reset}])`
httpsServer.listen(HTTPS_PORT, process.env.HOST, () => myLogger.log(httpsMessage));

const httpServer = http.createServer(app);
let httpMessage = `${conColor.brightBlue}API Browser Extension HTTP Server Started${conColor.Reset} [IP: ${conColor.brightYellow}${SERVER}${conColor.Reset}, PORT: ${conColor.brightYellow}${PORT}${conColor.Reset}, start time: (${conColor.brightGreen}${TIME.toLocaleString()}${conColor.Reset}])`;

httpServer.listen(PORT, process.env.HOST, () => myLogger.log(httpMessage));
