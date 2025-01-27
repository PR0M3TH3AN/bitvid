/* global WebTorrent, angular, moment, prompt */

const VERSION = '1.1'
const trackers = ['wss://tracker.btorrent.xyz', 'wss://tracker.openwebtorrent.com']
const rtcConfig = {
  'iceServers': [
    {
      'urls': ['stun:stun.l.google.com:19305', 'stun:stun1.l.google.com:19305']
    }
  ]
}

const torrentOpts = {
  announce: trackers
}

const trackerOpts = {
  announce: trackers,
  rtcConfig: rtcConfig
}

const debug = window.localStorage.getItem('debug') !== null

function dbg (message, item, color = '#333333') {
  if (debug) {
    if (item && item.name) {
      console.debug(
        `%cβTorrent:${item.infoHash ? 'torrent ' : 'torrent ' + item._torrent.name + ':file '}${item.name}${item.infoHash ? ' (' + item.infoHash + ')' : ''} %c${message}`,
        'color: #33C3F0',
        `color: ${color}`
      )
    } else {
      console.debug(`%cβTorrent:client %c${message}`, 'color: #33C3F0', `color: ${color}`)
    }
  }
}

function er (err, item) {
  dbg(err, item, '#FF0000')
}

dbg(`Starting v${VERSION}. WebTorrent ${WebTorrent.VERSION}`)

// Create WebTorrent client
const client = new WebTorrent({ tracker: trackerOpts })

// Angular app
const app = angular.module('BTorrent', [
  'ngRoute',
  'ui.grid',
  'ui.grid.resizeColumns',
  'ui.grid.selection',
  'ngFileUpload',
  'ngNotify'
], [
  '$compileProvider',
  '$locationProvider',
  '$routeProvider',
  function ($compileProvider, $locationProvider, $routeProvider) {
    // Allow magnet: and blob: links
    $compileProvider.aHrefSanitizationWhitelist(/^\s*(https?|magnet|blob|javascript):/)

    // Disable HTML5 mode, only use # routing so no rewrites are needed
    $locationProvider.html5Mode(false).hashPrefix('')

    // Define routes
    $routeProvider
      .when('/view', {
        templateUrl: 'views/view.html',
        controller: 'ViewCtrl'
      })
      .when('/download', {
        templateUrl: 'views/download.html',
        controller: 'DownloadCtrl'
      })
      .otherwise({
        templateUrl: 'views/full.html',
        controller: 'FullCtrl'
      })
  }
])

