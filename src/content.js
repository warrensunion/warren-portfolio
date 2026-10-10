// Every word, link and figure spec on the page lives here so Warren can edit one file.
// Unknown facts stay as visible [TODO: ...] markers on purpose: a recruiter-facing page must
// never carry an invented number, role or date. Strings in `bio` and `body` are trusted HTML.

const ACCENT = '#1f5f78';

const objectFig = (slug, { title, shape, label, alt, caption }) => ({
  kind: 'iceblock',
  title,
  stat: '[TODO: stat]',
  caption,
  alt,
  poster: `/posters/${slug}.webp`,
  size: [1200, 900],
  data: { object: `/objects/${slug}.webp`, shape, label, accent: ACCENT },
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
          title: 'BC Window Coverings',
          href: null,
          role: '[TODO: role]',
          dates: '[TODO: dates]',
          body: [
            'I worked on the website for BC Window Coverings, a business in Richmond, BC. ' +
              '[TODO: what you built, the tools you used, and one result with a real number.]',
            '[TODO: link to the live site.]',
          ],
          tags: ['Web', '[TODO: stack]'],
          fig: objectFig('window-blind', {
            title: 'Window blind',
            shape: 'knowledge',
            label: 'BC WINDOW COVERINGS',
            alt: 'A marble window blind frozen inside a block of ice.',
            caption: 'A window blind for BC Window Coverings, frozen in ice.',
          }),
        },
      ],
    },
    {
      id: 'building',
      title: 'Building',
      entries: [
        {
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
              'Playwright scripts screenshot every screen to catch broken layouts. [TODO: one number, such as users or launch date.]',
          ],
          tags: ['JavaScript', 'Vite', 'three.js', 'Supabase', 'Gemini API', 'MediaPipe', 'Playwright'],
          fig: objectFig('summit-flag', {
            title: 'Summit flag',
            shape: 'physique',
            label: 'BTTRURSLF',
            alt: 'A marble summit flag frozen inside a block of ice.',
            caption: 'The flag at the top of the BTTRmountain, frozen in ice.',
          }),
        },
      ],
    },
    {
      id: 'projects',
      title: 'Projects',
      entries: [
        {
          title: 'Archer Hero',
          href: null,
          role: '[TODO: role]',
          dates: '[TODO: dates]',
          body: [
            'A combat game on Roblox, written in Lua in Roblox Studio. ' +
              '[TODO: what players do, the part you built, and one number such as visits or players.]',
            '[TODO: link to the game.]',
          ],
          tags: ['Lua', 'Roblox Studio'],
          fig: objectFig('archer-bow', {
            title: 'Bow',
            shape: 'face',
            label: 'ARCHER HERO',
            alt: 'A marble bow frozen inside a block of ice.',
            caption: 'The bow from Archer Hero, frozen in ice.',
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
      size: [2000, 1040],
      data: {
        initials: 'WS',
        objects: ['window-blind', 'summit-flag', 'archer-bow'].map((slug) => ({
          slug,
          sample: `/objects/${slug}-sample.png`,
        })),
      },
    },
  },
};

