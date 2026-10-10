// fixture: the router table shape the stats script counts
const SCREENS = {
  '/lodge': screen(lodge, 'hall'),
  '/map': screen(() => import('./screens/map/index.js')),
  ...Object.fromEntries(
    ['face', 'hair']
      .map((id) => [`/shop/${id}`, lazy(() => market().then((m) => m.shopMarket(id)))]),
  ),
};
const router = createRouter(app, {
  '/': menu,
  ...SCREENS,
});
