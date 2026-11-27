# Local PDF reader

## Supabase Auth client

`supabase.js` is the unmodified UMD distribution of `@supabase/supabase-js` 2.119.2
from the official npm registry. The archive SHA-512 was checked against the
registry integrity field before extraction. Exact version, archive integrity
and direct dependency versions are pinned in `supabase.lock.json`.
Upstream license: `SUPABASE-LICENSE.txt` (MIT), fetched from the matching release.
Auth/session requests bypass the app's offline cache; only the SDK asset is cached.

## PDF.js

Mozilla PDF.js 5.6.205, from the bundled `pdfjs-dist` distribution, Apache-2.0.
Original project: https://github.com/mozilla/pdf.js
License: `PDFJS-LICENSE.txt`.

The two legacy ESM bundles were mechanically wrapped as classic scripts by
`tools/vendor-pdf.cjs`: the final ESM export is removed and `import.meta.url` is
replaced with the current script URL. Upstream global exports are preserved.
Preloading the core allows the app to read PDFs under `file://` as well as HTTPS,
without fetching a worker or sending the document to a server.

The app loads these scripts only when a PDF is opened. They are included in the
offline app shell. PDF JavaScript evaluation and XFA are disabled. No OCR is used;
extracted timetable rows always require the user's review before saving.
