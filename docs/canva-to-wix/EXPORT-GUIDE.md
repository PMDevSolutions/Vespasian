# How to Export from Canva for Wix Conversion

## Exporting HTML/CSS from Canva

1. Open your design in Canva
2. Click **Share** → **Download**
3. Select **HTML** as the file type (Canva Pro feature)
4. Download the ZIP file
5. Extract to a directory (e.g., `canva-export/`)

## Alternative for Free Canva Users

1. Open browser DevTools (F12) while viewing the design
2. Copy the page HTML and save as `page.html`
3. Copy the CSS styles and save as `style.css`
4. Right-click and save images separately

## Expected Directory Structure

```
canva-export/
├── index.html          # Main page HTML
├── about.html          # Additional pages (if multi-page)
├── style.css           # Stylesheet with design tokens
└── images/
    ├── hero.png
    └── logo.svg
```

## Design Tips for Wix-Ready Canva Designs

- Use consistent colors (they become Wix theme-slot assignments — Studio allows at most 25 site colors, so a tight palette translates cleanly)
- Use a small set of font sizes (they compress into Wix's 9 text-theme slots: H1–H6 + 3 paragraph styles)
- Keep layouts simple — columns, sections, headers map well onto Studio section grids
- Use text boxes, not text embedded in images
- Name pages clearly (they become Wix page names)

## Known Limitations

- Canva animations are not converted
- Complex overlapping elements translate to coarse section intent and may need manual adjustment in the Wix editor
- Gradient effects may simplify to solid colors
- Canva's proprietary fonts may not be available in Wix; unmatched fonts are substituted (or uploaded as WOFF2 via the editor's font dialog) and recorded in the FidelityReport

## What Maps Well to Wix

- **Headers, footers, navigation** → the template's header/footer sections
- **Hero sections** → full-width Studio sections with grid intent
- **Card grids** → multi-column section grids (or CMS-bound repeaters)
- **Image galleries** → gallery elements fed by API-uploaded media
- **Call-to-action buttons** → buttons styled by theme button roles
- **Text sections** → text elements assigned to the H1–H6 / P1–P3 theme slots
