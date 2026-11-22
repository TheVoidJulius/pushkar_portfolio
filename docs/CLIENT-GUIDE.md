# Your portfolio: owner's guide

You can update everything on your website yourself, from any browser, and changes appear on the live site as soon as you click **Save**. You never need to touch code.

---

## 1. Your two addresses

| | Address |
|---|---|
| Your public website | https://example-portfolio.vercel.app |
| Your private dashboard | https://example-portfolio.vercel.app/admin |

*(Your developer will replace these with your real addresses.)*

The dashboard is private. Only your account can sign in, and there's no public sign-up page.

## 2. Signing in

1. Go to **/admin**.
2. Enter your email and password, then click **Sign in**.
3. **Forgot your password?** Click *Forgot password?*, enter your email, and follow the link we email you to choose a new one.

To sign out, click the **door icon** at the bottom of the left menu (or go to **Settings → Sign out**). You can change your password in **Settings → Account**.

## 3. Finding your way around

The menu on the left (the ☰ button on a phone) has one page per part of your site:

**Overview · Hero · Projects · Skills · Experience · About · Contact · AI Assistant · Settings**

- **Overview** shows how many projects, skills and messages you have, and when each section was last changed.
- **Preview site (with drafts)** at the bottom of the menu shows your site including unpublished drafts. Only you can see drafts.

### How saving works

- On pages with a form (Hero, About, Contact, AI Assistant, Settings), a bar at the bottom says **"You have unsaved changes"**. Click **Save changes** to publish them, or **Discard** to undo.
- Shortcut: **Ctrl + S** (or **⌘ + S** on a Mac) saves.
- If you try to leave with unsaved changes, your browser will warn you.
- On Projects, Experience and Skills, each action (add, edit, delete, reorder, publish) saves on its own, and a green message confirms it.
- **View on site** opens your public page so you can check the result.

## 4. Editing each section

### Hero (the top of your homepage)
Your name, job title, a one-line introduction, a short description, your location, an availability badge (leave it empty to hide it), the two buttons, and up to 6 highlight numbers such as *"8+ years building for the web"*.

**Button links:** type `#work`, `#skills`, `#experience`, `#about` or `#contact` to jump to a part of your page, or paste a full web address.

### Projects
- **Add a project:** click **New project**, fill in the title and a one-line summary, then add the details. Turn on **Published** when it's ready for visitors, and click **Add & publish** (or **Save draft**).
- **Edit:** click the ✏️ pencil.
- **Publish / hide:** click the 👁 eye. Hidden projects are *drafts*: they stay saved but visitors can't see them.
- **Feature:** click the ⭐ star. Featured projects appear larger at the top.
- **Reorder:** drag the ⋮⋮ handle, or use the small ↑ ↓ arrows.
- **Delete:** click the 🗑 bin and confirm. This can't be undone, so if you're unsure, hide the project instead.
- **Category** creates the filter buttons visitors see (e.g. "AI Product"). Use the same spelling to group projects together.

### Skills
- Skills are grouped into **categories** (e.g. "Frontend Development"). Click a category to open it.
- **Add a skill:** type its name, choose a level (●●● Expert, ●●○ Proficient, ●○○ Familiar), and click **Add**.
- Change a level with the dropdown, remove a skill with 🗑, and drag to reorder.
- **New category** adds a group. Click ✏️ on a category to rename it or change its icon. Deleting a category also deletes the skills inside it.

### Experience
Works like Projects. Each role has a job title, company, dates, a description, key achievements (press **Enter** after each one), technologies and a logo. Tick **"I work here now"** for your current job. Put your most recent role first.

### About
Your headline, introduction, biography (line breaks are kept), background, interests (press **Enter** after each) and up to 9 "highlight" cards. You can also change the photo here.

### Contact
Your email, phone (optional), location, a short availability note, and your social links. For each link, pick the platform, adjust the label and paste the full address starting with `https://`.

**Messages:** everything people send through your contact form appears at the bottom of this page. New messages have a coral dot. Click one to read it, then use **Reply by email**, **Mark as unread** or **Delete**.

## 5. Images

Anywhere you see an image box:
- **Upload:** click it (or drag a picture onto it).
- **Replace:** click **Replace** and choose a new picture. The old one is removed automatically.
- **Remove:** click **Remove**.
- Accepted: PNG, JPG, WebP, GIF, AVIF or SVG, up to **5 MB**. Remember to **save** after uploading.

Tips: use a portrait-shaped photo for the hero and About sections, and a landscape image (about 16:10) for project covers.

## 6. Mikuro, your AI assistant

Mikuro is a small, shiny 3D puffball cat. She greets visitors, talks about each section as they scroll, and answers questions using **only what's published on your site**. When you add a project, Mikuro knows about it straight away. If someone asks something your site doesn't cover, Mikuro says she doesn't know rather than making something up.

On the **AI Assistant** page you can change:
- **Name**, if you'd like to rename her.
- **Greeting**: the first message visitors see and hear.
- **Personality instructions**: how she talks (cheerful, formal, short answers…). Don't put facts about yourself here; they come from your sections automatically.
- **Suggested questions**: up to 6 quick buttons shown when the chat opens.
- **Narrate the page**: Mikuro introduces herself when your site opens, then talks about each section as visitors scroll. Her lines are written automatically from your content, so they stay up to date. Visitors can tap **Skip intro**, or choose **Play the tour** from the menu to have her walk them through everything.
- **Greet visitors**: turns the welcome bubble on or off.
- **Speak replies out loud**: turns her voice on or off. Visitors can always mute her too.
- **Voice**: if your developer has connected ElevenLabs, click *Load my ElevenLabs voices*, choose one, adjust *Expressiveness* and *Speed*, save, then click **Hear Mikuro**. Without ElevenLabs, your visitors' browser voice is used. Leave *Accent* on **Japanese accent** for a Japanese-accented English voice (sounds best in Microsoft Edge), and adjust *Pitch* and *Speed* to taste.

To hide Mikuro completely, go to **Settings** and turn off *Show Mikuro on the site*.

## 7. Settings

- **Browser tab & search title** and **Search & social description**: what Google and social networks show for your site.
- **Footer note**: the short line at the very bottom of your site.
- **Backup:** **Download backup** saves all your text content to a file. Keep one every now and then. **Restore from backup** replaces everything with a backup file. A copy of your current content is downloaded first, just in case.

## 8. Light and dark mode

Visitors can switch themes with the ☀/🌙 button, and the site remembers their choice. The dashboard has the same button at the bottom of the menu.

## 9. If something goes wrong

| Problem | Try this |
|---|---|
| "You don't have permission" when saving | Sign out and back in. Your session may have expired. |
| "Some values aren't valid" | A field is too long or a link is missing `https://`. Check the fields marked in red. |
| An image won't upload | Check it's under 5 MB and is a PNG, JPG, WebP, GIF, AVIF or SVG. |
| A change doesn't show on the site | Make sure you clicked **Save** (the bar should say "All changes saved") and that the project is **Published**. Then refresh the site. |
| Mikuro's voice sounds robotic | That's the free browser voice. Ask your developer to connect ElevenLabs. |

## 10. Accounts that belong to you

Your website runs on a few services, all in **your** name:

- **Vercel**: hosts the website.
- **Supabase**: stores your content, images and login.
- **GitHub**: keeps the website's code.
- **Your domain registrar**: your web address, if you use a custom one.
- *(Optional)* **Anthropic**: Mikuro's smart conversation (paid per use).
- *(Optional)* **ElevenLabs**: Mikuro's anime-style voice (paid plan).

Keep these logins safe. Nobody else needs them for you to update your site day to day.
