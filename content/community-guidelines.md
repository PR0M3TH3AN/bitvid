Welcome to **bitvid**, a decentralized video-sharing platform built on Nostr. These Community Guidelines outline the types of content allowed and prohibited on the client hosted at this domain. Enforcement occurs at the **client level** with blur, hide, and downrank rules that mirror the current moderator tooling. Personal blocklists, mute controls, admin blacklists, and NIP-56 reporting are already available so you can tune your own experience.

> ⚠️ **Note:** Don't like the Guidelines? [Fork the code](https://github.com/PR0M3TH3AN/bitvid) and host the client on your own domain.

## **1. Content Principles**

bitvid aims to support **free expression** while maintaining a platform where users feel safe and respected. To achieve this balance, the following principles guide our moderation approach:

- **Decentralization:** We do not host videos directly but enable peer-to-peer sharing through WebTorrent and Nostr.
- **User Moderation:** Users have control over their feeds through subscriptions, blocking, and reporting.
- **Transparency:** Enforcement actions at the client level are visible, and policy updates will be communicated openly.

## **2. Allowed Content**

bitvid encourages a wide range of content, including but not limited to:

- **Educational and informative videos** (tech tutorials, history, science, etc.).
- **Entertainment** (music, gaming, comedy, reviews, etc.).
- **News and journalism** (independent reporting and discussions).
- **Creative works** (art, animations, short films, open-source projects, etc.).
- **Discussions and opinions** (provided they adhere to respectful discourse).

## **3. Prohibited Content**

To maintain a functional and ethical platform, the following types of content are blocked at the client level:

### **3.1. Illegal Content**

- Content that violates applicable laws, including but not limited to:
  - **CSAM (Child Sexual Abuse Material)** (immediate report and block enforcement).
  - **Human trafficking, exploitation, or abuse.**
  - **Direct threats or incitements to violence.**
  - **Explicit doxxing or leaking of private information without consent.**
  - **Fraudulent or scam content (e.g., Ponzi schemes, fake giveaways, impersonation).**

### **3.2. Spam and Low-Quality Content**

- Mass-uploaded, repetitive, or bot-generated content intended to flood the platform.
- Clickbait thumbnails/titles that mislead viewers.
- Excessive self-promotion with no meaningful engagement.

### **3.3. NSFW and Sensitive Content**

- **Pornographic material** (non-artistic sexually explicit content is not allowed at this stage).
- **Extreme gore or graphic violence** (unless in an educational or journalistic context).
- **Hate speech, racism, or targeted harassment.**
- **Calls for harm against individuals or groups based on race, religion, nationality, gender, or sexual orientation.**
- **Encouragement of self-harm, suicide, or dangerous activities.**

### **3.4. AI-Generated and Deepfake Content**

- **Deepfake impersonations** of real people used for deceptive purposes.
- AI-generated content must be **clearly labeled** to avoid misinformation.

## **4. Enforcement & Visibility Controls**

bitvid enforces these guidelines through client-side visibility rules that match the current `moreMenuController` and `userBlocks` behavior:

- **Blurred previews:** When at least three F1 contacts file trusted NIP-56 `nudity` reports, thumbnails render blurred and autoplay previews are paused. Every blur includes a “show anyway” override.
- **Downranked authors:** Muting a creator adds them to your NIP-51 mute list (kind `10000`). Videos from muted creators are deprioritized but still visible with clear badges so you can reverse the action.
- **Personal blocks:** Blocking a creator adds them to your private block list (`userBlocks`). Videos from blocked creators are hidden from feeds, carousels, and modals unless you explicitly unblock them.
- **Admin hard hides:** Moderator-maintained blacklists (NIP-51 kind `30000`) remove creators from default feeds for everyone using the hosted client. Moderators can still review the content through “show anyway” controls when auditing decisions.
- **Relay transparency:** Because enforcement is client-side, blocked or blurred videos may still exist on relays and appear in other Nostr clients that do not apply these rules.

## **5. User Moderation Controls**

You can manage moderation directly from the client using the existing menus rendered by `videoMenuRenderers`:

### **5.1 Personal blocklist (`userBlocks`)**

- Open any video card or modal and select the **More** (`···`) button. Choose **Block creator** to hide all future uploads from that pubkey. `moreMenuController` will confirm the action and refresh your feeds.
- To review or remove blocks, open your profile avatar → **Profile** → **Blocked**. The list is private to your account; use **Unblock** next to a creator to restore their videos.

### **5.2 Mute list management**

- Use the same **More** menu and pick **Mute creator**. Muted creators stay visible but are downranked, aligning with the viewer mute list logic in `moreMenuController`.
- Return to a muted creator’s video later and select **Unmute creator** from the menu to restore their normal ranking.

### **5.3 Moderator blacklist controls**

- Moderators with admin permissions see **Blacklist creator** inside the **More** menu. This updates the shared admin list managed by `moreMenuController` and immediately removes the creator from default feeds.
- Only accounts with edit rights can add or remove creators. Attempting to blacklist without sufficient permissions will surface an error toast.

### **5.4 Reporting workflow (NIP-56)**

- Select **Report video** from the **More** menu to launch the reporting modal. Provide a category (e.g., `nudity`, `spam`, `illegal`) and submit; the client signs a NIP-56 report from your connected key.
- Reports feed the same trusted-report scoring used for blur and hide decisions. Moderators monitor these queues to escalate urgent cases.

### **5.5 Safety & Moderation thresholds**

- Open your profile avatar → **Profile** → **Safety & Moderation** to adjust blur and autoplay thresholds. Leave a field blank to return to the default (blur at ≥3 trusted reports, autoplay block at ≥2).
- These controls update immediately and sync with the moderation overlays applied by `moreMenuController` and `VideoCard` components.

## **6. Appeals and Feedback**

As we refine the moderation system, we welcome feedback from early users. If you believe your content was unfairly blocked, you can appeal by reaching out through bitvid’s Nostr channels.

## **7. Final Notes**

bitvid is committed to **free speech and open platforms** while acknowledging the need for responsible content moderation. These guidelines will continue to evolve as we develop better tools for user moderation and decentralized governance.

> ⚠️ **Note:** If you agree to follow these guidelines then [submit an application](https://bitvid.network/?modal=application) to be a content creator!

> ⚠️ **Note:** If you believe your content was unfairly blocked or restricted on [bitvid.network](https://bitvid.network/), please complete [this form](https://bitvid.network/?modal=appeals).

Thank you for being part of the early bitvid community!