app.controller('BTorrentCtrl', [
  '$scope',
  '$rootScope',
  '$http',
  '$log',
  '$location',
  'ngNotify',
  function ($scope, $rootScope, $http, $log, $location, ngNotify) {
    $rootScope.version = VERSION
    $rootScope.webtorrentVersion = WebTorrent.VERSION

    ngNotify.config({
      duration: 5000,
      html: true
    })

    if (!WebTorrent.WEBRTC_SUPPORT) {
      $rootScope.disabled = true
      ngNotify.set('Please use a WebRTC compatible browser', {
        type: 'error',
        sticky: true,
        button: false
      })
    }

    $rootScope.client = client

    function updateAll () {
      if (!$rootScope.client.processing) {
        $rootScope.$applyAsync()
      }
    }

    setInterval(updateAll, 500)

    $rootScope.seedFiles = function (files) {
      if (files && files.length > 0) {
        dbg(`Seeding ${files.length} file(s)`)
        $rootScope.client.processing = true
        $rootScope.client.seed(files, torrentOpts, $rootScope.onSeed)
      }
    }

    $rootScope.openTorrentFile = function (file) {
      if (file) {
        dbg(`Adding torrent file ${file.name}`)
        $rootScope.client.processing = true
        $rootScope.client.add(file, torrentOpts, $rootScope.onTorrent)
      }
    }

    $rootScope.client.on('error', function (err, torrent) {
      $rootScope.client.processing = false
      ngNotify.set(err, 'error')
      er(err, torrent)
    })

    $rootScope.addMagnet = function (magnet, onTorrent) {
      if (magnet && magnet.length > 0) {
        dbg(`Adding magnet/hash ${magnet}`)
        $rootScope.client.processing = true
        $rootScope.client.add(magnet, torrentOpts, onTorrent || $rootScope.onTorrent)
      }
    }

    $rootScope.destroyedTorrent = function (err) {
      if (err) throw err
      dbg('Destroyed torrent', $rootScope.selectedTorrent)
      $rootScope.selectedTorrent = null
      $rootScope.client.processing = false
    }

    $rootScope.changePriority = function (file) {
      if (file.priority === '-1') {
        dbg('Deselected', file)
        file.deselect()
      } else {
        dbg(`Selected with priority ${file.priority}`, file)
        file.select(file.priority)
      }
    }

    $rootScope.onTorrent = function (torrent, isSeed) {
      dbg(torrent.magnetURI)
      torrent.safeTorrentFileURL = torrent.torrentFileBlobURL
      torrent.fileName = `${torrent.name}.torrent`
      if (!isSeed) {
        dbg('Received metadata', torrent)
        ngNotify.set(`Received ${torrent.name} metadata`)
        if (!$rootScope.selectedTorrent) {
          $rootScope.selectedTorrent = torrent
        }
        $rootScope.client.processing = false
      }
      torrent.files.forEach(function (file) {
        file.getBlobURL(function (err, url) {
          if (err) throw err
          file.url = url
          if (isSeed) {
            dbg('Started seeding', torrent)
            if (!$rootScope.selectedTorrent) {
              $rootScope.selectedTorrent = torrent
            }
            $rootScope.client.processing = false
          } else {
            dbg('Done ', file)
            ngNotify.set(`<b>${file.name}</b> ready for download`, 'success')
          }
        })
      })
      torrent.on('done', function () {
        if (!isSeed) {
          dbg('Done', torrent)
          ngNotify.set(`<b>${torrent.name}</b> has finished downloading`, 'success')
        }
      })
      torrent.on('wire', function (wire, addr) {
        dbg(`Wire ${addr}`, torrent)
      })
      torrent.on('error', er)
    }

    $rootScope.onSeed = function (torrent) {
      $rootScope.onTorrent(torrent, true)
    }

    dbg('Angular ready')
  }
])

// Full View Controller
app.controller('FullCtrl', [
  '$scope',
  '$rootScope',
  '$http',
  '$log',
  '$location',
  'ngNotify',
  function ($scope, $rootScope, $http, $log, $location, ngNotify) {
    ngNotify.config({
      duration: 5000,
      html: true
    })
    $scope.addMagnet = function () {
      $rootScope.addMagnet($scope.torrentInput)
      $scope.torrentInput = ''
    }

    $scope.columns = [
      { field: 'name', cellTooltip: true, minWidth: 200 },
      { field: 'length', name: 'Size', cellFilter: 'pbytes', width: 80 },
      { field: 'received', displayName: 'Downloaded', cellFilter: 'pbytes', width: 135 },
      { field: 'downloadSpeed', displayName: '↓ Speed', cellFilter: 'pbytes:1', width: 100 },
      { field: 'progress', displayName: 'Progress', cellFilter: 'progress', width: 100 },
      { field: 'timeRemaining', displayName: 'ETA', cellFilter: 'humanTime', width: 140 },
      { field: 'uploaded', displayName: 'Uploaded', cellFilter: 'pbytes', width: 125 },
      { field: 'uploadSpeed', displayName: '↑ Speed', cellFilter: 'pbytes:1', width: 100 },
      { field: 'numPeers', displayName: 'Peers', width: 80 },
      { field: 'ratio', cellFilter: 'number:2', width: 80 }
    ]

    $scope.gridOptions = {
      columnDefs: $scope.columns,
      data: $rootScope.client.torrents,
      enableColumnResizing: true,
      enableColumnMenus: false,
      enableRowSelection: true,
      enableRowHeaderSelection: false,
      multiSelect: false
    }

    $scope.gridOptions.onRegisterApi = function (gridApi) {
      $scope.gridApi = gridApi
      gridApi.selection.on.rowSelectionChanged($scope, function (row) {
        if (!row.isSelected && $rootScope.selectedTorrent && $rootScope.selectedTorrent.infoHash === row.entity.infoHash) {
          $rootScope.selectedTorrent = null
        } else {
          $rootScope.selectedTorrent = row.entity
        }
      })
    }

    // If there's a magnet in the URL (ex: torrent.html#/magnet-link)
    if ($location.hash() !== '') {
      $rootScope.client.processing = true
      setTimeout(function () {
        dbg(`Adding ${$location.hash()}`)
        $rootScope.addMagnet($location.hash())
      }, 0)
    }
  }
])

