# A test keeps failing after the code is fixed, because an earlier failing run left a file behind

**Error**: `expected true to be false` at the first assertion of "stores an upload named
../../evil.png inside the uploads folder, under a name of its own" in
`src/add-photo.test.ts`, with the upload code correct. Every later run failed the same way.
**Where**: `vitest run src/add-photo.test.ts`, after one run in which the storage had been
changed, on purpose, to store a file under the client's name with `preservePath: true`.
**Cause**: the test asserts that `<uploads folder>/../../evil.png` does not exist before
and after the upload. The uploads folder of a test app is `<tmpdir>/mtask-test-XXXXXX/uploads`,
so that path is `<tmpdir>/evil.png`: outside the folder `close()` removes. The broken
server really wrote it there, the test failed as it should, and nothing removed the file.
From then on the "before" assertion failed whatever the code did.
**Fix**: the test wraps the upload and its assertions in `try`/`finally` and removes that
one path in `finally`; the stray file was removed by hand
(`rm "$(node -p 'os.tmpdir()')/evil.png"`). A test that proves "nothing is written outside
my folder" must itself remove what a broken implementation would write there, or one
failure poisons every later run. If this test fails at its first assertion, look for that
file first.
**Seen in**: 004-photo-upload, 2026-10-12
