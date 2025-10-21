# Quick Start Guide

Get Dev Feedback Capture running in **2 minutes**!

## Step 1: Generate Icons (30 seconds)

1. Open `generate-icons.html` in your browser
2. Click "Download All Icons"
3. Save the three PNG files to this folder:
   - `icon16.png`
   - `icon48.png`
   - `icon128.png`

**Skip this step?** The extension works without icons, Chrome will just show a default icon.

## Step 2: Load Extension in Chrome (60 seconds)

1. Open Chrome and go to: `chrome://extensions/`
2. Toggle **"Developer mode"** ON (top-right corner)
3. Click **"Load unpacked"**
4. Select the `webDevFeedbackExt` folder
5. Done! ✅

## Step 3: Test It (30 seconds)

1. Navigate to any **localhost** page (e.g., `http://localhost:3000`)
2. Look for the **"Feedback Mode: OFF"** button (bottom-right)
3. Click it or press **Alt+F**
4. Hover over elements - they'll highlight in blue
5. Click an element to capture feedback
6. Add your note and click "Save Feedback"

## Export Your Feedback

In the floating panel:
- **Copy as JSON** - Perfect for API consumption or scripts
- **Copy as Markdown** - Great for GitHub issues, Notion, or team docs

## That's It!

You're now capturing detailed feedback about UI elements. No more vague "make that button bigger" - you'll have exact selectors, computed styles, and context.

---

### Need Help?

- Full docs: See `README.md`
- Not working? Check you're on a **localhost** URL
- Element not highlighting? Make sure Feedback Mode is **ON** (blue button)

Happy feedback capturing! 🎯
