

The browser extension `GatherTool DOM Saver` saves the page DOM to the table `scraped_pages`.

From there, the extension POST route `/scraper/parse/pages` gets the `content_html` field and parses
the DOM to extract the pertinent information.

The parse can be a dry run or a production run, along with a specific record, or a batch count of records. The payload is {pageId: <scraped_pages.objid>, limit: <integer>, dryRun: <Boolean>}

curl -s -X POST http://192.168.4.24:3020/scraper/parse/pages   -H 'Content-Type: application/json'   -d '{"pageId":10, "dryRun": true}' | jq

curl -s -X POST http://192.168.4.24:3020/scraper/parse/pages   -H 'Content-Type: application/json'   -d '{"pageId":10}' | jq

## Save the relevant data

Once the page is parsed. the relevant data is stored in `scraped_page_torrents`
From here the POST route `/scraper/promote/torrents` gathers and normalizes data which is then inserted into
`torrents_downloaded` (probably should rename to `torrent_archive`)

This route also has the same payload and references the scraped page id.

curl -s -X POST http://192.168.4.24:3020/scraper/promote/torrents   -H 'Content-Type: application/json'   -d '{"scrapedPageId":10}' | jq
