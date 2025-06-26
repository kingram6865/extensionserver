import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import https from 'https';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';

import * as conColor from './utilities/consoleColors';
import { appLogger } from './utilities/logging';

import { ytsaverRoutes } from './routes/ytsaver';

const PORT = process.env.PORT || 3019;
const HTTPS_PORT = process.env.HTTPS_PORT || 3018; // New HTTPS port
const SERVER = process.env.HOST || 'localhost';
const TIME = new Date();
const sslOptions = {
  key: fs.readFileSync('/etc/letsencrypt/live/bastiat.hopto.org/privkey.pem'),
  cert: fs.readFileSync('/etc/letsencrypt/live/bastiat.hopto.org/fullchain.pem')
};

const myLogger = appLogger(__dirname)
const accessLogStream = fs.createWriteStream(path.join(__dirname, `/logs/access.log`), { flags: 'a' })

const app = express();
app.use(cors());

/* dev, combined or common */
app.use(morgan('common', { stream: accessLogStream }))
app.use(express.static(__dirname + '/static', { dotfiles: 'allow' }))

app.use(express.json({ limit: '3mb'}));

/* Set up html templating */
app.engine('.html', require('pug').__express);
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'html');

app.get('/', (req, res) => {
  res.render('root', {})
})

// Health check endpoint
// app.get('/health', (req, res) => {
//   res.status(200).json({ status: 'healthy' });
// });

app.get('/favicon.ico', (req, res) => res.status(204).end());

// Add all the routes to the Express server exported from routes/{object model}/index.js
ytsaverRoutes.forEach(route => {
    app[route.method](route.path, route.handler);
});

const httpsServer = https.createServer(sslOptions, app);
let httpsMessage = `${conColor.brightBlue}API Browser Extension Server Started${conColor.Reset} [IP: ${conColor.brightYellow}${SERVER}${conColor.Reset}, PORT: ${conColor.brightYellow}${HTTPS_PORT}${conColor.Reset}, start time: (${conColor.brightGreen}${TIME.toLocaleString()}${conColor.Reset}])`
  httpsServer.listen(HTTPS_PORT, process.env.HOST, () => myLogger.log(httpsMessage));
