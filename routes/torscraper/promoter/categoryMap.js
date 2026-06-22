function norm(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function mapTorrentCategory(category, torrentName = '') {
  const text = `${norm(category)} ${norm(torrentName)}`;

  if (/\b(tv|television|tv shows?|series|episodes?)\b/.test(text)) {
    return {
      general_category: 'video',
      specific_category: 'television'
    };
  }

  if (/\b(animated|animation|anime|cartoons?|toon)\b/.test(text)) {
    return {
      general_category: 'video',
      specific_category: 'animated'
    };
  }

  if (/\b(movies?|films?|cinema|bluray|brrip|webrip|web-dl|dvdrip|x264|x265|h264|h265)\b/.test(text)) {
    return {
      general_category: 'video',
      specific_category: 'film'
    };
  }

  if (/\b(audiobooks?|audio books?)\b/.test(text)) {
    return {
      general_category: 'audiobook',
      specific_category: null
    };
  }

  if (/\b(music|albums?|discography|flac|mp3)\b/.test(text)) {
    return {
      general_category: 'music',
      specific_category: null
    };
  }

  if (/\b(audio)\b/.test(text)) {
    return {
      general_category: 'audio',
      specific_category: null
    };
  }

  if (/\b(ebooks?|books?|epub|mobi|pdf)\b/.test(text)) {
    return {
      general_category: 'ebook',
      specific_category: null
    };
  }

  if (/\b(courses?|course)\b/.test(text)) {
    return {
      general_category: 'Ebook/Course',
      specific_category: null
    };
  }

  if (/\b(tutorials?|training)\b/.test(text)) {
    return {
      general_category: 'tutorial',
      specific_category: null
    };
  }

  if (/\b(games?|pc game|xbox|playstation|nintendo)\b/.test(text)) {
    return {
      general_category: 'game',
      specific_category: null
    };
  }

  if (/\b(software|apps?|applications?|windows|linux|macos)\b/.test(text)) {
    return {
      general_category: 'software',
      specific_category: null
    };
  }

  if (/\b(comics?|manga)\b/.test(text)) {
    return {
      general_category: 'comics',
      specific_category: null
    };
  }

  if (/\b(education|educational)\b/.test(text)) {
    return {
      general_category: 'education',
      specific_category: null
    };
  }

  return {
    general_category: 'unknown',
    specific_category: null
  };
}
