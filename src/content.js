// Every word, link and figure spec on the page lives here so Warren can edit one file.
// Unknown facts stay as visible [TODO: ...] markers on purpose: a recruiter-facing page must
// never carry an invented number, role or date. Strings in `bio` and `body` are trusted HTML.

const ACCENT = '#1f5f78';

// A track figure walks through stages as the visitor scrolls (spec section 3). Each stage has a still:
// the poster under reduced motion and ?static=1, and the first paint before the demo loads.
const trackFig = (slug, kind, { title, caption, hint, alt, size = [1280, 800], data = {}, stages, tabs }) => ({
  kind,
  hint: hint || null,
  title,
  stat: '[TODO: stat]',
  caption,
  alt,
  size,
  data: { accent: ACCENT, ...data },
  stages: stages.map(([label, stillAlt], i) => ({ label, still: `stills/${slug}-s${i}.webp`, alt: stillAlt || label })),
  // A feature track groups its stages under tabs: [label, first stage].
  tabs: tabs ? tabs.map(([label, first]) => ({ label, first })) : null,
});

export const content = {
  name: 'Warren Sun',
  email: 'warren.sun9@gmail.com',
  links: {
    resume: 'resume.pdf',
    github: 'https://github.com/warrensunion',
    linkedin: 'https://www.linkedin.com/in/warren-sun-b2b113323',
  },

  // One paragraph, at most 220 visible characters: it must stay within 3 lines at 1440px.
  bio: [
    'I study Software Engineering at the University of Waterloo, after MacNeill Secondary in Richmond, BC. ' +
      'I&rsquo;m building <a href="#building">BTTRURSLF</a>, and I make <a href="#projects">ML and simulation ' +
      'projects</a> and <a href="#work">websites</a>.',
  ],

  hero: {
    fig: {
      kind: 'iceberg',
      title: 'Ascent',
      stat: '[TODO: stat]',
      caption: 'The iceberg from the BTTRURSLF start screen, built from ice blocks. Scroll and the camera sinks below the waterline.',
      alt: 'An iceberg made of stacked ice blocks floating in still water, seen above and then below the waterline.',
      poster: 'posters/iceberg.webp',
      posterUnder: 'posters/iceberg-under.webp',
      size: [1200, 1200],
      data: {},
    },
  },

  sections: [
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
            'A self-improvement game: each day you show up moves you up a mountain of ten photo stages, lit by ' +
              'your live local sky and switched to night plates after sunset. Mereum, its guide, runs a hub for ' +
              'appearance, sociability and knowledge; BTTRmap routes the day&rsquo;s tasks along its streets with A*; ' +
              'and Pro is a Stripe subscription.',
            'It runs on Vite and vanilla JavaScript with four runtime dependencies, three.js among them, Supabase ' +
              'accounts and a small Node server. The face scan measures on the device with MediaPipe, taking the ' +
              'median of 20 gated frames, and Gemini only writes the words. Only Stripe&rsquo;s signed webhook ' +
              'grants Pro. A female version is in progress.',
          ],
          tags: ['JavaScript', 'Vite', 'three.js', 'Supabase', 'Gemini API', 'MediaPipe', 'Stripe', 'Node.js', 'Playwright'],
          fig: trackFig('bttrurslf', 'bttr', {
            title: 'Inside BTTRURSLF',
            caption: 'Screens recorded from the game itself. Scroll through each tab, or pick one.',
            alt: 'Recorded screens from BTTRURSLF: its climb menu, Mereum’s hub, the face scan, BTTRmap, BTTRshop and Go Pro.',
            size: [1600, 1000],
            tabs: [['Climb', 0], ['Mereum', 3], ['Face scan', 6], ['BTTRmap', 9], ['BTTRshop', 11], ['Pro', 13], ['Stats', 14]],
            stages: [
              ['Climb: begin the journey', 'The Begin journey screen over a misty mountain; a goal is set and the clouds part onto the Trailhead.'],
              ['Climb: the lake', 'The Lake stage by day, with Mereum and Onix seen from behind on a snowy ledge.'],
              ['Climb: summit at night', 'The summit at night in falling snow under a crescent moon, with the guides relit for night.'],
              ['Mereum: appearance', 'Appearance puzzle pieces fold open into cards, and Mereum offers a next step.'],
              ['Mereum: sociability', 'Sociability opens into interview prep, speaking and active listening.'],
              ['Mereum: knowledge', 'The Knowledge board for mathematics, with exercises, resources and picks beside Mereum.'],
              ['Face scan: coaching', 'The live camera on a clay head render with a face mesh and the prompt to turn the head.'],
              ['Face scan: analyzing', 'The guided scan finishes and the analysis opens on a white 3D face mask with four scores.'],
              ['Face scan: analysis', 'The 3D mask turned by drag, with one row open and its region glowing on the mask.'],
              ['BTTRmap: tasks', 'Today’s task list, with a route along the map’s streets and numbered pins.'],
              ['BTTRmap: your day', 'A day planned toward a destination, with its route drawn on the map.'],
              ['BTTRshop: ice blocks', 'Frosted ice blocks drift through fog, then a stone ring assembles round the B.'],
              ['BTTRshop: market', 'The camera dives to a B made of particles, then the gear market.'],
              ['Pro', 'The Go Pro page: free and Pro plans side by side.'],
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
          id: 'drift',
          title: 'Drift',
          href: 'https://warrensunion.github.io/drift/',
          links: [
            { label: 'Live demo', href: 'https://warrensunion.github.io/drift/' },
            { label: 'Code', href: 'https://github.com/warrensunion/drift' },
          ],
          role: '[TODO: role]',
          dates: '[TODO: dates]',
          body: [
            'Where a piece of plastic goes. A scroll story follows one bottle down to the deep sea, then a globe ' +
              '(WebGPU, with a WebGL2 fallback) lets you drop plastic and watch ten years of drift. I trained an MLP ' +
              'in PyTorch on 878,086 daily moves of NOAA drifter buoys; it runs as ONNX in a Web Worker, and each ' +
              'fragment is a cloud of 24 possible paths.',
            'The model only slightly beats plain advection, an RMSE of 21.05 against 21.78 km a day, and the site ' +
              'says so. A Salish Sea mode follows the Fraser River plume on SalishSeaCast currents, next to my ' +
              'OceanWise-funded microplastics research in Richmond, BC waterways.',
          ],
          tags: ['JavaScript', 'three.js', 'WebGPU', 'ONNX Runtime Web', 'Web Workers', 'PyTorch', 'Python', 'Vite'],
          fig: trackFig('drift', 'drift', {
            title: 'Where a piece of plastic goes',
            caption: 'Recorded from the live site, then the model’s own output replayed: 40 simulated copies of a bottle per drop site over ten years. A simulation, not observations or a forecast.',
            alt: 'Drift: a painted scroll story of a bottle sinking to the deep sea, a globe where simulated fragments drift for ten years, and a chart of the Fraser River mouth.',
            size: [1600, 1000],
            stages: [
              ['One bottle, down to the deep', 'The scroll story: a bottle on a river bank, broken at the shore, carried by currents and a gyre, down to the deep sea.'],
              ['Ten years of drift', 'A bottle dropped in the North Pacific; its 24 simulated copies spread round the gyre over ten years.'],
              ['The Fraser River mouth', 'The Salish Sea chart: a bottle dropped at the Fraser River mouth carried south by tidal currents as a plume of 64 paths.'],
              ['Where it ends up', 'Where the simulated copies end up: on a beach, out of the strait, or still floating.'],
            ],
          }),
        },
        {
          id: 'stress-test',
          title: 'Stress Test',
          href: 'https://warrensunion.github.io/stress-test/',
          links: [
            { label: 'Live demo', href: 'https://warrensunion.github.io/stress-test/' },
            { label: 'Code', href: 'https://github.com/warrensunion/stress-test' },
          ],
          role: '[TODO: role]',
          dates: '[TODO: dates]',
          body: [
            'A systems design tool for checking an architecture before building it. You sketch the components on a ' +
              'canvas, and a seeded discrete-event simulation pushes Poisson traffic through them, names the first ' +
              'bottleneck and finds the load where the design saturates.',
            'A 17-rule linter, chaos mode and an advice loop sit on top, and every suggested fix is re-simulated ' +
              'before its numbers are shown. The engine runs in a Web Worker and matches M/M/1 queueing theory within ' +
              '3% on mean time in system, from 30% to 95% load.',
          ],
          tags: ['TypeScript', 'React', 'React Flow', 'Web Workers', 'Discrete-event simulation', 'Vitest', 'Playwright'],
          fig: trackFig('stress-test', 'stresstest', {
            title: 'Run it until something breaks',
            caption: 'Recorded from the live tool, then its own simulator output for the deliberately bad preset: drag the load and watch the database saturate at 860 req/s.',
            alt: 'Stress Test simulating a seven-node architecture; the database is marked as the bottleneck and the design saturates at 860 requests per second.',
            hint: 'Drag the load slider, or let it ramp.',
            size: [1600, 1000],
            stages: [
              ['Sketch the architecture', 'A three-tier starter design on the canvas; a cache is added from the palette and connected to the API.'],
              ['Run it until something breaks', 'A live run of the deliberately bad design; the database turns red as the bottleneck and saturation is found at 860 req/s.'],
              ['Advice, re-simulated', 'The advice panel lists fixes with simulated gains; caching reads in front of the database raises saturation from 810 to 1,900 req/s.'],
              ['Read the result', 'Latency, error rate, first bottleneck and saturation tiles above per-node utilization charts.'],
            ],
          }),
        },
        {
          id: 'raingarden',
          title: 'Raingarden',
          href: 'https://warrensunion.github.io/raingarden/',
          links: [
            { label: 'Live demo', href: 'https://warrensunion.github.io/raingarden/' },
            { label: 'Code', href: 'https://github.com/warrensunion/raingarden' },
          ],
          role: '[TODO: role]',
          dates: '[TODO: dates]',
          body: [
            'Turns a phone photo of a yard into a rain garden plan. Depth Anything V2 runs on the phone to read the ' +
              'slope, a real local storm from Open-Meteo runs across a 128 by 128 grid with Green-Ampt infiltration ' +
              'and D8 routing in a Web Worker, and simulated annealing searches for the garden that keeps the most ' +
              'water within setback and 48-hour drainage rules.',
            'The photo never leaves the device. On the demo yard, a 7.7 m&sup2; garden of 24 native plants catches ' +
              '2,524 of the 2,722 litres that ran off. It grew out of the rain-garden workshops I ran for elementary ' +
              'students with The Traction Initiative.',
          ],
          tags: ['JavaScript', 'three.js', 'ONNX Runtime Web', 'Depth Anything V2', 'Web Workers', 'Open-Meteo', 'Simulated annealing', 'Vite'],
          fig: trackFig('raingarden', 'raingarden', {
            title: 'A rain garden for your yard',
            caption: 'Recorded from the live app on its demo yard and the 29 Sep 2026 Richmond storm (24.3 mm), then that storm without and with the garden it designed.',
            alt: 'Raingarden reading a yard’s slope, running a storm across it and designing a native-plant rain garden.',
            hint: 'Drag across the picture to compare.',
            size: [1600, 1000],
            stages: [
              ['Reading the slope', 'The yard photo becomes a 3D slope with contour lines, and the slope is set by hand when the reading is unsure.'],
              ['Running a real storm', 'Runoff crosses the lawn from the downspout and leaves the yard while counters for rain, runoff and soaked-in water climb.'],
              ['Designing the garden', 'Candidate gardens flicker across the lawn until one settles: 7.7 square metres, catching about 2,524 litres.'],
              ['Before and after', 'The same yard in the same storm, without a garden and with a planted rain garden holding the water.'],
            ],
          }),
        },
        {
          id: 'ghostline',
          title: 'Ghostline',
          href: 'https://warrensunion.github.io/ghostline/',
          links: [
            { label: 'Live demo', href: 'https://warrensunion.github.io/ghostline/' },
            { label: 'Code', href: 'https://github.com/warrensunion/ghostline' },
          ],
          role: '[TODO: role]',
          dates: '[TODO: dates]',
          body: [
            'A browser archery duel where a small neural net learns to play like you. You record matches against a ' +
              'practice bot, a TensorFlow.js network trains on your frames in a Web Worker, and then you fight it as ' +
              'your ghost, with saliency heat showing what it looks at.',
            'The ghost acts on every 60 Hz step through a hand-written JavaScript forward pass, 0.34 ms at the median: ' +
              '48 mirrored inputs, two hidden layers of 128 and five action heads. Held-out frames come from the end ' +
              'of each session, so near-duplicate frames cannot inflate its agreement score.',
          ],
          tags: ['JavaScript', 'TensorFlow.js', 'Web Workers', 'three.js', 'IndexedDB', 'Vite', 'Playwright'],
          fig: trackFig('ghostline', 'ghostline', {
            title: 'Duel your ghost',
            caption: 'Recorded from the live game. The ghost in these clips learned from scripted play mixed with the practice bot’s own frames.',
            alt: 'Ghostline: an archer duels a practice bot, a training screen fills its charts, then a cyan ghost archer fights back with saliency heat on.',
            size: [1600, 1000],
            stages: [
              ['You play', 'The player draws and shoots at the practice bot across a stone bridge at dusk while the recording counts frames.'],
              ['It learns', 'The training screen: loss curves fall and per-action agreement bars fill as the worker trains.'],
              ['It shoots back', 'The cyan ghost archer trades arrows with the player in a rematch.'],
              ['What it looks at', 'Cyan heat gathers on the player the ghost is watching, with its action probabilities above it.'],
            ],
          }),
        },
        {
          id: 'terrarium',
          title: 'Terrarium',
          href: null,
          links: [{ label: 'Code', href: 'https://github.com/warrensunion/terrarium' }],
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
          compact: true,
          title: 'HowPolluted',
          href: null,
          links: [{ label: 'Code', href: 'https://github.com/warrensunion/howpolluted' }],
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
            alt: 'A field with a pile of litter and a result card with a grade.',
            stages: [['Globe'], ['Ground'], ['Trash falls'], ['Grade'], ['Clean it up']],
          }),
        },
        {
          id: 'archer-hero',
          compact: true,
          title: 'Archer Hero',
          href: null,
          links: [{ label: 'Play on Roblox', href: 'https://www.roblox.com/games/126065886236053/archer-game' }],
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
            caption: 'A short sample rebuilt in three.js for this page, with its own models.',
            // In the markup from the start, so the plate never grows when the game goes live; the host hides
            // it under a lasting fallback, when there is nothing to play.
            hint: 'Click to play. WASD or arrows move, mouse turns, Q dodges, E rains arrows. Esc lets go.',
            alt: 'A low-poly archer on a dirt path through a green valley, shooting at enemies with health bars.',
            data: { roblox: 'https://www.roblox.com/games/126065886236053/archer-game' },
            stages: [['Valley'], ['Auto-aim'], ['Boss'], ['Your turn']],
          }),
        },
      ],
    },
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
            'A website and 3D blind configurator for BC Window Coverings, a family business in Richmond, BC. Seven ' +
              'kinds of blind are built in code, and a sun model set at 49.17°N lights the room by season and time ' +
              'of day. The pages are prerendered so search engines read them.',
            'A refresh matched the printed brochure: green and white, the family&rsquo;s own install photos and ' +
              'motorization clips, and faux wood blinds in the configurator. Shaders now compile in the background, ' +
              'and desktop Lighthouse performance on the configurator went from 47 to 98 (Lighthouse 12, simulated ' +
              'throttling). [TODO: link to the live site.]',
          ],
          tags: ['TypeScript', 'React', 'three.js', 'React Three Fiber', 'GSAP', 'Lenis', 'Vite', 'Playwright'],
          fig: trackFig('bcwc', 'bcwc', {
            title: 'The site',
            caption: 'The BC Window Coverings site, recorded from a local build. Scroll through its loader, gallery and configurator.',
            alt: 'A browser window showing the BC Window Coverings website: its loader, photo gallery and 3D blind configurator.',
            // The deployed site's origin, framed live at the last stage. Not deployed yet: see the README.
            data: { liveUrl: null, liveNote: '[TODO: deploy bcwc and add its URL]' },
            stages: [
              ['Loader', 'A dark room with a white faux wood blind under the logo; light floods in as the blind lifts onto the home page.'],
              ['Our work', 'The gallery of install photos filtered to blackout; a roller shade switches from raised to closed.'],
              ['Time of day', 'The configurator room with a sheer shading as the time slider runs from dawn through dusk.'],
              ['Faux wood blind', 'Faux wood blinds in the configurator: the slats tilt open, the blind rises, then lowers to 40% open.'],
              ['The configurator', 'The configurator at rest: faux wood blinds 40% open at 4 pm in summer, beside the product list.'],
            ],
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
        poster: 'posters/contests.svg',
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
      poster: 'posters/ws.webp',
      // Reduced motion: hovering or focusing project link i cross-fades to still i (same order as objects).
      posterMorph: [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => `posters/ws-${i}.webp`),
      size: [2000, 1040],
      data: {
        initials: 'WS',
        // One object per project, in page order (the contact list's order).
        objects: [
          'summit-flag',
          'drift-bottle',
          'stress-gauge',
          'raingarden-plant',
          'ghostline-ghost',
          'terrarium-jar',
          'howpolluted-globe',
          'archer-bow',
          'window-blind',
        ].map((slug) => ({
          slug,
          sample: `objects/${slug}-sample.png`,
        })),
      },
    },
  },
};
