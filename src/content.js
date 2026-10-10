// Every word, link and figure spec on the page lives here so Warren can edit one file.
// Unknown facts stay as visible [TODO: ...] markers on purpose: a recruiter-facing page must
// never carry an invented number, role or date. Strings in `bio` and `body` are trusted HTML.

const ACCENT = '#1f5f78';

// A track figure walks through stages as the visitor scrolls (spec section 3). Each stage has a still:
// the poster under reduced motion and ?static=1, and the first paint before the demo loads.
const trackFig = (slug, kind, { title, caption, alt, size = [1280, 800], data = {}, stages }) => ({
  kind,
  title,
  stat: '[TODO: stat]',
  caption,
  alt,
  size,
  data: { accent: ACCENT, ...data },
  stages: stages.map(([label, stillAlt], i) => ({ label, still: `/stills/${slug}-s${i}.webp`, alt: stillAlt || label })),
});

export const content = {
  name: 'Warren Sun',
  email: 'warren.sun9@gmail.com',
  links: {
    resume: '/resume.pdf',
    github: 'https://github.com/warrensunion',
    linkedin: 'https://www.linkedin.com/in/warren-sun-b2b113323',
  },

  // One paragraph, at most 220 visible characters: it must stay within 3 lines at 1440px.
  bio: [
    'I study Software Engineering at Waterloo, after MacNeill Secondary in Richmond, BC. ' +
      'I&rsquo;m building <a href="#building">BTTRURSLF</a> and made ' +
      '<a href="#work">a website</a> and <a href="#projects">a Roblox game</a>.',
  ],

  hero: {
    fig: {
      kind: 'iceberg',
      title: 'Ascent',
      stat: '[TODO: stat]',
      caption: 'The iceberg from the BTTRURSLF start screen, built from ice blocks. Scroll and the camera sinks below the waterline.',
      alt: 'An iceberg made of stacked ice blocks floating in still water, seen above and then below the waterline.',
      poster: '/posters/iceberg.webp',
      posterUnder: '/posters/iceberg-under.webp',
      size: [1200, 1200],
      data: {},
    },
  },

  sections: [
    {
      id: 'work',
      title: 'Work',
      entries: [
        {
          id: 'bcwc',
          title: 'BC Window Coverings',
          href: null,
          role: '[TODO: role]',
          dates: '[TODO: dates]',
          body: [
            'A website and 3D blind configurator for BC Window Coverings, a business in Richmond, BC. Seven ' +
              'kinds of blind are built in code, from venetian to ripplefold drapery, and a sun model set at ' +
              '49.17°N lights the room by season and time of day. Every page change plays its own blind ' +
              'transition, and the pages are prerendered so search engines read them. ' +
              '[TODO: one result with a real number.]',
            '[TODO: link to the live site.]',
          ],
          tags: ['TypeScript', 'React', 'three.js', 'React Three Fiber', 'GSAP', 'Lenis', 'Vite'],
          fig: trackFig('bcwc', 'bcwc', {
            title: 'The site, live',
            caption: 'The BC Window Coverings site in a browser frame. Scroll through its loader and sliders, then use it.',
            alt: 'A browser window showing the BC Window Coverings website and its blind configurator.',
            stages: [['Loader'], ['Blind transition'], ['Time of day'], ['Blind'], ['Try it']],
          }),
        },
      ],
    },
    {
      id: 'building',
      title: 'Building',
      entries: [
        {
          id: 'bttrurslf',
          feature: true,
          title: 'BTTRURSLF',
          href: null,
          role: '[TODO: role]',
          dates: '[TODO: dates]',
          body: [
            'A self-improvement game: your progress in real life, in appearance, knowledge and sociability, ' +
              'becomes a climb up a mountain. It runs on Vite and vanilla ES modules with no framework, and ' +
              'three.js draws the 3D screens, including the iceberg at the top of this page.',
            'Accounts run on Supabase. Gemini sits behind a small server layer so API keys never reach the ' +
              'browser, and face and body scans are measured on the device with MediaPipe. The server guards ' +
              'its routes with a same-origin check, per-route rate limits, a honeypot field and a proof of work. ' +
              'Playwright scripts screenshot its screens to catch broken layouts.',
          ],
          tags: ['JavaScript', 'Vite', 'three.js', 'Supabase', 'Gemini API', 'MediaPipe', 'Playwright'],
          fig: trackFig('bttrurslf', 'bttr', {
            title: 'Inside BTTRURSLF',
            caption: 'Screens recorded from the game itself. Scroll through each tab, or pick one.',
            alt: 'Recorded screens from BTTRURSLF: its dashboard, shop, motivator, Ping and map.',
            size: [1600, 1000],
            data: { tabs: ['Appearance', 'BTTRshop', 'Motivator', 'Knowledge & Sociability', 'BTTRmap', 'Stats'] },
            stages: [
              ['Appearance: cards open'], ['Appearance: ask Mereum'], ['Appearance: Mereum answers'],
              ['BTTRshop: ice blocks'], ['BTTRshop: stone ring'], ['BTTRshop: particle B'], ['BTTRshop: market'],
              ['Motivator: hub'], ['Motivator: quotes'], ['Motivator: edits'],
              ['Knowledge: Ping'], ['Sociability: Ping'],
              ['BTTRmap: route'], ['BTTRmap: city'],
              ['Stats'],
            ],
          }),
        },
      ],
    },
    {
      id: 'projects',
      title: 'Projects',
      entries: [
        {
          id: 'terrarium',
          title: 'Terrarium',
          href: null,
          role: '[TODO: role]',
          dates: '[TODO: dates]',
          body: [
            'A glass jar of creatures that evolve. Each one has a body genome and a NEAT neural network for a ' +
              'brain; they eat, mate and die, and the population splits into species over the generations. ' +
              'The simulation is pure and seeded, so the same seed always grows the same history, and it runs in ' +
              'a Web Worker while three.js draws the jar.',
            '[TODO: one number, such as generations simulated or a launch date.]',
          ],
          tags: ['JavaScript', 'three.js', 'Web Workers', 'NEAT', 'Vite'],
          fig: trackFig('terrarium', 'terrarium', {
            title: 'Terrarium',
            caption: 'A small world from a fixed seed, run live. Drag to turn the jar; click a creature to see its brain.',
            alt: 'A glass jar with moss and small segmented creatures, a chart of species over time, and a neural network.',
            stages: [['The jar'], ['Generations'], ['Species split'], ['Brains'], ['Your turn']],
          }),
        },
        {
          id: 'howpolluted',
          title: 'HowPolluted',
          href: null,
          role: '[TODO: role]',
          dates: '[TODO: dates]',
          body: [
            'Pick any spot on a globe and see how polluted it is. The ground type comes from ESA WorldCover, ' +
              'litter piles up on land or a spill spreads on water, and the place gets one of five grades, from ' +
              'Good to Poor. Every number on its result card is tagged as measured, modelled or an estimate.',
            '[TODO: one number, such as places checked or a launch date.]',
          ],
          tags: ['JavaScript', 'three.js', 'Canvas 2D', 'ESA WorldCover', 'Vite'],
          fig: trackFig('howpolluted', 'howpolluted', {
            title: 'HowPolluted, demo',
            caption: 'A demo with fixed numbers, not a measurement. Pick up the trash and watch the grade recover.',
            alt: 'A globe, then a field with litter falling into a pile, then a result card with a grade.',
            stages: [['Globe'], ['Ground'], ['Trash falls'], ['Grade'], ['Clean it up']],
          }),
        },
        {
          id: 'archer-hero',
          title: 'Archer Hero',
          href: null,
          role: '[TODO: role]',
          dates: '[TODO: dates]',
          body: [
            'An archery combat game on Roblox, written in Lua in Roblox Studio. The archer aims on its own; ' +
              'players move, dodge and time their skills through 50 stages with bosses, relics and collectibles. ' +
              '[TODO: release status.] [TODO: player count.]',
            '[TODO: the part you built.]',
          ],
          tags: ['Lua', 'Roblox Studio'],
          fig: trackFig('archer-hero', 'archer', {
            title: 'A stage to play',
            caption: 'A short sample rebuilt in three.js for this page, with its own models. Click to play.',
            alt: 'A low-poly archer on a dirt path through a green valley, shooting at enemies with health bars.',
            data: { roblox: 'https://www.roblox.com/games/126065886236053/archer-game' },
            stages: [['Valley'], ['Auto-aim'], ['Boss'], ['Your turn']],
          }),
        },
      ],
    },
    {
      id: 'contests',
      title: 'Contests and awards',
      lede: 'Each dot is one contest, placed by how far up the field I finished.',
      entries: [],
      fig: {
        kind: 'contests',
        title: 'Placement over time',
        stat: '[TODO: stat]',
        caption: 'Placement percentile by year.',
        poster: '/posters/contests.svg',
        size: [1280, 800],
        data: {},
      },
    },
    { id: 'contact', title: 'Get in touch', entries: [] },
  ],

  contests: [
    { name: '[TODO: contest name]', year: '[TODO: year]', result: '[TODO: result]', placeholder: true },
    { name: '[TODO: award name]', year: '[TODO: year]', result: '[TODO: result]', placeholder: true },
  ],

  touch: {
    line: 'I&rsquo;m looking for [TODO: co-op term] co-op roles. Email is the fastest way to reach me.',
    hint: 'Click to copy, or press e anywhere.',
    projectsLine: 'The projects on this page:',
    fig: {
      kind: 'ring',
      title: 'Ring',
      stat: '[TODO: stat]',
      caption: 'A stone ring, and particles that spell my initials. Hover or focus a project to reshape them.',
      alt: 'A stone ring with a cloud of particles inside it forming the letters WS.',
      poster: '/posters/ws.webp',
      // Reduced motion: hovering or focusing project link i cross-fades to still i (same order as objects).
      posterMorph: [0, 1, 2, 3, 4].map((i) => `/posters/ws-${i}.webp`),
      size: [2000, 1040],
      data: {
        initials: 'WS',
        objects: ['window-blind', 'summit-flag', 'terrarium-jar', 'howpolluted-globe', 'archer-bow'].map((slug) => ({
          slug,
          sample: `/objects/${slug}-sample.png`,
        })),
      },
    },
  },
};

