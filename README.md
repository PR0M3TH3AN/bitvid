# **NosTube: Building a Nostr + WebTorrent Video Streaming Client**

This project plan outlines the steps to build a decentralized video streaming client using **Nostr** for metadata and **WebTorrent** for video distribution. It includes technical specifications, a framework outline, and a phased approach for development.

---

## **1. Overview**

### **1.1 Objectives**
1. Enable users to upload videos by posting a magnet link along with metadata (title, description, tags, thumbnail).
2. Allow users to edit video metadata (e.g., description, thumbnail URL) without duplicating content.
3. Fetch video content via WebTorrent and display published videos on a decentralized platform.
4. Operate entirely client-side with static hosting.
5. Use Nostr to store and retrieve metadata.

---

## **2. Specifications**

### **2.1 Nostr Note Specification**
We will use **Kind `30078`** for arbitrary custom app data. The note will store all video metadata, enabling discovery and categorization. Editing is supported using the `d` tag in **Replaceable Events**.

#### **Nostr Event Schema**
```json
{
  "kind": 30078,
  "pubkey": "npub1exampleauthorhash",
  "created_at": 1700000000,
  "tags": [
    ["d", "example-video-identifier"],
    ["t", "video"],
    ["t", "tutorial"]
  ],
  "content": {
    "type": "video",
    "magnet_link": "magnet:?xt=urn:btih:examplehash&dn=nostr-video.mp4",
    "title": "Nostr Video Example",
    "description": "A tutorial on Nostr and WebTorrent integration.",
    "tags": ["video", "tutorial", "nostr"],
    "author": "npub1exampleauthorhash",
    "upload_time": 1700000000,
    "file_size": "20MB",
    "thumbnail": "https://example.com/thumbnail.jpg",
    "duration": "15m20s"
  }
}
```

#### **Fields Description**
- **kind**: `30078` (custom app data for video metadata).
- **tags**:
  - `"d"`: Unique identifier (e.g., hash of the magnet link or custom ID) for replaceable events.
  - `"t"`: Categorization tags for searching.
- **content**:
  - `type`: Defines the content type (`video`).
  - `magnet_link`: WebTorrent magnet link for the video.
  - `title`, `description`, `tags`: Metadata for the video.
  - `author`: Uploader’s Nostr public key (`npub`).
  - `upload_time`: Unix timestamp of the upload.
  - `file_size`: Size of the video file.
  - `thumbnail`: URL of the video thumbnail.
  - `duration`: Optional video duration (retrieved from metadata if available).

---

## **3. Framework Outline**

### **3.1 Technologies**
- **Frontend**: React (or Vanilla JavaScript for smaller scale).
- **Decentralized Protocols**:
  - **Nostr** for metadata storage, retrieval, and updates.
  - **WebTorrent** for video content distribution.
- **Hosting**: Static hosting (e.g., GitHub Pages, Netlify, or Vercel).

---

### **3.2 Application Structure**
Organize the project into reusable components and modules to manage complexity and scalability.

#### **3.2.1 Directory Structure**
```
src/
├── components/            # Reusable UI components
│   ├── Header.js          # Navigation header
│   ├── Footer.js          # Footer with links and copyright
│   ├── Layout.js          # Wrapper for consistent page structure
│   ├── MagnetInput.js     # Input for magnet links
│   ├── VideoForm.js       # Form for uploading video metadata
│   ├── EditVideoForm.js   # Form for editing video metadata
│   ├── VideoList.js       # Displays list of videos
│   ├── VideoCard.js       # Individual video item card
├── pages/                 # Page-level components
│   ├── Home.js            # Home page with video list
│   ├── Upload.js          # Upload page for video publishing
│   ├── About.js           # About page
├── utils/                 # Utility functions and services
│   ├── torrent.js         # WebTorrent integration
│   ├── nostr.js           # Nostr event handling
├── App.js                 # Main application component
└── index.js               # Entry point
```

---

### **3.3 Phases**

#### **Phase 1: Core Functionality**
1. **Input and Parse Magnet Links**:
   - Create `MagnetInput` to accept user input for a magnet link.
   - Validate the link format.
2. **Fetch Torrent Metadata**:
   - Use `WebTorrent` to fetch file size, name, and optional metadata (e.g., duration, thumbnail).
3. **Publish Metadata to Nostr**:
   - Build `VideoForm` to collect metadata (title, description, tags, thumbnail URL).
   - Use `nostr-tools` to create and sign events, then publish them to relays.
4. **Display Videos**:
   - Create `VideoList` to fetch and display videos published on Nostr relays.

---

#### **Phase 2: Editing and Replaceable Events**
1. **Enable Editing**:
   - Fetch the latest metadata using the unique `d` tag.
   - Prepopulate an editable form (`EditVideoForm`) with current metadata.
   - Publish updates using replaceable events to overwrite the existing entry.
2. **UI for Editing**:
   - Add an "Edit" button to each video card.
   - Redirect users to the editing page or show a modal with the editing form.

---

#### **Phase 3: UI Enhancements**
1. **Reusable Layouts**:
   - Add `Header` and `Footer` for navigation and consistent structure.
   - Use `Layout` to wrap all pages.
