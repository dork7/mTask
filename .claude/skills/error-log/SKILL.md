---
name: error-log
description: Search and add to the project's log of errors and their fixes in docs/errors/. Use before debugging any failure, and after fixing an error that needed more than a retry.
---
# Error log

The log is `docs/errors/`, one file per error, so that parallel branches never conflict.

## Before you debug

Search for the distinctive part of the message, without paths, line numbers or ids:

```
grep -ril "<part of the message>" docs/errors/
```

If an entry matches, try its fix first. If the fix no longer works, correct the entry
once you know why.

## After a fix

Log each error that needed a fix. Skip typos and anything a plain rerun cleared. Write
`docs/errors/<short-slug>.md`, or update the entry that already covers it:

```
# <one line naming the error>

**Error**: the exact message, trimmed to the lines that identify it.
**Where**: the command or test that produced it.
**Cause**: what was actually wrong.
**Fix**: what you changed, specific enough to repeat.
**Seen in**: <job-id>, <date>
```

Commit the entry with the fix it describes. Never put secrets or tokens in an entry.
