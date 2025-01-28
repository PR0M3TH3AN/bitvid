# **bitvid: Enhanced Dynamic Home Page and Video Tracking Specification**

This document outlines how to implement a dynamic home page for bitvid using new video tracking methods. It focuses on reading video views via Nostr events rather than relying on active WebTorrent peer counts. The goal is to display personalized, popular, and trending content, all while preserving a single-page architecture and maintaining a consistent layout.

---

## 1. Overview

### Main Objectives
1. **Personalized Feeds**: Recommend videos and channels by analyzing user subscriptions and view logs.  
2. **Video Tracking**: Log video views using Nostr events (kind `30078`) so the system can determine popularity and trending content.  
3. **Consistent Layout**: Use a single-page approach with views for home, profiles, and other sections. A templating or view-switching system will let the header, footer, and future sidebar remain unchanged.  
4. **Privacy Support**: Track views with either a logged-in public key or a temporary session-based key for non-logged-in users.

---

## 2. Home Page Views

The home page will be composed of multiple sections that show different collections of videos. All sections can be rendered within `index.html`, controlled by view logic. These sections might include:

1. **For You**  
   - Videos from subscriptions.  
   - Personalized based on user watch history or tags.  
2. **Trending**  
   - Videos that have grown in views over a certain timeframe.  
   - Uses view logs to gauge growth trends.  
3. **Popular**  
   - Videos with the highest total views.  
   - Sorted based on aggregated play events.  

Each section can be wrapped in its own HTML container. JavaScript will fetch the relevant data, sort or filter it, then populate the DOM dynamically.

---

## 3. Video View Tracking

Rather than measuring active peers, bitvid now counts views by logging them as Nostr events. This enables a transparent and decentralized way to track engagement while still allowing for privacy controls.

### 3.1 Event Structure

- **Kind**: `30078` (existing kind used for video-related data).  
- **Tags**:  
  - `["t", "view"]` to identify a view event.  
  - `["video", "<video_id>"]` to map the event to a specific video.  
  - `["session", "true"]` if the viewer is non-logged-in using a temporary session.  
- **Content**: May include a JSON object with the video ID, timestamp, and optional metadata.

**Example View Event (Logged In):**
```json
{
  "kind": 30078,
  "pubkey": "user_pubkey",
  "created_at": 1672531200,
  "tags": [
    ["t", "view"],
    ["video", "video_abc123"]
  ],
  "content": "{\"videoId\":\"video_abc123\",\"timestamp\":1672531200}"
}
```

**Example View Event (Temporary Session):**
```json
{
  "kind": 30078,
  "pubkey": "temporary_pubkey",
  "created_at": 1672531200,
  "tags": [
    ["t", "view"],
    ["video", "video_abc123"],
    ["session", "true"]
  ],
  "content": "{\"videoId\":\"video_abc123\",\"timestamp\":1672531200}"
}
```

---

## 4. Ranking Logic

1. **Popular Videos**  
   - Sort by the total number of view events.  
   - A simple approach is to query all view events for each video, then rank them by the count of events.

2. **Trending Videos**  
   - Evaluate growth in view events over a recent window (for example, the last 24 hours).  
   - Compare the count of new views against a previous period, or calculate the rate of increase.

3. **For You**  
   - Look at what the user watched or subscribed to (via kind `30002` subscription lists).  
   - Track the user’s or session’s recent view tags, then recommend videos with overlapping tags or from the same channels.

---

## 5. Home Page Layout and Rendering

### 5.1 HTML Structure

Your `index.html` might include placeholders for each section:

```html
<div id="homeContainer">
  <!-- For You -->
  <section id="forYouSection">
    <h2>For You</h2>
    <div id="forYouGrid"></div>
  </section>

  <!-- Trending -->
  <section id="trendingSection">
    <h2>Trending</h2>
    <div id="trendingGrid"></div>
  </section>

  <!-- Popular -->
  <section id="popularSection">
    <h2>Popular</h2>
    <div id="popularGrid"></div>
  </section>
</div>
```

