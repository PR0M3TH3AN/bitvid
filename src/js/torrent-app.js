/* <ai_context>
   File: js/torrent-app.js
   Purpose: Recreate core βTorrent-like functionality in a modern design
</ai_context> */

// We'll rely on window.WebTorrent from webtorrent.global.min.js

class TorrentApp {
    constructor() {
      this.torrentClient = null;
      this.fileInput = null;
      this.magnetInput = null;
      this.seedingArea = null;
  
      // An in-memory array of torrents
      this.torrents = [];
      this.selectedTorrent = null;
  
      // UI elements
      this.torrentQueue = null;
      this.torrentQueueBody = null;
  
      // Selected panel elements
      this.selectedTorrentPanel = null;
      this.selectedTorrentName = null;
      this.pauseResumeBtn = null;
      this.removeBtn = null;
      this.shareList = null;
      this.selectedTorrentFilesBody = null;
  
      // Client stats elements
      this.clientStatsBar = null;
      this.clientDlSpeed = null;
      this.clientUlSpeed = null;
      this.clientRatio = null;
  
      this.statsInterval = null;
    }
  
    async init() {
      this.fileInput = document.getElementById("torrentFile");
      this.magnetInput = document.getElementById("magnetInput");
      this.seedingArea = document.getElementById("seedingArea");
      this.torrentQueue = document.getElementById("torrentQueue");
      this.torrentQueueBody = document.getElementById("torrentQueueTable").querySelector("tbody");
  
      // Selected panel
      this.selectedTorrentPanel = document.getElementById("selectedTorrentPanel");
      this.selectedTorrentName = document.getElementById("selectedTorrentName");
      this.pauseResumeBtn = document.getElementById("pauseResumeBtn");
      this.removeBtn = document.getElementById("removeBtn");
      this.shareList = document.getElementById("shareList");
      this.selectedTorrentFilesBody = document.getElementById("selectedTorrentFilesBody");
  
      // Client stats
      this.clientStatsBar = document.getElementById("clientStatsBar");
      this.clientDlSpeed = document.getElementById("clientDlSpeed");
      this.clientUlSpeed = document.getElementById("clientUlSpeed");
      this.clientRatio = document.getElementById("clientRatio");
  
      if (this.fileInput) {
        this.fileInput.addEventListener("change", (e) => this.handleFile(e));
      }
  
      const downloadBtn = document.getElementById("downloadBtn");
      if (downloadBtn) {
        downloadBtn.addEventListener("click", () => this.handleMagnet());
      }
  
      const seedBtn = document.getElementById("seedBtn");
      if (seedBtn) {
        seedBtn.addEventListener("click", () => this.handleSeeding());
      }
  
      if (this.pauseResumeBtn) {
        this.pauseResumeBtn.addEventListener("click", () => {
          if (!this.selectedTorrent) return;
          this.togglePause(this.selectedTorrent);
          this.renderSelectedTorrent();
        });
      }
  
      if (this.removeBtn) {
        this.removeBtn.addEventListener("click", () => {
          if (!this.selectedTorrent) return;
          this.removeTorrent(this.selectedTorrent.infoHash);
          this.clearSelectedTorrent();
        });
      }
  
      // Create local WebTorrent client from global
      if (window.WebTorrent) {
        this.torrentClient = new window.WebTorrent();
        console.log("TorrentApp initialized with WebTorrent global.");
  
        // Start updating client stats
        this.clientStatsBar.classList.remove("hidden");
        this.statsInterval = setInterval(() => {
          if (!this.torrentClient) return;
          this.clientDlSpeed.textContent = "↓ " + this.formatBytes(this.torrentClient.downloadSpeed || 0) + "/s";
          this.clientUlSpeed.textContent = "↑ " + this.formatBytes(this.torrentClient.uploadSpeed || 0) + "/s";
          // ratio is not directly exposed, so we do a basic placeholder
          const ratio = ((this.torrentClient.uploaded || 0) / ((this.torrentClient.downloaded || 1))) || 0;
          this.clientRatio.textContent = ratio.toFixed(2);
        }, 1000);
  
      } else {
        console.error("window.WebTorrent is not defined. Please include webtorrent.global.min.js");
        return;
      }
    }
  
    handleFile(e) {
      const file = e.target.files[0];
      if (!file) return;
      this.addTorrentFile(file);
    }
  
