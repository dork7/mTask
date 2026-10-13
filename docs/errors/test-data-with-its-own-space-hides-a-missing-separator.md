# A test that should prove "the parts are joined with a space" passes when they are joined with nothing

**Error**: no failure. In `src/add-voice.test.ts`, the test that fires a `result` event
with the transcripts `'  buy \n milk '` and `'and   eggs '` and expects
`buy milk and eggs` stayed green with `parts.join(' ')` in `public/js/add-voice.js`
changed to `parts.join('')`.
**Where**: `vitest run src/add-voice.test.ts`, while breaking the script to see the test
fail.
**Cause**: the first transcript of the test ends with a space. Joined with nothing, the
two are still apart, and the collapse of white space that follows makes both ways of
joining give the same text. The data was written to show the collapse, and it brought
the separator along.
**Fix**: a second test whose results carry no white space at the joint: `buy milk` and
`and eggs` have to give `buy milk and eggs`. It fails with `join('')` and passes with
`join(' ')`; the first test stays, for the collapse and the trim. When a test is about a
separator, its data must have none of its own where the parts meet, and one test checks
one rule: a test of two rules can pass on the second alone.
**Seen in**: 007-voice-and-text, 2026-10-13
