#!/bin/sh
# Test-only fake git that ignores its argv and sleeps far past any tiny timeout
# override, so the timeout-kill path can be exercised deterministically. If it is
# ever NOT killed it would block for 60s, which the bounded test assertion guards
# against.
sleep 60
