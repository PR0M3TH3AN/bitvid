# **bitvid: Enhanced Profile/Channel Views Specification**

## **Overview**
We aim to integrate a multi-view system within `index.html`, allowing smooth navigation between views like the home grid and user profiles. This will leverage JavaScript for dynamic DOM manipulation, maintaining a consistent layout (header, footer, future sidebar) across views.

---

## **Structure and Navigation**
### **Navigation Logic**
1. **Default View (Home Grid):**
   - A grid showcasing all videos.
   - Acts as the primary landing page.

2. **Profile View:**
   - A user's profile page containing:
     - Profile banner and information.
     - Action buttons (Subscribe, Share, Block).
     - Videos grid (only videos posted by the user).

3. **Templating System:**
   - Use dynamic DOM manipulation to switch views without reloading the page.
   - Structure each "view" as a reusable container rendered based on URL or state.

---

## **Dynamic Routing**
### **Route Handling**
- Use the `hashchange` or `pushState` method to detect and handle navigation.
- Route format:
  - `/#home`: Default home grid view.
  - `/#profile/{npub}`: Profile view of a specific user, determined by `{npub}`.

### **Implementation Plan**
- Use JavaScript to parse the `window.location.hash` or `window.location.pathname` and determine which view to render.
- Example:
  ```javascript
  const renderView = () => {
    const hash = window.location.hash;
    if (hash.startsWith("#profile")) {
      const npub = hash.split("/")[1];
      loadProfileView(npub);
    } else {
      loadHomeGrid();
    }
  };

  window.addEventListener("hashchange", renderView);
  window.addEventListener("load", renderView);
  ```

---

## **View Templates**
### **Template System**
1. **Home Grid Template:**
   - Container: `#homeGrid`.
   - Dynamically populate the grid with all videos fetched from Nostr relays.

2. **Profile Template:**
   - Container: `#profileView`.
   - Display user details and their videos based on the `npub`.

3. **Shared Components:**
   - Header, footer, and optional sidebar remain static.
   - Use `display: none` and `block` to toggle view visibility.

### **HTML Structure**
Add placeholders for different views in `index.html`:
```html
<div id="homeGrid" class="view hidden">
  <!-- Home grid content -->
</div>

<div id="profileView" class="view hidden">
  <header class="profile-header">
    <img id="profileBanner" src="" alt="Banner" />
    <img id="profileImage" src="" alt="Profile" />
    <h1 id="profileName"></h1>
    <p id="profileBio"></p>
    <button id="subscribeBtn">Subscribe</button>
    <button id="shareProfileBtn">Share</button>
    <button id="blockProfileBtn">Block</button>
  </header>
  <div id="profileVideos" class="videos-grid">
    <!-- User's videos -->
  </div>
</div>
```

---

## **Functionality**
### **Profile Fetching**
- Use Nostr protocol (`kind 0`) to fetch profile details.
- Display:
  - Profile picture, name, bio, and website link.
  - Action buttons for Subscribe, Share, and Block.

### **Videos Fetching**
- Fetch videos (`kind 30078`) filtered by the user's `npub`.

### **Subscriptions**
- Use `kind 30000` to manage the subscription follow set:
  - Subscribe: Add user to the list.
  - Unsubscribe: Remove user.

### **Implementation Example**
```javascript
const loadProfileView = async (npub) => {
  // Fetch profile details
  const profileEvent = await nostrClient.fetchProfile(npub);
  const { name, picture, about } = profileEvent.content;

  // Update profile view
  document.getElementById("profileImage").src = picture;
  document.getElementById("profileName").textContent = name;
  document.getElementById("profileBio").textContent = about;

  // Fetch and display user videos
  const userVideos = await nostrClient.fetchVideosByNpub(npub);
  renderVideos(userVideos, "profileVideos");

  // Show profile view
  showView("profileView");
};

const showView = (viewId) => {
  document.querySelectorAll(".view").forEach((view) => {
    view.classList.toggle("hidden", view.id !== viewId);
  });
};
```

---

## **Unique Profile URLs**
- Format: `https://bitvid.network/#profile/{npub}`.
- Navigation to this URL will directly load the profile view.
- Use `history.pushState` or `location.hash` to set the URL.

---

## **Next Steps**
- **Integrate Dynamic Routing**: Update `app.js` with route handling for views.
- **Refactor HTML**: Add placeholders for views in `index.html`.
- **Build Profile Fetching Logic**: Use Nostr client to fetch and display user details dynamically.
- **Enhance UX**: Smooth transitions between views with CSS animations.

This setup achieves a modular SPA-like architecture while keeping development lightweight and aligned with your project’s goals.