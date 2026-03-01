import { nostrClient } from "./js/nostrClientFacade.js";

async function test() {
  console.log("nostrClient methods:", Object.keys(nostrClient));
  if (nostrClient.loginWithExtension) {
    console.log("Has loginWithExtension");
  }
  if (nostrClient.signAndPublishEvent) {
    console.log("Has signAndPublishEvent");
  }
  process.exit(0);
}
test();
