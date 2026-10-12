# Headless Chrome never exits after `--screenshot`, and a 375px window is not a 375px page

**Error**: no message. `"Google Chrome" --headless=new --window-size=375,812 --screenshot=<file> <url>`
wrote the file and then never returned; the shell command ran into its 120 s time limit.
In the picture the header's button, the notice and the last navigation link were cut off
at the right edge, as if the page were too wide. A second picture taken with
`--force-dark-mode` was byte for byte the light one.
**Where**: the by-hand look at `/add` at 375px and 1200px in both themes (Chrome 154, macOS).
**Cause**: three separate things. Headless Chrome 154 can stay alive after it has written
the screenshot. A window on macOS is never narrower than 500px, so the page was laid out
at 500px and the picture cropped to 375px. `--force-dark-mode` does not change what
`prefers-color-scheme` answers.
**Fix**: start Chrome in the background with its own `--user-data-dir`, wait until the
screenshot file has a size, then stop that process (`pkill -f "user-data-dir=<that folder>"`),
and wait a second before the next start, or the profile is still locked and no file is
written. For a narrow page, screenshot a local wrapper page that holds the saved HTML in
`<iframe width="375">`: the frame is a real 375px viewport. For a theme, save the page's
HTML, add `data-theme="dark"` (or `light`) to `<html>` and `<base href="http://localhost:<port>/">`
to the head, and open that file.
**Seen in**: 004-photo-upload, 2026-10-12
