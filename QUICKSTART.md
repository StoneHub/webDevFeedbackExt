# Quick Start Guide

Get Dev Feedback Capture running in **2 minutes**!

## Step 1: Load the Included Icons (0 seconds)

The repo now includes the required icon files already:
- `icon16.png`
- `icon48.png`
- `icon128.png`

If you ever want to regenerate them, run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\generate-icons.ps1
```

## Step 2: Load Extension in Chrome (60 seconds)

1. Open Chrome and go to: `chrome://extensions/`
2. Toggle **"Developer mode"** ON (top-right corner)
3. Click **"Load unpacked"**
4. Select the `webDevFeedbackExt` folder
5. Done! ✅

## Step 3: Test It (30 seconds)

1. Navigate to any supported local dev page such as `http://localhost:3000`
2. Open the extension popup from the browser toolbar
3. Click **Start Feedback Mode** or press **Ctrl+Shift+F**
4. Hover over elements and click one to capture feedback
5. Add your note and click **Save Feedback**
6. Use the floating panel to export or delete captured items

## Export Your Feedback

In the floating panel:
- **Copy as JSON** - Perfect for API consumption or scripts
- **Copy as Markdown** - Great for GitHub issues, Notion, or team docs

## That's It!

You're now capturing detailed feedback about UI elements. No more vague "make that button bigger" - you'll have exact selectors, computed styles, and context.

---

### Need Help?

- Full docs: See `README.md`
- Not working? Check you're on `localhost`, `127.0.0.1`, `0.0.0.0`, or `[::1]`
- Just installed it? Refresh the page once so the content script can attach
- Element not highlighting? Make sure Feedback Mode is **ON** in the popup

Happy feedback capturing! 🎯
