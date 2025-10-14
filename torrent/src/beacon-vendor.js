import angular from "angular";
import "angular-route";
import "angular-sanitize";
import "angular-ui-grid/ui-grid.js";
import "angular-ui-grid/ui-grid.resize-columns.js";
import "angular-ui-grid/ui-grid.selection.js";
import "ng-file-upload/dist/ng-file-upload.js";
import "ng-notify/dist/ng-notify.min.js";
import moment from "moment";
import WebTorrent from "webtorrent/webtorrent.min.js";

// Ensure Angular modules register on the shared angular instance.
const globalScope = typeof window !== "undefined" ? window : globalThis;

const webTorrentInstance = WebTorrent && WebTorrent.default ? WebTorrent.default : WebTorrent;

globalScope.angular = angular;
globalScope.moment = moment;
globalScope.WebTorrent = webTorrentInstance;

export { angular, moment, WebTorrent };
