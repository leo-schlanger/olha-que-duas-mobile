import {
  classifyEntry,
  findEntryByStreamTitle,
  pickAudibleEntry,
  IDLE_DATA,
  AzuraNowPlayingPayload,
} from '../../services/nowPlayingService';

jest.mock('react-native', () => ({
  AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })), currentState: 'active' },
}));
jest.mock('react-native-sse', () => jest.fn());

const ART = 'https://radio.olhaqueduas.com/api/station/olha_que_duas/art/';

// Shape taken from the real API (02/10/2026): an ad between two songs.
const payload: AzuraNowPlayingPayload = {
  live: { is_live: false, streamer_name: '' },
  now_playing: {
    played_at: 1790974231,
    duration: 267,
    playlist: 'Noite Duas',
    song: {
      text: 'Tame Impala - Loser',
      title: 'Loser',
      artist: 'Tame Impala',
      art: `${ART}a.jpg`,
    },
  },
  playing_next: {
    played_at: 1790974494,
    duration: 209,
    playlist: 'Noite Duas',
    song: {
      text: 'Bárbara Bandeira - Como Tu (feat. Ivandro)',
      title: 'Como Tu (feat. Ivandro)',
      artist: 'Bárbara Bandeira',
      art: `${ART}b.jpg`,
    },
  },
  song_history: [
    {
      played_at: 1790973990,
      duration: 228,
      playlist: 'Noite Duas',
      song: { text: 'Taylor Swift - Fortnight', title: 'Fortnight', artist: 'Taylor Swift' },
    },
    {
      played_at: 1790973975,
      duration: 15,
      playlist: 'Anúncios',
      song: {
        text: 'O Boticário - Anúncios - Floratta Rose Bouquet',
        title: 'Anúncios - Floratta Rose Bouquet',
        artist: 'O Boticário',
        art: `${ART}ad.jpg`,
      },
    },
  ],
};

describe('classifyEntry (same rules as the site)', () => {
  it('shows a 15s ad from the "Anúncios" playlist as an announcement with its artwork', () => {
    const ad = findEntryByStreamTitle(payload, 'O Boticário - Anúncios - Floratta Rose Bouquet');
    const data = classifyEntry(payload, ad);
    expect(data.mode).toBe('announcement');
    expect(data.announcementName).toBe('Anúncios - Floratta Rose Bouquet');
    expect(data.announcementArt).toBe(`${ART}ad.jpg`);
  });

  it('keeps an ad as announcement even when it is long and has an artist', () => {
    const data = classifyEntry(payload, {
      duration: 90,
      playlist: 'Anúncios',
      song: { title: 'Campanha', artist: 'Marca', art: 'x' },
    });
    expect(data.mode).toBe('announcement');
  });

  it('treats "Especial do Dia" as music, not as an announcement', () => {
    const data = classifyEntry(payload, {
      duration: 180,
      playlist: 'Especial do Dia',
      song: { title: 'Canção', artist: 'Artista', art: 'x' },
    });
    expect(data.mode).toBe('music');
  });

  it('accepts short legit songs (>= 25s)', () => {
    const data = classifyEntry(payload, {
      duration: 30,
      playlist: 'Noite Duas',
      song: { title: 'Interlúdio', artist: 'Artista' },
    });
    expect(data.mode).toBe('music');
  });

  it('shows the station identity during jingles and gaps', () => {
    expect(
      classifyEntry(payload, {
        duration: 8,
        playlist: 'Jingles',
        song: { title: 'Vinheta 1', artist: 'OQD' },
      })
    ).toEqual(IDLE_DATA);
    expect(classifyEntry(payload, undefined)).toEqual(IDLE_DATA);
  });

  it('live show has priority over everything', () => {
    const data = classifyEntry(
      { ...payload, live: { is_live: true, streamer_name: ' Motivar ' } },
      payload.now_playing
    );
    expect(data.mode).toBe('liveShow');
    expect(data.liveShowName).toBe('Motivar');
  });
});

describe('findEntryByStreamTitle (ICY sync)', () => {
  it('finds the next track before the API promotes it to now_playing', () => {
    // ICY text varies in case/spacing; the API entry must still be found.
    const entry = findEntryByStreamTitle(payload, 'BÁRBARA BANDEIRA  -  Como Tu (feat.  Ivandro)');
    expect(entry?.song?.art).toBe(`${ART}b.jpg`);
  });

  it('builds the text from artist + title when the API has no text field', () => {
    const entry = findEntryByStreamTitle(
      { now_playing: { song: { title: 'Loser', artist: 'Tame Impala' } } },
      'TAME IMPALA - LOSER'
    );
    expect(entry?.song?.title).toBe('Loser');
  });

  it('matches "Artist - Title" when the API text also carries the album', () => {
    const entry = findEntryByStreamTitle(
      {
        playing_next: {
          song: {
            text: 'Marisa Liz - Relatos De Um Coração Confuso - Vício Difícil',
            artist: 'Marisa Liz',
            title: 'Vício Difícil',
            art: 'cover.jpg',
          },
        },
      },
      'Marisa Liz - Vício Difícil'
    );
    expect(entry?.song?.art).toBe('cover.jpg');
  });

  it('returns undefined for an unknown title', () => {
    expect(findEntryByStreamTitle(payload, 'Outra - Coisa')).toBeUndefined();
  });
});

describe('pickAudibleEntry (fallback without ICY)', () => {
  it('uses the listener delay so the previous track still counts as audible', () => {
    const entry = pickAudibleEntry(payload.now_playing, payload.song_history ?? [], 1790974222);
    expect(entry?.song?.title).toBe('Fortnight');
  });
});
