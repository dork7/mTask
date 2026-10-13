# Hundreds of unrelated tests fail when the test files are run many times in a row

**Error**: `Error: listen EADDRNOTAVAIL: address not available 127.0.0.1` and
`Error: connect EADDRNOTAVAIL 127.0.0.1:55913 - Local (0.0.0.0:0)`, in up to 326 tests of
seven files at once, tests of code that had not been touched among them. The next run of
the same files, a little later, passed.
**Where**: a script that ran `vitest run` on the seven `src/add-*.test.ts` files about
once every 1.2 seconds, once per behaviour it had broken, to see which tests fail (macOS).
In a loop of 60 such runs with nothing broken, runs 30, 31, 33, 34 and 59 failed this way.
**Cause**: supertest starts a server on a new port for every request, and the request
takes a second port. macOS hands out the ports 49152 to 65535, 16384 of them, and keeps a
closed one out of use for a while after it is closed (`net.inet.tcp.msl` is 15000 here,
which is 30 seconds). Runs that follow each other faster than the ports come back use
them all up, and the machine has no port to give. In the loop that took 30 runs.
**Fix**: nothing in the repo changed; one `yarn test` is far below the limit. The script
now waits 1.5 seconds before each run, and a run in which any failure message holds
`EADDRNOTAVAIL` is thrown away and repeated after 40 seconds. All 236 runs were then
free of it. A run that failed this way proves nothing about the code: when tests are run
in a loop, read the failure messages, not only the names of the failed tests, and when a
break "fails" tests of files it cannot reach, suspect the machine first.
**Seen in**: 007-voice-and-text, 2026-10-13
