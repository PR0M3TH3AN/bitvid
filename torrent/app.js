/* global WebTorrent, angular, moment */

const VERSION = "1.1";

// A smaller set of WebSocket trackers for reliability.
const trackers = [
  "wss://tracker.btorrent.xyz",
  "wss://tracker.openwebtorrent.com",
];

// Basic torrent options.
const torrentOpts = { announce: trackers };
const trackerOpts = { announce: trackers };

// Simple debug logger.
function dbg(msg) {
  console.log("[DEBUG]", msg);
}

// Create a WebTorrent client.
const client = new WebTorrent({ tracker: trackerOpts });

// Angular app definition.
const app = angular.module("BTorrent", [
  "ngRoute",
  "ui.grid",
  "ui.grid.resizeColumns",
  "ui.grid.selection",
  "ngFileUpload",
  "ngNotify",
]);

/**
 * Optional: inline CSS for row lines in the grid.
 */
const styleEl = document.createElement("style");
styleEl.textContent = `
  .ui-grid-row {
    border-bottom: 1px solid var(--color-border-subtle, rgb(209 213 219));
  }
`;
document.head.appendChild(styleEl);

// Configure Angular routes.
app.config([
  "$compileProvider",
  "$locationProvider",
  "$routeProvider",
  function ($compileProvider, $locationProvider, $routeProvider) {
    // Allow magnet, blob, etc. in Angular URLs.
    $compileProvider.aHrefSanitizationWhitelist(
      /^\s*(https?|magnet|blob|javascript):/
    );
    $locationProvider.html5Mode(false).hashPrefix("");

    // Define basic routes.
    $routeProvider
      .when("/view", {
        templateUrl: "views/view.html",
        controller: "ViewCtrl",
      })
      .when("/download", {
        templateUrl: "views/download.html",
        controller: "DownloadCtrl",
      })
      .otherwise({
        templateUrl: "views/full.html",
        controller: "FullCtrl",
      });
  },
]);

// Warn user before they unload if torrents are still active.
app.run([
  "$rootScope",
  function ($rootScope) {
    window.addEventListener("beforeunload", (e) => {
      if ($rootScope.client && $rootScope.client.torrents.length > 0) {
        e.preventDefault();
        e.returnValue =
          "Transfers are in progress. Are you sure you want to leave or refresh?";
        return e.returnValue;
      }
    });
  },
]);

// Main BTorrent controller.
app.controller("BTorrentCtrl", [
  "$scope",
  "$rootScope",
  "$http",
  "$log",
  "ngNotify",
  function ($scope, $rootScope, $http, $log, ngNotify) {
    dbg("Starting app.js version " + VERSION);

    if (!WebTorrent.WEBRTC_SUPPORT) {
      ngNotify.set("Please use a browser with WebRTC support.", "error");
    }

    $rootScope.client = client;
    $rootScope.selectedTorrent = null;
    $rootScope.processing = false;

    // Global error handler.
    client.on("error", (err) => {
      dbg("Torrent client error: " + err);
      ngNotify.set(err.message || err, "error");
      $rootScope.processing = false;
    });

    /**
     * Called whenever a new torrent is added or we seed files.
     */
    $rootScope.onTorrent = function (torrent, isSeed) {
      dbg("Torrent added: " + torrent.magnetURI);
      $rootScope.processing = false;

      if (!isSeed) {
        ngNotify.set(`Received ${torrent.name} metadata`);
      }
      if (!$rootScope.selectedTorrent) {
        $rootScope.selectedTorrent = torrent;
      }

      // Generate file.blobURL for direct downloading in the file table.
      torrent.files.forEach((file) => {
        file.getBlobURL((err, url) => {
          if (!err) {
            file.url = url;
          }
        });
      });
    };

    /**
     * Add a magnet link or .torrent URL.
     */
    $rootScope.addMagnet = function (magnet) {
      if (!magnet) return;
      $rootScope.processing = true;
      dbg("Adding magnet: " + magnet);
      client.add(magnet, torrentOpts, (torrent) => {
        $rootScope.onTorrent(torrent, false);
        $scope.$applyAsync();
      });
    };

    /**
     * Seed local files.
     */
    $rootScope.seedFiles = function (files) {
      if (!files || !files.length) return;
      $rootScope.processing = true;
      dbg(`Seeding ${files.length} file(s)`);
      client.seed(files, torrentOpts, (torrent) => {
        $rootScope.onTorrent(torrent, true);
        $scope.$applyAsync();
      });
    };

    /**
     * Remove/destroy a selected torrent.
     */
    $rootScope.destroyedTorrent = function (err) {
      if (err) {
        console.error("Failed to destroy torrent:", err);
      }
      dbg("Destroyed torrent", $rootScope.selectedTorrent);
      $rootScope.selectedTorrent = null;
      $rootScope.processing = false;
    };

    /**
     * Change the priority of an individual file (high, low, or don't download).
     */
    $rootScope.changePriority = function (file) {
      if (file.priority === "-1") {
        file.deselect();
        dbg("Deselected file", file);
      } else {
        file.select(file.priority);
        dbg(`Selected with priority ${file.priority}`, file);
      }
    };

    /**
     * Download all files in the selected torrent if it's 100% done.
     * Creates a blob for each file, triggers a native download with <a>.
     */
    $rootScope.downloadAll = function (torrent) {
      if (!torrent) return;
      if (torrent.progress < 1) {
        alert("Torrent is not finished downloading yet.");
        return;
      }
      torrent.files.forEach((file) => {
        file.getBlob((err, blob) => {
          if (err) {
            console.error("Failed to get blob for file:", file.name, err);
            return;
          }
          // Create an anchor to trigger the download.
          const blobUrl = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.style.display = "none";
          a.href = blobUrl;
          a.download = file.name;
          // Append, click, remove, revoke.
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(blobUrl);
        });
      });
    };

    /**
     * Copy the magnet URI of a torrent to the clipboard.
     */
    $rootScope.copyMagnetURI = function (torrent) {
      if (!torrent || !torrent.magnetURI) return;
      const magnetURI = torrent.magnetURI;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard
          .writeText(magnetURI)
          .then(() =>
            ngNotify.set("Magnet URI copied to clipboard!", "success")
          )
          .catch((err) => {
            console.error("Clipboard error:", err);
            ngNotify.set("Failed to copy magnet URI", "error");
          });
      } else {
        try {
          const textarea = document.createElement("textarea");
          textarea.value = magnetURI;
          textarea.style.position = "fixed";
          textarea.style.left = "-9999px";
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand("copy");
          document.body.removeChild(textarea);
          ngNotify.set("Magnet URI copied (fallback)!", "success");
        } catch (err) {
          console.error("Clipboard fallback error:", err);
          ngNotify.set("Failed to copy magnet URI", "error");
        }
      }
    };

    /**
     * Save the .torrent file itself (via torrent.torrentFileBlobURL).
     */
    $rootScope.saveTorrentFile = function (torrent) {
      if (!torrent || !torrent.torrentFileBlobURL) return;
      const fileName = torrent.fileName || `${torrent.name}.torrent`;
      // Create a hidden <a> to force download of the .torrent file.
      const a = document.createElement("a");
      a.style.display = "none";
      a.href = torrent.torrentFileBlobURL;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    };
  },
]);