// Download View Controller
app.controller('DownloadCtrl', [
  '$scope',
  '$rootScope',
  '$http',
  '$log',
  '$location',
  'ngNotify',
  function ($scope, $rootScope, $http, $log, $location, ngNotify) {
    ngNotify.config({
      duration: 5000,
      html: true
    })

    $scope.addMagnet = function () {
      $rootScope.addMagnet($scope.torrentInput)
      $scope.torrentInput = ''
    }

    if ($location.hash() !== '') {
      $rootScope.client.processing = true
      setTimeout(function () {
        dbg(`Adding ${$location.hash()}`)
        $rootScope.addMagnet($location.hash())
      }, 0)
    }
  }
])

// Stream/View Controller
app.controller('ViewCtrl', [
  '$scope',
  '$rootScope',
  '$http',
  '$log',
  '$location',
  'ngNotify',
  function ($scope, $rootScope, $http, $log, $location, ngNotify) {
    ngNotify.config({
      duration: 2000,
      html: true
    })

    function onTorrent (torrent) {
      // Adjust viewer styling
      $rootScope.viewerStyle = {
        'margin-top': '-20px',
        'text-align': 'center'
      }
      dbg(torrent.magnetURI)
      torrent.safeTorrentFileURL = torrent.torrentFileBlobURL
      torrent.fileName = `${torrent.name}.torrent`
      $rootScope.selectedTorrent = torrent
      $rootScope.client.processing = false
      dbg('Received metadata', torrent)
      ngNotify.set(`Received ${torrent.name} metadata`)

      // Append each file to #viewer
      torrent.files.forEach(function (file) {
        file.appendTo('#viewer')
        file.getBlobURL(function (err, url) {
          if (err) throw err
          file.url = url
          dbg('Done ', file)
        })
      })

      torrent.on('done', function () {
        dbg('Done', torrent)
      })
      torrent.on('wire', function (wire, addr) {
        dbg(`Wire ${addr}`, torrent)
      })
      torrent.on('error', er)
    }

    $scope.addMagnet = function () {
      $rootScope.addMagnet($scope.torrentInput, onTorrent)
      $scope.torrentInput = ''
    }

    // If there's a magnet in the URL
    if ($location.hash() !== '') {
      $rootScope.client.processing = true
      setTimeout(function () {
        dbg(`Adding ${$location.hash()}`)
        $rootScope.addMagnet($location.hash(), onTorrent)
      }, 0)
    }
  }
])

// Custom Angular filters
app.filter('html', [
  '$sce',
  function ($sce) {
    return function (input) {
      return $sce.trustAsHtml(input)
    }
  }
])

app.filter('pbytes', function () {
  return function (num, speed) {
    if (isNaN(num)) return ''
    if (num < 1) return speed ? '' : '0 B'

    const units = ['B', 'kB', 'MB', 'GB', 'TB']
    const exponent = Math.min(Math.floor(Math.log(num) / 6.907755278982137), 8)
    const val = (num / Math.pow(1000, exponent)).toFixed(1) * 1
    const unit = units[exponent]
    return `${val} ${unit}${speed ? '/s' : ''}`
  }
})

app.filter('humanTime', function () {
  return function (millis) {
    if (millis < 1000) return ''
    const remaining = moment.duration(millis).humanize()
    return remaining.charAt(0).toUpperCase() + remaining.slice(1)
  }
})

app.filter('progress', function () {
  return function (num) {
    return `${(100 * num).toFixed(1)}%`
  }
})