    handleMagnet() {
      if (!this.torrentClient) return;
      const magnetLink = this.magnetInput.value.trim();
      if (!magnetLink) return;
      this.addMagnet(magnetLink);
    }
  
    handleSeeding() {
      if (!this.torrentClient) return;
      const files = this.seedingArea.files;
      if (!files || files.length === 0) return;
      this.seedFiles(files);
    }
  
    addTorrentFile(file) {
      console.log("Adding torrent file:", file.name);
      this.torrentClient.add(file, (torrent) => {
        this.trackTorrent(torrent);
      });
    }
  
    addMagnet(magnetURI) {
      console.log("Adding magnet:", magnetURI);
      this.torrentClient.add(magnetURI, (torrent) => {
        this.trackTorrent(torrent);
      });
    }
  
    seedFiles(fileList) {
      console.log("Seeding", fileList.length, "files");
      this.torrentClient.seed(fileList, (torrent) => {
        this.trackTorrent(torrent, true);
      });
    }
  
    trackTorrent(torrent, isSeeding = false) {
      // If we already have it in the table, skip
      const existing = this.torrents.find((t) => t.infoHash === torrent.infoHash);
      if (existing) {
        console.log("Torrent already tracked:", torrent.infoHash);
        return;
      }
  
      this.torrents.push(torrent);
  
      // Show queue if hidden
      if (this.torrentQueue && this.torrentQueue.classList.contains("hidden")) {
        this.torrentQueue.classList.remove("hidden");
      }
  
      // Create a row in the queue
      this.createTorrentRow(torrent, isSeeding);
  
      torrent.on("done", () => {
        console.log(torrent.name, "finished downloading.");
      });
  
      // Generate Blob URLs for each file
      if (torrent.files && torrent.files.forEach) {
        torrent.files.forEach((file) => {
          file.getBlobURL((err) => {
            if (err) {
              console.error("File blob error:", err);
            }
          });
        });
      }
  
      // Periodic UI updates
      this.updateTorrentUI(torrent);
    }
  