2. **Dynamic Pages**:
   - Implement routing (e.g., React Router) for `Home`, `Upload`, and `About` pages.
3. **Video Cards**:
   - Create `VideoCard` to display individual video metadata in `VideoList`.

---

#### **Phase 4: Performance Optimization**
1. **Caching**:
   - Use `IndexedDB` or `LocalStorage` to cache fetched metadata for offline usage.
2. **Pagination or Lazy Loading**:
   - Improve `VideoList` for better handling of large datasets.
3. **Reduce Network Calls**:
   - Debounce or throttle relay queries for efficiency.

---

#### **Phase 5: Advanced Features**
1. **Video Previews**:
   - Stream videos directly in the browser using WebTorrent and HTML5 `<video>`.
2. **Search and Filters**:
   - Add a search bar and filters for tags, titles, or authors.
3. **Reactions and Comments**:
   - Use Nostr events (`kind: 7` for reactions and `kind: 1` for comments) to add engagement features.

---

## **4. Development Milestones**

### **Milestone 1: Basic Upload and Display**
- Implement `MagnetInput` and `VideoForm`.
- Fetch and publish metadata to Nostr.
- Build `VideoList` to display published videos.

**Deliverable**: Users can upload videos and see them listed.

---

### **Milestone 2: Editing Support**
- Implement `EditVideoForm` for editing metadata.
- Add `d` tags to video events for replaceable updates.
- Fetch and update metadata seamlessly.

**Deliverable**: Users can update metadata without duplicating content.

---

### **Milestone 3: Complete UI**
- Add `Header`, `Footer`, and `Layout` for consistent design.
- Implement routing for `Home`, `Upload`, and `About`.

**Deliverable**: Fully functional interface with navigation and polished design.

---

### **Milestone 4: Optimized Performance**
- Implement caching and pagination for `VideoList`.
- Optimize network calls for fetching Nostr events.

**Deliverable**: Application performs well with a large number of videos.

---

### **Milestone 5: Advanced Features**
- Add direct video streaming using WebTorrent.
- Implement search and filtering for videos.
- Enable user reactions and comments.

**Deliverable**: Feature-rich, fully decentralized video platform.

---

## **5. Hosting and Deployment**

1. **Static Hosting Options**:
   - **GitHub Pages**: Free and integrates with Git repositories.
   - **Netlify**: Free plan with continuous deployment and custom domains.
   - **Vercel**: Optimized for React and other frontend frameworks.

2. **Deployment Steps**:
   - Build the project:
     ```bash
     npm run build
     ```
   - Deploy:
     - **GitHub Pages**:
       ```bash
       npm install gh-pages --save-dev
       npm run deploy
       ```
     - **Netlify** or **Vercel**:
       - Connect the repository and configure the build settings.

---

## **6. Tools and Libraries**

| **Category**         | **Tool/Library**         | **Description**                              |
|-----------------------|--------------------------|----------------------------------------------|
| Frontend Framework    | React                   | Component-based UI development.              |
| Decentralized Metadata| Nostr + nostr-tools     | Protocol and tools for metadata storage.     |
| Video Distribution    | WebTorrent              | Decentralized video streaming.               |
| State Management      | React Hooks             | Local state for managing application data.   |
| Styling               | Tailwind CSS (optional) | Utility-first styling framework.             |
| Hosting               | Netlify, Vercel, GitHub Pages | Static hosting options.                |

---

## **7. Timeline**

| **Week** | **Task**                                   |
|----------|-------------------------------------------|
| Week 1   | Setup project, create `MagnetInput`.       |
| Week 2   | Implement WebTorrent integration.          |
| Week 3   | Build `VideoForm` and Nostr publishing.    |
| Week 4   | Create `VideoList` to display videos.      |
| Week 5   | Implement `EditVideoForm` with updates.    |
| Week 6   | Add `Header`, `Footer`, and `Layout`.      |
| Week 7   | Optimize performance (caching, lazy load). |
| Week 8   | Add advanced features (streaming, comments).|

---

## **8. Risks and Mitigation**

### **8.1 Key Risks**
1. **Relay Downtime**:
   - **Mitigation**: Use multiple relays and implement fallback mechanisms.
2. **Private Key Management**:
   - **Mitigation**: Encourage integration with secure key storage solutions like Nostr Keychain.
3. **Scalability**:
   - **Mitigation**: Optimize performance early (pagination, caching).

### **8.2 Potential Challenges**
- **Decentralized Thumbnails**:
  - Since we rely on user-provided URLs, broken links might occur.
  - Educate users to host thumbnails on reliable services.

---

## **9. Deliverables**

1. **Core Application**:
   - Magnet link input, torrent metadata fetching, Nostr publishing.
2. **Editing Support**:
   - Allow metadata updates without creating duplicates.
3. **Polished UI**:
   - Navigation, video listing, and upload pages.
4. **Performance Optimizations**:
   - Efficient event fetching and caching.
5. **Advanced Features**:
   - Streaming, reactions, and search capabilities.