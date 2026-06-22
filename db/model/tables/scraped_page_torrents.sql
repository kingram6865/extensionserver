CREATE TABLE IF NOT EXISTS scraped_page_torrents (
  objid INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  entry_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_update TIMESTAMP NULL DEFAULT NULL,
  scraped_page_id INT NOT NULL,
  source VARCHAR(40) NOT NULL,
  source_url TEXT NOT NULL,
  torrent_name TEXT,
  magnet_link TEXT,
  num_files INT,
  mbytes DECIMAL(18, 3),
  seeds INT,
  peers INT,
  info MEDIUMTEXT,
  category VARCHAR(100),
  trackers_json MEDIUMTEXT,
  contents_json MEDIUMTEXT,
  parser_profile VARCHAR(80),
  parser_warnings_json TEXT,

  UNIQUE KEY scraped_page_torrents_page_uq (scraped_page_id),
  KEY scraped_page_torrents_source_idx (source),
  KEY scraped_page_torrents_parser_profile_idx (parser_profile)
);

-- CREATE OR REPLACE TRIGGER tbi_new_scraped_torrent
