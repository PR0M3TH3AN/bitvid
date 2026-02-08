import test from "node:test";
import { renderChannelVideosFromList } from "../js/channelProfile.js";

test("can import channelProfile", () => {
  if (typeof renderChannelVideosFromList !== "function") {
    throw new Error("Import failed");
  }
});
