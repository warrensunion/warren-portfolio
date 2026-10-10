// fixture
export const ROUTES = {
  ...Object.fromEntries(['face', 'hair'].flatMap((a) => [
    [`/api/${a}/scan`, scan(a)],
    [`/api/${a}/chat`, json(a, 'chat', 'chat')],
  ])),
  '/api/motivator/chat': json('motivator', 'chat', 'motivator'),
};
