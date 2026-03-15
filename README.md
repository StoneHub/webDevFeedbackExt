# Dev Feedback Capture

A Chrome browser extension that helps developers annotate and capture web page elements for development feedback. Perfect for gathering UI/UX feedback, documenting bugs, or communicating design changes.

## Features

- **🎯 Element Capture**: Click any element on supported local dev pages to capture detailed information
- **📝 Feedback Notes**: Add contextual notes about what needs to be changed
- **💾 Export Options**: Copy all feedback as JSON or Markdown format
- **🎨 Visual Feedback**: Elements highlight on hover with blue outline, selected elements show green dashed outline with number badges
- **⌨️ Keyboard Shortcut**: Toggle feedback mode with `Ctrl+Shift+F`
- **📍 Draggable Panel**: Move the feedback panel anywhere on screen
- **💿 Persistent Storage**: Feedback items are saved per-origin until you clear them

## Installation

### For Chrome

1. **Download or Clone this Repository**
   ```bash
   git clone https://github.com/your-username/dev-feedback-capture.git
   cd dev-feedback-capture
   ```

2. **Open Chrome Extensions Page**
   - Navigate to `chrome://extensions/`
   - Or click the three-dot menu → More tools → Extensions

3. **Enable Developer Mode**
   - Toggle the "Developer mode" switch in the top-right corner

4. **Load the Extension**
   - Click "Load unpacked"
   - Select the `webDevFeedbackExt` folder (the one containing `manifest.json`)

5. **Verify Installation**
   - You should see "Dev Feedback Capture" in your extensions list
   - The extension icon will appear in your toolbar

### Icons

The extension now ships with ready-to-use icons:

- `icon16.png`: 16x16 pixels
- `icon48.png`: 48x48 pixels
- `icon128.png`: 128x128 pixels

To regenerate them locally:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\generate-icons.ps1
```

## Usage

### Quick Start

1. **Navigate to a supported local dev page**
   - Examples: `http://localhost:3000`, `https://127.0.0.1:5173`, `http://0.0.0.0:3000`, `http://[::1]:8080`
   - The extension only runs on local development hosts by default

2. **Enable Feedback Mode**
   - Open the extension popup from the browser toolbar
   - Click **Start Feedback Mode**
   - Or press `Ctrl+Shift+F`
   - If you just installed the extension, refresh the page once first

3. **Capture Elements**
   - Hover over any element - it will highlight with a blue outline
   - Click the element to capture it
   - A modal will appear showing element details

4. **Add Your Feedback**
   - In the modal, enter what you want changed in the text area
   - Click "Save Feedback" to add it to your list
   - Or click "Cancel" to discard

5. **Manage Feedback**
   - View all captured items in the floating panel
   - Drag the panel by its header to reposition it
   - Delete individual items with the × button
   - Export all feedback as JSON or Markdown
   - Clear all items when done

### Captured Information

For each element, the extension captures:

- **CSS Selector**: Specific path to the element (up to 5 levels deep)
- **Element Tag**: HTML tag name (e.g., `button`, `div`, `a`)
- **Classes**: All CSS classes applied to the element
- **Inner Text**: First 100 characters of text content
- **Computed Styles**:
  - Background color
  - Text color
  - Font size
  - Width & height
  - Margin & padding
- **Viewport Position**: X and Y coordinates
- **Page URL**: The exact page where the feedback was captured
- **Your Note**: What you want changed
- **Timestamp**: When the feedback was captured

### Export Formats

#### JSON Format

```json
{
  "url": "http://localhost:5000/page",
  "timestamp": "2025-10-21T10:30:00Z",
  "feedback": [
    {
      "selector": "nav > ul > li:nth-child(2) > a",
      "elementInfo": {
        "tag": "a",
        "classes": ["nav-link", "active"],
        "text": "Products",
        "styles": {
          "background-color": "rgb(255, 255, 255)",
          "color": "rgb(51, 51, 51)",
          "font-size": "16px",
          "width": "120px",
          "height": "40px",
          "margin": "0px",
          "padding": "8px 16px"
        }
      },
      "position": { "x": 150, "y": 80 },
      "note": "Make this button blue and increase font to 18px",
      "timestamp": "2025-10-21T10:30:00Z"
    }
  ]
}
```

#### Markdown Format

The Markdown export creates a well-formatted document with:
- Page URL and date
- Total item count
- Numbered sections for each feedback item
- All element details in an easy-to-read format

