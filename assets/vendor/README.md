# PDF resources

- `jspdf.umd.min.js`: jsPDF 3.0.4, MIT. The distributed library retains its complete upstream copyright and license header; see also `jsPDF-LICENSE.txt`. Source: https://github.com/parallax/jsPDF/releases/tag/v3.0.4
- `AirStarsCJK.woff2`: Noto Sans CJK TC Regular, copyright © 2014–2021 Adobe, SIL Open Font License 1.1 (`Noto-LICENSE.txt`). Extracted from the Traditional Chinese face in the system `NotoSansCJK-Regular.ttc` (Debian `fonts-noto-cjk`) and converted to WOFF2 with fontTools. Glyphs and embedded copyright/license metadata are retained. Source: https://github.com/notofonts/noto-cjk

All required resources are served from this directory. PDF generation does not contact a CDN. `AirStarsDocument` is the CSS family alias used to render the licensed font onto the document canvas; generated PDF pages contain the rendered images.