    createTorrentRow(torrent, isSeeding) {
      if (!this.torrentQueueBody) return;
  
      const row = document.createElement("tr");
      row.id = `torrent-row-${torrent.infoHash}`;
  
      // Name cell
      const nameCell = document.createElement("td");
      nameCell.textContent = torrent.name || "Unnamed Torrent";
  
      // Progress cell
      const progressCell = document.createElement("td");
      progressCell.style.width = "150px"; // for visual space
      const progressBar = document.createElement("div");
      progressBar.classList.add("torrent-progress-bar");
      const progressFill = document.createElement("div");
      progressFill.classList.add("torrent-progress-fill");
      progressFill.style.width = "0%";
      progressBar.appendChild(progressFill);
      progressCell.appendChild(progressBar);
  
      // Size cell
      const sizeCell = document.createElement("td");
      sizeCell.textContent = this.formatBytes(torrent.length || 0);
  
      // DL Speed
      const dlSpeedCell = document.createElement("td");
      dlSpeedCell.textContent = "0 KB/s";
  
      // UL Speed
      const ulSpeedCell = document.createElement("td");
      ulSpeedCell.textContent = "0 KB/s";
  
      // Peers
      const peersCell = document.createElement("td");
      peersCell.textContent = "0";
  
      // ETA
      const etaCell = document.createElement("td");
      etaCell.textContent = "∞";
  
      // Actions
      const actionsCell = document.createElement("td");
      actionsCell.classList.add("torrent-actions");
  
      const pauseResumeBtn = document.createElement("button");
      pauseResumeBtn.classList.add("pause-resume-btn");
      pauseResumeBtn.textContent = "Pause";
      pauseResumeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.togglePause(torrent);
        if (this.selectedTorrent === torrent) {
          this.renderSelectedTorrent();
        }
      });
  
      const removeBtn = document.createElement("button");
      removeBtn.classList.add("remove-btn");
      removeBtn.textContent = "Remove";
      removeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.removeTorrent(torrent.infoHash);
        if (this.selectedTorrent === torrent) {
          this.clearSelectedTorrent();
        }
      });
  
      const shareBtn = document.createElement("button");
      shareBtn.classList.add("share-btn");
      shareBtn.textContent = "Share";
      shareBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.shareMagnetLink(torrent);
      });
  
      actionsCell.appendChild(pauseResumeBtn);
      actionsCell.appendChild(removeBtn);
      actionsCell.appendChild(shareBtn);
  
      row.appendChild(nameCell);
      row.appendChild(progressCell);
      row.appendChild(sizeCell);
      row.appendChild(dlSpeedCell);
      row.appendChild(ulSpeedCell);
      row.appendChild(peersCell);
      row.appendChild(etaCell);
      row.appendChild(actionsCell);
  
      // Clicking the entire row => selectTorrent
      row.addEventListener("click", () => {
        this.selectTorrent(torrent);
      });
  
      this.torrentQueueBody.appendChild(row);
    }
  
    selectTorrent(torrent) {
      this.selectedTorrent = torrent;
      this.renderSelectedTorrent();
    }
  
    clearSelectedTorrent() {
      this.selectedTorrent = null;
      if (this.selectedTorrentPanel) {
        this.selectedTorrentPanel.classList.add("hidden");
      }
    }
  
    renderSelectedTorrent() {
      if (!this.selectedTorrentPanel) return;
      if (!this.selectedTorrent) {
        this.selectedTorrentPanel.classList.add("hidden");
        return;
      }
      const t = this.selectedTorrent;
  
      // Show panel
      this.selectedTorrentPanel.classList.remove("hidden");
  
      // Name
      this.selectedTorrentName.textContent = t.name || "Unnamed Torrent";
  
      // Pause/Resume
      if (t.paused) {
        this.pauseResumeBtn.textContent = "Resume";
      } else {
        this.pauseResumeBtn.textContent = "Pause";
      }
  
      // Share links
      while (this.shareList.firstChild) {
        this.shareList.removeChild(this.shareList.firstChild);
      }
      // Example links
      if (t.magnetURI) {
        const magnetLi = document.createElement("li");
        const magnetLink = document.createElement("a");
        magnetLink.href = t.magnetURI;
        magnetLink.target = "_blank";
        magnetLink.textContent = "Magnet URI";
        magnetLi.appendChild(magnetLink);
        this.shareList.appendChild(magnetLi);
      }
      if (t.infoHash) {
        const hashLi = document.createElement("li");
        hashLi.innerHTML = `<strong>Hash: </strong>${t.infoHash}`;
        this.shareList.appendChild(hashLi);
      }
      // We won't do the .torrent file link unless you want to generate it
  
      // Files
      while (this.selectedTorrentFilesBody.firstChild) {
        this.selectedTorrentFilesBody.removeChild(this.selectedTorrentFilesBody.firstChild);
      }
      if (t.files) {
        t.files.forEach((file) => {
          const tr = document.createElement("tr");
  
          // File name
          const nameTd = document.createElement("td");
          if (file.done) {
            const a = document.createElement("a");
            a.href = file.url || "#";
            a.download = file.name;
            a.target = "_self";
            a.textContent = file.name;
            nameTd.appendChild(a);
          } else {
            nameTd.textContent = file.name;
          }
  
          // Size
          const sizeTd = document.createElement("td");
          sizeTd.textContent = this.formatBytes(file.length);
  
          // Priority
          const priorityTd = document.createElement("td");
          const select = document.createElement("select");
          select.classList.add("no-margin", "border", "rounded", "text-sm");
          const optHigh = document.createElement("option");
          optHigh.value = "1";
          optHigh.textContent = "High Priority";
          const optLow = document.createElement("option");
          optLow.value = "0";
          optLow.textContent = "Low Priority";
          const optNone = document.createElement("option");
          optNone.value = "-1";
          optNone.textContent = "Don't download";
          select.appendChild(optHigh);
          select.appendChild(optLow);
          select.appendChild(optNone);
  
          // default
          select.value = file.priority || "0";
  
          select.addEventListener("change", () => {
            this.changeFilePriority(file, select.value);
          });
  
          priorityTd.appendChild(select);
  
          tr.appendChild(nameTd);
          tr.appendChild(sizeTd);
          tr.appendChild(priorityTd);
  
          this.selectedTorrentFilesBody.appendChild(tr);
        });
      }
    }
  
    changeFilePriority(file, val) {
      file.priority = val;
      if (val === "-1") {
        file.deselect && file.deselect();
      } else {
        // In real webtorrent usage:
        // file.select(Number(val));
        file.select && file.select(Number(val));
      }
    }
  
    togglePause(torrent) {
      if (!torrent.paused) {
        torrent.pause && torrent.pause();
        torrent.paused = true;
      } else {
        torrent.resume && torrent.resume();
        torrent.paused = false;
      }
    }
  
    removeTorrent(infoHash) {
      this.torrents = this.torrents.filter((t) => t.infoHash !== infoHash);
  
      const row = document.getElementById(`torrent-row-${infoHash}`);
      if (row && row.parentNode) {
        row.parentNode.removeChild(row);
      }
  
      if (!this.torrentClient) return;
      const torrent = this.torrentClient.get(infoHash);
      if (torrent && torrent.destroy) {
        torrent.destroy(() => {
          console.log(`Destroyed torrent ${torrent.name}`);
        });
      }
  
      if (this.selectedTorrent && this.selectedTorrent.infoHash === infoHash) {
        this.clearSelectedTorrent();
      }
  
      if (this.torrents.length === 0 && this.torrentQueue) {
        this.torrentQueue.classList.add("hidden");
      }
    }
  
    shareMagnetLink(torrent) {
      const link = torrent.magnetURI || "No magnet available";
      navigator.clipboard
        .writeText(link)
        .then(() => {
          console.log("Magnet link copied to clipboard!");
        })
        .catch((err) => {
          console.error("Failed to copy magnet link:", err);
        });
    }
  
    // Periodically update the queue
    updateTorrentUI(torrent) {
      const row = document.getElementById(`torrent-row-${torrent.infoHash}`);
      if (!row) return;
  
      const progressCell = row.children[1];
      const progressFill = progressCell.querySelector(".torrent-progress-fill");
      const dlSpeedCell = row.children[3];
      const ulSpeedCell = row.children[4];
      const peersCell = row.children[5];
      const etaCell = row.children[6];
  
      const refresh = () => {
        if (!document.body.contains(row)) return;
  
        // If using real webtorrent, you'd do:
        // let progress = torrent.progress
        // let downloadSpeed = torrent.downloadSpeed
        // let uploadSpeed = torrent.uploadSpeed
        // let numPeers = torrent.numPeers
        // etc.
        const progressPercent = (torrent.progress || 0) * 100;
        progressFill.style.width = progressPercent.toFixed(1) + "%";
  
        dlSpeedCell.textContent = this.formatBytes(torrent.downloadSpeed || 0) + "/s";
        ulSpeedCell.textContent = this.formatBytes(torrent.uploadSpeed || 0) + "/s";
        peersCell.textContent = torrent.numPeers ? torrent.numPeers.toString() : "0";
  
        if (torrent.done) {
          etaCell.textContent = "Done";
        } else {
          etaCell.textContent = (torrent.downloadSpeed && torrent.downloadSpeed > 0)
            ? this.calcETA(torrent)
            : "∞";
        }
  
        requestAnimationFrame(refresh);
      };
      refresh();
    }
  
    calcETA(torrent) {
      // Real approach: (torrent.length - torrent.downloaded) / torrent.downloadSpeed
      const bytesRemaining = (torrent.length || 0) - (torrent.downloaded || 0);
      if (!torrent.downloadSpeed || torrent.downloadSpeed <= 0) return "∞";
      const sec = bytesRemaining / torrent.downloadSpeed;
      if (sec < 1) return "<1s";
      let s = Math.floor(sec);
      const h = Math.floor(s / 3600);
      s = s % 3600;
      const m = Math.floor(s / 60);
      s = s % 60;
      const parts = [];
      if (h > 0) parts.push(h + "h");
      if (m > 0) parts.push(m + "m");
      parts.push(s + "s");
      return parts.join(" ");
    }
  
    formatBytes(num) {
      if (num <= 0) return "0 B";
      const k = 1024;
      const sizes = ["B", "KB", "MB", "GB", "TB"];
      const i = Math.floor(Math.log(num) / Math.log(k));
      return (num / Math.pow(k, i)).toFixed(1) + " " + sizes[i];
    }
  }
  
  // Initialize on DOMContentLoaded
  document.addEventListener("DOMContentLoaded", () => {
    const app = new TorrentApp();
    app.init();
  });