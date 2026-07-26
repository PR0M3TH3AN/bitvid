import test from "node:test";
import assert from "node:assert/strict";

import { ProfilePlaylistsController } from "../js/ui/profileModal/ProfilePlaylistsController.js";

test("playlist refresh renders the list before deferred video metadata completes", async () => {
  const controller = new ProfilePlaylistsController({
    getActivePubkey: () => "a".repeat(64),
    services: {
      nostrService: {
        fetchVideosByAuthors: () => new Promise(() => {}),
      },
    },
  });
  const renders = [];
  let resolveMetadata;
  controller.listEl = {};
  controller.setLoading = () => {};
  controller.render = () => renders.push(controller.playlists.map((playlist) => playlist.id));
  controller.fetchCreatorPlaylists = async () => [{
    id: "existing",
    items: [{ type: "a", value: `30078:${"b".repeat(64)}:video` }],
  }];
  controller.mainController.services.nostrService.fetchVideosByAuthors = () =>
    new Promise((resolve) => {
      resolveMetadata = resolve;
    });

  await controller.refresh();
  assert.deepEqual(renders, [["existing"]], "list renders before metadata request settles");

  resolveMetadata();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(renders, [["existing"], ["existing"]], "metadata completion refreshes labels later");
});