### 5.2 JavaScript Flow

1. **Fetch Data**  
   - Pull video metadata from kind `30078` events that contain video info or from your existing approach.  
   - Pull subscription data (kind `30002`).  
   - Pull view events (kind `30078` with `"t", "view"`).  

2. **Process Rankings**  
   - Tally views per video.  
   - Track growth rates for trending.  
   - Filter or sort data.  

3. **Render Sections**  
   - Populate each section with relevant videos.  
   - A typical approach:

   ```js
   async function loadHomePage() {
     const videos = await fetchAllVideos(); // from Nostr or local data
     const viewEvents = await fetchAllViews(); // filter by "t=view"

     const forYouData = getForYouRecommendations(videos, viewEvents);
     renderVideoGrid(forYouData, "forYouGrid");

     const trendingData = getTrendingVideos(videos, viewEvents);
     renderVideoGrid(trendingData, "trendingGrid");

     const popularData = getPopularVideos(videos, viewEvents);
     renderVideoGrid(popularData, "popularGrid");
   }
   ```

   - Each function (`getForYouRecommendations`, `getTrendingVideos`, `getPopularVideos`) calculates the appropriate subset of videos.

---

## 6. Single-Page View Structure

### 6.1 Profile and Other Views

- Keep the header, footer, and any sidebar in place.  
- Change the visible view container to switch between the home grid, a user’s profile, or other screens.  
- Use JavaScript routing (hash-based or history API) to detect and render the correct view in `index.html`.

**Example:**
```js
function handleRouteChange() {
  const hash = window.location.hash;

  if (hash.startsWith("#profile")) {
    const npub = hash.split("/")[1];
    loadProfileView(npub);
  } else {
    // Default: show home
    loadHomePage();
  }
}

window.addEventListener("hashchange", handleRouteChange);
window.addEventListener("load", handleRouteChange);
```

---

## 7. Recommendations and Personalized Feeds

### 7.1 Logged-In Users

- Use their public key to track watch history and subscription data.  
- Query view events authored by that pubkey.  
- Match frequent tags, channels, or categories.

### 7.2 Non-Logged-In Users

- Generate a session-based key pair.  
- Tag view events with `["session", "true"]`.  
- Maintain in-memory or localStorage.  
- Provide basic recommendations for the session.

---

## 8. Implementation Steps

1. **View Logging**:  
   - Update the video player code to publish a view event when a user starts or confirms playback.

2. **Data Fetching**:  
   - Build or adapt functions to query view events from your Nostr relays.  
   - Merge the resulting data with your video metadata.

3. **Ranking Functions**:  
   - Create functions to rank videos by total views (popular) or view velocity (trending).  
   - Create a function that looks at subscription data and view history for personalized feeds.

4. **Rendering**:  
   - Implement `renderVideoGrid(data, containerId)` to fill the given section with video cards.  
   - Keep the layout responsive and consistent.

5. **Routes and Views**:  
   - Integrate the home feed with other views (e.g., user profiles, single video modals) within the same page.  
   - Use a simple router or your existing JavaScript structure to swap out sections.

---

## 9. Future Enhancements

1. **Advanced Recommendations**  
   - Add more factors like video tags, watch duration, or user engagement events (likes, zaps).  

2. **Analytics Dashboard**  
   - Provide creators with a summary of total views, trending periods, and audience insights.  

3. **Community Features**  
   - Collaborative playlists, comments, or shared watch parties, all tracked in a decentralized manner.

4. **Optimized Relay Usage**  
   - Implement batching or caching to limit the load on relays when publishing or querying events.

---

### Conclusion

This updated plan replaces the old peer-count method with view event tracking. It outlines how to fetch and render dynamic sections on the home page, switch between views, and generate personalized recommendations. By tracking views via Nostr events and rendering multiple content sections in a single-page architecture, bitvid can maintain a flexible interface while providing a richer user experience.