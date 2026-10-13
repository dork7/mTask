# A page state between a click and the answer cannot be read through Chrome's debugging port

**Error**: `TypeError: Cannot read properties of null (reading 'hidden')` from
`Runtime.evaluate`, for `document.querySelector('[data-analyzing]').hidden`, half a second
after a click on `Upload photo`. With the null checked, the same call reported
`location.pathname` as `/review/5`, although the server's analyzer took two seconds to
answer.
**Where**: the by-hand look at the "Analyzing..." state of `/add` (plan, step 9), with a
script that drives headless Chrome 154 through `--remote-debugging-port`.
**Cause**: the click was sent with `Input.dispatchMouseEvent` and submitted the form. Chrome
answers that command, and runs every command sent after it (`Runtime.evaluate`,
`Page.captureScreenshot`), only when the navigation the click started is over. So the
"state while waiting" was read from the next page. Not awaiting the click does not help:
the later commands are still held.
**Fix**: let the page record its own state. Before the click, `Runtime.evaluate` adds a
`submit` listener that starts a `setTimeout` of 500 ms and writes what it sees
(`hidden`, `disabled`, the text) to `sessionStorage`; after the navigation the value is
read from the new page, which has the same origin. Seen working: the status shown and the
button disabled at 501 ms on `/add`, the answer after 2.2 s. The same trick tells whether
a page came back from the back-forward cache: a `pageshow` listener added before leaving
stores `event.persisted`, and it is only still there when the page was kept. No screenshot
of the in-between state can be taken this way.
**Seen in**: 006-review-drafts, 2026-10-13