// FullCtrl: sets up the ui-grid and magnet input for /full route.
app.controller("FullCtrl", [
  "$scope",
  "$rootScope",
  "$location",
  "ngNotify",
  function ($scope, $rootScope, $location, ngNotify) {
    // Handle magnet input
    $scope.addMagnet = function () {
      $rootScope.addMagnet($scope.torrentInput);
      $scope.torrentInput = "";
    };

    // If we have a #magnet in the URL, add it automatically
    if ($location.hash()) {
      $rootScope.addMagnet($location.hash());
    }

    // Define columns for ui-grid.
    $scope.columns = [
      { field: "name", displayName: "Name", minWidth: 200 },
      {
        field: "progress",
        displayName: "Progress",
        cellFilter: "progress",
        width: 100,
      },
      {
        field: "downloadSpeed",
        displayName: "↓ Speed",
        cellFilter: "pbytes:1",
        width: 100,
      },
      {
        field: "uploadSpeed",
        displayName: "↑ Speed",
        cellFilter: "pbytes:1",
        width: 100,
      },
      { field: "numPeers", displayName: "Peers", width: 80 },
      {
        field: "ratio",
        displayName: "Ratio",
        cellFilter: "number:2",
        width: 80,
      },
    ];

    // Create gridOptions and update each second.
    $scope.gridOptions = {
      columnDefs: $scope.columns,
      enableColumnResizing: true,
      enableColumnMenus: false,
      enableRowSelection: true,
      enableRowHeaderSelection: false,
      multiSelect: false,
      data: [],
    };

    setInterval(() => {
      $scope.gridOptions.data =
        ($rootScope.client && $rootScope.client.torrents) || [];
      $scope.$applyAsync();
    }, 1000);

    // On row selection, set the selectedTorrent
    $scope.gridOptions.onRegisterApi = function (gridApi) {
      $scope.gridApi = gridApi;
      gridApi.selection.on.rowSelectionChanged($scope, function (row) {
        if (row.isSelected) {
          $rootScope.selectedTorrent = row.entity;
        } else {
          $rootScope.selectedTorrent = null;
        }
      });
    };
  },
]);

// DownloadCtrl / ViewCtrl are minimal in this example.
app.controller("DownloadCtrl", [
  "$scope",
  "$rootScope",
  "$location",
  function ($scope, $rootScope, $location) {
    $scope.addMagnet = function () {
      $rootScope.addMagnet($scope.torrentInput);
      $scope.torrentInput = "";
    };
    if ($location.hash()) {
      $rootScope.addMagnet($location.hash());
    }
  },
]);

app.controller("ViewCtrl", [
  "$scope",
  "$rootScope",
  "$location",
  function ($scope, $rootScope, $location) {
    $scope.addMagnet = function () {
      $rootScope.addMagnet($scope.torrentInput);
      $scope.torrentInput = "";
    };
    if ($location.hash()) {
      $rootScope.addMagnet($location.hash());
    }
  },
]);

// Angular filters for size, progress, etc.
app.filter("pbytes", function () {
  return function (num, speed) {
    if (isNaN(num)) return "";
    if (num < 1) return speed ? "" : "0 B";
    const units = ["B", "kB", "MB", "GB", "TB"];
    const exponent = Math.min(Math.floor(Math.log(num) / Math.log(1000)), 4);
    const val = (num / Math.pow(1000, exponent)).toFixed(1) * 1;
    return `${val} ${units[exponent]}${speed ? "/s" : ""}`;
  };
});

app.filter("progress", function () {
  return function (val) {
    if (typeof val !== "number") return "";
    return (val * 100).toFixed(1) + "%";
  };
});

app.filter("html", [
  "$sce",
  function ($sce) {
    return function (input) {
      return $sce.trustAsHtml(input);
    };
  },
]);

app.filter("humanTime", function () {
  return function (millis) {
    if (millis < 1000) return "";
    const duration = moment.duration(millis).humanize();
    return duration.charAt(0).toUpperCase() + duration.slice(1);
  };
});
