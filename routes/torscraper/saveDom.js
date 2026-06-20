import { validateDomPayload } from './validateDomPayload';

export const saveDom = {
  path: '/scraper/save/dom',
  method: 'post',
  handler: async (req, res, next) => {
    try {
      const validation = validateDomPayload(req.body);
      if (!validation.ok) {
        return res.status(400).json({
          ok: false,
          accepted: false,
          errors: validation.errors
        });
      }

      const payload = validation.payload;
      return res.status(202).json({
        ok: true,
        accepted: true,
        message: 'DOM payload accepted',
        source: payload.source,
        pageType: payload.pageType,
        url: payload.url,
        hostname: payload.hostname,
        pathname: payload.pathname,
        domLength: payload.domLength,
        capturedAt: payload.capturedAt,
        receivedAt: new Date().toISOString()
      });
    } catch (err) {
      req.log?.error('scraper.save.dom.fail', { error: err.message });
      next(err);
    }
  }
}