Perfect for pasting into GitHub issues, Notion, or sharing with your team!

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+Shift+F` | Toggle Feedback Mode ON/OFF |

## Configuration

### Enable on Additional Domains

By default, the extension only works on `localhost`, `127.0.0.1`, `0.0.0.0`, and `[::1]` over HTTP or HTTPS. To enable it on other domains:

1. Open `manifest.json`
2. Add your domain to the `host_permissions` array:
   ```json
   "host_permissions": [
     "http://localhost/*",
     "https://localhost/*",
     "http://127.0.0.1/*",
     "https://127.0.0.1/*",
     "http://your-domain.local/*"
   ]
   ```
3. Update the `content_scripts` matches as well
4. Reload the extension in `chrome://extensions/`

## Troubleshooting

### Extension doesn't appear on my page

- ✅ Make sure you're on a supported local dev URL such as `localhost`, `127.0.0.1`, `0.0.0.0`, or `[::1]`
- ✅ Check that the extension is enabled in `chrome://extensions/`
- ✅ Refresh the page once after installing or reloading the extension
- ✅ Open the browser console (F12) and check for errors

### Feedback items disappeared

- Feedback items are stored per-origin (protocol + domain + port)
- If you change ports (e.g., `localhost:3000` → `localhost:5000`), you'll have separate feedback lists
- Items persist in Chrome's local storage until you clear them or clear browser data

### Element highlighting doesn't work

- Make sure Feedback Mode is ON in the popup
- Some elements with high z-index might cover the extension UI
- Try clicking directly on elements rather than relying solely on hover

### Modal or panel is hidden

- The panel might be dragged off-screen - disable and re-enable Feedback Mode to reset position
- Check if page styles are interfering with z-index values

## Limitations

### iFrames
The extension has limited support for iframes:
- Elements inside iframes from the same origin can be captured
- Cross-origin iframes are restricted by browser security policies
- The selector path will be relative to the iframe content, not the parent page

### Dynamic Content
- Elements that are dynamically removed from the DOM will lose their visual badges
- The selector may not work if the page structure changes significantly
- Feedback data is preserved even if elements change

### Shadow DOM
- Elements inside Shadow DOM may not be accessible
- Selectors for Shadow DOM elements may not be accurate

## Privacy & Security

- **No external servers**: All data is stored locally in Chrome's storage
- **No network requests**: The extension doesn't send any data anywhere
- **Local dev hosts only**: By default, only runs on local development pages
- **No permissions abuse**: Only requests necessary permissions (storage, activeTab)

## Development

### Project Structure

```
webDevFeedbackExt/
├── manifest.json       # Extension configuration (Manifest V3)
├── content.js          # Main functionality script (injected into pages)
├── styles.css          # All extension UI styles
├── popup.html          # Extension popup UI
├── popup.js            # Popup functionality
├── icon16.png          # Extension icon 16x16
├── icon48.png          # Extension icon 48x48
├── icon128.png         # Extension icon 128x128
└── README.md           # This file
```

### Tech Stack

- **Manifest V3**: Latest Chrome extension format
- **Vanilla JavaScript**: No external dependencies
- **Chrome Storage API**: For persistent feedback storage
- **Vanilla CSS**: Clean, scoped styles with high z-index

### Making Changes

1. Edit the files in your extension folder
2. Go to `chrome://extensions/`
3. Click the refresh icon on the "Dev Feedback Capture" card
4. Refresh your local dev page to see changes
5. Run `npm test` for helper and manifest checks
6. Run `npm run check` before packaging a release

## Roadmap / Future Enhancements

- [ ] Screenshot capture for each element
- [ ] Export to file (using downloads API)
- [ ] Import previously saved feedback
- [ ] Browser action to toggle mode from toolbar
- [ ] Support for Firefox/Edge
- [ ] Visual annotations (draw on page)
- [ ] Collaborative feedback sharing
- [ ] Integration with project management tools

## Contributing

Contributions are welcome! Please feel free to submit issues or pull requests.

## License

MIT License - feel free to use this extension in your projects!

## Support

If you encounter any issues or have questions:
1. Check the Troubleshooting section above
2. Open an issue on GitHub
3. Review Chrome's developer documentation for extensions

---

**Happy Feedback Capturing!** 🎯

Made with ❤️ for developers who want better communication about UI changes.
