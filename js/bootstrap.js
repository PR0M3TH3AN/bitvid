// js/bootstrap.js

import Application from "./app.js";
import nostrService from "./services/nostrService.js";
import r2Service from "./services/r2Service.js";
import { loadView } from "./viewManager.js";
import { setApplication, setApplicationReady } from "./applicationContext.js";

const app = new Application({
  services: {
    nostrService,
    r2Service,
  },
  loadView,
});

setApplication(app);

const appReady = app.init();
setApplicationReady(appReady);

export { app, appReady };
export default app;
