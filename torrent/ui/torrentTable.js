const COLUMN_DEFS = [
  {
    key: "name",
    label: "Name",
    headerClass: "w-full sm:w-1/3 text-left",
    cellClass: "font-medium text-text truncate",
  },
  {
    key: "progress",
    label: "Progress",
    headerClass: "w-24 text-right",
    cellClass: "tabular-nums text-right",
    filter: { name: "progress" },
  },
  {
    key: "downloadSpeed",
    label: "\u2193 Speed",
    headerClass: "w-24 text-right",
    cellClass: "tabular-nums text-right",
    filter: { name: "pbytes", args: [1] },
  },
  {
    key: "uploadSpeed",
    label: "\u2191 Speed",
    headerClass: "w-24 text-right",
    cellClass: "tabular-nums text-right",
    filter: { name: "pbytes", args: [1] },
  },
  {
    key: "numPeers",
    label: "Peers",
    headerClass: "w-20 text-right",
    cellClass: "tabular-nums text-right",
  },
  {
    key: "ratio",
    label: "Ratio",
    headerClass: "w-20 text-right",
    cellClass: "tabular-nums text-right",
    filter: { name: "number", args: [2] },
  },
];

function getRowId(torrent) {
  if (!torrent) {
    return "";
  }

  return torrent.infoHash || torrent.magnetURI || torrent.name || Math.random();
}

export function registerTorrentTable(app) {
  app.component("torrentTable", {
    bindings: {
      torrents: "<",
      selected: "<?",
      onSelect: "&?",
    },
    controller: [
      "$filter",
      function ($filter) {
        this.$onChanges = function () {
          this.rows = Array.isArray(this.torrents) ? this.torrents : [];
        };

        this.isSelected = function (torrent) {
          if (!this.selected || !torrent) {
            return false;
          }

          return (
            this.selected === torrent ||
            (this.selected.magnetURI && this.selected.magnetURI === torrent.magnetURI) ||
            (this.selected.infoHash && this.selected.infoHash === torrent.infoHash)
          );
        };

        this.selectTorrent = function (torrent) {
          if (typeof this.onSelect === "function") {
            this.onSelect({ torrent });
          }
        };

        this.getRowKey = function (torrent) {
          return getRowId(torrent);
        };

        this.getDisplayValue = function (torrent, column) {
          const value = torrent ? torrent[column.key] : undefined;

          if (!column.filter || !$filter) {
            return value;
          }

          const filterFn = $filter(column.filter.name);
          const args = Array.isArray(column.filter.args) ? column.filter.args : [];
          return filterFn(value, ...args);
        };
      },
    ],
    template: `
      <div class="overflow-hidden rounded-xl border border-border-translucent bg-surface shadow-sm">
        <div class="overflow-x-auto">
          <table class="min-w-full divide-y divide-border-translucent text-sm">
            <thead class="bg-surface-alt text-muted-strong">
              <tr>
                <th ng-repeat="column in $ctrl.columns"
                    scope="col"
                    class="px-4 py-3 font-semibold uppercase tracking-wide text-xs"
                    ng-class="column.headerClass">
                  {{ column.label }}
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border-translucent" ng-if="$ctrl.rows.length">
              <tr ng-repeat="torrent in $ctrl.rows track by $ctrl.getRowKey(torrent)"
                  ng-click="$ctrl.selectTorrent(torrent)"
                  ng-keydown="($event.key === 'Enter' || $event.key === ' ') && ($event.preventDefault(), $ctrl.selectTorrent(torrent))"
                  ng-class="{ 'bg-info/10 text-text': $ctrl.isSelected(torrent) }"
                  class="group align-middle cursor-pointer transition hover:bg-panel-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-info"
                  role="button"
                  tabindex="0"
                  aria-pressed="$ctrl.isSelected(torrent)">
                <td ng-repeat="column in $ctrl.columns"
                    class="px-4 py-3"
                    ng-class="column.cellClass">
                  <span>{{ $ctrl.getDisplayValue(torrent, column) }}</span>
                </td>
              </tr>
            </tbody>
            <tbody ng-if="!$ctrl.rows.length">
              <tr>
                <td class="px-4 py-8 text-center text-sm text-muted" colspan="{{$ctrl.columns.length}}">
                  No active torrents yet. Add a magnet link to get started.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    `,
    $onInit() {
      this.columns = COLUMN_DEFS;
      this.rows = Array.isArray(this.torrents) ? this.torrents : [];
    },
  });
}
